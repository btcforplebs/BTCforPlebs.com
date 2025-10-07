const express = require("express");
const fetch = require("node-fetch");
const https = require("https");
const config = require('./config');
const app = express();

const links = [
  "https://relay.btcforplebs.com",
  "https://live.btcforplebs.com",
  "https://bloom.btcforplebs.com",
  "https://mempool.btcforplebs.com",
  "https://lightning.btcforplebs.com",
  "https://nostrudel.btcforplebs.com",
  "https://nosotros.btcforplebs.com",
  "https://mint.btcforplebs.com",
  "https://cashu.btcforplebs.com",
  "https://live.btcforplebs.com",
  "https://explorer.btcforplebs.com",
  "https://nsec.btcforplebs.com",
];

// Optional: Only allow internal requests if you're not exposing this publicly
app.use((req, res, next) => {
  const origin = req.headers.origin || 'unknown';
  console.log(`Request: ${req.method} ${req.url} | Origin: ${origin}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get("/", (req, res) => {
  res.json({ status: "Local link status server running" });
});

app.get("/api/link-status", async (req, res) => {
  console.log("🔄 Checking link statuses...");
  const results = {};
  const agent = new https.Agent({ rejectUnauthorized: false });

  for (const url of links) {
    try {
      console.log(`🌐 Checking ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        },
        timeout: 10000,
        agent
      });

      if (response.ok) {
        results[url] = "online";
        continue;
      }

      // mint special handling
      if (url.includes("mint.btcforplebs.com")) {
        try {
          const text = await response.text();
          const json = JSON.parse(text);
          if (json.detail === "Not Found") {
            results[url] = "online";
          } else {
            results[url] = "offline";
          }
        } catch {
          results[url] = "offline";
        }
      } else {
        results[url] = "offline";
      }
    } catch (error) {
      console.error(`❌ Error checking ${url}:`, error.message);
      results[url] = "offline";
    }
  }

  res.json(results);
});

// ✅ IMPORTANT: Only listen on localhost
app.listen(config.port, '127.0.0.1', () => {
  console.log(`✅ Link status server running at http://127.0.0.1:${config.port}`);
});
