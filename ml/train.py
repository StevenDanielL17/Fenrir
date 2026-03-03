"""
Fenrir — Model Training Script
================================
Trains a Decision Tree Classifier on historical OpenGov proposal data.
Exports a confusion matrix, classification report, and the trained
model for downstream Rust weight export.

The algorithm is deliberately kept simple (decision tree) so that
the resulting weights can be hardcoded as Rust constants inside
the PolkaVM inference contract. Interpretability is paramount —
Fenrir must be able to explain *why* a proposal was flagged.

Usage:
    python train.py --data data/proposals.csv --output data/model.pkl
"""

import argparse
import json
import logging
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    precision_score,
    recall_score,
    f1_score,
)

# -----------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("fenrir.train")

# -----------------------------------------------------------------------
# Feature Columns
# -----------------------------------------------------------------------
# These match the feature vector specified in BASE_INSTRUCTIONS Section 5.
# wallet_age_blocks, dot_ratio_to_avg, approval_rate, prior_total,
# track_id, and days_since_last_prop are the six features used for
# the decision tree. dot_requested is used for context but not
# directly in the model (we use the ratio instead).

FEATURE_COLUMNS = [
    "wallet_age_blocks",
    "dot_ratio_to_avg",
    "approval_rate",
    "prior_total",
    "track_id",
    "days_since_last_prop",
]

LABEL_COLUMN = "high_risk"


def load_and_validate_data(data_path):
    """
    Load the training CSV and validate it has the required columns.

    Returns a cleaned DataFrame with missing values handled
    and features normalised where necessary.
    """
    logger.info("Loading training data from: %s", data_path)
    df = pd.read_csv(data_path)

    # Verify all required columns exist
    required = FEATURE_COLUMNS + [LABEL_COLUMN]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in training data: {missing}")

    logger.info("Loaded %d rows with %d columns", len(df), len(df.columns))

    # Handle missing values sensibly
    df["wallet_age_blocks"] = df["wallet_age_blocks"].fillna(100000)
    df["dot_ratio_to_avg"] = df["dot_ratio_to_avg"].fillna(1.0)
    df["approval_rate"] = df["approval_rate"].fillna(0.0)
    df["prior_total"] = df["prior_total"].fillna(0)
    df["track_id"] = df["track_id"].fillna(-1)
    df["days_since_last_prop"] = df["days_since_last_prop"].fillna(365)
    df["high_risk"] = df["high_risk"].fillna(0).astype(int)

    # Log class distribution — important for understanding model bias
    risk_counts = df[LABEL_COLUMN].value_counts()
    logger.info("Class distribution:")
    logger.info("  Low risk (0):  %d (%.1f%%)", risk_counts.get(0, 0),
                risk_counts.get(0, 0) / len(df) * 100)
    logger.info("  High risk (1): %d (%.1f%%)", risk_counts.get(1, 0),
                risk_counts.get(1, 0) / len(df) * 100)

    return df


def train_decision_tree(X_train, y_train, X_test, y_test):
    """
    Train the primary Decision Tree Classifier.

    We use max_depth=5 as specified in the blueprint — deep enough
    to capture meaningful patterns, shallow enough to be
    interpretable and exportable to Rust constants.
    """
    logger.info("Training Decision Tree Classifier (max_depth=5)...")

    model = DecisionTreeClassifier(
        max_depth=5,
        min_samples_leaf=10,
        min_samples_split=20,
        class_weight="balanced",      # Handle class imbalance
        random_state=42,
    )

    model.fit(X_train, y_train)

    # Evaluate on test set
    y_pred = model.predict(X_test)

    logger.info("\n=== Decision Tree Results ===")
    logger.info("\nClassification Report:\n%s", classification_report(y_test, y_pred))
    logger.info("\nConfusion Matrix:\n%s", confusion_matrix(y_test, y_pred))

    # Cross-validation for robustness check
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring="precision")
    logger.info("\nCross-validation precision scores: %s", cv_scores)
    logger.info("Mean CV precision: %.4f (+/- %.4f)", cv_scores.mean(), cv_scores.std())

    # Feature importances — crucial for understanding what drives scores
    importances = dict(zip(FEATURE_COLUMNS, model.feature_importances_))
    logger.info("\nFeature Importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: x[1], reverse=True):
        logger.info("  %-25s %.4f", feat, imp)

    # Print the decision tree as text (for human review)
    tree_rules = export_text(model, feature_names=FEATURE_COLUMNS)
    logger.info("\nDecision Tree Rules:\n%s", tree_rules)

    return model


def train_logistic_baseline(X_train, y_train, X_test, y_test):
    """
    Train a Logistic Regression model as a comparison baseline.

    This isn't used in production — it's purely for validation.
    If the decision tree performs significantly worse than logistic
    regression, we know we might need to revisit our approach.
    """
    logger.info("Training Logistic Regression baseline...")

    baseline = LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )

    baseline.fit(X_train, y_train)
    y_pred = baseline.predict(X_test)

    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)

    logger.info("Logistic Regression — Precision: %.4f, Recall: %.4f, F1: %.4f",
                precision, recall, f1)

    return baseline


