"""
Fenrir — Python to Rust Weight Exporter
=========================================
Converts trained sklearn model weights and thresholds into
Rust constants for the FenrirInference PolkaVM contract.

This is the critical bridge between the off-chain Python
training pipeline and the on-chain Rust inference contract.
The exported weights.rs file is compiled directly into the
PolkaVM binary.

Usage:
    python export_weights.py --model data/model.pkl --output ../inference/src/weights.rs
    python export_weights.py --weights data/weights.json --output ../inference/src/weights.rs
"""

import argparse
import json
import logging
import os
import pickle
from datetime import datetime, timezone

import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("fenrir.export")


def load_model_weights(model_path=None, weights_path=None):
    """
    Load weights either from a trained model or a weights JSON file.

    If both are provided, the weights JSON takes precedence as
    it may have been manually tuned after training.
    """
    if weights_path and os.path.exists(weights_path):
        logger.info("Loading weights from JSON: %s", weights_path)
        with open(weights_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["feature_weights"], data.get("thresholds", {})

    if model_path and os.path.exists(model_path):
        logger.info("Loading weights from model: %s", model_path)
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        feature_names = [
            "wallet_age_blocks",
            "dot_ratio_to_avg",
            "approval_rate",
            "prior_total",
            "track_id",
            "days_since_last_prop",
        ]

        importances = model.feature_importances_
        weights = {}
        for i, name in enumerate(feature_names):
            weights[name] = int(importances[i] * 100)

        # Extract thresholds from the tree
        tree = model.tree_
        thresholds = {}
        for node_id in range(tree.node_count):
            if tree.feature[node_id] >= 0:
                feat_idx = tree.feature[node_id]
                feat_name = feature_names[feat_idx]
                if feat_name not in thresholds:
                    thresholds[feat_name] = []
                thresholds[feat_name].append(float(tree.threshold[node_id]))

        median_thresholds = {
            name: float(np.median(vals))
            for name, vals in thresholds.items()
        }

        return weights, median_thresholds

    # Fallback: use the blueprint's default weights
    logger.warning("No model or weights file found — using blueprint defaults")
    return get_default_weights()


def get_default_weights():
    """
    Return the default weights from the BASE_INSTRUCTIONS blueprint.

    These are used when no trained model is available, ensuring
    the inference contract always has sensible behaviour.
    """
    weights = {
        "wallet_age_blocks": 35,    # 35% importance — young wallets are suspect
        "dot_ratio_to_avg": 30,     # 30% importance — outsized requests
        "approval_rate": 35,        # 35% importance — track record matters
        "prior_total": 0,           # Accounted for via approval_rate
        "track_id": 0,              # Reserved for future use
        "days_since_last_prop": 0,  # Burst detection via flag only
    }

    thresholds = {
        "wallet_age_blocks": 50000.0,   # ~83 days at 6s block time
        "dot_ratio_to_avg": 3.0,        # 3x ecosystem average
        "approval_rate": 0.2,           # Below 20% is concerning
        "days_since_last_prop": 7.0,    # Less than a week between proposals
    }

    return weights, thresholds


def generate_rust_weights(weights, thresholds):
    """
    Generate the Rust source code for weights.rs.

    Produces clean, well-documented Rust constants that are
    directly usable by the inference contract's scoring logic.
    All values are integers to avoid floating-point arithmetic
    in the PolkaVM contract.
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Map feature weights to the Rust constant names used
    # in the blueprint's inference contract
    wallet_age_weight = weights.get("wallet_age_blocks", 35)
    dot_ratio_weight = weights.get("dot_ratio_to_avg", 30)
    approval_rate_weight = weights.get("approval_rate", 35)
    no_history_weight = max(15, approval_rate_weight // 2)
    burst_weight = weights.get("days_since_last_prop", 15)

    # Thresholds — converted to integer representations
    wallet_age_threshold = int(thresholds.get("wallet_age_blocks", 50000))
    dot_ratio_threshold = int(thresholds.get("dot_ratio_to_avg", 3.0) * 100)
    approval_rate_threshold = int(thresholds.get("approval_rate", 0.2) * 100)

    rust_code = f"""\
// -----------------------------------------------------------------------
// Fenrir Model Weights — Auto-generated from Python training pipeline
// Generated: {timestamp}
// Do NOT edit manually — run: python export_weights.py
// -----------------------------------------------------------------------
//
// These constants represent the trained decision tree's feature
// importances, scaled to integer weights suitable for on-chain
// arithmetic. The inference contract uses these to compute a
// weighted risk score without floating-point operations.

/// Weight for wallet age feature.
/// Negative correlation — younger wallets receive higher risk scores.
/// Derived from feature importance: {wallet_age_weight}% of total model weight.
pub const WEIGHT_WALLET_AGE: i32 = -{wallet_age_weight};

/// Weight for DOT request ratio feature.
/// Positive correlation — requests above the ecosystem average
/// contribute proportionally to risk.
pub const WEIGHT_DOT_RATIO: i32 = {dot_ratio_weight};

/// Weight for approval rate feature.
/// Negative correlation — proposers with good track records
/// receive lower risk scores.
pub const WEIGHT_APPROVAL_RATE: i32 = -{approval_rate_weight};

/// Weight for the no-history penalty.
/// Applied when a proposer has zero prior approved proposals.
pub const WEIGHT_NO_HISTORY: i32 = {no_history_weight};

/// Weight for burst activity detection.
/// Applied when multiple proposals are submitted in rapid succession.
pub const WEIGHT_BURST: i32 = {burst_weight};

/// Baseline score before feature adjustments.
/// A score of 50 represents neutral risk — features push it
/// up towards 100 (high risk) or down towards 0 (minimal risk).
pub const BIAS: i32 = 50;

// -----------------------------------------------------------------------
// Thresholds — define when risk flags are triggered
// -----------------------------------------------------------------------

/// Wallet must be at least this many blocks old to avoid the
/// new-wallet flag. At ~6 seconds per block, {wallet_age_threshold}
/// blocks equates to roughly {wallet_age_threshold * 6 // 86400} days.
pub const WALLET_AGE_THRESHOLD: u64 = {wallet_age_threshold};

/// DOT ratio threshold as a percentage.
/// A value of {dot_ratio_threshold} means the requested amount must
/// exceed {dot_ratio_threshold // 100}x the ecosystem average to
/// trigger the large-request flag.
pub const DOT_RATIO_THRESHOLD: u64 = {dot_ratio_threshold};

/// Approval rate threshold as a percentage.
/// Proposers with an approval rate below {approval_rate_threshold}%
/// are flagged as having a poor track record.
pub const APPROVAL_RATE_THRESHOLD: u32 = {approval_rate_threshold};

// -----------------------------------------------------------------------
// Feature weight percentages (for weighted score computation)
// -----------------------------------------------------------------------

/// Percentage of the final score attributed to wallet age.
pub const FEATURE_WEIGHT_WALLET_AGE: u64 = {wallet_age_weight};

/// Percentage of the final score attributed to DOT ratio.
pub const FEATURE_WEIGHT_DOT_RATIO: u64 = {dot_ratio_weight};

/// Percentage of the final score attributed to proposer history.
pub const FEATURE_WEIGHT_HISTORY: u64 = {100 - wallet_age_weight - dot_ratio_weight};
"""

    return rust_code


def main():
    """Entry point for the weight export pipeline."""
    parser = argparse.ArgumentParser(
        description="Fenrir — Export trained model weights to Rust constants"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="data/model.pkl",
        help="Path to trained model pickle (default: data/model.pkl)",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default="data/weights.json",
        help="Path to weights JSON (default: data/weights.json)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="../inference/src/weights.rs",
        help="Output Rust file (default: ../inference/src/weights.rs)",
    )

    args = parser.parse_args()

    # Load weights from whichever source is available
    weights, thresholds = load_model_weights(
        model_path=args.model,
        weights_path=args.weights,
    )

    logger.info("Feature weights:")
    for name, w in weights.items():
        logger.info("  %-25s %d", name, w)

    logger.info("Thresholds:")
    for name, t in thresholds.items():
        logger.info("  %-25s %.2f", name, t)

    # Generate the Rust source
    rust_code = generate_rust_weights(weights, thresholds)

    # Write to file
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(rust_code)

    logger.info("✓ Rust weights written to: %s", args.output)
    logger.info("  Next step: cd ../inference && cargo build --release")


if __name__ == "__main__":
    main()
