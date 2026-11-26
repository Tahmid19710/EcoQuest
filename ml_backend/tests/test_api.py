import json
import unittest

import numpy as np
from fastapi.testclient import TestClient

from app import main as api
from app import model_service


class FakeModel:
    def predict_proba(self, frame):
        return np.asarray([[0.2, 0.8]])


class ApiIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous_load_model = api.load_model
        cls.previous_model = model_service._model

        # Keep API tests deterministic and independent of the binary
        # model artifact / optional XGBoost runtime installation.
        model_service._model = FakeModel()
        api.load_model = lambda: True

        cls.client = TestClient(api.app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        api.load_model = cls.previous_load_model
        model_service._model = cls.previous_model

    def make_payload(self):
        return {
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
            "soil": 3,
        }

    def test_health_endpoint_reports_dataset_and_model_status(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "healthy")
        self.assertEqual(payload["upazila_count"], 38)
        self.assertTrue(payload["geojson_loaded"])
        self.assertTrue(payload["model_loaded"])

    def test_upazila_endpoint_returns_all_38_records(self):
        response = self.client.get("/api/upazilas")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 38)

    def test_model_prediction_endpoint_returns_historical_target_result(self):
        response = self.client.post(
            "/api/model/predict",
            json=self.make_payload(),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["prediction"], 1)
        self.assertEqual(payload["positive_class_probability"], 0.8)
        self.assertEqual(
            payload["target_definition"],
            "2022 flood fraction >= 0.50",
        )

    def test_model_prediction_rejects_extra_features(self):
        payload = self.make_payload()
        payload["unapproved_feature"] = 123

        response = self.client.post(
            "/api/model/predict",
            json=payload,
        )

        self.assertEqual(response.status_code, 422)

    def test_model_prediction_rejects_non_finite_values(self):
        payload = self.make_payload()
        payload["rain"] = float("nan")

        response = self.client.post(
            "/api/model/predict",
            content=json.dumps(payload, allow_nan=True),
            headers={"Content-Type": "application/json"},
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
