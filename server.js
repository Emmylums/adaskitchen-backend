// server.js - Ultra Minimal
const express = require("express");
const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Handle OPTIONS requests
app.options("*", (req, res) => {
  res.sendStatus(200);
});

// Parse JSON
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "OK", time: new Date().toISOString() });
});

// Test endpoint
app.post("/api/test", (req, res) => {
  res.json({ 
    message: "Received your request", 
    data: req.body 
  });
});

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});