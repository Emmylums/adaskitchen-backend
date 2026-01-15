require("dotenv").config();
const express = require("express");

const app = express();

// =========================
// CORS Headers (Simple & Safe)
// =========================
app.use((req, res, next) => {
  // Allow all origins for now
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// =========================
// Handle preflight OPTIONS requests
// =========================
// Handle ALL OPTIONS requests with a simple response
app.options("/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(200);
});

// =========================
// Body Parser
// =========================
app.use(express.json());

// =========================
// Test Endpoints
// =========================
app.get("/", (req, res) => {
  res.json({
    message: "Adas Kitchen Backend API",
    status: "running",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Adas Kitchen Backend",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Test endpoint working",
    env: {
      NODE_ENV: process.env.NODE_ENV,
      HAS_STRIPE_KEY: !!process.env.STRIPE_SECRET_KEY,
      NODE_VERSION: process.version
    }
  });
});

// =========================
// Simple Payment Test Endpoint
// =========================
app.post("/api/payments/test", (req, res) => {
  console.log("Test payment request:", req.body);
  
  res.json({
    success: true,
    message: "Payment endpoint is reachable",
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// =========================
// 404 Handler
// =========================
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
    method: req.method,
    availableEndpoints: [
      "GET /",
      "GET /api/health",
      "GET /api/test",
      "POST /api/payments/test"
    ]
  });
});

// =========================
// Error Handler
// =========================
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔑 Stripe key: ${process.env.STRIPE_SECRET_KEY ? "Configured" : "Not configured"}`);
});