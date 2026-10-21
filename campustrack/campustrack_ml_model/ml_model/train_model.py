import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, classification_report

df = pd.read_csv("simulated_students.csv")

FEATURES = ["attendance_pct", "avg_understanding_rating", "avg_ca_mark_pct"]
X = df[FEATURES]
y = df["passed"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# ---- Model 1: Logistic Regression (interpretable, explainable) ----
logreg = LogisticRegression()
logreg.fit(X_train_s, y_train)
pred_lr = logreg.predict(X_test_s)

# ---- Model 2: Random Forest (comparison) ----
rf = RandomForestClassifier(n_estimators=150, max_depth=5, random_state=42)
rf.fit(X_train, y_train)
pred_rf = rf.predict(X_test)

def report(name, y_true, y_pred):
    print(f"\n=== {name} ===")
    print("Accuracy: ", round(accuracy_score(y_true, y_pred), 3))
    print("Precision:", round(precision_score(y_true, y_pred), 3))
    print("Recall:   ", round(recall_score(y_true, y_pred), 3))
    print("F1:       ", round(f1_score(y_true, y_pred), 3))
    print("Confusion matrix [ [TN FP] [FN TP] ]:")
    print(confusion_matrix(y_true, y_pred))

report("Logistic Regression", y_test, pred_lr)
report("Random Forest", y_test, pred_rf)

print("\nLogistic Regression coefficients (on standardised features):")
for f, c in zip(FEATURES, logreg.coef_[0]):
    print(f"  {f}: {round(c,3)}")
print("  intercept:", round(logreg.intercept_[0], 3))

# Save the chosen model (logistic regression — interpretable, matches
# the project's "explainable" positioning) plus the scaler
joblib.dump(logreg, "risk_model.joblib")
joblib.dump(scaler, "risk_scaler.joblib")
print("\nSaved risk_model.joblib and risk_scaler.joblib")
