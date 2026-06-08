const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MANTLE_EXPLORER = 'https://api.etherscan.io/v2/api';
const MANTLE_EXPLORER_KEY = process.env.MANTLE_EXPLORER_KEY || '';
const PINATA_JWT = process.env.PINATA_JWT;
const PORT = process.env.PORT || 3000;

// ─── STATS PERSISTENCE ───
const STATS_FILE = process.env.STATS_FILE || path.join(__dirname, 'stats.json');

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      if (!saved.recentRoasts) saved.recentRoasts = [];
      return saved;
    }
  } catch (_) {}
  return { walletsAnalyzed: 0, nftsMinted: 0, traits: [], recentRoasts: [] };
}

function saveStats(stats) {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats)); } catch (_) {}
}

const stats = loadStats();

// ─── FETCH WALLET STATS FROM MANTLE EXPLORER ───
async function fetchWalletStats(wallet) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const base = `${MANTLE_EXPLORER}?chainid=5000&apikey=${MANTLE_EXPLORER_KEY}`;
    const [txRes, tokenRes] = await Promise.all([
      fetch(`${base}&module=account&action=txlist&address=${wallet}&startblock=0&endblock=99999999&sort=asc`, { signal: controller.signal }),
      fetch(`${base}&module=account&action=tokentx&address=${wallet}&startblock=0&endblock=99999999&sort=asc`, { signal: controller.signal })
    ]);

    clearTimeout(timeout);

    if (!txRes.ok) throw new Error(`Explorer error: ${txRes.status}`);

    const txData = await txRes.json();
    const tokenData = await tokenRes.json();

    const txList = txData.result && Array.isArray(txData.result) ? txData.result : [];
    const tokenList = tokenData.result && Array.isArray(tokenData.result) ? tokenData.result : [];

    if (txList.length === 0) {
      return {
        transactions: 0, volume: '$0', since: 'N/A',
        gas: '0 MNT', topProtocol: 'None', uniqueContracts: 0,
        rawStats: { txList: [], tokenList: [] }
      };
    }

    const transactions = txList.length;
    const firstTx = txList[0];
    const sinceDate = new Date(parseInt(firstTx.timeStamp) * 1000);
    const since = sinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const totalGasWei = txList.reduce((acc, tx) => acc + BigInt(tx.gasUsed || 0) * BigInt(tx.gasPrice || 0), BigInt(0));
    const totalGasMNT = Number(totalGasWei) / 1e18;
    const gas = totalGasMNT < 0.01 ? '<0.01 MNT' : `${totalGasMNT.toFixed(4)} MNT`;

    const totalValueWei = txList.reduce((acc, tx) => acc + BigInt(tx.value || 0), BigInt(0));
    const totalValueMNT = Number(totalValueWei) / 1e18;
    const volume = totalValueMNT > 1000000
      ? `${(totalValueMNT / 1000000).toFixed(2)}M MNT`
      : totalValueMNT > 1000
      ? `${(totalValueMNT / 1000).toFixed(2)}K MNT`
      : `${totalValueMNT.toFixed(2)} MNT`;

    const contracts = new Set(
      txList.filter(tx => tx.to && tx.to !== wallet.toLowerCase() && tx.input !== '0x').map(tx => tx.to.toLowerCase())
    );
    const uniqueContracts = contracts.size;

    const contractCounts = {};
    txList.forEach(tx => {
      if (tx.to && tx.to !== wallet.toLowerCase() && tx.input !== '0x') {
        const addr = tx.to.toLowerCase();
        contractCounts[addr] = (contractCounts[addr] || 0) + 1;
      }
    });

    let topProtocol = 'Unknown';
    if (Object.keys(contractCounts).length > 0) {
      const topAddr = Object.entries(contractCounts).sort((a, b) => b[1] - a[1])[0][0];
      topProtocol = topAddr.slice(0, 6) + '...' + topAddr.slice(-4);
    }

    return {
      transactions, volume, since, gas, topProtocol, uniqueContracts,
      rawStats: {
        totalGasMNT: totalGasMNT.toFixed(6),
        totalValueMNT: totalValueMNT.toFixed(4),
        txCount: transactions,
        contractCount: uniqueContracts,
        firstTxDate: since,
        tokenTxCount: tokenList.length
      }
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Explorer request timed out');
    throw err;
  }
}

// ─── RUN AI ANALYSIS ───
async function runAIAnalysis(wallet, stats) {
  const prompt = `You are analyzing an Ethereum/Mantle wallet's on-chain activity to generate a "Wrapped" summary card — like Spotify Wrapped but for DeFi.

Wallet: ${wallet}
Stats:
- Total transactions: ${stats.transactions}
- Total volume transacted: ${stats.volume}
- On Mantle since: ${stats.since}
- Gas spent: ${stats.gas}
- Most used contract: ${stats.topProtocol}
- Unique contracts touched: ${stats.uniqueContracts}
- Token transfers: ${stats.rawStats.tokenTxCount}

Generate a JSON response with exactly these fields:
{
  "trait": "2-3 word trader personality label (e.g. Chaotic Bull, Silent Accumulator, Gas Burner, Diamond Hands, Degen Supreme, Quiet Farmer, Ghost Trader)",
  "narrative": "2-3 sentence story about this wallet's on-chain life. Specific, interesting, based on the stats. No generic filler.",
  "roast": "One brutally savage, funny sentence roasting this wallet with zero mercy. Reference specific numbers. Make it sting. Think crypto Twitter at its most ruthless.",
  "prediction": "One sentence prediction for this wallet in 2026, based on their behavior patterns. Confident and specific."
}

Rules:
- Base everything on the actual stats provided
- No emojis anywhere
- No asterisks or markdown
- Trait must be unique and specific to their behavior
- Roast must reference actual numbers from their stats
- Return only valid JSON, nothing else`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (parseErr) {
    throw new Error('AI returned invalid JSON');
  }
}

