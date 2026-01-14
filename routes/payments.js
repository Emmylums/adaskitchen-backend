const express = require("express");
const Stripe = require("stripe");
const { db, admin } = require("../config/firebase");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Get or create Stripe customer
 */
async function getOrCreateCustomer(userId, email) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists && userDoc.data().stripeCustomerId) {
      return userDoc.data().stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: email || `user_${userId}@example.com`,
      metadata: { userId }
    });

    await userRef.set(
      { stripeCustomerId: customer.id },
      { merge: true }
    );

    return customer.id;
  } catch (error) {
    console.error("Error creating Stripe customer:", error);
    throw error;
  }
}

/**
 * POST /api/payments/create-payment-intent
 *
 * body:
 * {
 *   amount: number (in pence),
 *   currency?: "gbp",
 *   orderId: string,
 *   userId: string,
 *   paymentMethodId?: string,
 *   walletAmount: number
 * }
 */
router.post("/create-payment-intent", async (req, res) => {
  console.log("=== CREATE PAYMENT INTENT REQUEST ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  try {
    const {
      amount,
      orderId,
      userId,
      paymentMethodId,
      walletAmount = 0,
      currency = "gbp",
    } = req.body;

    console.log("Parsed data:", {
      amount,
      orderId,
      userId,
      paymentMethodId,
      walletAmount,
      currency
    });

    if (!amount || amount <= 0) {
      console.error("❌ Invalid amount:", amount);
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!orderId || !userId) {
      console.error("❌ Missing required fields:", { orderId, userId });
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user data from Firestore
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error("❌ User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    console.log("User data found:", {
      email: userData.email,
      stripeCustomerId: userData.stripeCustomerId
    });

    const customerId = await getOrCreateCustomer(userId, userData.email);
    console.log("Customer ID:", customerId);

    // Calculate final Stripe amount (after wallet deduction)
    const stripeAmount = amount - walletAmount;
    console.log("Payment calculation:", {
      totalAmount: amount,
      walletAmount,
      stripeAmount
    });
    
    if (stripeAmount <= 0) {
      // Full wallet payment, no Stripe needed
      console.log("💰 Wallet-only payment detected");
      return res.json({
        clientSecret: null,
        paymentIntentId: null,
        walletOnly: true
      });
    }

    // Create payment intent parameters - DO NOT CONFIRM IMMEDIATELY
    const paymentIntentParams = {
      amount: stripeAmount,
      currency,
      customer: customerId,
      metadata: {
        orderId,
        userId,
        walletAmount: walletAmount.toString()
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    };

    // If payment method is provided, attach it but DON'T confirm yet
    if (paymentMethodId) {
      paymentIntentParams.payment_method = paymentMethodId;
      // DO NOT set confirm: true here - let frontend handle confirmation
      
      console.log("Using existing payment method:", paymentMethodId);
      
      // Attach payment method to customer if not already attached
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });
        console.log("✅ Payment method attached");
      } catch (error) {
        // Payment method might already be attached, ignore
        if (!error.message.includes("already attached")) {
          console.error("❌ Error attaching payment method:", error);
        } else {
          console.log("ℹ️ Payment method already attached");
        }
      }
    } else {
      console.log("ℹ️ No payment method ID provided - will use new card");
    }

    // Create the payment intent WITHOUT confirming
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);
    
    console.log("✅ Payment intent created:", {
      id: paymentIntent.id,
      status: paymentIntent.status,
      client_secret: paymentIntent.client_secret ? "***REDACTED***" : null
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      walletOnly: false,
      status: paymentIntent.status,
      // Return whether we should confirm on frontend
      requiresConfirmation: paymentIntent.status === 'requires_confirmation' || paymentIntent.status === 'requires_payment_method'
    });

  } catch (err) {
    console.error("❌ Error creating payment intent:", err);
    console.error("❌ Error type:", err.type);
    console.error("❌ Error code:", err.code);
    
    res.status(500).json({ 
      error: err.message || "Failed to create payment intent",
      details: err.type,
      code: err.code
    });
  }
});

/**
 * POST /api/payments/create-setup-intent
 * For saving cards
 */
router.post("/create-setup-intent", async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing user ID" });
    }

    const customerId = await getOrCreateCustomer(userId, email);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session"
    });

    res.json({ 
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id
    });
  } catch (err) {
    console.error("Error creating setup intent:", err);
    res.status(500).json({ 
      error: err.message || "Failed to create setup intent" 
    });
  }
});

/**
 * GET /api/payments/payment-method/:id
 * Retrieve payment method details
 */
router.get("/payment-method/:id", async (req, res) => {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(req.params.id);
    res.json(paymentMethod);
  } catch (error) {
    console.error("Retrieve payment method error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to retrieve payment method" 
    });
  }
});

/**
 * POST /api/payments/set-default-card
 * Set default payment method
 */
router.post("/set-default-card", async (req, res) => {
  try {
    const { customerId, paymentMethodId, userId } = req.body;

    if (!customerId || !paymentMethodId || !userId) {
      return res.status(400).json({ error: "Missing required data" });
    }

    // Update Stripe customer
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update Firestore user document
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      defaultPaymentMethod: paymentMethodId,
      updatedAt: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: "Default card updated successfully" 
    });
  } catch (err) {
    console.error("Error setting default card:", err);
    res.status(500).json({ 
      error: err.message || "Failed to set default card" 
    });
  }
});

/**
 * GET /api/payments/cards/:userId
 * Get user's saved cards from Firestore
 */
router.get("/cards/:userId", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const savedCards = userData.savedCards || [];
    
    res.json(savedCards);
  } catch (err) {
    console.error("Error fetching cards:", err);
    res.status(500).json({ 
      error: err.message || "Failed to fetch cards" 
    });
  }
});

