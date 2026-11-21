import React, { useEffect, useState } from "react"
import { FiCheckCircle } from "react-icons/fi"
import { useAuth } from "../../context/AuthContext.jsx"
import SessionQuiz from "../../components/SessionQuiz.jsx"

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

export default function MarkAttendance() {
  const { auth } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [openQuiz, setOpenQuiz] = useState(null)
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
    let locationFailed = false
    try {
      const code = codes[session.id] || ""
      const location = await getCurrentLocation()
      locationFailed = !location
      const result = await fetchJson("/api/student/attendance/mark", {
        method: "POST",
        body: { userId: auth.user.id, code, ...(location || {}) },
      })
      setCodes((current) => ({ ...current, [session.id]: "" }))
      setSessions((current) => current.map((item) => (
        item.id === session.id ? { ...item, attendanceStatus: "present" } : item
      )))
      const flagged = result.locationStatus === "outside_radius" || result.locationStatus === "no_location"
      setFeedback({
        ok: true,
        warning: !location || flagged,
        message: `${!location ? "Location permission is needed to confirm you are in class. " : ""}${result.message || "Marked present."}`,
      })
      if (session.hasQuiz) setOpenQuiz(session.id)
    } catch (err) {
      setFeedback({
        ok: false,
        warning: locationFailed,
        message: `${locationFailed ? "Location permission is needed to sign the register. " : ""}${err.message}`,
      })
    } finally {
      setProcessingSession(null)
    }
  }

  const quizCompleted = (session, result) => {
    setSessions((current) => current.map((item) => (
      item.id === session.id ? { ...item, myRating: result.rating, quizScore: result.score, quizTotal: result.total } : item
    )))
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Mark attendance</h4>
      <p className="text-muted mb-4">Enter the live code for your session, then take a short quiz on what was taught.</p>

      {sessions === null && !loadError && <p className="text-muted">Loading open sessions…</p>}
      {loadError && <div className="alert alert-danger">{loadError}</div>}
      {feedback && <div className={`alert ${feedback.warning ? "alert-warning" : feedback.ok ? "alert-success" : "alert-danger"}`}>{feedback.message}</div>}
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
                  <div className="col-12 small text-muted">Your location is used only to confirm you are in class.</div>
                </form>
              ) : !session.hasQuiz ? (
                <div className="mt-3 small text-muted">There is no quiz for this session.</div>
              ) : openQuiz === session.id ? (
                <div className="mt-3">
                  <SessionQuiz sessionId={session.id} userId={auth.user.id} onCompleted={(result) => quizCompleted(session, result)} />
                </div>
              ) : session.quizScore != null ? (
                <div className="d-flex flex-wrap align-items-center gap-2 mt-3 text-success small">
                  <FiCheckCircle />
                  <span>Quiz done: {session.quizScore}/{session.quizTotal} · understanding {session.myRating}/5.</span>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setOpenQuiz(session.id)}>Review answers</button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="small fw-semibold mb-2">Check your understanding of this session</div>
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setOpenQuiz(session.id)}>
                    Take the 10-question quiz
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
