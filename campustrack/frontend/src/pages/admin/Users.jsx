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

export default function Users() {
  const { auth } = useAuth()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ role: "student", name: "", email: "", studentNumber: "", password: "" })
  const [error, setError] = useState("")

  const load = () => fetchJson(`/api/admin/users?userId=${auth.user.id}`).then(setUsers)
  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      await fetchJson("/api/admin/users", {
        method: "POST",
        body: { ...form, userId: auth.user.id },
      })
      setForm({ role: form.role, name: "", email: "", studentNumber: "", password: "" })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Users</h4>
      <p className="text-muted mb-4">Onboard lecturers and students.</p>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={submit}>
              <label className="form-label small">Role</label>
              <select className="form-select mb-3" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </select>

              <label className="form-label small">Full name</label>
              <input className="form-control mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

              {form.role === "student" ? (
                <>
                  <label className="form-label small">Student number</label>
                  <input className="form-control mb-3" value={form.studentNumber} onChange={(e) => setForm({ ...form, studentNumber: e.target.value })} required />
                </>
              ) : (
                <>
                  <label className="form-label small">Email</label>
                  <input type="email" className="form-control mb-3" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </>
              )}

              <label className="form-label small">Temporary password</label>
              <input className="form-control mb-3" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />

              <button className="btn btn-primary w-100">Add user</button>
            </form>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-0">
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Name</th>
                    <th>Role</th>
                    <th className="pe-4">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="ps-4">{u.name}</td>
                      <td className="text-capitalize">{u.role}</td>
                      <td className="pe-4 text-muted small">{u.email || u.studentNumber}</td>
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
