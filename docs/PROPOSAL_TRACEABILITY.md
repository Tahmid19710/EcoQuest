# EcoQuest Proposal-to-Implementation Traceability

This document maps the three-page **EcoQuest: Save Your City — Hackathon Project Idea Proposal** to the current repository. It separates implemented functionality from validation or deployment work that still requires real users, hosting accounts or additional data.

## 01. The Problem

**Proposal:** Poorly planned urban growth can connect pollution, loss of green space, energy and waste pressure, and urban flooding.

**Implementation:** The city simulation exposes connected gameplay indicators for pollution, green coverage, rainfall, drainage, flood risk, energy, waste, happiness, industrial pressure and surface-runoff pressure. Buildings, green infrastructure and resource actions change those indicators.

**Status:** Implemented as an educational simulation. Gameplay weights are not measurements of a real city.

## 02. The AI-Powered Solution

**Proposal:** Players act as mayor, manage city systems, receive environmental risk feedback and test alternative actions.

**Implementation:**
- Three.js city-building environment with districts, roads, buildings, green infrastructure, traffic, river/lake and weather effects.
- Environmental Assistant with a transparent live game-risk simulation and recommendations.
- What-if previews for drainage and tree planting.
- Three sequential missions: Green Recovery, Flood Readiness and Clean City.
- Flood Intelligence map for 38 Upazilas in Sylhet Division.
- AI Prediction Lab submits 11-feature vectors to the FastAPI XGBoost endpoint and displays the model result and SHAP contributions.

**Status:** Core loop and AI proof of concept implemented. The XGBoost form requires values from the same feature units/codes used during training; it does not fabricate or infer the complete feature vector from the selected Upazila summary.

## 03. Target Users and Expected Impact

**Proposal:** Students, young people, teachers, educational institutions, NGOs and community programmes.

**Implementation:** The missions, what-if previews, environmental indicators and recommendations provide a learning-oriented experience.

**Status:** Intended users are supported by the design. Learning impact has not yet been demonstrated through a pre/post user study.

## 04. AI Approach and Technical Design

**Proposal:** A supervised flood-risk baseline, an explainable output, open historical data where available, and a modular game/API/model architecture.

**Implementation:**
- Frontend: Vite, JavaScript and Three.js.
- API: Python and FastAPI.
- Model: saved XGBoost classifier with 20,000 training samples and 11 documented features.
- Historical target: 2022 flood fraction >= 0.50.
- Spatial validation: 5-fold GroupKFold using 10 km spatial blocks.
- Local explanation: SHAP TreeExplainer endpoint.
- Geographic context: precomputed susceptibility data and simplified GeoJSON for 38 Sylhet Upazilas.

**Status:** API and frontend model workflow implemented. Model metrics in the repository are previously recorded spatial cross-validation results, not a new evaluation run in this completion task. The XGBoost output is a historical-target estimate, not a live flood forecast. The rule-based game risk and the trained model probability are distinct outputs.

## 05. Innovation

**Proposal:** Connected consequences, explainable feedback, learning through play and an expandable design.

**Implementation:** Buildings and green infrastructure affect multiple city indicators; the assistant ranks simulated risk drivers; missions provide sequential challenges; model explanations expose signed SHAP contributions.

**Status:** Core innovation features implemented. Heat, transport-policy and other additional scenarios remain future expansions.

## 06. Feasibility and 24-Hour Scope

**Proposal:** Prioritise a playable city, core interactions, live indicators and a consistent cause-and-effect simulation. Clearly label synthetic data and avoid claiming a certified warning system.

**Implementation:** The playable city, building interactions, local save/load, resource simulation, missions, historical susceptibility map and model API are in the repository. Game formulas and model limitations are documented in the UI and README.

**Status:** MVP scope implemented. EcoQuest remains an educational prototype, not a certified urban-planning or disaster-warning system.

## 07. MVP Delivery Plan

| Stage | Repository evidence | Status |
|---|---|---|
| Core game | Three.js city, controls, districts, planting and construction | Implemented |
| Simulation | Pollution, green, drainage, rainfall, flood risk, energy and waste consequences | Implemented |
| AI proof of concept | XGBoost prediction, model metadata, gain importance and SHAP API | Implemented |
| Integration | Frontend GET/POST API clients and AI Prediction Lab | Implemented |
| Reliability | Frontend tests, backend unit/API tests and production build CI | Implemented; browser demo still needs a final local smoke test |

## 08. Business Model

**Proposal:** Institutional licences, custom learning modules, freemium educational features and sponsored challenges.

**Status:** Business model is documented in the proposal. No billing, licence management or sponsor workflow is implemented in the MVP.

## 09. Sustainability Plan

**Proposal:** Environmental learning, modular technical design, efficient hosting and partnership-supported development.

**Implementation:** Frontend, model service and backend are separated. Vercel and Render deployment configuration is included. The browser save/load feature stores the local game and mission progress.

**Status:** Modular design and deployment preparation implemented. Supabase/PostgreSQL accounts and public leaderboard remain follow-on features as described in the proposal.

## 10. Measuring Success

**Proposal:** Learning pre/post questions, scenario completion and repeat play, AI precision/recall/F1/calibration, and technical reliability measures.

**Implementation:** Existing model metadata records spatial validation metrics; CI checks frontend tests, production build and backend API/model-service tests.

**Status:** Automated engineering checks implemented. A learner study, engagement analytics, production load test and independent model re-evaluation remain to be conducted before making impact or production-performance claims.

## Explicit architecture decisions

The original proposal diagram names Phaser 3.90. The later project decision is to retain the full 3D **Three.js** city builder; this repository follows that decision. The proposal lists Random Forest or Gradient Boosting as candidate baselines, while the current model implementation is XGBoost. The current model's historical target and feature schema are documented rather than silently equating its probability with the live game flood-risk score.

## Remaining external actions

1. Configure `VITE_API_BASE_URL` in the Vercel project to point to the deployed Render API.
2. Configure `ECOQUEST_CORS_ORIGINS` in Render with the exact deployed frontend origin.
3. Run the deployed frontend and backend together and complete a browser smoke test, including one model prediction and SHAP explanation using valid training-schema inputs.
4. Conduct the proposed learner/teacher pilot and collect learning and engagement measures.
5. Add Supabase/PostgreSQL accounts and leaderboard only when moving beyond the MVP.
