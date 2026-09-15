"""
CampusTrack Risk Prediction Service
------------------------------------
A small Flask microservice that loads the trained logistic regression
model and exposes it over HTTP, so the Node.js backend can call it the
same way it already calls the Groq API for the AI assistant.

Run with:  python predict_service.py
Listens on: http://localhost:6000/predict
"""

from flask import Flask, request, jsonify
import joblib
import numpy as np

app = Flask(__name__)

model = joblib.load("risk_model.joblib")
scaler = joblib.load("risk_scaler.joblib")

FEATURES = ["attendance_pct", "avg_understanding_rating", "avg_ca_mark_pct"]


def risk_band(pass_probability):
    """Bin the MODEL'S OWN predicted probability into a risk level.
    This is standard, explainable practice — NOT a copy of the app's
    separate rule-based score. The thresholds are a deliberate,
    documented design choice."""
    if pass_probability >= 0.70:
        return "Low"
    elif pass_probability >= 0.45:
        return "Medium"
    else:
        return "High"


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    missing = [f for f in FEATURES if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        import pandas as pd
        x = pd.DataFrame([[data[f] for f in FEATURES]], columns=FEATURES, dtype=float)
    except (ValueError, TypeError):
        return jsonify({"error": "All fields must be numeric."}), 400

    x_scaled = scaler.transform(x)
    pass_probability = float(model.predict_proba(x_scaled)[0][1])
    predicted_pass = bool(pass_probability >= 0.5)
    level = risk_band(pass_probability)

    return jsonify({
        "passProbability": round(pass_probability, 4),
        "predictedOutcome": "pass" if predicted_pass else "fail",
        "riskLevel": level,
        "confidence": round(abs(pass_probability - 0.5) * 2, 4)  # 0 (uncertain) to 1 (confident)
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "logistic_regression_v1"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000)
