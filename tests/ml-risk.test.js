import test from "node:test";
import assert from "node:assert/strict";

import {
    predictModel,
    explainModel
} from "../src/ml-risk.js";

const featureValues = {
    elev: 12.5,
    hand: 2.1,
    slope: 1.8,
    curv: 0.02,
    twi: 8.4,
    sti: 5.2,
    dist: 350,
    dd: 1.4,
    rain: 1800,
    lulc: 4,
    soil: 3
};

test("prediction client sends the complete feature vector to FastAPI", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl;
    let capturedOptions;

    globalThis.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;

        return {
            ok: true,
            json: async () => ({
                positive_class_probability: 0.82,
                predicted_label: "Target event (y=1)"
            })
        };
    };

    try {
        const result = await predictModel(featureValues);

        assert.equal(
            capturedUrl,
            "http://127.0.0.1:8000/api/model/predict"
        );
        assert.equal(capturedOptions.method, "POST");
        assert.equal(
            capturedOptions.headers["Content-Type"],
            "application/json"
        );
        assert.deepEqual(
            JSON.parse(capturedOptions.body),
            featureValues
        );
        assert.equal(result.positive_class_probability, 0.82);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("explanation client sends a SHAP request", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl;

    globalThis.fetch = async (url, options) => {
        capturedUrl = url;
        return {
            ok: true,
            json: async () => ({
                explanation_type: "SHAP TreeExplainer",
                contributions: []
            })
        };
    };

    try {
        const result = await explainModel(featureValues);

        assert.equal(
            capturedUrl,
            "http://127.0.0.1:8000/api/model/explain"
        );
        assert.equal(result.explanation_type, "SHAP TreeExplainer");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("API client surfaces backend validation errors", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => ({
        ok: false,
        status: 422,
        json: async () => ({ detail: "Invalid feature vector" })
    });

    try {
        await assert.rejects(
            predictModel(featureValues),
            /Invalid feature vector/
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
