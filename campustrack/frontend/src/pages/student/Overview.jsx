import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FiArrowRight, FiAward, FiCheckSquare, FiFileText, FiStar } from "react-icons/fi"
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

  const score = Number(data?.risk?.score)
  const normalizedScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0
  const riskLevel = String(data?.risk?.level || "").toLowerCase()
  const gaugeColor = riskLevel === "high"
    ? "var(--ct-red)"
    : riskLevel === "medium" ? "var(--ct-amber)" : "var(--ct-green)"
  const modules = data?.modules || []

  return (
    <div>
      <div className="ct-page-head">
        <div>
          <h1>Welcome back, {auth.user.name}</h1>
          <p>Here's where things stand across your modules.</p>
        </div>
        <Link to="/student/ratings" className="btn btn-outline-primary d-inline-flex align-items-center gap-2">
          <FiStar /> Take a session quiz
        </Link>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="row g-4 mb-4">
            <div className="col-xl-8">
              <div className="card p-4 h-100">
                <div className="d-flex flex-wrap align-items-center gap-4">
                  <div className="ct-gauge">
                    <svg viewBox="0 0 168 168" role="img" aria-label={`Risk score ${data.risk.score} out of 100`}>
                      <circle cx="84" cy="84" r="70" fill="none" stroke="var(--ct-line-2)" strokeWidth="14" />
                      <circle
                        cx="84"
                        cy="84"
                        r="70"
                        fill="none"
                        stroke={gaugeColor}
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeDasharray={`${(normalizedScore / 100) * 439.8} 439.8`}
                      />
                    </svg>
                    <div className="num">
                      <b>{data.risk.score ?? "–"}</b>
                      <span>out of 100</span>
                    </div>
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 260 }}>
                    <div className="ct-eyebrow mb-2">Your risk indicator</div>
                    <div className="mb-3">
                      <RiskBadge level={data.risk.level} score={data.risk.score} />
                    </div>
                    <div className="d-flex flex-column gap-3">
                      <div className="ct-factor">
                        <div>Attendance<span className="w">weighted factor</span></div>
                        <div className="ct-bar green"><i style={{ width: `${Math.min(100, Math.max(0, Number(data.risk.attendance) || 0))}%` }} /></div>
                        <b className="text-end">{data.risk.attendance ?? "–"}%</b>
                      </div>
                      <div className="ct-factor">
                        <div>Understanding<span className="w">out of 5</span></div>
                        <div className="ct-bar"><i style={{ width: `${Math.min(100, Math.max(0, (Number(data.risk.understanding) || 0) * 20))}%` }} /></div>
                        <b className="text-end">{data.risk.understanding ?? "–"}/5</b>
                      </div>
                      <div className="ct-factor">
                        <div>Marks so far<span className="w">average mark</span></div>
                        <div className="ct-bar"><i style={{ width: `${Math.min(100, Math.max(0, Number(data.risk.avgMark) || 0))}%` }} /></div>
                        <b className="text-end">{data.risk.avgMark ?? "–"}%</b>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-muted small mt-4">
                  Combines your attendance, session quiz results and marks so far into one explainable score — visible to you and your lecturer.
                </div>
              </div>
            </div>
            <div className="col-xl-4">
              <div className="card p-4 h-100 d-flex flex-column">
                <div className="ct-card-title">
                  Due soon
                  <Link to="/student/assignments" className="small">View all</Link>
                </div>
                {data.nextAssignment ? (
                  <div className="ct-list-row">
                    <div className="ct-stat-icon bg-soft-red"><FiFileText /></div>
                    <div className="grow">
                      <div className="t">{data.nextAssignment.title}</div>
                      <div className="m">{data.nextAssignment.moduleCode} · due {data.nextAssignment.due}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">Nothing due right now.</p>
                )}
                <Link to="/student/assignments" className="mt-auto btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" style={{ width: "fit-content" }}>
                  View assignments <FiArrowRight />
                </Link>
              </div>
            </div>
          </div>

          <div className="row g-4 mb-4">
            <div className="col-6 col-lg-3">
              <div className="card ct-kpi">
                <div className="top"><div className="ct-stat-icon bg-soft-green"><FiCheckSquare /></div></div>
                <div className="val">{data.risk.attendance ?? "–"}<small>%</small></div>
                <div className="lab">Attendance rate</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card ct-kpi">
                <div className="top"><div className="ct-stat-icon bg-soft-amber"><FiStar /></div></div>
                <div className="val">{data.risk.understanding ?? "–"}<small> / 5</small></div>
                <div className="lab">Understanding</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card ct-kpi">
                <div className="top"><div className="ct-stat-icon bg-soft-primary"><FiAward /></div></div>
                <div className="val">{data.risk.avgMark ?? "–"}<small>%</small></div>
                <div className="lab">Average mark</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <Link to="/student/assignments" className="text-decoration-none text-reset d-block h-100">
                <div className="card ct-kpi">
                  <div className="top"><div className="ct-stat-icon bg-soft-red"><FiFileText /></div></div>
                  <div className="val">{data.nextAssignment ? "1" : "0"}</div>
                  <div className="lab">Next assignment due</div>
                </div>
              </Link>
            </div>
          </div>

          <div className="card p-4">
            <div className="ct-card-title">Your modules <Link to="/student/results" className="small">View results</Link></div>
            <div className="row g-3">
              {modules.length === 0 ? (
                <p className="text-muted mb-0">No modules are currently available.</p>
              ) : modules.map((m) => (
                <div className="col-sm-6 col-lg-4" key={m.code}>
                  <Link to="/student/results" className="ct-modcard">
                    <div className="code">{m.code}</div>
                    <div className="text-muted small mb-3">{m.name}</div>
                    <div className="d-flex justify-content-between small">
                      <span className="text-muted">Academic period</span>
                      <b>{m.period}</b>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
