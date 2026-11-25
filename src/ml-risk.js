const API_BASE = import.meta.env.VITE_ECOQUEST_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        let detail = `EcoQuest API error: ${response.status}`;
        try {
            const body = await response.json();
            if (body.detail) detail = body.detail;
        } catch {
            // Keep the HTTP status message when the response is not JSON.
        }
        throw new Error(detail);
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
    return request(`/api/upazilas/${encodeURIComponent(name)}`);
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

export async function getModelFeatureImportance() {
    return request("/api/model/feature-importance");
}

export async function predictFloodTarget(features) {
    return request("/api/model/predict", {
        method: "POST",
        body: JSON.stringify(features)
    });
}
