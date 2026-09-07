import React, { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext.jsx"

const fetchJson = async (path) => {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Request failed with status ${res.status}`)
  return data
}

const categoryLabels = {
  CT: "Class Test",
  WR: "Written Test",
  AS: "Assignment",
  EXAM: "Exam",
  OTHER: "Other",
}

export default function Results() {
  const { auth } = useAuth()
  const [results, setResults] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchJson(`/api/student/results?userId=${auth.user.id}`)
      .then(setResults)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h4 className="fw-bold mb-1">Results</h4>
      <p className="text-muted mb-4">Your marks across enrolled modules.</p>

      {error && <div className="alert alert-danger">{error}</div>}
      {results === null && !error ? (
        <p className="text-muted">Loading...</p>
      ) : results?.length === 0 ? (
        <div className="card p-4 text-center text-muted">No results have been recorded yet.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead>
                <tr className="text-muted small text-uppercase">
                  <th className="ps-4">Module</th>
                  <th>Assessment</th>
                  <th>Category</th>
                  <th className="pe-4">Mark</th>
                </tr>
              </thead>
              <tbody>
                {results?.map((result) => (
                  <tr key={result.id}>
                    <td className="ps-4">
                      <div className="fw-semibold">{result.moduleCode}</div>
                      <div className="text-muted small">{result.moduleName}</div>
                    </td>
                    <td>{result.title}</td>
                    <td>{categoryLabels[result.category] || result.category}</td>
                    <td className="pe-4 fw-semibold">{result.mark}/{result.outOf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
