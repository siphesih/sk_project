import React, { useEffect, useRef, useState } from "react"
import { FiCheckSquare, FiDownload, FiRefreshCw } from "react-icons/fi"
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

const getCurrentLocation = () => new Promise((resolve) => {
  if (!navigator.geolocation) {
    resolve(null)
    return
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 10000 },
  )
})

// verified       -> signed from inside the classroom radius
// outside_radius -> signed the register, but from somewhere else
// no_location    -> signed, but the phone didn't share a location
// not_checked    -> the lecturer's location wasn't captured, so nothing to compare against
const LOCATION_BADGES = {
  verified: ["In class", "text-bg-success"],
  outside_radius: ["Not in class · signed", "text-bg-danger"],
  no_location: ["Location unknown", "text-bg-secondary"],
  not_checked: ["Not checked", "text-bg-light text-dark"],
}

const osmEmbedUrl = (lat, lng) => {
  const delta = 0.0015
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",")
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`
}

const AUTO_REFRESH_MS = 10000

const formatSignedAt = (value) => (value ? new Date(value).toLocaleString() : "-")

const csvCell = (value) => {
  if (value === null || value === undefined) return ""
  let text = String(value)
  // Stop spreadsheet apps from treating names like "=SUM(...)" as formulas.
  if (/^[=+@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadAttendanceCsv = (rows, fileName) => {
  const header = ["studentNumber", "name", "status", "signedAt", "rating", "locationStatus", "distanceMeters", "latitude", "longitude", "quizScore"]
  const lines = rows.map((r) => [
    r.studentNumber,
    r.name,
    r.status,
    r.signedAt ? new Date(r.signedAt).toISOString() : "",
    r.rating,
    r.signedAt ? r.location_status : "",
    r.distance_m,
    r.latitude,
    r.longitude,
    r.quizScore != null ? `${r.quizScore}/${r.quizTotal}` : "",
  ].map(csvCell).join(","))

  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
  const [locationWarning, setLocationWarning] = useState("")
  const [actionError, setActionError] = useState("")
  const [summary, setSummary] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [quiz, setQuiz] = useState(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState("")
  const [showQuestions, setShowQuestions] = useState(false)
  const [mapStudent, setMapStudent] = useState(null)
  const currentSessionRef = useRef("")
  const currentModuleRef = useRef("")

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then((m) => {
      setModules(m)
      if (m[0]) setModuleCode(m[0].code)
    }).catch((err) => setActionError(err.message))
  }, [])

  const loadSummary = (code = moduleCode) => {
    if (!code) return Promise.resolve()
    return fetchJson(`/api/lecturer/modules/${encodeURIComponent(code)}/sessions-summary?userId=${encodeURIComponent(auth.user.id)}`)
      .then((data) => { if (currentModuleRef.current === code) setSummary(data) })
      .catch((err) => setActionError(err.message))
  }

  useEffect(() => {
    currentModuleRef.current = moduleCode
    if (!moduleCode) return
    fetchJson(`/api/lecturer/modules/${encodeURIComponent(moduleCode)}/sessions?userId=${encodeURIComponent(auth.user.id)}`)
      .then((data) => { if (currentModuleRef.current === moduleCode) setSessions(data) })
      .catch((err) => setActionError(err.message))
    setSummary(null)
    loadSummary(moduleCode)
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
    setActionError("")
    setCreating(true)
    try {
      const session = await fetchJson("/api/lecturer/sessions", {
        method: "POST",
        body: { moduleCode, date, topic, description, userId: auth.user.id },
      })
      setSessions((s) => [session, ...s])
      setSessionId(session.id)
      setTopic("")
      setDescription("")
      loadSummary()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const loadQuiz = (id) => {
    setQuiz(null)
    setQuizError("")
    setShowQuestions(false)
    if (!id) return
    setQuizLoading(true)
    fetchJson(`/api/lecturer/sessions/${encodeURIComponent(id)}/quiz?userId=${encodeURIComponent(auth.user.id)}`)
      .then((data) => { if (currentSessionRef.current === id) setQuiz(data) })
      .catch((err) => { if (currentSessionRef.current === id) setQuizError(err.message) })
      .finally(() => { if (currentSessionRef.current === id) setQuizLoading(false) })
  }

  const regenerateQuiz = async () => {
    const id = sessionId
    setQuizError("")
    setQuizLoading(true)
    try {
      const data = await fetchJson(`/api/lecturer/sessions/${encodeURIComponent(id)}/quiz/regenerate`, {
        method: "POST",
        body: { userId: auth.user.id },
      })
      if (currentSessionRef.current === id) setQuiz(data)
    } catch (err) {
      if (currentSessionRef.current === id) setQuizError(err.message)
    } finally {
      if (currentSessionRef.current === id) setQuizLoading(false)
    }
  }

  const generateCode = async () => {
    setLocationWarning("")
    setActionError("")
    const location = await getCurrentLocation()
    if (!location) setLocationWarning("Location permission is needed to verify attendance. A code will still be generated.")
    try {
      const res = await fetchJson(`/api/lecturer/sessions/${sessionId}/generate-code`, {
        method: "POST",
        body: { userId: auth.user.id, expiresInMinutes: expiresIn, ...(location || {}) },
      })
      setCodeInfo({ ...res, locationAccuracy: location?.accuracy ?? null })
      loadAttendance()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const loadAttendance = (id = sessionId) => {
    if (!id) return Promise.resolve()
    return fetchJson(`/api/lecturer/sessions/${encodeURIComponent(id)}/attendance?userId=${encodeURIComponent(auth.user.id)}`)
      .then((d) => {
        // Ignore a slow response for a session the lecturer has already moved away from.
        if (currentSessionRef.current !== id) return
        setRows(d.rows)
        setLastUpdated(new Date())
      })
      .catch((err) => setActionError(err.message))
  }

  const refreshNow = async () => {
    setRefreshing(true)
    await Promise.all([loadAttendance(), loadSummary()])
    setRefreshing(false)
  }

  // Auto-refresh the open session every 10 seconds so new sign-ins appear without a reload.
  useEffect(() => {
    if (!sessionId) return
    const timer = setInterval(() => {
      loadAttendance(sessionId)
      loadSummary(moduleCode)
    }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [sessionId, moduleCode])

  useEffect(() => {
    currentSessionRef.current = sessionId
    setRows(null)
    setLastUpdated(null)
    setMapStudent(null)
    loadQuiz(sessionId)
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
      <p className="text-muted mb-4">
        Log a session with a description of what you taught, display its code, and students key it in to be marked
        present. Each student then takes a 10-question quiz built from your description, and their score becomes their
        understanding rating.
      </p>

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
                <label className="form-label small mb-1" htmlFor="session-description">What did you teach in this class?</label>
                <textarea
                  id="session-description"
                  className="form-control mb-1"
                  rows={4}
                  placeholder="e.g. Singly linked lists: nodes and next pointers, inserting at the head and tail, deleting a node, traversal, and why insertion is O(1) compared to arrays."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minLength={20}
                  maxLength={3000}
                  required
                />
                <div className="small text-muted mb-2">The quiz is generated from this description, so list the key ideas covered.</div>
                <button className="btn btn-outline-primary btn-sm w-100" disabled={creating}>
                  {creating ? "Logging…" : "Log session"}
                </button>
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
            {locationWarning && <div className="alert alert-warning mt-3 mb-0 py-2">{locationWarning}</div>}
            {actionError && <div className="alert alert-danger mt-3 mb-0 py-2">{actionError}</div>}
          </div>

          <div className="card p-4 mt-4">
            <div className="fw-semibold mb-3">3. Understanding quiz</div>
            {!sessionId ? (
              <div className="text-muted small">Select a session to see its quiz.</div>
            ) : quizLoading ? (
              <div className="text-muted small">Generating / loading the quiz… this can take a few seconds.</div>
            ) : quizError && !quiz ? (
              <div className="alert alert-danger py-2 mb-0 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <span>{quizError}</span>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => loadQuiz(sessionId)}>Try again</button>
              </div>
            ) : quiz && !quiz.description ? (
              <div className="text-muted small">
                This session was logged without a description, so it has no quiz. Log new sessions with a description.
              </div>
            ) : quiz && (
              <>
                <div className="small text-muted mb-1">Description</div>
                <div className="small mb-3" style={{ whiteSpace: "pre-wrap" }}>{quiz.description}</div>
                <div className="d-flex flex-wrap gap-3 small mb-3">
                  <span><span className="fw-semibold">{quiz.questions?.length ?? 0}</span> questions</span>
                  <span><span className="fw-semibold">{quiz.attempts}</span> taken</span>
                  {quiz.avgScore != null && <span>Average <span className="fw-semibold">{quiz.avgScore}/10</span></span>}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowQuestions((v) => !v)}>
                    {showQuestions ? "Hide questions" : "Preview questions"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                    disabled={quiz.attempts > 0}
                    title={quiz.attempts > 0 ? "Students have already taken this quiz" : ""}
                    onClick={regenerateQuiz}
                  >
                    <FiRefreshCw /> Regenerate quiz
                  </button>
                </div>
                {quizError && <div className="alert alert-danger py-2 mt-3 mb-0">{quizError}</div>}
                {showQuestions && quiz.questions && (
                  <ol className="small mt-3 mb-0 ps-3">
                    {quiz.questions.map((q, i) => (
                      <li key={i} className="mb-2">
                        <div className="fw-semibold">{q.question}</div>
                        <ul className="list-unstyled mb-0">
                          {q.options.map((option, j) => (
                            <li key={j} className={j === q.answerIndex ? "text-success fw-semibold" : "text-muted"}>
                              {["A", "B", "C", "D"][j]}. {option}{j === q.answerIndex && " ✓"}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-4 text-center mb-4">
            {codeInfo ? (
              <>
                <div className="text-muted small mb-2">Display this to the class</div>
                <div className="ct-code-display mb-2">{codeInfo.code}</div>
                {codeInfo.locationAccuracy != null && <div className="small text-success mb-1">Location captured (±{Math.round(codeInfo.locationAccuracy)} m)</div>}
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
            <div className="p-3 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div>
                <div className="fw-semibold">Session attendance</div>
                {sessionId && (
                  <div className="text-muted small">
                    Auto-refreshes every 10 s{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ""}
                  </div>
                )}
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={!sessionId || refreshing} onClick={refreshNow}>
                  <FiRefreshCw /> {refreshing ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                  disabled={!rows || rows.length === 0}
                  onClick={() => {
                    const selected = sessions.find((s) => s.id === sessionId)
                    downloadAttendanceCsv(rows, `attendance_${moduleCode}_${selected?.date || sessionId}.csv`)
                  }}
                >
                  <FiDownload /> Export CSV
                </button>
              </div>
            </div>
            {rows && rows.length > 0 && (() => {
              const signed = rows.filter((r) => r.signedAt)
              const count = (status) => signed.filter((r) => r.location_status === status).length
              return (
                <div className="px-3 py-2 border-bottom d-flex flex-wrap gap-2 small">
                  <span className="badge rounded-pill text-bg-success">In class: {count("verified")}</span>
                  <span className="badge rounded-pill text-bg-danger">Not in class · signed: {count("outside_radius")}</span>
                  <span className="badge rounded-pill text-bg-secondary">Location unknown: {count("no_location")}</span>
                  <span className="badge rounded-pill text-bg-light text-dark">Absent: {rows.length - signed.length}</span>
                </div>
              )
            })()}
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Student</th>
                    <th>Student no.</th>
                    <th>Status</th>
                    <th>Quiz / rating</th>
                    <th>Signed in</th>
                    <th>In class?</th>
                    <th>Distance</th>
                    <th className="pe-4">Map</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">Select a session to view its roster.</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">No students enrolled in this module yet.</td></tr>
                  ) : rows.map((r) => {
                    const [locationLabel, locationClass] = LOCATION_BADGES[r.location_status] || LOCATION_BADGES.not_checked
                    const hasCoordinates = r.latitude != null && r.longitude != null
                    const lat = Number(r.latitude)
                    const lng = Number(r.longitude)
                    const mapOpen = mapStudent === r.studentId && hasCoordinates
                    return (
                      <React.Fragment key={r.studentId}>
                        <tr>
                          <td className="ps-4">{r.name}</td>
                          <td className="text-muted small">{r.studentNumber}</td>
                          <td>
                            <span className={"badge rounded-pill " + (r.status === "absent" ? "text-bg-secondary" : "text-bg-success")}>
                              {r.status}
                            </span>
                          </td>
                          <td className="small text-nowrap">
                            {r.quizScore != null ? `${r.quizScore}/${r.quizTotal} · ${r.rating}/5` : r.signedAt ? "Not taken" : "-"}
                          </td>
                          <td className="small">{formatSignedAt(r.signedAt)}</td>
                          <td>{r.signedAt ? <span className={`badge rounded-pill ${locationClass}`}>{locationLabel}</span> : "-"}</td>
                          <td>{r.distance_m == null ? "-" : `${r.distance_m} m`}</td>
                          <td className="pe-4 text-nowrap">
                            {!hasCoordinates ? "-" : (
                              <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setMapStudent(mapOpen ? null : r.studentId)}>
                                {mapOpen ? "Hide pin" : "Show pin"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {mapOpen && (
                          <tr>
                            <td colSpan={8} className="px-4 pb-3">
                              <div className="small mb-2">
                                <span className={`badge rounded-pill ${locationClass} me-2`}>{locationLabel}</span>
                                {r.name} signed {r.distance_m != null ? `about ${r.distance_m} m from you` : "here"}
                                {r.accuracy_m != null ? ` (phone accuracy ±${r.accuracy_m} m)` : ""}.
                              </div>
                              <iframe
                                title={`Where ${r.name} signed`}
                                src={osmEmbedUrl(lat, lng)}
                                className="w-100 border rounded"
                                style={{ height: 260 }}
                                loading="lazy"
                              />
                              <a
                                className="small"
                                href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=19/${r.latitude}/${r.longitude}`}
                                target="_blank"
                                rel="noopener"
                              >View on map</a>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 mt-4">
        <div className="p-3 border-bottom">
          <div className="fw-semibold">Sessions summary{moduleCode ? ` · ${moduleCode}` : ""}</div>
          <div className="text-muted small">Click a session to open its attendance list.</div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr className="text-muted small text-uppercase">
                <th className="ps-4">Date</th>
                <th>Topic</th>
                <th>Present</th>
                <th>Attendance</th>
                <th>In class</th>
                <th>Not in class</th>
                <th className="pe-4">Avg quiz</th>
              </tr>
            </thead>
            <tbody>
              {!summary ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">Loading sessions…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">No sessions logged for this module yet.</td></tr>
              ) : summary.map((s) => (
                <tr
                  key={s.id}
                  className={s.id === sessionId ? "table-active" : ""}
                  style={{ cursor: "pointer" }}
                  onClick={() => { setSessionId(s.id); setCodeInfo(null) }}
                >
                  <td className="ps-4 text-nowrap">{s.date}</td>
                  <td>{s.topic}</td>
                  <td>{s.present} / {s.enrolled}</td>
                  <td>{s.attendancePct == null ? "-" : `${s.attendancePct}%`}</td>
                  <td>{s.verified}</td>
                  <td>{s.outsideRadius > 0 ? <span className="text-danger fw-semibold">{s.outsideRadius}</span> : 0}</td>
                  <td className="pe-4">{s.avgQuizScore == null ? "-" : `${s.avgQuizScore}/10 (${s.quizAttempts})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
