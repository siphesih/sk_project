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

export default function Ratings() {
  const { auth } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [saving, setSaving] = useState(null)

  const load = () => fetchJson(`/api/student/sessions?userId=${auth.user.id}`).then(setSessions)
  useEffect(() => { load() }, [])

  const rate = async (sessionId, rating) => {
    setSaving(sessionId)
    try {
      await fetchJson(`/api/student/sessions/${sessionId}/rating`, {
        method: "POST",
        body: { userId: auth.user.id, rating },
      })
      await load()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Rate sessions</h4>
      <p className="text-muted mb-4">
        How well did you understand each topic? Low ratings feed the assistant's clarification
        suggestions and your risk indicator.
      </p>

      {sessions === null ? (
        <p className="text-muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted">No sessions logged yet.</p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {sessions.map((s) => (
            <div className="card p-3 p-md-4" key={s.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <div className="fw-semibold">{s.moduleCode} · {s.date}</div>
                  <div className="text-muted small">{s.topic}</div>
                </div>
                <div className="d-flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={"ct-rating-btn" + (s.myRating === n ? " selected" : "")}
                      disabled={saving === s.id}
                      onClick={() => rate(s.id, n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
