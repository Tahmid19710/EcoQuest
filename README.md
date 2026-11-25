# EcoQuest

EcoQuest is a Three.js city-building environmental simulation with a FastAPI flood-intelligence backend for Sylhet Division, Bangladesh.

## Current ML scope

- Geographic coverage: 38 upazilas in Sylhet Division.
- Precomputed map layer: upazila flood-susceptibility statistics and simplified GeoJSON.
- ML model: saved XGBoost binary classifier.
- Training samples: 20,000.
- Input features: `elev`, `hand`, `slope`, `curv`, `twi`, `sti`, `dist`, `dd`, `rain`, `lulc`, `soil`.
- Target: `y = 1` when the 2022 flood fraction is at least 0.50.
- Validation: 5-fold GroupKFold using 10 km spatial blocks.

The model predicts its historical binary training target from an explicitly supplied feature vector. It is **not** a real-time flood forecast. The existing map's precomputed susceptibility scores and quantile-based map thresholds are separate from the binary model probability and must not be treated as interchangeable.

## Project structure

```text
EcoQuest/
├── src/                         # Three.js game and ML map frontend
├── public/                      # Static game assets
├── ml_backend/
│   ├── app/
│   │   ├── main.py               # FastAPI endpoints
│   │   └── model_service.py      # XGBoost loading and inference
│   ├── data/
│   │   ├── config/
│   │   ├── maps/
│   │   ├── rasters/
│   │   └── tables/
│   ├── models/                   # Saved model and evaluation metadata
│   └── requirements.txt
└── package.json
```

## Run the frontend

From the project root:

```powershell
npm install
npm run dev
```

## Run the backend

From the `ml_backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API documentation: http://127.0.0.1:8000/docs

## Model endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend and model health |
| GET | `/api/model/info` | Model provenance and spatial-CV metadata |
| GET | `/api/model/feature-importance` | Global XGBoost gain importance |
| POST | `/api/model/predict` | Predict the binary training target from 11 supplied features |

### Prediction request

```json
{
  "elev": 12.5,
  "hand": 2.1,
  "slope": 1.8,
  "curv": 0.02,
  "twi": 8.4,
  "sti": 5.2,
  "dist": 350.0,
  "dd": 1.4,
  "rain": 1800.0,
  "lulc": 4,
  "soil": 3
}
```

The values above are illustrative request-format examples only, not measured values for any real location. Do not use them as a scientific prediction.

The API returns the positive-class probability and a default 0.50 decision. That cutoff is not a calibrated public-warning threshold.

## Validation results

The committed `EcoQuest_Spatial_CV.csv` and model metadata record the 5 spatial folds. Reported mean metrics:

- ROC-AUC: 0.9538
- Accuracy: 0.8832
- Cohen's kappa: 0.7658
- F1-score: 0.8859
- Brier score: 0.0841

These are the previously recorded cross-validation results, not a new evaluation run.

## Current limitations

- The tracked data package contains precomputed susceptibility rasters and upazila summaries; the complete set of 11 predictor rasters has not yet been confirmed in the repository.
- Therefore, full-coverage raster inference and per-pixel SHAP mapping are not claimed as implemented.
- XGBoost gain importance is provided as a global model diagnostic. It is not SHAP and does not establish causal influence.
- The map represents susceptibility, not current water levels or real-time flood alerts.
