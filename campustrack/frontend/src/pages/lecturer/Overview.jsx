import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FiAlertTriangle, FiArrowRight, FiBookOpen, FiUsers } from "react-icons/fi"
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
  const [modules, setModules] = useState(null)
  const [atRisk, setAtRisk] = useState(null)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then(setModules)
    fetchJson(`/api/lecturer/at-risk?userId=${auth.user.id}`).then(setAtRisk)
  }, [])

  const highRiskCount = atRisk?.filter((student) => student.level === "High").length ?? "–"
  const mediumRiskCount = atRisk?.filter((student) => student.level === "Medium").length ?? "–"

  return (
    <div>
      <div className="ct-page-head">
        <div>
          <h1>Welcome back, {auth.user.name}</h1>
          <p>A quick view across your modules and students who may need support.</p>
        </div>
        <Link to="/lecturer/attendance" className="btn btn-primary d-inline-flex align-items-center gap-2">
          Take attendance <FiArrowRight />
        </Link>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-6 col-lg-3">
          <div className="card ct-kpi">
            <div className="top"><div className="ct-stat-icon bg-soft-primary"><FiBookOpen /></div></div>
            <div className="val">{modules?.length ?? "–"}</div>
            <div className="lab">Modules taught</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <Link to="/lecturer/at-risk" className="text-decoration-none text-reset d-block h-100">
            <div className="card ct-kpi">
              <div className="top"><div className="ct-stat-icon bg-soft-red"><FiAlertTriangle /></div></div>
              <div className="val">{atRisk?.length ?? "–"}</div>
              <div className="lab">Students needing support</div>
            </div>
          </Link>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card ct-kpi">
            <div className="top"><div className="ct-stat-icon bg-soft-red"><FiAlertTriangle /></div></div>
            <div className="val">{highRiskCount}</div>
            <div className="lab">High-risk students</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card ct-kpi">
            <div className="top"><div className="ct-stat-icon bg-soft-amber"><FiUsers /></div></div>
            <div className="val">{mediumRiskCount}</div>
            <div className="lab">Medium-risk students</div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card p-4 h-100">
            <div className="ct-card-title">Your modules <Link to="/lecturer/roster" className="small">View rosters</Link></div>
            {!modules ? (
              <p className="text-muted mb-0">Loading modules…</p>
            ) : modules.length === 0 ? (
              <p className="text-muted mb-0">No modules are assigned to you yet.</p>
            ) : (
              <div className="row g-3">
                {modules.map((module) => (
                  <div className="col-sm-6" key={module.code}>
                    <Link to="/lecturer/roster" className="ct-modcard">
                      <div className="code">{module.code}</div>
                      <div className="text-muted small mb-3">{module.name}</div>
                      <div className="d-flex justify-content-between small">
                        <span className="text-muted">Academic period</span>
                        <b>{module.period}</b>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card p-4 h-100">
            <div className="ct-card-title">Students to check in with <Link to="/lecturer/at-risk" className="small">View all</Link></div>
            {!atRisk ? (
              <p className="text-muted mb-0">Loading student risk indicators…</p>
            ) : atRisk.length === 0 ? (
              <p className="text-muted mb-0">No students are currently flagged.</p>
            ) : atRisk.slice(0, 4).map((student) => (
              <div className="ct-list-row" key={student.id}>
                <div className="ct-avatar sm">{student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
                <div className="grow">
                  <div className="t">{student.name}</div>
                  <div className="m">{student.studentNumber}</div>
                </div>
                <RiskBadge level={student.level} score={student.score} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
