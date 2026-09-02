import React, { useEffect, useState } from "react"
import { FiCheckSquare, FiRefreshCw } from "react-icons/fi"
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

export default function Attendance() {
  const { auth } = useAuth()
  const [modules, setModules] = useState([])
  const [moduleCode, setModuleCode] = useState("")
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [topic, setTopic] = useState("")
  const [expiresIn, setExpiresIn] = useState(10)
  const [codeInfo, setCodeInfo] = useState(null)
  const [rows, setRows] = useState(null)
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then((m) => {
      setModules(m)
      if (m[0]) setModuleCode(m[0].code)
    })
  }, [])

  useEffect(() => {
    if (!moduleCode) return
    fetchJson(`/api/lecturer/modules/${moduleCode}/sessions?userId=${auth.user.id}`).then(setSessions)
    setSessionId("")
    setCodeInfo(null)
    setRows(null)
  }, [moduleCode])

  useEffect(() => {
    if (!codeInfo) return
    const tick = () => setRemaining(Math.max(0, Math.round((codeInfo.expiresAt - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [codeInfo])

  const createSession = async (e) => {
    e.preventDefault()
    const session = await fetchJson("/api/lecturer/sessions", {
      method: "POST",
      body: { ...{ moduleCode, date, topic }, userId: auth.user.id },
    })
    setSessions((s) => [session, ...s])
    setSessionId(session.id)
    setTopic("")
  }

  const generateCode = async () => {
    const res = await fetchJson(`/api/lecturer/sessions/${sessionId}/generate-code`, {
      method: "POST",
      body: { userId: auth.user.id, expiresInMinutes: expiresIn },
    })
    setCodeInfo(res)
    loadAttendance()
  }

  const loadAttendance = () => {
    if (!sessionId) return
    fetchJson(`/api/lecturer/sessions/${sessionId}/attendance?userId=${auth.user.id}`).then((d) => setRows(d.rows))
  }

  useEffect(() => {
    if (!sessionId) return

    const selected = sessions.find((s) => s.id === sessionId)

    if (selected?.code && selected.expiresAt && new Date(selected.expiresAt) > new Date()) {
      setCodeInfo({
        code: selected.code,
        expiresAt: new Date(selected.expiresAt).getTime(),
      })
    } else {
      setCodeInfo(null)
    }

    loadAttendance()
  }, [sessionId])

  return (
    <div>
      <h4 className="fw-bold mb-1">Attendance</h4>
      <p className="text-muted mb-4">Log a session, display its code, and students key it in themselves to be marked present.</p>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4 mb-4">
            <div className="fw-semibold mb-3">1. Choose module &amp; session</div>
            <label className="form-label small">Module</label>
            <select className="form-select mb-3" value={moduleCode} onChange={(e) => setModuleCode(e.target.value)}>
              {modules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
            </select>

            <label className="form-label small">Existing sessions</label>
            <select className="form-select mb-3" value={sessionId} onChange={(e) => { setSessionId(e.target.value); setCodeInfo(null) }}>
              <option value="">— select a session —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.date} · {s.topic}</option>)}
            </select>

            <div className="border-top pt-3">
              <div className="small fw-semibold mb-2">Or log a new session</div>
              <form onSubmit={createSession}>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <input className="form-control" placeholder="Topic covered" value={topic} onChange={(e) => setTopic(e.target.value)} required />
                  </div>
                </div>
                <button className="btn btn-outline-primary btn-sm w-100">Log session</button>
              </form>
            </div>
          </div>

          <div className="card p-4">
            <div className="fw-semibold mb-3">2. Generate the code</div>
            <label className="form-label small">Expires in (minutes)</label>
            <input type="number" min={1} max={60} className="form-control mb-3" value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)} />
            <button className="btn btn-primary d-flex align-items-center justify-content-center gap-2" disabled={!sessionId} onClick={generateCode}>
              <FiCheckSquare /> Generate code
            </button>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-4 text-center mb-4">
            {codeInfo ? (
              <>
                <div className="text-muted small mb-2">Display this to the class</div>
                <div className="ct-code-display mb-2">{codeInfo.code}</div>
                <div className={"small " + (remaining <= 30 ? "text-danger" : "text-muted")}>
                  Expires in {remaining != null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "…"}
                </div>
                <button className="btn btn-outline-secondary btn-sm mt-3 mx-auto d-flex align-items-center gap-1" onClick={generateCode}>
                  <FiRefreshCw /> Regenerate
                </button>
              </>
            ) : (
              <div className="text-muted py-4">Select a session and generate a code to display it here.</div>
            )}
          </div>

          <div className="card p-0">
            <div className="p-3 border-bottom fw-semibold">Session attendance</div>
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Student</th>
                    <th>ID</th>
                    <th>Status</th>
                    <th className="pe-4">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">Select a session to view its roster.</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">No students enrolled in this module yet.</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.studentId}>
                      <td className="ps-4">{r.name}</td>
                      <td className="text-muted small">{r.studentNumber}</td>
                      <td>
                        <span className={"badge rounded-pill " + (r.status === "present" ? "text-bg-success" : "text-bg-secondary")}>
                          {r.status}
                        </span>
                      </td>
                      <td className="pe-4">{r.rating ? `${r.rating}/5` : "–"}</td>
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
