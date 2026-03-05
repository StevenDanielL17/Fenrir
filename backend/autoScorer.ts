// ======================================================================
// Fenrir Auto-Scorer Service
// Run with: npx ts-node backend/autoScorer.ts
// Deploy on: Railway / Render free tier (always-on)
//
// This service watches for new OpenGov proposals via the Substrate WS API
// and automatically scores them via the FenrirScorer EVM contract.
// The user should never need to click "Score" — Fenrir already did it.
// ======================================================================

import { ethers } from "ethers"
import { ApiPromise, WsProvider } from "@polkadot/api"
import * as dotenv from "dotenv"
import * as path from "path"

// Load .env from project root (one level up from backend/)
dotenv.config({ path: path.resolve(__dirname, "../.env") })

const SCORER_ABI = [
  "function scoreReferendum(uint32 refIndex) returns (uint8)",
  "function scores(uint32) view returns (uint8 value, uint8 flags, uint64 scoredAtBlock, uint128 requestedDOT, bool exists)",
  "function totalScored() view returns (uint256)",
]

// Retry a scoring call up to N times with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (i === retries - 1) throw e
      console.warn(`Retry ${i + 1}/${retries} after error: ${e.message}`)
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error("Retry exhausted") // unreachable
}

async function scoreIfNew(scorer: ethers.Contract, refIndex: number): Promise<void> {
  try {
    const existing = await scorer.scores(refIndex)
    if (existing.exists) {
      console.log(`REF #${refIndex} already scored: ${existing.value}/100`)
      return
    }

    console.log(`REF #${refIndex} detected — scoring...`)
    const tx = await withRetry(() =>
      scorer.scoreReferendum(refIndex, { gasLimit: 500_000 })
    ) as ethers.ContractTransactionResponse
    const receipt = await tx.wait()
    if (receipt) {
      console.log(`✓ REF #${refIndex} scored. TX: ${receipt.hash}`)
    }

  } catch (err: any) {
    // These are expected contract reverts — skip silently
    if (err.message?.includes("NotActiveReferendum")) return
    if (err.message?.includes("AlreadyScored")) return
    console.error(`✗ Error scoring REF #${refIndex}:`, err.message)
  }
}

async function scanUnscoredProposals(api: ApiPromise, scorer: ethers.Contract): Promise<void> {
  console.log("Scanning for existing unscored proposals...")

  const entries = await api.query.referenda.referendumInfoFor.entries()
  let scored = 0

  for (const [key, info] of entries) {
    const refIndex = (key.args[0] as any).toNumber()
    const refInfo = info.toJSON() as any

    // Only score ongoing (active) referenda
    if (refInfo?.ongoing) {
      await scoreIfNew(scorer, refIndex)
      scored++
      // Small delay between calls to avoid nonce collision
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`Initial scan complete: checked ${entries.length} referenda, scored ${scored} new ones.`)
  console.log("Watching for new proposals continuously...")
}

async function main(): Promise<void> {
  const missingVars = ["WESTEND_EVM_RPC", "WESTEND_WS_RPC", "PRIVATE_KEY", "VITE_SCORER_ADDRESS"].filter(
    v => !process.env[v]
  )
  if (missingVars.length > 0) {
    console.error("Missing required env vars:", missingVars.join(", "))
    process.exit(1)
  }

  // EVM provider for contract calls
  const evmProvider = new ethers.JsonRpcProvider(process.env.WESTEND_EVM_RPC)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, evmProvider)
  const scorer = new ethers.Contract(process.env.VITE_SCORER_ADDRESS!, SCORER_ABI, wallet)

  // Substrate provider for watching new referenda
  const wsProvider = new WsProvider(process.env.WESTEND_WS_RPC)
  const api = await ApiPromise.create({ provider: wsProvider })

  const network = await evmProvider.getNetwork()
  console.log(`🐺 Fenrir Auto-Scorer connected to chain ${network.chainId}`)
  console.log(`   Scorer contract: ${process.env.VITE_SCORER_ADDRESS}`)

  // Watch for new referenda being submitted
  await api.query.system.events(async (events: any) => {
    for (const record of events) {
      const { event } = record
      if (api.events.referenda?.Submitted?.is(event)) {
        const refIndex = (event.data[0] as any).toNumber()
        console.log(`📡 New referendum #${refIndex} detected on-chain`)
        await scoreIfNew(scorer, refIndex)
      }
    }
  })

  // On startup, score any existing unscored proposals
  await scanUnscoredProposals(api, scorer)
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
