// ======================================================================
// generateSummary — One-line human-readable summary of WHY a proposal
// is risky. Pure function, rule-based, no AI API needed.
//
// The goal: a sentence that feels intelligent, not a data dump.
// "New wallet requesting 42K DOT — 3.8x the ecosystem average."
// is more useful than showing 4 flag chips the user has to decode.
// ======================================================================

const ECOSYSTEM_AVG_DOT_FALLBACK = 25000 // fallback if not provided

/**
 * Formats a raw DOT planck value (as number or string) into a human label.
 * Handles both pre-formatted floats (from ethers.formatEther) and raw bigints.
 */
function formatDOT(requestedDOT) {
  let dot
  try {
    // If it's already a float string from ethers.formatEther (e.g., "42000.5")
    dot = parseFloat(requestedDOT)
    if (isNaN(dot)) dot = Number(BigInt(requestedDOT) / BigInt(1e18))
  } catch {
    dot = 0
  }

  if (dot >= 1_000_000) return `${(dot / 1_000_000).toFixed(1)}M DOT`
  if (dot >= 1_000)     return `${(dot / 1_000).toFixed(0)}K DOT`
  return `${dot.toFixed(0)} DOT`
}

/**
 * Generates a one-line summary for a proposal.
 *
 * @param {number} score              - 0–100 risk score
 * @param {object} flags              - { newWallet, largeRequest, noHistory, lowApproval, burst }
 * @param {string|number} requestedDOT - DOT requested (formatted float or planck bigint string)
 * @param {number} [ecosystemAvg]     - Ecosystem average DOT for ratio calc
 * @returns {string}
 */
export function generateSummary(score, flags, requestedDOT, ecosystemAvg) {
  const avg = ecosystemAvg || ECOSYSTEM_AVG_DOT_FALLBACK
  const dotLabel = formatDOT(requestedDOT)
  const dot = parseFloat(requestedDOT) || 0
  const ratio = avg > 0 ? (dot / avg).toFixed(1) : null

  const { newWallet, largeRequest, noHistory, lowApproval, burst } = flags || {}

  // ── HIGH RISK compound patterns ──────────────────────────────────────
  if (newWallet && largeRequest && noHistory) {
    return `First-time wallet requesting ${dotLabel}${ratio ? ` (${ratio}× avg)` : ""} with no on-chain history.`
  }
  if (newWallet && burst && noHistory) {
    return `Multiple rapid submissions from a new wallet with no prior approved proposals.`
  }
  if (newWallet && largeRequest) {
    return `New wallet requesting ${dotLabel}${ratio ? ` — ${ratio}× the ecosystem average` : ""}.`
  }
  if (newWallet && noHistory) {
    return `First-time proposer with no on-chain governance history requesting treasury funds.`
  }
  if (largeRequest && lowApproval) {
    return `Poor approval record requesting ${dotLabel}${ratio ? ` — ${ratio}× above average` : ""}.`
  }
  if (burst && noHistory) {
    return `Multiple rapid submissions from an account with no previously approved proposals.`
  }

  // ── SINGLE FLAG patterns ─────────────────────────────────────────────
  if (largeRequest) {
    return `Request of ${dotLabel} is${ratio ? ` ${ratio}×` : " significantly"} above the ecosystem average for this track.`
  }
  if (newWallet) {
    return `Proposer wallet has limited on-chain history. No prior governance participation recorded.`
  }
  if (burst) {
    return `Multiple proposals submitted in rapid succession — possible ballot stuffing or rushed submission.`
  }
  if (lowApproval) {
    return `Proposer has a below-average approval rate on previous submissions.`
  }
  if (noHistory) {
    return `No prior proposal history found for this address. Track record cannot be verified.`
  }

  // ── LOW / MINIMAL ────────────────────────────────────────────────────
  if (score <= 15) {
    return `Established proposer, reasonable request size. No risk flags triggered.`
  }
  if (score <= 30) {
    return `Low risk profile. Established proposer with a positive approval history.`
  }

  return `Moderate risk profile. Review proposal details and voting history before casting your vote.`
}
