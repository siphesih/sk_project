import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FiUsers, FiAlertTriangle, FiArrowRight } from "react-icons/fi"
import { useAuth } from "../../context/AuthContext.jsx"

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
  const [modules, setModules] = useState(null)
  const [atRisk, setAtRisk] = useState(null)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then(setModules)
    fetchJson(`/api/lecturer/at-risk?userId=${auth.user.id}`).then(setAtRisk)
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">Welcome back, {auth.user.name}.</h4>
      <p className="text-muted mb-4">A quick view across your modules.</p>

      <div className="row g-4 mb-4">
        <div className="col-md-4">
          <div className="card p-4 d-flex flex-row align-items-center gap-3">
            <div className="ct-stat-icon bg-primary bg-opacity-10"><FiUsers className="text-primary" /></div>
            <div>
              <div className="fs-4 fw-bold">{modules?.length ?? "–"}</div>
              <div className="text-muted small">Modules taught</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-4 d-flex flex-row align-items-center gap-3">
            <div className="ct-stat-icon bg-danger bg-opacity-10"><FiAlertTriangle className="text-danger" /></div>
            <div>
              <div className="fs-4 fw-bold">{atRisk?.length ?? "–"}</div>
              <div className="text-muted small">Students flagged Medium/High</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="fw-semibold mb-3">Your modules</div>
        <div className="row g-3">
          {modules?.map((m) => (
            <div className="col-sm-4" key={m.code}>
              <div className="border rounded-3 p-3 h-100">
                <div className="fw-semibold">{m.code}</div>
                <div className="text-muted small">{m.name}</div>
                <div className="text-muted small mb-2">{m.period}</div>
                <Link to="/lecturer/attendance" className="small d-inline-flex align-items-center gap-1">
                  Take attendance <FiArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
