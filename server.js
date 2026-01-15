require("dotenv").config();
const express = require("express");
const cors = require("cors");
const paymentsRoutes = require("./routes/payments");
const stripeWebhook = require("./routes/stripeWebhook");
const { db } = require("./config/firebase");

const app = express();

// =========================
// DEFINE ALLOWED ORIGINS
// =========================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://adaskitchen-app.vercel.app", // Your frontend Vercel domain
  "https://adaskitchen-backend.vercel.app" // Your backend domain (if needed)
];

// =========================
// CORS Configuration
// =========================
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if the origin is in the allowed list
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        console.error(msg);
        return callback(new Error(msg), false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
    credentials: true,
    exposedHeaders: ["Content-Length", "X-Request-Id"]
  })
);

// =========================
// Preflight requests
// =========================
app.options("*", cors());

// =========================
// Stripe webhook — RAW body ONLY
// =========================
app.use(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// =========================
// Normal JSON parser for everything else
// =========================
app.use(express.json());

// =========================
// Routes
// =========================
app.use("/api/payments", paymentsRoutes);

// =========================
// Debug endpoint
// =========================
app.get("/api/debug", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    allowedOrigins: allowedOrigins,
    stripe: {
      keyExists: !!process.env.STRIPE_SECRET_KEY,
      keyPrefix: process.env.STRIPE_SECRET_KEY ? 
        process.env.STRIPE_SECRET_KEY.substring(0, 10) + "..." : 
        "Not set",
      webhookSecretExists: !!process.env.STRIPE_WEBHOOK_SECRET
    },
    headers: req.headers,
    origin: req.headers.origin,
    host: req.headers.host
  });
});

// =========================
// Health check endpoint
// =========================
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "Adas Kitchen Backend API"
  });
});

// =========================
// Error handling middleware
// =========================
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// =========================
// 404 handler
// =========================
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Stripe key configured: ${!!process.env.STRIPE_SECRET_KEY}`);
});