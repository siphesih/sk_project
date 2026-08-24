import React, { useEffect, useState } from "react"
import { FiTrash2 } from "react-icons/fi"
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

export default function Enrolments() {
  const { auth } = useAuth()
  const [students, setStudents] = useState([])
  const [modules, setModules] = useState([])
  const [enrolments, setEnrolments] = useState([])
  const [form, setForm] = useState({ studentId: "", moduleId: "" })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const load = async () => {
    const [enrolmentRows, studentRows, moduleRows] = await Promise.all([
      fetchJson("/api/admin/enrolments"),
      fetchJson("/api/students"),
      fetchJson("/api/modules"),
    ])
    setEnrolments(enrolmentRows)
    setStudents(studentRows)
    setModules(moduleRows)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    try {
      await fetchJson("/api/admin/enrolments", {
        method: "POST",
        body: { ...form, userId: auth.user.id },
      })
      setForm({ studentId: "", moduleId: "" })
      setSuccess("Student enrolled successfully.")
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    if (!window.confirm("Remove this student from the module?")) return

    setError("")
    setSuccess("")

    try {
      await fetchJson(`/api/admin/enrolments/${id}`, { method: "DELETE" })
      setSuccess("Student removed from module.")
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Enrolments</h4>
      <p className="text-muted mb-4">Assign students to the modules they are taking.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {success && <div className="alert alert-success py-2">{success}</div>}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4">
            <form onSubmit={submit}>
              <label className="form-label small">Student</label>
              <select
                className="form-select mb-3"
                value={form.studentId}
                onChange={(event) => setForm({ ...form, studentId: event.target.value })}
                required
              >
                <option value="">Select a student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({student.student_number})
                  </option>
                ))}
              </select>

              <label className="form-label small">Module</label>
              <select
                className="form-select mb-3"
                value={form.moduleId}
                onChange={(event) => setForm({ ...form, moduleId: event.target.value })}
                required
              >
                <option value="">Select a module</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.code} - {module.name}
                  </option>
                ))}
              </select>

              <button className="btn btn-primary w-100">Enrol student</button>
            </form>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-0">
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Student</th>
                    <th>Module</th>
                    <th className="pe-4 text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolments.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-muted py-4">No active enrolments yet.</td></tr>
                  ) : enrolments.map((enrolment) => (
                    <tr key={enrolment.id}>
                      <td className="ps-4">
                        <div className="fw-semibold">{enrolment.studentName}</div>
                        <div className="text-muted small">{enrolment.studentNumber}</div>
                      </td>
                      <td>
                        <div className="fw-semibold">{enrolment.moduleCode}</div>
                        <div className="text-muted small">{enrolment.moduleName}</div>
                      </td>
                      <td className="pe-4 text-end">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          title="Remove enrolment"
                          aria-label={`Remove ${enrolment.studentName} from ${enrolment.moduleCode}`}
                          onClick={() => remove(enrolment.id)}
                        >
                          <FiTrash2 />
                        </button>
                      </td>
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
