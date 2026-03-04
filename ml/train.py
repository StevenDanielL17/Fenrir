"""
Trains decision tree classifier on scraped proposals.
Target: 70%+ precision on high_risk class.
Output: ml/model.joblib + calls export_weights.py
"""
import pandas as pd
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report
import joblib

FEATURE_COLS = [
    "wallet_age_blocks",
    "requested_dot",
    "dot_ratio_to_avg",       # engineered: requested / ecosystem_avg
    "prior_approved",
    "prior_total",
    "approval_rate",           # engineered: prior_approved / prior_total
    "track_id",
    "days_since_last_prop",
]


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered features required by the model."""
    ecosystem_avg = df["requested_dot"].median()
    df["dot_ratio_to_avg"] = df["requested_dot"] / max(ecosystem_avg, 1)
    df["approval_rate"] = (
        df["prior_approved"] / df["prior_total"].clip(lower=1)
    ) * 100
    df = df.fillna(0)
    return df, ecosystem_avg


def train(data_path: str = "data/proposals.csv"):
    df = pd.read_csv(data_path)
    df, ecosystem_avg = engineer_features(df)

    X = df[FEATURE_COLS]
    y = df["high_risk"]

    print(f"Dataset: {len(df)} proposals, {y.sum()} high risk ({y.mean()*100:.1f}%)")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Decision tree — interpretable, weights exportable to Rust
    model = DecisionTreeClassifier(
        max_depth=6,
        min_samples_leaf=8,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    print("\n=== Classification Report ===")
    print(classification_report(y_test, y_pred, target_names=["clean", "high_risk"]))

    cv_scores = cross_val_score(model, X, y, cv=5, scoring="precision")
    print(f"CV Precision: {cv_scores.mean():.3f} (+/- {cv_scores.std():.3f})")

    # Save model
    joblib.dump(model, "model.joblib")

    # Export to Rust
    from export_weights import export_to_rust
    export_to_rust(model, FEATURE_COLS, ecosystem_avg=ecosystem_avg)

    return model


if __name__ == "__main__":
    train()
