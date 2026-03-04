<p align="center">
  <h1 align="center">🐺 FENRIR</h1>
  <p align="center"><strong>On-Chain OpenGov Risk Intelligence for Polkadot</strong></p>
  <p align="center">
    <em>On-chain OpenGov risk scorer powered by PVM ML inference.</em>
  </p>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#contracts">Contracts</a> •
  <a href="#ml-pipeline">ML Pipeline</a> •
  <a href="#frontend">Frontend</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#why-polkadot">Why Polkadot</a>
</p>

---

## The Problem

Polkadot's OpenGov processes treasury requests worth **millions of DOT**. Human reviewers can't scale. Participation has dropped **64%**, and the treasury has roughly **24 months of runway** left. Malicious actors submit treasury drain proposals with fresh wallets, inflated budgets, and recycled pitches — and sometimes they pass. There is no automated, trustless risk assessment layer.

## The Solution

**Fenrir** is an on-chain risk scoring system deployed on Polkadot Hub that analyses OpenGov treasury proposals in real-time.

A Solidity contract reads live proposal data via the **governance precompile**, feeds structured features into a **Rust-compiled ML classifier running natively on PolkaVM**, and writes a public **risk score (0–100)** with explainable flags back on-chain — **no oracle, no off-chain service, no trust assumption**.

Any wallet, UI, or contract in the Polkadot ecosystem can read a proposal's Fenrir score before voting.

**Track 2: PVM Smart Contracts** | Polkadot Solidity Hackathon 2026

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     POLKADOT HUB                            │
│                                                             │
│  ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │  Governance  │───▶│     FenrirScorer.sol            │   │
│  │  Precompile  │    │  (Solidity - EVM layer)         │   │
│  │  (0x0807)    │    │  - Reads proposal data          │   │
│  └──────────────┘    │  - Computes feature vector      │   │
│                      │  - Calls PVM inference (Rust)   │   │
│  ┌──────────────┐    │  - Stores score + flags         │   │
│  │ Asset Hub    │───▶│  - Emits ScorePublished event   │   │
│  │ Precompile   │    └──────────────┬──────────────────┘   │
│  │ (0x0808)     │                   │ cross-contract call   │
│  └──────────────┘    ┌──────────────▼──────────────────┐   │
│                      │     FenrirInference (PVM)        │   │
│                      │  Rust compiled to RISC-V         │   │
│                      │  Runs ML classifier with         │   │
│                      │  hardcoded weights from sklearn   │   │
│                      │  Returns: packed u64             │   │
│                      │  (score << 32 | flag bitmask)    │   │
│                      └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Three-Layer Design

| Layer               | Technology            | Purpose                                                                     |
| ------------------- | --------------------- | --------------------------------------------------------------------------- |
| **FenrirScorer**    | Solidity (EVM)        | Reads governance data via precompiles, orchestrates scoring, stores results |
| **FenrirInference** | Rust (PolkaVM/RISC-V) | Runs ML classifier with hardcoded weights, returns score + flag bitmask     |
| **ML Pipeline**     | Python (off-chain)    | Trains model on historical proposals, exports weights to Rust constants     |

---

## How It Works

### 1. Score a Proposal

Call `scoreReferendum(refIndex)` on the FenrirScorer contract:

1. **Fetches proposal data** from the governance precompile (`0x0807`)
2. **Fetches proposer history** — total proposals, approval count, first activity block
3. **Computes derived features** — wallet age, days since last proposal, DOT ratio
4. **Calls the PVM inference contract** — Rust ML model returns a risk score (0–100) and flag bitmask
5. **Stores the result on-chain** — score, flags, requestedDOT, and block number
6. **Emits `ScorePublished` event** — frontends and contracts can listen and react

If the inference call fails, the contract gracefully falls back to a neutral score of 50 with an `INFERENCE_FAILED` flag — scoring is never blocked.

### 2. Read a Score

Call `getScoreDetails(refIndex)` to receive:

- **Risk score** (0–100)
- **Verdict** — `MINIMAL RISK`, `LOW RISK`, `MODERATE RISK`, or `HIGH RISK`
- **Individual flags** — 5 boolean values indicating which risk factors triggered

### 3. Risk Flags (Explainability)

