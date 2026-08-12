import React, { useEffect, useState } from "react"
import { FiUsers, FiUser, FiBookOpen } from "react-icons/fi"
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

  useEffect(() => {
    fetchJson(`/api/admin/overview?userId=${auth.user.id}`).then((d) => setCounts(d.counts))
  }, [])

  const cards = [
    { label: "Students", value: counts?.students, icon: FiUsers, color: "primary" },
    { label: "Lecturers", value: counts?.lecturers, icon: FiUser, color: "success" },
    { label: "Modules", value: counts?.modules, icon: FiBookOpen, color: "warning" },
  ]

  return (
    <div>
      <h4 className="fw-bold mb-1">Welcome back, {auth.user.name}.</h4>
      <p className="text-muted mb-4">Set up lecturers, students and modules for the pilot.</p>

      <div className="row g-4">
        {cards.map((c) => (
          <div className="col-md-4" key={c.label}>
            <div className="card p-4 d-flex flex-row align-items-center gap-3">
              <div className={`ct-stat-icon bg-${c.color} bg-opacity-10`}><c.icon className={`text-${c.color}`} /></div>
              <div>
                <div className="fs-4 fw-bold">{c.value ?? "–"}</div>
                <div className="text-muted small">{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
