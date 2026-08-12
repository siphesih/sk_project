import React, { useEffect, useState } from "react"
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

export default function Roster() {
  const { auth } = useAuth()
  const [modules, setModules] = useState([])
  const [moduleCode, setModuleCode] = useState("")
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then((m) => {
      setModules(m)
      if (m[0]) setModuleCode(m[0].code)
    })
  }, [])

  useEffect(() => {
    if (!moduleCode) return
    fetchJson(`/api/lecturer/modules/${moduleCode}/roster?userId=${auth.user.id}`).then(setRows)
  }, [moduleCode])

  return (
    <div>
      <h4 className="fw-bold mb-1">Roster</h4>
      <p className="text-muted mb-4">Full class list with attendance and risk, per module.</p>

      <select className="form-select mb-4" style={{ maxWidth: 320 }} value={moduleCode} onChange={(e) => setModuleCode(e.target.value)}>
        {modules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
      </select>

      <div className="card p-0">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr className="text-muted small text-uppercase">
                <th className="ps-4">Student</th>
                <th>ID</th>
                <th>Attendance</th>
                <th className="pe-4">Risk</th>
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted py-4">No students enrolled yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td className="ps-4">{r.name}</td>
                  <td className="text-muted small">{r.studentNumber}</td>
                  <td>{r.attendanceRate != null ? `${r.attendanceRate}%` : "–"}</td>
                  <td className="pe-4"><RiskBadge level={r.risk.level} score={r.risk.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