// ─── UPLOAD IMAGE TO IPFS ───
async function uploadImageToIPFS(imageBase64, wallet) {
  const buffer = Buffer.from(imageBase64, 'base64');
  const boundary = `----FormBoundary${Date.now()}`;
  const filename = `mantle-wrapped-${wallet.slice(0, 8)}-season1.png`;

  const bodyParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    buffer,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\n\r\n${JSON.stringify({ name: filename })}\r\n--${boundary}--\r\n`
  ];
  const bodyBuffer = Buffer.concat(bodyParts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PINATA_JWT}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyBuffer,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) { const errText = await res.text(); throw new Error(`Pinata image error ${res.status}: ${errText}`); }
    const data = await res.json();
    return data.IpfsHash;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Pinata image upload timed out');
    throw err;
  }
}

// ─── UPLOAD METADATA TO IPFS ───
async function uploadToIPFS(wallet, stats, aiResult, imageIpfsHash) {
  const metadata = {
    name: `Mantle Wrapped 2026 — ${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
    description: aiResult.narrative,
    image: `ipfs://${imageIpfsHash}`,
    attributes: [
      { trait_type: 'Personality', value: aiResult.trait },
      { trait_type: 'Total Transactions', value: String(stats.transactions) },
      { trait_type: 'Total Volume', value: stats.volume },
      { trait_type: 'On Mantle Since', value: stats.since },
      { trait_type: 'Gas Spent', value: stats.gas },
      { trait_type: 'Top Protocol', value: stats.topProtocol },
      { trait_type: 'Unique Contracts', value: String(stats.uniqueContracts) },
      { trait_type: 'Season', value: '1' },
      { trait_type: 'Network', value: 'Mantle' }
    ],
    properties: {
      wallet,
      roast: aiResult.roast,
      prediction: aiResult.prediction,
      generatedAt: new Date().toISOString()
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PINATA_JWT}` },
      body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `mantle-wrapped-${wallet.slice(0, 8)}-season1` } }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) { const errText = await res.text(); throw new Error(`Pinata error ${res.status}: ${errText}`); }
    const data = await res.json();
    return data.IpfsHash;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Pinata upload timed out');
    throw err;
  }
}

// ─── ROUTES ───

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mantle-wrapped-backend' });
});

app.post('/api/wrapped', async (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }
  try {
    const walletStats = await fetchWalletStats(wallet);
    const aiResult = await runAIAnalysis(wallet, walletStats);

    stats.walletsAnalyzed += 1;
    if (!stats.traits.includes(aiResult.trait)) stats.traits.push(aiResult.trait);

    const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4);
    stats.recentRoasts.unshift({ addr: shortAddr, roast: aiResult.roast, trait: aiResult.trait });
    if (stats.recentRoasts.length > 10) stats.recentRoasts.length = 10;

    saveStats(stats);

    return res.json({
      trait: aiResult.trait,
      narrative: aiResult.narrative,
      roast: aiResult.roast,
      prediction: aiResult.prediction,
      stats: {
        transactions: walletStats.transactions,
        volume: walletStats.volume,
        since: walletStats.since,
        gas: walletStats.gas,
        topProtocol: walletStats.topProtocol,
        uniqueContracts: walletStats.uniqueContracts
      }
    });
  } catch (err) {
    console.error('POST /api/wrapped:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-metadata', async (req, res) => {
  const { wallet, data, imageBase64 } = req.body;
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ error: 'Invalid wallet address' });
  if (!data || !data.trait || !data.stats) return res.status(400).json({ error: 'Missing wrapped data' });
  if (!imageBase64) return res.status(400).json({ error: 'Missing image' });

  try {
    const imageIpfsHash = await uploadImageToIPFS(imageBase64, wallet);
    const ipfsHash = await uploadToIPFS(wallet, data.stats, data, imageIpfsHash);
    stats.nftsMinted += 1;
    saveStats(stats);
    return res.json({ ipfsHash });
  } catch (err) {
    console.error('POST /api/upload-metadata:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    walletsAnalyzed: stats.walletsAnalyzed,
    nftsMinted: stats.nftsMinted,
    uniqueTraits: stats.traits.length,
    recentRoasts: stats.recentRoasts || []
  });
});

app.listen(PORT, () => {
  console.log(`mantle-wrapped backend running on port ${PORT}`);
});

