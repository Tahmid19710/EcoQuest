"""XGBoost inference utilities for EcoQuest.

The model predicts the training target (2022 flood fraction >= 0.50).
It does not produce a real-time flood forecast.
"""
from pathlib import Path
import json

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "EcoQuest_Final_XGB.ubj"
METADATA_PATH = BASE_DIR / "models" / "EcoQuest_Model_Metadata.json"

FEATURES = [
    "elev",
    "hand",
    "slope",
    "curv",
    "twi",
    "sti",
    "dist",
    "dd",
    "rain",
    "lulc",
    "soil",
]

_model = None
_metadata = {}
_load_error = None


class ModelUnavailableError(RuntimeError):
    """Raised when the saved XGBoost model is not available."""


def load_model() -> bool:
    """Load the native XGBoost model once when the API starts."""
    global _model, _metadata, _load_error

    if not MODEL_PATH.is_file():
        _model = None
        _load_error = "Saved XGBoost model file is missing."
        return False

    try:
        import xgboost as xgb

        candidate = xgb.XGBClassifier()
        candidate.load_model(str(MODEL_PATH))

        booster = candidate.get_booster()
        if booster.num_features() != len(FEATURES):
            raise ValueError(
                f"Model expects {booster.num_features()} features; "
                f"EcoQuest API defines {len(FEATURES)}."
            )

        saved_names = booster.feature_names
        if saved_names and list(saved_names) != FEATURES:
            raise ValueError(
                "Saved model feature order does not match the API schema."
            )

        # The saved model was trained on Kaggle GPU. CPU inference keeps the
        # local FastAPI backend usable without requiring a CUDA installation.
        candidate.set_params(device="cpu")

        metadata = {}
        if METADATA_PATH.is_file():
            with METADATA_PATH.open("r", encoding="utf-8") as file:
                metadata = json.load(file)

        if metadata.get("features") and metadata["features"] != FEATURES:
            raise ValueError(
                "Model metadata feature order does not match the API schema."
            )

        _model = candidate
        _metadata = metadata
        _load_error = None
        return True

    except Exception as exc:
        _model = None
        _load_error = f"{type(exc).__name__}: {exc}"
        return False


def is_model_loaded() -> bool:
    return _model is not None


def get_model_info() -> dict:
    """Return model provenance and validation metadata."""
    return {
        "loaded": is_model_loaded(),
        "model": _metadata.get("model", "XGBoost Classifier"),
        "version": _metadata.get("version"),
        "training_samples": _metadata.get("training_samples"),
        "features": FEATURES,
        "target": _metadata.get("target", "y"),
        "target_definition": _metadata.get(
            "target_definition", "2022 flood fraction >= 0.50"
        ),
        "spatial_validation": _metadata.get("spatial_validation"),
        "validation_folds": _metadata.get("validation_folds"),
        "mean_spatial_cv": _metadata.get("mean_spatial_cv", {}),
        "message": (
            "Model ready for feature-based inference."
            if is_model_loaded()
            else "Model inference is unavailable."
        ),
        "error": _load_error,
        "forecast_scope": (
            "Historical susceptibility classification target; "
            "not a real-time flood forecast."
        ),
    }


def predict_features(values: dict, threshold: float = 0.5) -> dict:
    """Predict the probability of the model's binary training target."""
    if _model is None:
        raise ModelUnavailableError("XGBoost model is not loaded.")

    ordered_values = {name: float(values[name]) for name in FEATURES}

    # Match the preprocessing used by the training notebook.
    ordered_values["lulc"] = int(round(ordered_values["lulc"]))

    frame = pd.DataFrame(
        [[ordered_values[name] for name in FEATURES]],
        columns=FEATURES,
    )

    probability = float(_model.predict_proba(frame)[0, 1])
    prediction = int(probability >= threshold)

    return {
        "target": "y",
        "target_definition": "2022 flood fraction >= 0.50",
        "positive_class_probability": round(probability, 6),
        "decision_threshold": threshold,
        "prediction": prediction,
        "predicted_label": (
            "Target event (y=1)"
            if prediction == 1
            else "No target event (y=0)"
        ),
        "features_used": ordered_values,
        "interpretation": (
            "This is the model probability for its historical binary target. "
            "The 0.50 cutoff is a default decision threshold, not a calibrated "
            "public-warning threshold or a real-time forecast."
        ),
    }


def get_feature_importance() -> dict:
    """Return normalized XGBoost gain importance, not SHAP values."""
    if _model is None:
        raise ModelUnavailableError("XGBoost model is not loaded.")

    booster = _model.get_booster()
    raw_scores = booster.get_score(importance_type="gain")

    scores = []
    for index, feature in enumerate(FEATURES):
        score = float(
            raw_scores.get(
                feature,
                raw_scores.get(f"f{index}", 0.0),
            )
        )
        scores.append((feature, score))

    total = sum(score for _, score in scores)
    results = [
        {
            "feature": feature,
            "gain": round(score, 6),
            "gain_importance_pct": round(
                (score / total * 100.0) if total else 0.0, 4
            ),
        }
        for feature, score in scores
    ]
    results.sort(key=lambda item: item["gain_importance_pct"], reverse=True)

    return {
        "importance_type": "XGBoost gain",
        "is_shap": False,
        "note": (
            "Gain importance is a global tree-split statistic. "
            "It is not a SHAP explanation and does not show causal effects."
        ),
        "features": results,
    }
