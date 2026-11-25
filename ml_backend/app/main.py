from pathlib import Path
import json

import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.model_service import (
    ModelUnavailableError,
    get_feature_importance,
    get_model_info,
    is_model_loaded,
    load_model,
    predict_features,
)


# =====================================================
# ECOQUEST BACKEND CONFIGURATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

CSV_PATH = DATA_DIR / "tables" / "EcoQuest_Upazila_Susceptibility.csv"
GEOJSON_PATH = DATA_DIR / "maps" / "EcoQuest_Upazila_Susceptibility_simplified.geojson"
THRESHOLD_PATH = DATA_DIR / "config" / "susceptibility_thresholds.json"


# =====================================================
# LOAD PRECOMPUTED GEOGRAPHIC DATA
# =====================================================

if not CSV_PATH.exists():
    raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

df = pd.read_csv(CSV_PATH)

required_columns = [
    "rank", "district", "upazila", "population",
    "mean_score", "median_score",
    "low_pct", "moderate_pct", "high_pct",
    "very_high_pct", "high_very_high_pct",
    "observed_flood22_pct", "observed_flood24_pct",
    "valid_pixels", "coverage_pct"
]

missing_columns = [
    col for col in required_columns if col not in df.columns
]

if missing_columns:
    raise ValueError(f"Missing CSV columns: {missing_columns}")


thresholds = {}

if THRESHOLD_PATH.exists():
    with open(THRESHOLD_PATH, "r", encoding="utf-8") as file:
        thresholds = json.load(file)


geojson_data = None

if GEOJSON_PATH.exists():
    with open(GEOJSON_PATH, "r", encoding="utf-8") as file:
        geojson_data = json.load(file)


# =====================================================
# MODEL INPUT SCHEMA
# =====================================================

class ModelPredictionInput(BaseModel):
    elev: float = Field(..., allow_inf_nan=False)
    hand: float = Field(..., allow_inf_nan=False)
    slope: float = Field(..., allow_inf_nan=False)
    curv: float = Field(..., allow_inf_nan=False)
    twi: float = Field(..., allow_inf_nan=False)
    sti: float = Field(..., allow_inf_nan=False)
    dist: float = Field(..., allow_inf_nan=False)
    dd: float = Field(..., allow_inf_nan=False)
    rain: float = Field(..., allow_inf_nan=False)
    lulc: float = Field(..., allow_inf_nan=False)
    soil: float = Field(..., allow_inf_nan=False)

    class Config:
        extra = "forbid"


# =====================================================
# FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="EcoQuest Flood Intelligence API",
    description=(
        "Sylhet Division flood susceptibility information and "
        "feature-based XGBoost inference. The model target is historical "
        "flood fraction >= 0.50; this API is not a real-time flood forecast."
    ),
    version="1.1.0"
)


# Development CORS configuration.
# Restrict origins before public deployment.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def get_dominant_class(row):

    classes = {
        "Low": row["low_pct"],
        "Moderate": row["moderate_pct"],
        "High": row["high_pct"],
        "Very High": row["very_high_pct"]
    }

    return max(classes, key=classes.get)


def serialize_upazila(row):

    result = {}

    for key, value in row.items():

        if pd.isna(value):
            result[key] = None

        elif hasattr(value, "item"):
            result[key] = value.item()

        else:
            result[key] = value

    result["dominant_class"] = get_dominant_class(result)

    return result


# =====================================================
# 1. ROOT ENDPOINT
# =====================================================

@app.get("/")
def root():

    return {
        "project": "EcoQuest",
        "message": "Flood Intelligence Backend is running.",
        "version": app.version,
        "documentation": "/docs"
    }


# =====================================================
# 2. HEALTH CHECK
# =====================================================

@app.get("/api/health")
def health():

    return {
        "status": "healthy",
        "project": "EcoQuest",
        "dataset": "Sylhet Division",
        "upazila_count": int(len(df)),
        "geojson_loaded": geojson_data is not None,
        "thresholds_loaded": bool(thresholds),
        "model": "XGBoost Classifier",
        "model_loaded": is_model_loaded(),
        "data_type": "Flood susceptibility"
    }


# =====================================================
# 3. GET ALL UPAZILAS
# =====================================================

