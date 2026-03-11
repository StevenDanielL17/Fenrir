// ======================================================================
// useProposalMeta — Enriches scored proposals with deadline + title data
// from the Polkassembly public API.
//
// hoursRemaining makes Fenrir actionable, not just informational:
// a score of 90/100 with "closes in 3h" is actually urgent.
// A score of 90/100 with "closes in 30 days" can wait.
// ======================================================================

const POLKASSEMBLY_BASE = "https://api.polkassembly.io/api/v1"
const BLOCKS_PER_SECOND = 6 // ~6s per block on Polkadot/Westend

/**
 * Fetches the current EVM block number from the configured RPC.
 * Uses the VITE_RPC_URL env var (set in frontend/.env).
 */
async function getCurrentBlockNumber() {
  try {
    const rpcUrl =
      typeof import.meta !== "undefined" && import.meta.env?.VITE_RPC_URL
        ? import.meta.env.VITE_RPC_URL
        : "https://westend-asset-hub-eth-rpc.polkadot.io"

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    })
    const { result } = await res.json()
    return parseInt(result, 16)
  } catch {
    return null
  }
}

/**
 * Fetch Polkassembly metadata for a single proposal.
 * Returns { title, hoursRemaining, isClosingSoon } or nulls on failure.
 */
async function fetchProposalMeta(refIndex) {
  try {
    const res = await fetch(
      `${POLKASSEMBLY_BASE}/posts/on-chain-post?postId=${refIndex}&proposalType=referendums_v2`,
      { headers: { "x-network": "polkadot" } }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const endBlock = data?.onChainInfo?.end
    let hoursRemaining = null

    if (endBlock) {
      const currentBlock = await getCurrentBlockNumber()
      if (currentBlock != null) {
        const blocksLeft = Math.max(0, endBlock - currentBlock)
        hoursRemaining = Math.floor((blocksLeft * BLOCKS_PER_SECOND) / 3600)
      }
    }

    return {
      title: data?.title || null,
      track: data?.onChainInfo?.trackName || null,
      hoursRemaining,
      isClosingSoon: hoursRemaining != null && hoursRemaining <= 24,
    }
  } catch {
    return { title: null, track: null, hoursRemaining: null, isClosingSoon: false }
  }
}

/**
 * Enriches an array of scored proposals with deadline + title data.
 * Each proposal gets: title, track, hoursRemaining, isClosingSoon.
 *
 * @param {Array} scoredProposals - Array of proposal objects with at least { refIndex }
 * @returns {Promise<Array>} - Same proposals with enriched metadata
 */
export async function enrichWithDeadlines(scoredProposals) {
  if (!scoredProposals || scoredProposals.length === 0) return []

  const enriched = await Promise.all(
    scoredProposals.map(async (proposal) => {
      const meta = await fetchProposalMeta(proposal.refIndex)
      return { ...proposal, ...meta }
    })
  )

  return enriched
}
