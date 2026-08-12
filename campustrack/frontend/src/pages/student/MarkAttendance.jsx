import React, { useState } from "react"
import { FiCheckSquare } from "react-icons/fi"
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

export default function MarkAttendance() {
  const { auth } = useAuth()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState(null) // { ok, message }
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetchJson("/api/student/attendance/mark", {
        method: "POST",
        body: { userId: auth.user.id, code },
      })
      setStatus({ ok: true, message: res.message || "Marked present." })
      setCode("")
    } catch (err) {
      setStatus({ ok: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Mark attendance</h4>
      <p className="text-muted mb-4">Enter the code your lecturer displayed in class.</p>

      <div className="card p-4 p-md-5" style={{ maxWidth: 480 }}>
        <div className="ct-stat-icon bg-primary bg-opacity-10 mb-3">
          <FiCheckSquare className="text-primary" />
        </div>
        <form onSubmit={submit}>
          <label className="form-label small fw-semibold">Attendance code</label>
          <input
            className="form-control form-control-lg text-uppercase mb-3"
            style={{ letterSpacing: "0.3rem", fontWeight: 700 }}
            placeholder="E.G. 7QX2FM"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />
          <button className="btn btn-primary w-100" disabled={loading || code.length < 4}>
            {loading ? "Checking…" : "Mark me present"}
          </button>
        </form>

        {status && (
          <div className={`alert mt-3 mb-0 ${status.ok ? "alert-success" : "alert-danger"}`}>
            {status.message}
          </div>
        )}

        <p className="text-muted small mt-3 mb-0">
          Codes expire a few minutes after your lecturer generates them, so type it in as soon as you see it.
        </p>
      </div>
    </div>
  )
}
