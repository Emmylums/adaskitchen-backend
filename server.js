// server.js - NO app.options() at all
const express = require('express');
const app = express();

// =========================
// Simple CORS Middleware
// =========================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS method directly in middleware
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// =========================
// Body Parser
// =========================
app.use(express.json());

// =========================
// Test Routes
// =========================
app.get('/', (req, res) => {
  res.json({
    message: 'Adas Kitchen Backend API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

app.post('/api/payments/test', (req, res) => {
  console.log('Test request:', req.body);
  res.json({
    success: true,
    message: 'Received payment test',
    data: req.body
  });
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});