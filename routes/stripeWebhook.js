const express = require("express");
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const { admin, db } = require("../config/firebase");

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Process Stripe webhook events
 */
router.post(
  "/stripe-webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    // =========================
    // VERIFY STRIPE SIGNATURE
    // =========================
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // =========================
    // HANDLE WEBHOOK EVENTS
    // =========================
    
    // Payment Intent Succeeded
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
    }
    
    // Payment Intent Failed
    else if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      await handlePaymentFailure(paymentIntent);
    }
    
    // Setup Intent Succeeded (for saving cards)
    else if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      await handleSetupIntentSuccess(setupIntent);
    }

    // Return success response
    res.json({ received: true });
  }
);

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(paymentIntent) {
  const { orderId, userId, walletAmount = 0 } = paymentIntent.metadata || {};

  if (!orderId || !userId) {
    console.error("❌ Missing metadata in PaymentIntent:", paymentIntent.id);
    return;
  }

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const userRef = db.collection("users").doc(userId);

    const [orderSnap, userSnap] = await Promise.all([
      orderRef.get(),
      userRef.get()
    ]);

    if (!orderSnap.exists) {
      console.error("❌ Order not found:", orderId);
      return;
    }

    if (!userSnap.exists) {
      console.error("❌ User not found:", userId);
      return;
    }

    const order = orderSnap.data();

    // =========================
    // IDEMPOTENCY CHECK
    // =========================
    if (order.paymentStatus === "paid") {
      console.log("ℹ️ Order already finalized:", orderId);
      return;
    }

    // =========================
    // WALLET DEDUCTION (HYBRID PAYMENT)
    // =========================
    const walletAmountNum = Number(walletAmount);
    if (walletAmountNum > 0) {
      const currentBalance = userSnap.data().walletBalance || 0;
      const newBalance = currentBalance - walletAmountNum;
      
      if (newBalance >= 0) {
        await userRef.update({
          walletBalance: newBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(
          `💰 Wallet deducted: £${(walletAmountNum / 100).toFixed(2)} for user ${userId}`
        );
      } else {
        console.error("❌ Insufficient wallet balance for deduction");
      }
    }

    // =========================
    // FINALIZE ORDER
    // =========================
    await orderRef.update({
      paymentStatus: "paid",
      orderStatus: "confirmed",
      verified: true,
      currency: "GBP",
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: paymentIntent.latest_charge || null,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("✅ Order payment completed:", orderId);
    
    // =========================
    // UPDATE ORDER HISTORY IN USER DOCUMENT
    // =========================
    await userRef.update({
      orderHistory: admin.firestore.FieldValue.arrayUnion(orderId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    throw err;
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailure(paymentIntent) {
  const { orderId, userId } = paymentIntent.metadata || {};
  
  console.warn(
    "⚠️ Payment failed:",
    paymentIntent.id,
    paymentIntent.last_payment_error?.message
  );

  if (orderId && userId) {
    try {
      const orderRef = db.collection("orders").doc(orderId);
      await orderRef.update({
        paymentStatus: "failed",
        paymentError: paymentIntent.last_payment_error?.message || "Payment failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`❌ Order ${orderId} marked as failed`);
    } catch (error) {
      console.error("Error updating failed order:", error);
    }
  }
}

/**
 * Handle setup intent success (for saved cards)
 */
async function handleSetupIntentSuccess(setupIntent) {
  const { customer: customerId, payment_method: paymentMethodId } = setupIntent;
  
  if (!customerId || !paymentMethodId) {
    console.error("❌ Missing customer or payment method in setup intent");
    return;
  }

  try {
    // Retrieve payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    // Find user by Stripe customer ID
    const usersRef = db.collection("users");
    const querySnapshot = await usersRef
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      console.error("❌ User not found for customer:", customerId);
      return;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userRef = db.collection("users").doc(userDoc.id);
    
    // Add card to user's saved cards
    const cardData = {
      id: paymentMethodId,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      createdAt: new Date().toISOString()
    };
    
    await userRef.update({
      savedCards: admin.firestore.FieldValue.arrayUnion(cardData),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Card saved for user ${userDoc.id}: ${cardData.brand} •••• ${cardData.last4}`);
    
  } catch (err) {
    console.error("❌ Error processing setup intent:", err);
  }
}

module.exports = router;