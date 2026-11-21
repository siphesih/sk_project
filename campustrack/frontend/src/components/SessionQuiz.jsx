import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FiCheckCircle, FiXCircle } from "react-icons/fi"

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

const LETTERS = ["A", "B", "C", "D"]

// Shows a session's understanding quiz to a student. The score is marked on the
// server and becomes the student's 1-5 understanding rating for that session.
export default function SessionQuiz({ sessionId, userId, onCompleted }) {
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await fetchJson(`/api/student/sessions/${encodeURIComponent(sessionId)}/quiz?userId=${encodeURIComponent(userId)}`)
      setQuiz(data)
      if (!data.completed) setAnswers(new Array(data.questions.length).fill(null))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const result = await fetchJson(`/api/student/sessions/${encodeURIComponent(sessionId)}/quiz`, {
        method: "POST",
        body: { userId, answers },
      })
      setQuiz(result)
      onCompleted?.(result)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-muted small py-2">Preparing your quiz… this can take a few seconds the first time.</div>
  }

  if (!quiz) {
    return (
      <div className="alert alert-danger py-2 mb-0 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <span>{error}</span>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>Try again</button>
      </div>
    )
  }

  if (quiz.completed) {
    return (
      <div>
        <div className={`alert ${quiz.rating <= 2 ? "alert-warning" : "alert-success"} mb-3`}>
          <div className="fw-semibold">You scored {quiz.score}/{quiz.total}</div>
          <div className="small">Your understanding rating for this session is {quiz.rating}/5.</div>
          {quiz.rating <= 2 && (
            <button
              type="button"
              className="btn btn-sm btn-warning mt-2"
              onClick={() => navigate("/student/assistant", {
                state: { autoPrompt: `I scored ${quiz.score}/${quiz.total} on the quiz for '${quiz.topic}' (${quiz.moduleCode}). Can you explain it to me?` },
              })}
            >
              Ask the assistant to explain this topic
            </button>
          )}
        </div>

        <div className="d-flex flex-column gap-3">
          {quiz.review.map((q, i) => (
            <div key={i} className="border rounded p-3">
              <div className="d-flex gap-2 fw-semibold mb-2">
                {q.correct ? <FiCheckCircle className="text-success flex-shrink-0 mt-1" /> : <FiXCircle className="text-danger flex-shrink-0 mt-1" />}
                <span>{i + 1}. {q.question}</span>
              </div>
              <ul className="list-unstyled small mb-2">
                {q.options.map((option, j) => (
                  <li
                    key={j}
                    className={j === q.answerIndex ? "text-success fw-semibold" : j === q.chosenIndex ? "text-danger" : "text-muted"}
                  >
                    {LETTERS[j]}. {option}
                    {j === q.answerIndex && " ✓"}
                    {j === q.chosenIndex && j !== q.answerIndex && " (your answer)"}
                  </li>
                ))}
              </ul>
              {q.explanation && <div className="small text-muted">{q.explanation}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const answeredCount = answers.filter((a) => a !== null).length

  return (
    <form onSubmit={submit}>
      <div className="small text-muted mb-3">
        Answer all {quiz.questions.length} questions. You get one attempt, and your score becomes your understanding rating.
      </div>

      <div className="d-flex flex-column gap-3">
        {quiz.questions.map((q, i) => (
          <fieldset key={i} className="border rounded p-3">
            <legend className="fs-6 fw-semibold float-none w-auto mb-2">{i + 1}. {q.question}</legend>
            {q.options.map((option, j) => (
              <div className="form-check" key={j}>
                <input
                  className="form-check-input"
                  type="radio"
                  id={`q-${sessionId}-${i}-${j}`}
                  name={`q-${sessionId}-${i}`}
                  checked={answers[i] === j}
                  onChange={() => setAnswers((current) => current.map((a, k) => (k === i ? j : a)))}
                />
                <label className="form-check-label" htmlFor={`q-${sessionId}-${i}-${j}`}>
                  {LETTERS[j]}. {option}
                </label>
              </div>
            ))}
          </fieldset>
        ))}
      </div>

      {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}

      <div className="d-flex flex-wrap align-items-center gap-3 mt-3">
        <button className="btn btn-primary" disabled={submitting || answeredCount < quiz.questions.length}>
          {submitting ? "Submitting…" : "Submit quiz"}
        </button>
        <span className="small text-muted">{answeredCount}/{quiz.questions.length} answered</span>
      </div>
    </form>
  )
}
