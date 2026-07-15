const express = require('express');

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

// Serve chat widget with proper CORS and content-type
app.get('/nostr-chat-widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, 'public', 'nostr-chat-widget.js'));
});

// Proxy endpoint removed


// ... previous middleware ...

// Serve static files from /public, including dot‑folders such as .well-known
app.use(
  express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' })
);

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://127.0.0.1:${PORT}`);
});
