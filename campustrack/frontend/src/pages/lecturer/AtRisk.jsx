import React, { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext.jsx"
import RiskBadge from "../../components/RiskBadge.jsx"

const fetchJson = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Request failed with status ${res.status}`)
  return data
}

export default function AtRisk() {
  const { auth } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchJson(`/api/lecturer/at-risk?userId=${auth.user.id}`).then(setRows)
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">At-risk students</h4>
      <p className="text-muted mb-4">Anyone flagged Medium or High risk across your modules, worst first.</p>

      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card p-4 text-muted">No students currently flagged — nice.</div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {rows.map((s) => (
            <div className="card p-3 p-md-4" key={s.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <div className="fw-semibold">{s.name}</div>
                  <div className="text-muted small">{s.studentNumber}</div>
                </div>
                <RiskBadge level={s.level} score={s.score} />
              </div>
              <div className="text-muted small">
                Attendance: {s.attendance}% · Understanding: {s.understanding ?? "–"}/5 · Avg mark: {s.avgMark ?? "–"}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
