"""
Evaluate a trained Fenrir model against the test set.
Produces classification report, confusion matrix, and feature importance chart.
Optional standalone script — train.py also evaluates during training.
"""
import pandas as pd
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
import joblib
from pathlib import Path


def evaluate(model_path: str = "model.joblib", data_path: str = "data/proposals.csv"):
    model = joblib.load(model_path)
    df = pd.read_csv(data_path)

    # Engineer features (same as train.py)
    ecosystem_avg = df["dot_requested"].median()
    df["dot_ratio_to_avg"] = df["dot_requested"] / max(ecosystem_avg, 1)
    df["approval_rate"] = (
        df["prior_approved"] / df["prior_total"].clip(lower=1)
    ) * 100
    df = df.fillna(0)

    feature_cols = [
        "wallet_age_blocks", "dot_requested", "dot_ratio_to_avg",
        "prior_approved", "prior_total", "approval_rate",
        "track_id", "days_since_last_prop",
    ]

    X = df[feature_cols]
    y = df["high_risk"]

    y_pred = model.predict(X)

    print("=== Full Dataset Evaluation ===")
    print(f"Samples: {len(df)}")
    print(f"High risk: {y.sum()} ({y.mean()*100:.1f}%)")
    print()
    print(classification_report(y, y_pred, target_names=["clean", "high_risk"]))
    print("Confusion Matrix:")
    print(confusion_matrix(y, y_pred))
    print()

    # Feature importances
    importances = model.feature_importances_
    print("Feature Importances:")
    for name, imp in sorted(zip(feature_cols, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"  {name:25s} {imp:.3f} {bar}")


if __name__ == "__main__":
    evaluate()
