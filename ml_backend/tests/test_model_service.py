import unittest

from app import model_service


class FakeBooster:
    def get_score(self, importance_type="gain"):
        if importance_type != "gain":
            raise AssertionError("Unexpected importance type")
        return {"f0": 3.0, "f8": 1.0}


class FakeModel:
    def __init__(self):
        self.last_frame = None

    def predict_proba(self, frame):
        self.last_frame = frame.copy()
        return [[0.18, 0.82]]

    def get_booster(self):
        return FakeBooster()


class ModelServiceTests(unittest.TestCase):
    def setUp(self):
        self.previous_model = model_service._model
        self.previous_metadata = model_service._metadata
        self.fake_model = FakeModel()
        model_service._model = self.fake_model
        model_service._metadata = {
            "training_samples": 20000,
            "target_definition": "2022 flood fraction >= 0.50",
            "spatial_validation": "GroupKFold by 10 km block",
            "validation_folds": 5,
            "mean_spatial_cv": {"auc": 0.9538},
        }

    def tearDown(self):
        model_service._model = self.previous_model
        model_service._metadata = self.previous_metadata

    def make_features(self):
        return {
            feature: 1.25
            for feature in model_service.FEATURES
        } | {"lulc": 4.6}

    def test_prediction_uses_feature_order_and_rounds_lulc(self):
        result = model_service.predict_features(self.make_features())

        self.assertEqual(result["prediction"], 1)
        self.assertEqual(result["positive_class_probability"], 0.82)
        self.assertEqual(
            list(self.fake_model.last_frame.columns),
            model_service.FEATURES,
        )
        self.assertEqual(
            int(self.fake_model.last_frame.iloc[0]["lulc"]),
            5,
        )
        self.assertEqual(
            result["target_definition"],
            "2022 flood fraction >= 0.50",
        )

    def test_feature_importance_is_normalized_and_labelled_as_gain(self):
        result = model_service.get_feature_importance()

        self.assertEqual(result["importance_type"], "XGBoost gain")
        self.assertFalse(result["is_shap"])
        self.assertEqual(result["features"][0]["feature"], "elev")
        self.assertEqual(
            result["features"][0]["gain_importance_pct"],
            75.0,
        )
        self.assertEqual(
            result["features"][1]["feature"],
            "rain",
        )
        self.assertEqual(
            result["features"][1]["gain_importance_pct"],
            25.0,
        )

    def test_model_info_reports_training_provenance(self):
        result = model_service.get_model_info()

        self.assertTrue(result["loaded"])
        self.assertEqual(result["training_samples"], 20000)
        self.assertEqual(result["validation_folds"], 5)
        self.assertIn("not a real-time flood forecast", result["forecast_scope"])

    def test_prediction_fails_clearly_when_model_is_unavailable(self):
        model_service._model = None

        with self.assertRaises(model_service.ModelUnavailableError):
            model_service.predict_features(self.make_features())


if __name__ == "__main__":
    unittest.main()
