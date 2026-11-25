const API_BASE = "http://127.0.0.1:8000";

async function request(path) {
    const response = await fetch(`${API_BASE}${path}`);

    if (!response.ok) {
        throw new Error(
            `EcoQuest API error: ${response.status}`
        );
    }

    return response.json();
}

export async function getHealth() {
    return request("/api/health");
}

export async function getAllUpazilas() {
    return request("/api/upazilas");
}

export async function getUpazila(name) {
    return request(
        `/api/upazilas/${encodeURIComponent(name)}`
    );
}

export async function getRiskSummary() {
    return request("/api/risk/summary");
}

export async function getFloodGeoJSON() {
    return request("/api/map/geojson");
}

export async function getThresholds() {
    return request("/api/config/thresholds");
}
// =====================================================
// XGBOOST MODEL INFORMATION
// =====================================================

export async function getModelInfo() {
    return request("/api/model/info");
}

// =====================================================
// GLOBAL FEATURE IMPORTANCE
// =====================================================

export async function getFeatureImportance() {
    return request("/api/model/feature-importance");
}