import React, { useEffect, useState } from "react"
import { FiBell } from "react-icons/fi"
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

export default function Notifications() {
  const { auth } = useAuth()
  const [list, setList] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchJson(`/api/student/notifications?userId=${auth.user.id}`)
      .then(setList)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">Notifications</h4>
      <p className="text-muted mb-4">Announcements from lecturers, across all your modules.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="d-flex flex-column gap-3">
        {list === null ? (
          <p className="text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <div className="card p-4 text-muted d-flex flex-row align-items-center gap-2">
            <FiBell /> No notifications yet.
          </div>
        ) : (
          list.map((n) => (
            <div className="card p-3" key={n.id}>
              <div className="d-flex justify-content-between align-items-start">
                <div className="fw-semibold">{n.title}</div>
                <span className="badge text-bg-light border">{n.moduleCode}</span>
              </div>
              <div className="text-muted small mb-2">{n.moduleName} · {n.date}</div>
              <div className="small">{n.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}