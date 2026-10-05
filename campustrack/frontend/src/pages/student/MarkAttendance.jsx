import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FiCheckCircle } from "react-icons/fi"
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
  const navigate = useNavigate()
  const [sessions, setSessions] = useState(null)
  const [codes, setCodes] = useState({})
  const [loadError, setLoadError] = useState("")
  const [feedback, setFeedback] = useState(null)
  const [processingSession, setProcessingSession] = useState(null)

  const loadSessions = async () => {
    setLoadError("")
    try {
      const rows = await fetchJson(`/api/student/attendance/open-sessions?userId=${encodeURIComponent(auth.user.id)}`)
      setSessions(rows)
    } catch (err) {
      setLoadError(err.message)
      throw err
    }
  }

  useEffect(() => {
    loadSessions().catch(() => {})
  }, [])

  const submitCode = async (e, session) => {
    e.preventDefault()
    setProcessingSession(session.id)
    setFeedback(null)
    try {
      const code = codes[session.id] || ""
      const result = await fetchJson("/api/student/attendance/mark", {
        method: "POST",
        body: { userId: auth.user.id, code },
      })
      setCodes((current) => ({ ...current, [session.id]: "" }))
      setSessions((current) => current.map((item) => (
        item.id === session.id ? { ...item, attendanceStatus: "present" } : item
      )))
      setFeedback({ ok: true, message: result.message || "Marked present." })
    } catch (err) {
      setFeedback({ ok: false, message: err.message })
    } finally {
      setProcessingSession(null)
    }
  }

  const rateSession = async (session, rating) => {
    setProcessingSession(session.id)
    setFeedback(null)
    try {
      await fetchJson(`/api/student/sessions/${encodeURIComponent(session.id)}/rating`, {
        method: "POST",
        body: { userId: auth.user.id, rating },
      })
      setSessions((current) => current.map((item) => (
        item.id === session.id ? { ...item, myRating: rating } : item
      )))

      if (rating <= 2) {
        const autoPrompt = `I rated my understanding of '${session.topic}' (${session.moduleCode}) low. Can you explain it to me?`
        navigate("/student/assistant", { state: { autoPrompt } })
      }
    } catch (err) {
      setFeedback({ ok: false, message: err.message })
    } finally {
      setProcessingSession(null)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Mark attendance</h4>
      <p className="text-muted mb-4">Enter the live code for your session, then rate how well you understood the topic.</p>

      {sessions === null && !loadError && <p className="text-muted">Loading open sessions…</p>}
      {loadError && <div className="alert alert-danger">{loadError}</div>}
      {feedback && <div className={`alert ${feedback.ok ? "alert-success" : "alert-danger"}`}>{feedback.message}</div>}
      {sessions?.length === 0 && !loadError && <p className="text-muted">There are no sessions with an open attendance code right now.</p>}

      {sessions?.length > 0 && (
        <div className="d-flex flex-column gap-3">
          {sessions.map((session) => (
            <section className="card p-3 p-md-4" key={session.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <div className="fw-semibold">{session.moduleCode} · {session.date}</div>
                  <div className="text-muted small">{session.topic}</div>
                </div>
                {session.attendanceStatus && (
                  <span className="badge text-bg-success">Signed</span>
                )}
              </div>

              {!session.attendanceStatus ? (
                <form className="row g-2 mt-2" onSubmit={(e) => submitCode(e, session)}>
                  <div className="col-sm">
                    <label className="visually-hidden" htmlFor={`attendance-code-${session.id}`}>Attendance code</label>
                    <input
                      id={`attendance-code-${session.id}`}
                      className="form-control text-uppercase"
                      placeholder="Attendance code"
                      value={codes[session.id] || ""}
                      maxLength={6}
                      onChange={(e) => setCodes((current) => ({
                        ...current,
                        [session.id]: e.target.value.toUpperCase(),
                      }))}
                      required
                    />
                  </div>
                  <div className="col-sm-auto">
                    <button className="btn btn-primary w-100" disabled={processingSession !== null || (codes[session.id] || "").length < 4}>
                      {processingSession === session.id ? "Checking…" : "Sign register"}
                    </button>
                  </div>
                </form>
              ) : session.myRating == null ? (
                <div className="mt-3">
                  <div className="small fw-semibold mb-2">How well did you understand this session?</div>
                  <div className="d-flex align-items-center gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        className="ct-rating-btn"
                        aria-label={`Rate understanding ${rating} out of 5`}
                        disabled={processingSession !== null}
                        onClick={() => rateSession(session, rating)}
                      >
                        {rating}
                      </button>
                    ))}
                    {processingSession === session.id && <span className="text-muted small">Saving…</span>}
                  </div>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-2 mt-3 text-success small">
                  <FiCheckCircle />
                  <span>Thanks, you rated this session {session.myRating}/5.</span>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
