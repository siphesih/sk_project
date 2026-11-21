"""Unit tests for the CampusTrack risk prediction service (predict_service.py).

Uses only the standard library's unittest plus the service's own requirements.
Run from this folder:

    pip install -r requirements.txt
    python -m unittest -v test_predict_service
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)  # predict_service.py loads its model files by relative path
sys.path.insert(0, HERE)

import predict_service  # noqa: E402

EXPECTED_KEYS = {"passProbability", "predictedOutcome", "riskLevel", "confidence"}


class PredictServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        predict_service.app.testing = True
        cls.client = predict_service.app.test_client()

    def predict(self, attendance=None, rating=None, mark=None, **extra):
        payload = {"attendance_pct": attendance, "avg_understanding_rating": rating, "avg_ca_mark_pct": mark}
        payload.update(extra)
        return self.client.post("/predict", json=payload)

    def test_ml_01_health_check(self):
        """ML-01 /health reports the service and model"""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {"status": "ok", "model": "logistic_regression_v1"})

    def test_ml_02_strong_student_is_low_risk(self):
        """ML-02 a student with full attendance, good understanding and high marks is low risk"""
        body = self.predict(100, 5, 90).get_json()
        self.assertEqual(body["riskLevel"], "Low")
        self.assertEqual(body["predictedOutcome"], "pass")
        self.assertGreaterEqual(body["passProbability"], 0.70)

    def test_ml_03_struggling_student_is_high_risk(self):
        """ML-03 a student with poor attendance, understanding and marks is high risk"""
        body = self.predict(10, 1, 15).get_json()
        self.assertEqual(body["riskLevel"], "High")
        self.assertEqual(body["predictedOutcome"], "fail")
        self.assertLess(body["passProbability"], 0.45)

    def test_ml_04_response_fields_are_consistent(self):
        """ML-04 the response has every field, in range, and the fields agree with each other"""
        for attendance, rating, mark in [(100, 5, 90), (60, 3, 55), (30, 2, 40), (0, 1, 0)]:
            res = self.predict(attendance, rating, mark)
            self.assertEqual(res.status_code, 200)
            body = res.get_json()
            self.assertEqual(set(body), EXPECTED_KEYS)
            p = body["passProbability"]
            self.assertTrue(0 <= p <= 1)
            self.assertTrue(0 <= body["confidence"] <= 1)
            self.assertAlmostEqual(body["confidence"], round(abs(p - 0.5) * 2, 4), places=3)
            self.assertEqual(body["predictedOutcome"], "pass" if p >= 0.5 else "fail")
            self.assertEqual(body["riskLevel"], predict_service.risk_band(p))

    def test_ml_05_better_figures_never_lower_the_pass_probability(self):
        """ML-05 more attendance, understanding or marks never lowers the pass probability"""
        base = dict(attendance=50, rating=3, mark=50)
        p = lambda **kw: self.predict(**{**base, **kw}).get_json()["passProbability"]
        self.assertGreater(p(attendance=95), p(attendance=20))
        self.assertGreater(p(rating=5), p(rating=1))
        self.assertGreater(p(mark=90), p(mark=20))

    def test_ml_06_risk_band_thresholds(self):
        """ML-06 the risk bands switch at exactly 0.70 and 0.45"""
        self.assertEqual(predict_service.risk_band(0.70), "Low")
        self.assertEqual(predict_service.risk_band(0.6999), "Medium")
        self.assertEqual(predict_service.risk_band(0.45), "Medium")
        self.assertEqual(predict_service.risk_band(0.4499), "High")
        self.assertEqual(predict_service.risk_band(0.0), "High")
        self.assertEqual(predict_service.risk_band(1.0), "Low")

    def test_ml_07_missing_fields_are_a_400(self):
        """ML-07 missing fields are named in a 400 error"""
        res = self.client.post("/predict", json={"attendance_pct": 80})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "Missing fields: avg_understanding_rating, avg_ca_mark_pct")

    def test_ml_08_non_numeric_values_are_a_400(self):
        """ML-08 text, empty and null values are rejected with a 400, not a crash"""
        for bad in ["abc", "", None, "nan", [1, 2]]:
            res = self.predict(bad, 3, 60)
            self.assertEqual(res.status_code, 400, f"value {bad!r}")
            self.assertEqual(res.get_json()["error"], "All fields must be numeric.")

    def test_ml_09_numbers_sent_as_text_are_accepted(self):
        """ML-09 numbers sent as strings (e.g. "80") are accepted"""
        res = self.predict("80", "4", "70")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), self.predict(80, 4, 70).get_json())

    def test_ml_10_a_request_without_json_is_a_400(self):
        """ML-10 a request with no JSON body, or JSON that is not an object, is a 400"""
        for kwargs in [{}, {"data": "attendance=80", "content_type": "text/plain"}, {"json": [80, 4, 70]}]:
            res = self.client.post("/predict", **kwargs)
            self.assertEqual(res.status_code, 400, f"request {kwargs}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
