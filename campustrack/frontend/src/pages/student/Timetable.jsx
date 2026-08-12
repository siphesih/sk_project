import React, { useEffect, useState } from "react"
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

export default function Timetable() {
  const { auth } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchJson(`/api/student/timetable?userId=${auth.user.id}`).then(setRows)
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">Timetable</h4>
      <p className="text-muted mb-4">Your weekly class schedule across all enrolled modules.</p>

      <div className="card p-0">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr className="text-muted small text-uppercase">
                <th className="ps-4">Module</th>
                <th>Day</th>
                <th>Time</th>
                <th className="pe-4">Venue</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">No classes on your timetable yet.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td className="ps-4 fw-semibold">{r.moduleCode}</td>
                  <td>{r.day}</td>
                  <td>{r.time}</td>
                  <td className="pe-4">{r.venue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
