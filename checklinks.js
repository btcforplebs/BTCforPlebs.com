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
  "https://nostrapps.com",
  // Add more links as needed
];

app.use((req, res, next) => {
  console.log("Received request:", req.url);
  console.log("Request origin:", req.headers.origin);
  console.log("Allowed origins:", config.allowedOrigins);
  const origin = req.headers.origin;
  if (config.allowedOrigins.includes(origin)) {
    console.log("Origin allowed:", origin);
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    console.log("Origin not allowed:", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/api/link-status", async (req, res) => {
  console.log("Checking link statuses..."); // Add this line
  const results = {};
  
  const agent = new https.Agent({
    rejectUnauthorized: false // This helps with self-signed certificates
  });

  for (const url of links) {
    try {
      console.log(`Checking ${url}...`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        },
        timeout: 10000,
        agent
      });
      console.log(`${url} status: ${response.status}`);
      
      // If response is OK, it's online
      if (response.ok) {
        results[url] = "online";
        continue;
      }

      // Special check for mint.btcforplebs.com
      if (url.includes("mint.btcforplebs.com")) {
        try {
          const text = await response.text();
          console.log(`Mint response text:`, text);
          const json = JSON.parse(text);
          console.log(`Mint parsed JSON:`, json);
          console.log(`Content-Type:`, response.headers.get('content-type'));
          if (json.detail === "Not Found") {
            console.log(`Mint matched expected response, marking as online`);
            results[url] = "online";
          } else {
            console.log(`Mint response didn't match expected format`);
            results[url] = "offline";
          }
        } catch (error) {
          console.error(`Error processing mint response:`, error);
          results[url] = "offline";
        }
      } else {
        // For all other URLs, if not OK then offline
        results[url] = "offline";
      }
    } catch (error) {
      console.error(`Error checking ${url}:`, error.message);
      results[url] = "offline";
    }
  }
  
  console.log("Final results:", results);
  res.json(results);
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Link status API running on port ${config.port}`);
  console.log('Allowed origins:', config.allowedOrigins);
  console.log('Server is listening on all network interfaces');
});