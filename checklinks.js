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
  "https://nsec.btcforplebs.com",
  "https://flotilla.btcforplebs.com",
  "https://nutstash.btcforplebs.com",
  "https://jumble.btcforplebs.com"
];

// Optional: Only allow internal requests if you're not exposing this publicly
 app.use((req, res, next) => {
   const origin = req.headers.origin || 'unknown';
   console.log(`Request: ${req.method} ${req.url} | Origin: ${origin}`);
   res.header("Access-Control-Allow-Headers", "Content-Type");
   res.header("Access-Control-Allow-Origin", "*");
   res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
 
   if (req.method === 'OPTIONS') {
     return res.sendStatus(200);
   }
   next();
});

app.get("/", (req, res) => {
  res.json({ status: "Local link status server running" });
});

const cache = { data: null, timestamp: 0 };

app.get("/api/link-status", async (req, res) => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  if (cache.data && (now - cache.timestamp < tenMinutes)) {
    console.log("🔁 Serving from cache");
    return res.json(cache.data);
  }

  console.log("🔄 Checking link status and refreshing cache...");
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

  // Update cache
  cache.data = results;
  cache.timestamp = now;

  res.json(results);
});

// ✅ IMPORTANT: Only listen on localhost
app.listen(config.port, '127.0.0.1', () => {
  console.log(`✅ Link status server running at http://127.0.0.1:${config.port}`);
});
