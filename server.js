const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
const path = require('path');

const app = express();
const PORT = 9000;

const blockedPaths = [
  '/wp-includes/',
  '/wp-admin/',
  '/wp-content/',
  '/wp-login.php',
  '/xmlrpc.php'
];

// Block WP paths
app.use((req, res, next) => {
  if (blockedPaths.some(p => req.path.startsWith(p))) {
    console.log(`❌ Blocked WP path: ${req.path}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Proxy /api/link-status to API server on 5252
app.get('/api/link-status', async (req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:5252/api/link-status');
    if (!response.ok) throw new Error(`API responded ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch link status' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
