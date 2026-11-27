import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FiBookOpen, FiArrowRight, FiUser, FiUsers } from "react-icons/fi"
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
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchJson(`/api/admin/overview?userId=${auth.user.id}`)
      .then((d) => setCounts(d.counts))
      .catch((err) => {
        console.error("Failed to load overview:", err)
        setError("Failed to load dashboard counts.")
      })
  }, [])

  const cards = [
    { label: "Students", value: counts?.students, icon: FiUsers, color: "bg-soft-primary", to: "/admin/users" },
    { label: "Lecturers", value: counts?.lecturers, icon: FiUser, color: "bg-soft-green", to: "/admin/users" },
    { label: "Modules", value: counts?.modules, icon: FiBookOpen, color: "bg-soft-amber", to: "/admin/modules" },
  ]

  return (
    <div>
      <div className="ct-page-head">
        <div>
          <h1>Welcome back, {auth.user.name}</h1>
          <p>Set up lecturers, students and modules for the pilot.</p>
        </div>
        <Link to="/admin/users" className="btn btn-primary d-inline-flex align-items-center gap-2">
          Add a user <FiArrowRight />
        </Link>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      <div className="row g-4">
        {cards.map((card) => (
          <div className="col-md-4" key={card.label}>
            <Link to={card.to} className="text-decoration-none text-reset d-block h-100">
              <div className="card ct-kpi">
                <div className="top"><div className={`ct-stat-icon ${card.color}`}><card.icon /></div></div>
                <div className="val">{card.value ?? "–"}</div>
                <div className="lab">{card.label}</div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="row g-4 mt-1">
        <div className="col-md-6">
          <Link to="/admin/users" className="ct-step h-100">
            <div className="no">1</div>
            <div className="grow">
              <div className="fw-semibold">Manage users</div>
              <div className="text-muted small">Onboard students and lecturers for the pilot.</div>
            </div>
            <FiArrowRight />
          </Link>
        </div>
        <div className="col-md-6">
          <Link to="/admin/modules" className="ct-step h-100">
            <div className="no">2</div>
            <div className="grow">
              <div className="fw-semibold">Set up modules</div>
              <div className="text-muted small">Create modules and assign lecturers.</div>
            </div>
            <FiArrowRight />
          </Link>
        </div>
      </div>
    </div>
  )
}