| Flag                 | Bitmask | Meaning                                       |
| -------------------- | ------- | --------------------------------------------- |
| `FLAG_NEW_WALLET`    | `0x01`  | Wallet created < 50,000 blocks ago (~83 days) |
| `FLAG_LARGE_REQUEST` | `0x02`  | Requesting > 3x the ecosystem average DOT     |
| `FLAG_NO_HISTORY`    | `0x04`  | Proposer has no previously approved proposals |
| `FLAG_LOW_APPROVAL`  | `0x08`  | Less than 20% of past proposals were approved |
| `FLAG_BURST`         | `0x10`  | Multiple proposals submitted within 3 days    |

---

## Getting Started

### Prerequisites

- [Foundry](https://getfoundry.sh/) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) >= 18
- [Python](https://python.org/) >= 3.9
- [Rust](https://rustup.rs/) (stable + nightly) — for PVM contract only

### Quick Start (Under 10 Commands)

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/fenrir.git
cd fenrir

# Install Foundry dependencies
forge install

# Build + test contracts
forge build
forge test -vvv

# Install frontend
cd frontend && npm install && cd ..

# Install ML dependencies
cd ml && pip install -r requirements.txt && cd ..

# Run frontend locally
cd frontend && npm run dev
```

---

## Contracts

### FenrirScorer.sol (EVM)

The main orchestrator contract. Uses OpenZeppelin `ReentrancyGuard` + `Ownable2Step`.

| Function                            | Visibility  | Description                                         |
| ----------------------------------- | ----------- | --------------------------------------------------- |
| `scoreReferendum(uint32)`           | `external`  | Score an active referendum (calls precompile + PVM) |
| `getScoreDetails(uint32)`           | `view`      | Returns score, verdict, and 5 individual bool flags |
| `getRecentScores(uint256, uint256)` | `view`      | Paginated list of recently scored referenda         |
| `getStats()`                        | `view`      | Total scored, high risk count                       |
| `updateInferenceContract(address)`  | `onlyOwner` | Update PVM inference contract address               |

### FenrirInference (PVM/Rust)

Rust contract compiled to RISC-V, deployed as a PolkaVM contract.

| Function              | Description                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `score_proposal(...)` | Takes 6 feature inputs, returns packed `u64` (score << 32 \| flags) |

### Tests

15 test functions, 100% pass rate:

```
forge test -vvv
✓ test_ScoresActiveProposal
✓ test_CannotScoreTwice
✓ test_RejectsNonActiveProposal
✓ test_ScoreDetailsDecoded
✓ test_EmitsScorePublished
✓ test_HighRiskInputsProduceHighScore
✓ test_CleanInputsProduceLowScore
✓ test_InferenceFailureGraceful
✓ test_OnlyOwnerCanUpdateInference
✓ test_OwnerCanUpdateInference
✓ test_CannotSetZeroInference
✓ test_ConstructorRejectsZeroAddress
✓ test_GetRecentScores
✓ test_GetRecentScoresOffsetBeyondTotal
✓ test_GetStats
Suite result: ok. 15 passed; 0 failed; 0 skipped
```

---

## ML Pipeline

### Training Data

Historical OpenGov proposals scraped from [Polkassembly API](https://api.polkassembly.io/api/v1).

### Feature Vector

| Feature                | Type    | Description                                          |
| ---------------------- | ------- | ---------------------------------------------------- |
| `wallet_age_blocks`    | `int`   | Blocks since proposer's first on-chain activity      |
| `requested_dot`        | `float` | DOT amount requested (18-decimal normalised)         |
| `dot_ratio_to_avg`     | `float` | Requested / ecosystem median at submission time      |
| `prior_approved`       | `int`   | Number of previously approved proposals              |
| `prior_total`          | `int`   | Total proposals ever submitted                       |
| `approval_rate`        | `float` | `prior_approved / prior_total` × 100                 |
| `track_id`             | `int`   | OpenGov track (0=root, 13=treasurer, 34=big_spender) |
| `days_since_last_prop` | `int`   | Burst detection — rapid sequential submissions       |

### Model

- **Algorithm:** Decision Tree Classifier (`max_depth=6`, `min_samples_leaf=8`, `class_weight="balanced"`)
- **Target:** 65%+ precision on high-risk class
- **Export:** Weights hardcoded as Rust constants via `export_weights.py` → `inference/src/weights.rs`
- **Format:** `joblib` serialisation

### Pipeline Commands

```bash
cd ml
python scraper.py        # Scrape proposals → data/proposals.csv
python train.py          # Train model → model.joblib + inference/src/weights.rs
python evaluate.py       # Evaluate model performance
```

---

## Frontend

React + Vite dashboard. Dark, serious, trustworthy design. System fonts only.

### Three Views

| View       | Description                                                           |
| ---------- | --------------------------------------------------------------------- |
| **Feed**   | Scored proposals with risk bars, active flags, filter + search        |
| **Detail** | Score with count-up animation, ALL 5 flags (triggered + reassurances) |
| **Stats**  | Total scored, high risk count, DOT protected                          |

### Running Locally

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### Environment Variables

```env
VITE_SCORER_ADDRESS=0x...        # Deployed FenrirScorer address
VITE_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
VITE_CHAIN_ID=420420421
```

---

## Deployment

### Contract Addresses (Westend Testnet)

| Contract        | Network | Address |
| --------------- | ------- | ------- |
| FenrirScorer    | Westend | `TBD`   |
| FenrirInference | Westend | `TBD`   |

### Deploy Commands

```bash
# Set env variables
cp .env.example .env
# Edit .env with your PRIVATE_KEY and INFERENCE_CONTRACT address

# Deploy FenrirScorer
forge script contracts/script/Deploy.s.sol \
  --rpc-url $WESTEND_EVM_RPC \
  --broadcast \
  --private-key $PRIVATE_KEY \
  -vvvv
```

---

## Why Polkadot

Fenrir **cannot exist on Ethereum**. Three reasons:

1. **Governance precompile** — Ethereum has no on-chain governance readable via precompile. Fenrir reads live proposal data with zero external APIs.
2. **PVM Rust inference** — PolkaVM runs Rust ML inference natively at 64-bit word granularity. The same logic on EVM's 256-bit stack machine would cost 10–100× more gas.
3. **Unified address space** — EVM + PVM contracts coexist and call each other on Polkadot Hub. Solidity → Rust cross-contract calls are impossible on Ethereum.

---

## Project Structure

```
fenrir/
├── contracts/                         # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── FenrirScorer.sol          # Main EVM scoring contract
│   │   ├── interfaces/
│   │   │   ├── IGovernancePrecompile.sol
│   │   │   ├── IFenrirInference.sol
│   │   │   ├── IAssetHubPrecompile.sol
│   │   │   └── IXCMPrecompile.sol
│   │   └── mocks/
│   │       ├── MockGovernance.sol
│   │       └── MockAssetHub.sol
│   ├── test/
│   │   └── FenrirScorer.t.sol        # 15 Foundry tests
│   └── script/
│       └── Deploy.s.sol              # Deployment script
│
├── inference/                         # PVM Rust inference contract
│   ├── src/
│   │   ├── lib.rs                    # ML classifier (no_std, no_main)
│   │   └── weights.rs                # AUTO-GENERATED model weights
│   ├── Cargo.toml
│   └── .cargo/config.toml            # riscv32emac-unknown-none-polkavm
│
├── ml/                                # Off-chain ML training pipeline
│   ├── scraper.py                    # Polkassembly data collector (httpx)
│   ├── train.py                      # Decision tree trainer (joblib)
│   ├── export_weights.py             # Python → Rust weight exporter
│   ├── evaluate.py                   # Model evaluation script
│   ├── requirements.txt
│   └── data/
│       └── proposals.csv
│
├── frontend/                          # React + Vite dashboard
│   ├── src/
│   │   ├── constants/
│   │   │   └── contracts.js          # ABI, risk levels, flag defs
│   │   ├── components/
│   │   │   ├── ProposalCard.jsx
│   │   │   ├── ScoreDisplay.jsx
│   │   │   ├── FlagBreakdown.jsx
│   │   │   ├── StatsBanner.jsx
│   │   │   └── SkeletonCard.jsx
│   │   ├── hooks/
│   │   │   └── useFenrir.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
│
├── .env.example
├── foundry.toml
└── README.md
```

---

## License

MIT

---

<p align="center">
  <strong>🐺 Fenrir: The wolf that hunts corruption in governance</strong><br>
  <em>Built for the Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts</em>
</p>
