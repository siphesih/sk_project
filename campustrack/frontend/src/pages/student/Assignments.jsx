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

export default function Assignments() {
  const { auth } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchJson(`/api/student/assignments?userId=${auth.user.id}`).then(setRows)
  }, [])

  const daysLeft = (due) => Math.ceil((new Date(due) - new Date()) / (1000 * 60 * 60 * 24))

  return (
    <div>
      <h4 className="fw-bold mb-1">Assignments</h4>
      <p className="text-muted mb-4">Everything due across your modules, soonest first.</p>

      <div className="card p-0">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr className="text-muted small text-uppercase">
                <th className="ps-4">Title</th>
                <th>Module</th>
                <th>Due</th>
                <th className="pe-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">Nothing due — enjoy the breathing room.</td></tr>
              ) : rows.map((r) => {
                const d = daysLeft(r.due)
                return (
                  <tr key={r.id}>
                    <td className="ps-4 fw-semibold">{r.title}</td>
                    <td>{r.moduleCode}</td>
                    <td>{r.due}</td>
                    <td className="pe-4">
                      <span className={"badge rounded-pill " + (d < 0 ? "text-bg-secondary" : d <= 5 ? "text-bg-danger" : "text-bg-light border")}>
                        {d < 0 ? "Past due" : d === 0 ? "Due today" : `${d} day${d === 1 ? "" : "s"} left`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