@app.get("/api/upazilas")
def get_upazilas(
    district: str | None = None,
    search: str | None = None,
    sort_by: str = "rank",
    order: str = "asc"
):

    result = df.copy()

    if district:
        result = result[
            result["district"].str.casefold()
            == district.casefold()
        ]

    if search:
        result = result[
            result["upazila"].str.contains(
                search,
                case=False,
                na=False,
                regex=False
            )
        ]

    allowed_sort_columns = [
        "rank", "mean_score", "population",
        "high_very_high_pct", "observed_flood22_pct"
    ]

    if sort_by not in allowed_sort_columns:
        raise HTTPException(
            status_code=400,
            detail="Invalid sort_by value."
        )

    if order not in ["asc", "desc"]:
        raise HTTPException(
            status_code=400,
            detail="Order must be asc or desc."
        )

    result = result.sort_values(
        sort_by,
        ascending=(order == "asc")
    )

    return {
        "count": int(len(result)),
        "results": [
            serialize_upazila(row)
            for row in result.to_dict(orient="records")
        ]
    }


# =====================================================
# 4. GET SINGLE UPAZILA
# =====================================================

@app.get("/api/upazilas/{upazila_name}")
def get_upazila(upazila_name: str):

    result = df[
        df["upazila"].str.casefold()
        == upazila_name.casefold()
    ]

    if result.empty:
        raise HTTPException(
            status_code=404,
            detail="Upazila not found."
        )

    return serialize_upazila(
        result.iloc[0].to_dict()
    )


# =====================================================
# 5. FLOOD RISK SUMMARY
# =====================================================

@app.get("/api/risk/summary")
def risk_summary():

    district_summary = (
        df.groupby("district")
        .agg(
            upazila_count=("upazila", "count"),
            avg_mean_score=("mean_score", "mean"),
            avg_high_very_high_pct=("high_very_high_pct", "mean")
        )
        .reset_index()
    )

    top_upazilas = df.sort_values(
        "high_very_high_pct",
        ascending=False
    ).head(5)

    return {
        "geographic_coverage": "Sylhet Division",
        "total_upazilas": int(len(df)),
        "total_population": int(df["population"].sum()),

        "unweighted_upazila_average": {
            "mean_susceptibility": round(
                float(df["mean_score"].mean()), 4
            ),
            "high_very_high_percentage": round(
                float(df["high_very_high_pct"].mean()), 2
            )
        },

        "top_5_upazilas": [
            serialize_upazila(row)
            for row in top_upazilas.to_dict(orient="records")
        ],

        "district_summary": district_summary.to_dict(
            orient="records"
        )
    }


# =====================================================
# 6. GEOJSON MAP DATA
# =====================================================

@app.get("/api/map/geojson")
def get_map_geojson():

    if geojson_data is None:
        raise HTTPException(
            status_code=503,
            detail="GeoJSON data is unavailable."
        )

    return geojson_data


# =====================================================
# 7. SUSCEPTIBILITY THRESHOLDS
# =====================================================

@app.get("/api/config/thresholds")
def get_thresholds():

    if not thresholds:
        raise HTTPException(
            status_code=503,
            detail="Threshold configuration unavailable."
        )

    return thresholds


# =====================================================
# 8. XGBOOST MODEL INFORMATION
# =====================================================

@app.get("/api/model/info")
def model_info():

    return get_model_info()


# =====================================================
# 9. XGBOOST GLOBAL FEATURE IMPORTANCE
# =====================================================

@app.get("/api/model/feature-importance")
def model_feature_importance():

    try:
        return get_feature_importance()
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# =====================================================
# 10. XGBOOST FEATURE-BASED PREDICTION
# =====================================================

@app.post("/api/model/predict")
def model_predict(payload: ModelPredictionInput):

    try:
        return predict_features(payload.dict())
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# =====================================================
# STARTUP
# =====================================================

@app.on_event("startup")
def startup_event():

    model_ready = load_model()

    print("=" * 55)
    print("ECOQUEST FLOOD INTELLIGENCE API")
    print("=" * 55)
    print(f"Upazilas loaded: {len(df)}")
    print(f"GeoJSON loaded: {geojson_data is not None}")
    print(f"Thresholds loaded: {bool(thresholds)}")
    print(f"XGBoost model loaded: {model_ready}")
    if not model_ready:
        print("Model inference is unavailable; inspect model file/dependencies.")
    print("Backend ready!")
    print("=" * 55)
