import React, { useEffect, useMemo, useState } from "react"
import { FiSearch } from "react-icons/fi"
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

const riskFilters = ["All", "Low", "Medium", "High"]

export default function Roster() {
  const { auth } = useAuth()
  const [modules, setModules] = useState([])
  const [moduleCode, setModuleCode] = useState("")
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState("All")

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

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (rows || []).filter((row) => {
      const matchesRisk = riskFilter === "All" || row.risk?.level === riskFilter
      const matchesSearch = !query || `${row.name} ${row.studentNumber}`.toLowerCase().includes(query)
      return matchesRisk && matchesSearch
    })
  }, [rows, riskFilter, search])

  return (
    <div>
      <h4 className="fw-bold mb-1">Roster</h4>
      <p className="text-muted mb-4">Full class list with attendance and risk, per module.</p>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <select className="form-select" style={{ maxWidth: 360 }} value={moduleCode} onChange={(e) => setModuleCode(e.target.value)} aria-label="Select module">
          {modules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
        </select>
        <label className="ct-search" style={{ display: "block", width: "min(300px, 100%)", marginLeft: 0 }}>
          <FiSearch />
          <input type="search" placeholder="Search students…" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="nav nav-pills mb-3" role="group" aria-label="Filter roster by risk">
        {riskFilters.map((filter) => (
          <button
            type="button"
            className={`nav-link ${riskFilter === filter ? "active" : ""}`}
            key={filter}
            onClick={() => setRiskFilter(filter)}
          >
            {filter === "All" ? "All students" : `${filter} risk`}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr>
                <th className="ps-4">Student</th>
                <th>Attendance</th>
                <th className="pe-4">Risk level</th>
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={3} className="text-center text-muted py-4">Loading…</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={3} className="text-center text-muted py-4">{rows.length ? "No students match these filters." : "No students enrolled yet."}</td></tr>
              ) : visibleRows.map((row) => {
                const attendance = Number(row.attendanceRate)
                const attendanceWidth = Number.isFinite(attendance) ? Math.min(100, Math.max(0, attendance)) : 0
                const initials = row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
                return (
                  <tr key={row.id}>
                    <td className="ps-4">
                      <div className="ct-person">
                        <div className="ct-avatar sm">{initials}</div>
                        <div>
                          <div className="n">{row.name}</div>
                          <div className="s">{row.studentNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ct-minibar">
                        <div className="ct-bar green"><i style={{ width: `${attendanceWidth}%` }} /></div>
                        <span>{row.attendanceRate != null ? `${row.attendanceRate}%` : "–"}</span>
                      </div>
                    </td>
                    <td className="pe-4"><RiskBadge level={row.risk.level} score={row.risk.score} /></td>
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
