# EcoQuest

Proposal implementation checklist: [Proposal Traceability](docs/PROPOSAL_TRACEABILITY.md).

EcoQuest is a Three.js city-building environmental simulation with a FastAPI flood-intelligence backend for Sylhet Division, Bangladesh.

## Current ML and game-simulation scope

- Geographic coverage: 38 upazilas in Sylhet Division.
- The Three.js game has a dynamic, rule-based simulation using rainfall, green coverage and drainage.
- Selecting an Upazila applies the existing historical susceptibility layer as a geographic game-risk modifier.
- The Environmental Assistant shows the selected area's historical susceptibility context, explains local simulation drivers, previews drainage/tree actions, and can invoke the game's existing drainage and tree-placement controls.
- The assistant's dynamic game-risk score is a simulation indicator, not a calibrated flood probability or a live forecast.
- The XGBoost classifier remains a separate feature-based model for its historical binary target; it is not silently treated as a per-Upazila or real-time prediction.
- Precomputed map layer: upazila flood-susceptibility statistics and simplified GeoJSON.
- ML model: saved XGBoost binary classifier.
- Training samples: 20,000.
- Input features: `elev`, `hand`, `slope`, `curv`, `twi`, `sti`, `dist`, `dd`, `rain`, `lulc`, `soil`.
- Target: `y = 1` when the 2022 flood fraction is at least 0.50.
- Validation: 5-fold GroupKFold using 10 km spatial blocks.

The model predicts its historical binary training target from an explicitly supplied feature vector. It is **not** a real-time flood forecast. The existing map's precomputed susceptibility scores and quantile-based map thresholds are separate from the binary model probability and must not be treated as interchangeable.

## Dynamic environmental consequences

Player-built structures now affect derived city conditions through a transparent game-balance model:

- **Factories:** add ongoing industry pressure and increase effective pollution.
- **Houses, apartments and factories:** add impervious-surface pressure, which increases simulated runoff and slightly reduces effective green coverage.
- **Trees and gardens:** add infiltration capacity, offsetting some built-surface runoff.
- **Rainfall, effective greenery, drainage and runoff:** combine to calculate the local simulated flood-risk score.
- **Selected Upazila:** the existing historical susceptibility layer continues to apply its game modifier after local conditions are calculated.

The HUD displays effective pollution, effective green coverage, industry pressure and runoff pressure. The Environmental Assistant uses the same calculation and explains the contributing flood-risk factors. Mission objectives use effective green and pollution values.

These are explicit gameplay weights, not measured environmental quantities or a validated real-world flood prediction. Run the automated calculation tests with `npm test`.

## Environmental challenge system

The game includes three sequential, state-based missions:

1. **Green Recovery** — increase Green Score by 15 points and Happiness by 6 points through planting and green-space actions.
2. **Flood Readiness** — reach at least 25% simulated rainfall and 70% drainage, then observe the updated flood-risk indicator.
3. **Clean City** — bring Pollution to 30% or lower and Waste to 20% or lower using the existing cleanup action.

Each mission measures progress from the game state captured when that mission starts. Completing a mission awards in-game credits and unlocks the next challenge. Mission progress is included in the existing local save/load flow. The mission system uses the game's current simulation rules; it does not introduce a new trained AI model or claim real-world forecast accuracy.

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
| POST | `/api/model/explain` | Local SHAP TreeExplainer contributions for 11 supplied features |

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

The API returns the positive-class probability and a default 0.50 decision. That cutoff is not a calibrated public-warning threshold. The explanation endpoint returns SHAP contributions on the raw model margin (log-odds) scale; positive contributions move the output toward class 1 and negative contributions toward class 0. SHAP values explain model behavior, not causal effects.

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
- Local SHAP explanation is available for a supplied 11-feature vector when the SHAP dependency is installed. It does not provide a map-wide SHAP raster.
- The map represents susceptibility, not current water levels or real-time flood alerts.


## Proposal completion: interactive AI and resource loop

The frontend now includes an **AI Prediction Lab** inside the Flood Intelligence map:

1. Open the Flood Intelligence map from the game.
2. Scroll to **AI Prediction Lab** in the model panel.
3. Enter all 11 feature values using the same units and class coding as the model's training data.
4. Submit to the FastAPI `/api/model/predict` endpoint.
5. The interface displays the probability for the model's historical binary target and requests a local explanation from `/api/model/explain`.
6. SHAP contributions are displayed on the raw model-margin (log-odds) scale.

The form intentionally has no fabricated default feature values. The selected Upazila's summary statistics are not enough to reconstruct the model's complete 11-feature vector, so the interface does not pretend to infer those inputs automatically.

**Important distinction:** the live game Flood Risk indicator is an explainable rule-based simulation of rainfall, effective greenery, drainage and built-surface runoff. The XGBoost Prediction Lab is a separate feature-based model that estimates its historical target: 2022 flood fraction >= 0.50. Neither output is a real-time flood warning.

## Energy, waste and city economy

Construction now has reversible resource effects:

- Solar panels increase the energy balance and reduce pollution.
- Houses, apartments, factories and street lamps consume energy.
- Buildings generate waste according to their gameplay impact.
- Removing a structure reverses its construction effects and returns the existing partial credit refund.
- The HUD displays Waste alongside Energy.
- The in-game sustainability score considers effective green coverage, happiness, effective pollution, energy and waste.

These are transparent gameplay rules for learning and balancing decisions, not measured real-world environmental coefficients.

## Local configuration

Copy the root `.env.example` to `.env` and set the API address:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For the backend, copy `ml_backend/.env.example` to `ml_backend/.env`. Set `ECOQUEST_CORS_ORIGINS` to the exact local frontend origins or the deployed frontend origin, separated by commas. Public deployments must not use wildcard CORS.

## Deployment preparation

Deployment configuration is included:

- `vercel.json` builds the Vite frontend into `dist`.
- `render.yaml` describes the FastAPI web service, its health-check route and startup command.

To deploy, create the frontend project on Vercel and the API service on Render from this repository. Set `VITE_API_BASE_URL` in Vercel to the deployed API base URL. Set `ECOQUEST_CORS_ORIGINS` in Render to the deployed Vercel origin. The deployment files prepare the project but do not create hosting accounts, secrets, or a public URL.

## Persistence scope

The MVP saves the city and mission progress in browser `localStorage`. Supabase/PostgreSQL accounts and a public leaderboard remain follow-on features in the proposal; they are not represented as implemented in this MVP.

## Architecture decisions

The proposal's original diagram lists Phaser 3.90. The current implementation uses **Three.js** for the full 3D city experience, following the later project decision to retain the Three.js city builder. The frontend remains Vite + JavaScript, and the AI service remains Python + FastAPI. The proposal mentions Random Forest or Gradient Boosting as candidate baselines; the current repository contains a trained XGBoost classifier and documents its historical target and spatial validation separately.
