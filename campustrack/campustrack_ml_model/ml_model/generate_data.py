import numpy as np
import pandas as pd

np.random.seed(42)
N = 900  # simulated students

# ---------------------------------------------------------
# Latent (unobserved) ability/effort factor per student.
# This drives the THREE OBSERVED FEATURES probabilistically,
# but each feature also gets its own independent noise, so
# they are correlated with ability but not identical to it
# or to each other. This avoids one feature just being a
# rescaled copy of another.
# ---------------------------------------------------------
latent_ability = np.random.normal(0, 1, N)

# Attendance %: driven by ability + independent noise, bounded 0-100
attendance_pct = 78 + 14*latent_ability + np.random.normal(0, 12, N)
attendance_pct = np.clip(attendance_pct, 0, 100)

# Average self-rated understanding (1-5): driven by ability + noise
avg_rating_raw = 3.4 + 0.9*latent_ability + np.random.normal(0, 0.8, N)
avg_rating = np.clip(avg_rating_raw, 1, 5)

# Average continuous assessment mark % (CT/WR/AS so far, NOT final exam):
# driven by ability + noise, plus a smaller direct nudge from attendance
# and understanding (attending and understanding sessions plausibly
# helps CA marks a little, independent of raw ability)
avg_ca_mark = (55 + 16*latent_ability
               + 0.05*(attendance_pct - 78)
               + 2.5*(avg_rating - 3.4)
               + np.random.normal(0, 9, N))
avg_ca_mark = np.clip(avg_ca_mark, 0, 100)

# ---------------------------------------------------------
# FINAL OUTCOME: simulate the exam-time result as a NOISY
# process influenced by the three features, but with real
# randomness (exam-day variance, unmeasured factors) so the
# relationship is not a clean deterministic formula and the
# model cannot reach ~100% accuracy.
# ---------------------------------------------------------
outcome_score = (
    0.55*(avg_ca_mark - 50)
    + 0.28*(attendance_pct - 78)
    + 6.0*(avg_rating - 3.4)
    + np.random.normal(0, 16, N)          # substantial genuine noise
)

# Convert to a final mark-like scale for realism, then derive pass/fail
final_mark_sim = np.clip(50 + 0.6*outcome_score + np.random.normal(0, 6, N), 0, 100)
passed = (final_mark_sim >= 50).astype(int)

df = pd.DataFrame({
    "student_id": [f"sim-{i+1:04d}" for i in range(N)],
    "attendance_pct": np.round(attendance_pct, 1),
    "avg_understanding_rating": np.round(avg_rating, 2),
    "avg_ca_mark_pct": np.round(avg_ca_mark, 1),
    "final_mark_pct": np.round(final_mark_sim, 1),   # kept for reference/validation only
    "passed": passed
})

df.to_csv("simulated_students.csv", index=False)
print(df.head(10).to_string(index=False))
print()
print("Pass rate in simulated data:", round(df['passed'].mean()*100, 1), "%")
print("Correlation with pass (sanity check, should be positive but not ~1.0):")
print(df[['attendance_pct','avg_understanding_rating','avg_ca_mark_pct','passed']].corr()['passed'])
