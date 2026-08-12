import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FiArrowRight, FiFileText, FiActivity } from "react-icons/fi"
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

export default function Overview() {
  const { auth } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchJson(`/api/student/overview?userId=${auth.user.id}`).then(setData).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">Welcome back, {auth.user.name}.</h4>
      <p className="text-muted mb-4">Here's where things stand across your modules.</p>

      {error && <div className="alert alert-danger">{error}</div>}
      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="row g-4">
          <div className="col-md-6">
            <div className="card h-100 p-4">
              <div className="d-flex align-items-center gap-2 mb-3">
                <FiActivity className="text-primary" />
                <span className="fw-semibold">Your risk indicator</span>
              </div>
              <RiskBadge level={data.risk.level} score={data.risk.score} />
              <div className="text-muted small mt-3">
                Attendance: {data.risk.attendance}% · Understanding: {data.risk.understanding ?? "–"}/5 · Avg mark: {data.risk.avgMark ?? "–"}%
              </div>
              <div className="text-muted small mt-3">
                Combines your attendance rate, self-rated understanding and marks so far into one
                explainable score — visible to you and your lecturer.
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card h-100 p-4 d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-3">
                <FiFileText className="text-primary" />
                <span className="fw-semibold">Next up</span>
              </div>
              {data.nextAssignment ? (
                <>
                  <div className="fw-semibold">{data.nextAssignment.title}</div>
                  <div className="text-muted small mb-3">{data.nextAssignment.moduleCode} · due {data.nextAssignment.due}</div>
                </>
              ) : (
                <p className="text-muted small">Nothing due right now.</p>
              )}
              <Link to="/student/assignments" className="mt-auto btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" style={{ width: "fit-content" }}>
                View all assignments <FiArrowRight />
              </Link>
            </div>
          </div>

          <div className="col-12">
            <div className="card p-4">
              <div className="fw-semibold mb-3">Your modules</div>
              <div className="row g-3">
                {data.modules.map((m) => (
                  <div className="col-sm-4" key={m.code}>
                    <div className="border rounded-3 p-3 h-100">
                      <div className="fw-semibold">{m.code}</div>
                      <div className="text-muted small">{m.name}</div>
                      <div className="text-muted small mt-1">{m.period}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
