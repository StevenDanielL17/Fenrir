#![no_std]
#![no_main]

mod weights;
use weights::*;

/// Fenrir on-chain inference contract.
/// Called via cross-contract call from FenrirScorer.sol.
/// Returns: packed u64 — upper 32 bits = score, lower 32 bits = flags.
///
/// Flag bit meanings:
/// 0x01 = new wallet (age < WALLET_AGE_THRESHOLD_BLOCKS)
/// 0x02 = large DOT request (> 3x ecosystem avg)
/// 0x04 = no approved history (prior_total == 0)
/// 0x08 = low approval rate (< MIN_APPROVAL_RATE %)
/// 0x10 = burst submission (multiple proposals within 3 days)

#[polkavm_derive::polkavm_export]
pub extern "C" fn score_proposal(
    wallet_age_blocks: u64,
    requested_dot_raw: u64,      // in Planck (1e18)
    prior_approved: u32,
    prior_total: u32,
    days_since_last_prop: u32,
    _track_id: u8,
) -> u64 {   // packed: upper 32 = score, lower 32 = flags

    let mut flags: u8 = 0;
    let mut risk_accumulator: u64 = 0;

    // === Feature 1: Wallet Age (weight: FEATURE_WEIGHTS[0]) ===
    let age_risk = if wallet_age_blocks < WALLET_AGE_THRESHOLD_BLOCKS {
        flags |= 0x01;
        // Linear scale: 0 blocks = 100 risk, threshold blocks = 0 risk
        let ratio = wallet_age_blocks.saturating_mul(100) / WALLET_AGE_THRESHOLD_BLOCKS;
        100u64.saturating_sub(ratio)
    } else {
        0u64
    };
    risk_accumulator = risk_accumulator.saturating_add(
        age_risk.saturating_mul(FEATURE_WEIGHTS[0] as u64)
    );

    // === Feature 2: DOT Request Ratio (weight: FEATURE_WEIGHTS[1]) ===
    let dot_ratio = if ECOSYSTEM_AVG_DOT > 0 {
        requested_dot_raw.saturating_mul(100).saturating_div(ECOSYSTEM_AVG_DOT)
    } else {
        100
    };
    let dot_risk = if dot_ratio > DOT_RATIO_HIGH_RISK {
        flags |= 0x02;
        dot_ratio.saturating_sub(100).min(100)
    } else {
        0u64
    };
    risk_accumulator = risk_accumulator.saturating_add(
        dot_risk.saturating_mul(FEATURE_WEIGHTS[1] as u64)
    );

    // === Feature 3: Approval History (weight: FEATURE_WEIGHTS[2]) ===
    let history_risk = if prior_total == 0 {
        flags |= 0x04;
        70u64   // no history is moderately risky
    } else {
        let approval_rate = (prior_approved as u64).saturating_mul(100)
            / (prior_total as u64).max(1);
        if approval_rate < MIN_APPROVAL_RATE {
            flags |= 0x08;
            100u64.saturating_sub(approval_rate.saturating_mul(2))
        } else {
            0u64
        }
    };
    risk_accumulator = risk_accumulator.saturating_add(
        history_risk.saturating_mul(FEATURE_WEIGHTS[2] as u64)
    );

    // === Feature 4: Burst Detection ===
    if days_since_last_prop < 3 && prior_total > 0 {
        flags |= 0x10;
        risk_accumulator = risk_accumulator.saturating_add(15_000); // flat penalty
    }

    // === Normalise to 0–100 ===
    // risk_accumulator is sum of (risk_0_to_100 * weight_0_to_1000)
    // max possible ≈ 100 * 1000 = 100_000
    let score_clamped = (risk_accumulator / 1000).min(100) as u8;

    // Mask flags to valid 5-bit range
    let flags_valid = flags & 0x1F;

    // Pack score and flags into u64 return value
    ((score_clamped as u64) << 32) | (flags_valid as u64)
}

// -----------------------------------------------------------------------
// Unit Tests
// -----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn unpack(packed: u64) -> (u8, u8) {
        let score = (packed >> 32) as u8;
        let flags = (packed & 0xFF) as u8;
        (score, flags)
    }

    #[test]
    fn test_high_risk_new_wallet_large_request() {
        let packed = score_proposal(
            5_000,               // very new wallet
            25_000_000_000_000_000_000_000,  // 25000 DOT = 5x average
            0,                   // no approvals
            0,                   // no history
            999,                 // no burst
            34,                  // big_spender track
        );
        let (score, flags) = unpack(packed);
        assert!(score >= 50, "Expected high risk, got {}", score);
        assert!(flags & 0x01 != 0, "Should flag new wallet");
        assert!(flags & 0x02 != 0, "Should flag large request");
        assert!(flags & 0x04 != 0, "Should flag no history");
    }

    #[test]
    fn test_low_risk_established_proposer() {
        let packed = score_proposal(
            200_000,             // old wallet
            1_000_000_000_000_000_000_000,  // 1000 DOT = well below average
            8,                   // 8 approved
            10,                  // 10 total = 80%
            30,                  // no burst
            33,                  // medium_spender
        );
        let (score, flags) = unpack(packed);
        assert!(score <= 30, "Expected low risk, got {}", score);
        assert!(flags == 0, "Expected no flags, got {:#04x}", flags);
    }

    #[test]
    fn test_burst_detection() {
        let packed = score_proposal(
            200_000,
            1_000_000_000_000_000_000_000,
            5,
            8,
            1,                   // 1 day since last = burst
            33,
        );
        let (_, flags) = unpack(packed);
        assert!(flags & 0x10 != 0, "Should flag burst activity");
    }

    #[test]
    fn test_score_capped_at_100() {
        let packed = score_proposal(
            0,                   // brand new wallet
            100_000_000_000_000_000_000_000, // absurdly large
            0, 0, 0, 34,
        );
        let (score, _) = unpack(packed);
        assert!(score <= 100, "Score must not exceed 100, got {}", score);
    }

    #[test]
    fn test_zero_inputs_no_panic() {
        let packed = score_proposal(0, 0, 0, 0, 999, 0);
        let (score, _) = unpack(packed);
        assert!(score <= 100);
    }

    #[test]
    fn test_deterministic() {
        let a = score_proposal(10_000, 5_000_000_000_000_000_000_000, 2, 5, 10, 33);
        let b = score_proposal(10_000, 5_000_000_000_000_000_000_000, 2, 5, 10, 33);
        assert_eq!(a, b, "Same inputs must produce same output");
    }
}
