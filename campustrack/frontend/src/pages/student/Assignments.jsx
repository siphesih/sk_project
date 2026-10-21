import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
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

      <div className="ct-assign-list">
        {rows === null ? (
          <div className="ct-assign-empty">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="ct-assign-empty">
            <div className="ct-assign-empty__mark">OK</div>
            Nothing due - enjoy the breathing room.
          </div>
        ) : rows.map((r) => {
          const days = daysLeft(r.due)
          const urgencyClass = days < 0 ? "ct-assign-row--past" : days <= 5 ? "ct-assign-row--critical" : days <= 14 ? "ct-assign-row--soon" : ""
          const dueDate = new Date(r.due)

          return (
            <div className={`ct-assign-row ${urgencyClass}`} key={r.id}>
              <div className="ct-assign-row__date">
                <div className="ct-assign-row__date-num">{dueDate.getDate()}</div>
                <div className="ct-assign-row__date-month">{dueDate.toLocaleString("en-US", { month: "short" })}</div>
              </div>
              <div className="ct-assign-row__body">
                <div className="ct-assign-row__title">{r.title}</div>
                <div className="ct-assign-row__module">{r.moduleCode}</div>
              </div>
              <div className="ct-assign-row__status">
                {days < 0 ? "Past due" : days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} left`}
              </div>
              {days < 0 && (
                <Link to="/student/results" className="btn btn-outline-primary btn-sm text-nowrap">
                  View results
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
