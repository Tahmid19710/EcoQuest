const configuredApiBase = import.meta.env?.VITE_API_BASE_URL;

const API_BASE = (
    configuredApiBase || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    let payload = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const detail = payload?.detail || payload?.message;
        throw new Error(
            detail
                ? `EcoQuest API error (${response.status}): ${detail}`
                : `EcoQuest API error: ${response.status}`
        );
    }

    return payload;
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

export async function getModelInfo() {
    return request("/api/model/info");
}

export async function getFeatureImportance() {
    return request("/api/model/feature-importance");
}

export async function predictModel(features) {
    return request("/api/model/predict", {
        method: "POST",
        body: JSON.stringify(features)
    });
}

export async function explainModel(features) {
    return request("/api/model/explain", {
        method: "POST",
        body: JSON.stringify(features)
    });
}
