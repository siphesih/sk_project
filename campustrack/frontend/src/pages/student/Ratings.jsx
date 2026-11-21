import React, { useEffect, useState } from "react"
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

// Understanding ratings now come from a short quiz on each session the student attended,
// instead of the student rating themselves.
export default function Ratings() {
  const { auth } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [openQuiz, setOpenQuiz] = useState(null)

  useEffect(() => {
    fetchJson(`/api/student/sessions?userId=${encodeURIComponent(auth.user.id)}`)
      .then(setSessions)
      .catch((err) => setLoadError(err.message))
  }, [])

  const quizCompleted = (sessionId, result) => {
    setSessions((current) => current.map((s) => (
      s.id === sessionId ? { ...s, myRating: result.rating, quizScore: result.score, quizTotal: result.total } : s
    )))
  }

  const attended = (s) => s.attendanceStatus && s.attendanceStatus !== "absent"

  return (
    <div>
      <h4 className="fw-bold mb-1">Session quizzes</h4>
      <p className="text-muted mb-4">
        After each session you attend, take a 10-question quiz on what was taught. Your score becomes your
        understanding rating, which feeds the assistant's suggestions and your risk indicator.
      </p>

      {loadError && <div className="alert alert-danger">{loadError}</div>}

      {sessions === null && !loadError ? (
        <p className="text-muted">Loading…</p>
      ) : sessions?.length === 0 ? (
        <p className="text-muted">No sessions logged yet.</p>
      ) : sessions && (
        <div className="d-flex flex-column gap-3">
          {sessions.map((s) => (
            <div className="card p-3 p-md-4" key={s.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <div className="fw-semibold">{s.moduleCode} · {s.date}</div>
                  <div className="text-muted small">{s.topic}</div>
                </div>
                <div>
                  {!attended(s) ? (
                    <span className="badge rounded-pill text-bg-light text-dark">Not signed · quiz locked</span>
                  ) : !s.hasQuiz ? (
                    <span className="badge rounded-pill text-bg-light text-dark">No quiz</span>
                  ) : s.quizScore != null ? (
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge rounded-pill text-bg-success">{s.quizScore}/{s.quizTotal} · {s.myRating}/5</span>
                      <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setOpenQuiz(openQuiz === s.id ? null : s.id)}>
                        {openQuiz === s.id ? "Hide" : "Review"}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setOpenQuiz(openQuiz === s.id ? null : s.id)}>
                      {openQuiz === s.id ? "Hide quiz" : "Take quiz"}
                    </button>
                  )}
                </div>
              </div>

              {openQuiz === s.id && attended(s) && s.hasQuiz && (
                <div className="mt-3 border-top pt-3">
                  <SessionQuiz sessionId={s.id} userId={auth.user.id} onCompleted={(result) => quizCompleted(s.id, result)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
