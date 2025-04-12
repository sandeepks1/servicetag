const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
// const https = require('https');
const axios = require('axios');
const { Console } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG_PATH = path.join(__dirname, 'config.json');


// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Helper: Load admin config
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      STATIC_EXPIRES: '',
      STATIC_SIGNATURE: '',
      STATIC_BUSTER: '',
      STATIC_SID: ''
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Helper: Save config
function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// Admin APIs
app.get('/admin/config', (req, res) => {
  const config = loadConfig();
  res.json(config);
});

app.post('/admin/config', (req, res) => {
  saveConfig(req.body);
  res.json({ status: 'success', saved: req.body });
});

// View customer logs
app.get('/customerdata', (req, res) => {
  const logPath = path.join(__dirname, 'public/log.json');
  if (!fs.existsSync(logPath)) return res.json([]);
  const lines = fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  res.json(lines);
});

// Handle browser-submitted serviceTag
app.post('/submit', async (req, res) => {
  const { serviceTag } = req.body;
  const config = loadConfig();

  if (!serviceTag) {
    return res.status(400).json({ status: 'error', message: 'Missing serviceTag' });
  }

  try {
    // Step 1: Get asset ID from Dell
    const detectURL = `https://www.dell.com/support/components/detectproduct/encvalue/${serviceTag}?appname=warranty`;
    const detectResponse = await axios.get(detectURL, {
      headers: {
        Referer: 'https://www.dell.com/support/home/en-us',
        Origin: 'https://www.dell.com',
        'User-Agent': 'Mozilla/5.0',
        Accept: '*/*'
      }
    });
    console.log("output1"+detectResponse)
    const assetId = detectResponse.data;

    // Step 2: Get warranty info from Dell
    const entitlementURL = 'https://www.dell.com/support/contractservices/en-us/entitlement/contractservicesapi/v1';
    const entitlementResponse = await axios.post(entitlementURL, {
      assetFormat: 'servicetag',
      assetId,
      appName: 'home'
    }, {
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://www.dell.com/support/home/en-us',
        Origin: 'https://www.dell.com',
        'User-Agent': 'Mozilla/5.0',
        Accept: '*/*'
      }
    });
    console.log("output12"+entitlementResponse)
    // Step 3: Log results
    const logPath = path.join(__dirname, 'public/log.json');
    const logEntry = {
      timestamp: new Date().toISOString(),
      serviceTag,
      assetId,
      entitlementData: entitlementResponse.data
    };
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

    res.json({ status: 'logged' });
  } catch (error) {
    console.error("❌ Error during Dell lookup:", error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// Start HTTPS server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});