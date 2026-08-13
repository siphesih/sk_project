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

export default function Modules() {
  const { auth } = useAuth()
  const [modules, setModules] = useState([])
  const [lecturers, setLecturers] = useState([])
  const [form, setForm] = useState({ code: "", name: "", period: "First Semester", lecturerId: "" })
  const [error, setError] = useState("")

const load = () =>
  fetchJson(`/api/admin/modules?userId=${auth.user.id}`)
    .then(setModules)

useEffect(() => {
  load()

  fetchJson("/api/lecturers")
    .then(setLecturers)
    .catch((err) => {
      console.error("Failed to load lecturers:", err)
      setError("Failed to load lecturers.")
    })
}, [])

  const submit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      await fetchJson("/api/admin/modules", {
        method: "POST",
        body: { ...form, userId: auth.user.id },
      })
      setForm({ code: "", name: "", period: form.period, lecturerId: form.lecturerId })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Modules</h4>
      <p className="text-muted mb-4">Create modules for each academic period and assign a lecturer.</p>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={submit}>
              <label className="form-label small">Module code</label>
              <input className="form-control mb-3" placeholder="ISJ107V" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />

              <label className="form-label small">Module name</label>
              <input className="form-control mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

              <label className="form-label small">Academic period</label>
              <select className="form-select mb-3" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option>First Semester</option>
                <option>Second Semester</option>
                <option>Year module</option>
              </select>

              <label className="form-label small">Lecturer</label>
              <select className="form-select mb-3" value={form.lecturerId} onChange={(e) => setForm({ ...form, lecturerId: e.target.value })}>
                <option value="">— unassigned —</option>
                {lecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>

              <button className="btn btn-primary w-100">Create module</button>
            </form>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-0">
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Code</th>
                    <th>Name</th>
                    <th>Period</th>
                    <th className="pe-4">Lecturer</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.code}>
                      <td className="ps-4 fw-semibold">{m.code}</td>
                      <td>{m.name}</td>
                      <td className="text-muted small">{m.period}</td>
                      <td className="pe-4 text-muted small">{lecturers.find((l) => l.id === m.lecturerId)?.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