def extract_weights(model, feature_names):
    """
    Extract interpretable weights from the trained decision tree
    for hardcoding into the Rust inference contract.

    This function analyses the tree structure and derives
    simplified feature weights and thresholds that can be
    represented as integer constants in Rust.
    """
    tree = model.tree_
    importances = model.feature_importances_

    # Scale importances to weights (range roughly -50 to +50)
    # Negative weights mean the feature reduces risk
    weights = {}
    for i, name in enumerate(feature_names):
        importance = importances[i]
        # Scale to a weight value suitable for the Rust contract
        weight = int(importance * 100)
        weights[name] = weight

    # Extract key thresholds from the tree's decision nodes
    thresholds = {}
    for node_id in range(tree.node_count):
        if tree.feature[node_id] >= 0:  # Not a leaf
            feature_idx = tree.feature[node_id]
            feature_name = feature_names[feature_idx]
            threshold_value = tree.threshold[node_id]

            if feature_name not in thresholds:
                thresholds[feature_name] = []
            thresholds[feature_name].append(float(threshold_value))

    # Take the median threshold for each feature
    median_thresholds = {}
    for name, vals in thresholds.items():
        median_thresholds[name] = float(np.median(vals))

    return weights, median_thresholds


def save_model_and_weights(model, weights, thresholds, output_dir):
    """
    Persist the trained model and extracted weights.

    Saves:
    - model.pkl — the full sklearn model (for reference)
    - weights.json — extracted weights and thresholds
    - training_report.txt — human-readable summary
    """
    os.makedirs(output_dir, exist_ok=True)

    # Save the model
    model_path = os.path.join(output_dir, "model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    logger.info("Model saved to: %s", model_path)

    # Save weights as JSON for the export_weights.py script
    weights_path = os.path.join(output_dir, "weights.json")
    weights_data = {
        "feature_weights": weights,
        "thresholds": thresholds,
        "feature_names": FEATURE_COLUMNS,
        "model_type": "DecisionTreeClassifier",
        "max_depth": 5,
    }
    with open(weights_path, "w", encoding="utf-8") as f:
        json.dump(weights_data, f, indent=2)
    logger.info("Weights saved to: %s", weights_path)


def main():
    """Entry point for model training."""
    parser = argparse.ArgumentParser(
        description="Fenrir — Train risk scoring model on OpenGov proposals"
    )
    parser.add_argument(
        "--data",
        type=str,
        default="data/proposals.csv",
        help="Path to training CSV (default: data/proposals.csv)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data",
        help="Output directory for model and weights (default: data)",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of data for test split (default: 0.2)",
    )

    args = parser.parse_args()

    # Load and prepare data
    df = load_and_validate_data(args.data)

    X = df[FEATURE_COLUMNS]
    y = df[LABEL_COLUMN]

    # Split into training and test sets
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=args.test_size,
        random_state=42,
        stratify=y,
    )

    logger.info("Training set: %d samples, Test set: %d samples",
                len(X_train), len(X_test))

    # Train the primary model
    model = train_decision_tree(X_train, y_train, X_test, y_test)

    # Train baseline for comparison
    train_logistic_baseline(X_train, y_train, X_test, y_test)

    # Extract weights for Rust export
    weights, thresholds = extract_weights(model, FEATURE_COLUMNS)
    logger.info("\nExtracted weights for Rust contract:")
    for name, w in weights.items():
        logger.info("  %-25s weight=%d", name, w)

    logger.info("\nExtracted thresholds:")
    for name, t in thresholds.items():
        logger.info("  %-25s threshold=%.2f", name, t)

    # Save everything
    save_model_and_weights(model, weights, thresholds, args.output)

    logger.info("\n✓ Training complete. Next step: python export_weights.py")


if __name__ == "__main__":
    main()