/**
 * POST /api/payments/attach-payment-method
 * Attach payment method to customer
 */
router.post("/attach-payment-method", async (req, res) => {
  try {
    const { paymentMethodId, customerId } = req.body;

    if (!paymentMethodId || !customerId) {
      return res.status(400).json({ error: "Missing required data" });
    }

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    res.json(paymentMethod);
  } catch (error) {
    console.error("Error attaching payment method:", error);
    
    // Check if already attached
    if (error.type === 'StripeInvalidRequestError' && 
        error.code === 'resource_missing') {
      // Payment method doesn't exist or already attached
      res.status(400).json({ 
        error: "Payment method could not be attached" 
      });
    } else {
      res.status(500).json({ 
        error: error.message || "Failed to attach payment method" 
      });
    }
  }
});

/**
 * DELETE /api/payments/card/:paymentMethodId
 * Detach payment method
 */
router.delete("/card/:paymentMethodId", async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const { userId } = req.body;

    if (!paymentMethodId || !userId) {
      return res.status(400).json({ error: "Missing required data" });
    }

    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // Remove from Firestore
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const savedCards = userData.savedCards || [];
      const updatedCards = savedCards.filter(card => card.id !== paymentMethodId);
      
      await userRef.update({
        savedCards: updatedCards,
        // Reset default payment method if it was the one being deleted
        defaultPaymentMethod: userData.defaultPaymentMethod === paymentMethodId 
          ? null 
          : userData.defaultPaymentMethod,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ 
      success: true, 
      message: "Card removed successfully" 
    });
  } catch (error) {
    console.error("Error removing card:", error);
    res.status(500).json({ 
      error: error.message || "Failed to remove card" 
    });
  }
}); 

/**
 * POST /api/payments/add-money-to-wallet
 * Add money to user's wallet using card
 */
router.post("/add-money-to-wallet", async (req, res) => {
  console.log("=== ADD MONEY TO WALLET REQUEST ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  try {
    const {
      amount,
      userId,
      paymentMethodId,
      saveCard = false,
      currency = "gbp",
    } = req.body;

    console.log("Parsed data:", {
      amount,
      userId,
      paymentMethodId,
      saveCard,
      currency
    });

    if (!amount || amount <= 0) {
      console.error("❌ Invalid amount:", amount);
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!userId) {
      console.error("❌ Missing user ID");
      return res.status(400).json({ error: "Missing user ID" });
    }

    // Get user data from Firestore
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error("❌ User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const customerId = await getOrCreateCustomer(userId, userData.email);
    console.log("Customer ID:", customerId);

    // Create payment intent for wallet top-up
    const paymentIntentParams = {
      amount: amount,
      currency,
      customer: customerId,
      metadata: {
        userId,
        type: "wallet_top_up",
        saveCard: saveCard.toString()
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      confirm: true, // Automatically confirm
      off_session: true, // For saved cards
    };

    // Add payment_method if provided
    if (paymentMethodId) {
      paymentIntentParams.payment_method = paymentMethodId;
      
      // Attach payment method to customer if not already attached
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });
        console.log("✅ Payment method attached");
      } catch (error) {
        // Payment method might already be attached, ignore
        if (!error.message.includes("already attached")) {
          console.error("❌ Error attaching payment method:", error);
        } else {
          console.log("ℹ️ Payment method already attached");
        }
      }
    } else {
      // For new cards, don't confirm automatically
      delete paymentIntentParams.confirm;
      delete paymentIntentParams.off_session;
      paymentIntentParams.automatic_payment_methods.enabled = true;
    }

    // Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);
    
    console.log("✅ Payment intent created for wallet top-up:", {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount
    });

    // If payment requires confirmation, return client secret
    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_payment_method') {
      return res.json({
        requiresConfirmation: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });
    }

    // If payment succeeded, update user's wallet balance
    if (paymentIntent.status === 'succeeded') {
      const currentBalance = userData.walletBalance || 0;
      const newBalance = currentBalance + amount;
      
      await userRef.update({
        walletBalance: newBalance,
        updatedAt: new Date().toISOString(),
        walletTransactions: admin.firestore.FieldValue.arrayUnion({
          type: "deposit",
          amount: amount,
          previousBalance: currentBalance,
          newBalance: newBalance,
          timestamp: new Date().toISOString(),
          status: "completed",
          description: "Wallet top-up via card",
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: paymentIntent.latest_charge || null,
          paymentMethod: paymentMethodId ? "saved_card" : "new_card",
          saveCard: saveCard
        })
      });

      // If saveCard is true and new card was used, save it
      if (saveCard && !paymentMethodId && paymentIntent.payment_method) {
        try {
          // Get payment method details
          const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
          
          const cardData = {
            id: paymentMethod.id,
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
            createdAt: new Date().toISOString()
          };
          
          await userRef.update({
            savedCards: admin.firestore.FieldValue.arrayUnion(cardData),
            updatedAt: new Date().toISOString()
          });
          
          console.log("✅ New card saved for user");
        } catch (error) {
          console.error("Error saving new card:", error);
        }
      }

      console.log(`✅ Wallet updated for user ${userId}: +${amount/100} GBP`);
    }

    res.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      requiresConfirmation: false,
      amountAdded: amount,
      newBalance: (userData.walletBalance || 0) + amount
    });

  } catch (err) {
    console.error("❌ Error adding money to wallet:", err);
    console.error("❌ Error type:", err.type);
    console.error("❌ Error code:", err.code);
    
    res.status(500).json({ 
      error: err.message || "Failed to add money to wallet",
      details: err.type,
      code: err.code
    });
  }
});

module.exports = router;