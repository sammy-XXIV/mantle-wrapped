# Mantle Wrapped

**Mantle Wrapped** is an onchain "Wrapped" experience for Mantle mainnet — like Spotify Wrapped but for your DeFi activity. Connect your wallet, get an AI-generated personality verdict and roast based on your real on-chain stats, then mint it as a Soulbound NFT.

Built for the **Turing Test 2026 Hackathon** — Consumer DApps track.

---

## What it does

1. Connect your Mantle wallet
2. Backend fetches your real on-chain stats (tx count, volume, gas spent, contracts touched)
3. Claude AI generates your trader archetype, narrative, roast, and 2026 prediction
4. A shareable NFT card is generated and uploaded to IPFS
5. Mint it as a Soulbound Token (SBT) — non-transferable, permanently on Mantle mainnet

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, html2canvas |
| Backend | Node.js / Express on Railway |
| AI | Claude (claude-sonnet-4-6) via Anthropic API |
| Chain | Mantle Mainnet (chainId 5000) |
| NFT | ERC721 Soulbound contract |
| Storage | IPFS via Pinata |
| Hosting | GitHub Pages |

---

## Contract

Soulbound NFT contract on Mantle Mainnet:
`0xF2238eC479e64e8878e338b0bfD5B90E5AFd2502`

---

## Local dev

```bash
# Backend
cd new-backend-repo
npm install
ANTHROPIC_API_KEY=sk-... PINATA_JWT=... node server.js

# Frontend — just open index.html in a browser
# Update BACKEND_URL in index.html if running locally
```
