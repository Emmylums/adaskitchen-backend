require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// =========================
// CORS Configuration
// =========================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://adaskitchen-app.vercel.app",
  "https://adaskitchen-backend.vercel.app"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.error(`CORS blocked: ${origin}`);
      return callback(new Error(`CORS policy blocks origin: ${origin}`), false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
  credentials: true
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// =========================
// Body Parsers
// =========================
app.use(express.json());

// =========================
// Health Check Endpoint
// =========================
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "Adas Kitchen Backend API",
    environment: process.env.NODE_ENV || "development"
  });
});

// =========================
// Debug Endpoint
// =========================
app.get("/api/debug", (req, res) => {
  res.json({
    status: "ok",
    env: {
      NODE_ENV: process.env.NODE_ENV,
      STRIPE_KEY_EXISTS: !!process.env.STRIPE_SECRET_KEY,
      NODE_VERSION: process.version
    },
    headers: req.headers,
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// =========================
// Test Payment Endpoint
// =========================
app.post("/api/payments/create-payment-intent", async (req, res) => {
  try {
    console.log("Payment intent request:", req.body);
    
    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Stripe not configured",
        message: "STRIPE_SECRET_KEY environment variable is missing",
        help: "Add STRIPE_SECRET_KEY to Vercel environment variables"
      });
    }
    
    // Simple success response for now
    res.json({
      success: true,
      message: "Payment endpoint is working",
      received: req.body,
      stripeConfigured: true
    });
    
  } catch (error) {
    console.error("Payment endpoint error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
});

// =========================
// Routes (Add your actual routes here)
// =========================
// app.use("/api/payments", require("./routes/payments"));
// app.use("/api/stripe-webhook", express.raw({type: "application/json"}), require("./routes/stripeWebhook"));

// =========================
// 404 Handler - FIXED: Don't use "*" with app.use()
// =========================
app.use((req, res, next) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      "GET /api/health",
      "GET /api/debug",
      "POST /api/payments/create-payment-intent"
    ]
  });
});

// =========================
// Error Handler
// =========================
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔑 Stripe key exists: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
});