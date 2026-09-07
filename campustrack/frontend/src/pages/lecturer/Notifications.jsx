import React, { useEffect, useState } from "react"
import { FiSend } from "react-icons/fi"
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
  const [modules, setModules] = useState([])
  const [list, setList] = useState([])
  const [form, setForm] = useState({ moduleCode: "", title: "", message: "" })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const load = () => fetchJson(`/api/lecturer/notifications?userId=${auth.user.id}`).then(setList)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then((m) => {
      setModules(m)
      if (m[0]) setForm((f) => ({ ...f, moduleCode: m[0].code }))
    }).catch((err) => setError(err.message))
    load().catch((err) => setError(err.message))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      await fetchJson("/api/lecturer/notifications", {
        method: "POST",
        body: { ...form, userId: auth.user.id },
      })
      setForm((f) => ({ ...f, title: "", message: "" }))
      setSent(true)
      load()
      setTimeout(() => setSent(false), 2500)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Notifications</h4>
      <p className="text-muted mb-4">Post announcements to a module's students.</p>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4">
            {sent && <div className="alert alert-success py-2">Notification posted.</div>}
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={submit}>
              <label className="form-label small">Module</label>
              <select className="form-select mb-3" value={form.moduleCode} onChange={(e) => setForm({ ...form, moduleCode: e.target.value })}>
                {modules.map((m) => <option key={m.code} value={m.code}>{m.code}</option>)}
              </select>
              <label className="form-label small">Title</label>
              <input className="form-control mb-3" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <label className="form-label small">Message</label>
              <textarea className="form-control mb-3" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
              <button className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
                <FiSend /> Post notification
              </button>
            </form>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="d-flex flex-column gap-3">
            {list.length === 0 ? (
              <div className="card p-4 text-muted">Nothing posted yet.</div>
            ) : list.map((n) => (
              <div className="card p-3" key={n.id}>
                <div className="d-flex justify-content-between">
                  <div className="fw-semibold">{n.title}</div>
                  <span className="badge text-bg-light border">{n.moduleCode}</span>
                </div>
                <div className="text-muted small mb-1">{n.date}</div>
                <div className="small">{n.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
