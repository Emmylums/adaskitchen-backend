require("dotenv").config();
const express = require("express");
const cors = require("cors");

const paymentsRoutes = require("./routes/payments");
const stripeWebhook = require("./routes/stripeWebhook");
const { db } = require("./config/firebase");

const app = express();

/**
 * 1️⃣ CORS — MUST COME FIRST
 */
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "https://adaskitchen-app.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

/**
 * 2️⃣ Stripe webhook — RAW body ONLY
 */
// app.use(
//   "/api/stripe-webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook
// );

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        console.error(msg);
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
    credentials: true,
    exposedHeaders: ["Content-Length", "X-Request-Id"]
  })
);

/**
 * 3️⃣ Normal JSON parser for everything else
 */
app.use(express.json());

/**
 * 4️⃣ Routes
 */
app.use("/api/payments", paymentsRoutes);

/**
 * 5️⃣ Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});