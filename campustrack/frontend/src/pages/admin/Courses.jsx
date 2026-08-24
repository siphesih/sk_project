import React, { useEffect, useState } from "react"
import { FiTrash2 } from "react-icons/fi"

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

export default function Courses() {
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [courseModules, setCourseModules] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState("")
  const [courseForm, setCourseForm] = useState({ code: "", name: "", faculty: "", department: "", durationYears: 3 })
  const [moduleForm, setModuleForm] = useState({ moduleId: "", yearLevel: 1 })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadCourses = async () => {
    const rows = await fetchJson("/api/admin/courses")
    setCourses(rows)
    setSelectedCourseId((current) => current || rows[0]?.id || "")
  }

  const loadModules = async () => {
    setModules(await fetchJson("/api/modules"))
  }

  const loadCourseModules = async (courseId) => {
    if (!courseId) {
      setCourseModules([])
      return
    }
    setCourseModules(await fetchJson(`/api/admin/courses/${courseId}/modules`))
  }

  useEffect(() => {
    Promise.all([loadCourses(), loadModules()]).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    loadCourseModules(selectedCourseId).catch((err) => setError(err.message))
  }, [selectedCourseId])

  const submitCourse = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    try {
      const result = await fetchJson("/api/admin/courses", { method: "POST", body: courseForm })
      setCourseForm({ code: "", name: "", faculty: "", department: "", durationYears: 3 })
      setSelectedCourseId(result.courseId)
      setSuccess("Course created successfully.")
      await loadCourses()
    } catch (err) {
      setError(err.message)
    }
  }

  const submitModule = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    try {
      await fetchJson(`/api/admin/courses/${selectedCourseId}/modules`, {
        method: "POST",
        body: moduleForm,
      })
      setModuleForm({ moduleId: "", yearLevel: 1 })
      setSuccess("Module added to course.")
      await loadCourseModules(selectedCourseId)
    } catch (err) {
      setError(err.message)
    }
  }

  const removeModule = async (linkId) => {
    setError("")
    setSuccess("")

    try {
      await fetchJson(`/api/admin/courses/${selectedCourseId}/modules/${linkId}`, { method: "DELETE" })
      setSuccess("Module removed from course.")
      await loadCourseModules(selectedCourseId)
    } catch (err) {
      setError(err.message)
    }
  }

  const groupedModules = courseModules.reduce((groups, module) => {
    const year = module.year_level
    groups[year] = groups[year] || []
    groups[year].push(module)
    return groups
  }, {})

  return (
    <div>
      <h4 className="fw-bold mb-1">Courses</h4>
      <p className="text-muted mb-4">Organize shared modules by course and year level.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {success && <div className="alert alert-success py-2">{success}</div>}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4 mb-4">
            <h6 className="fw-bold mb-3">Create course</h6>
            <form onSubmit={submitCourse}>
              <label className="form-label small">Course code</label>
              <input className="form-control mb-3" placeholder="DIPIT" value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value.toUpperCase() })} required />

              <label className="form-label small">Course name</label>
              <input className="form-control mb-3" placeholder="Diploma in Information Technology" value={courseForm.name} onChange={(event) => setCourseForm({ ...courseForm, name: event.target.value })} required />

              <div className="row g-2">
                <div className="col-sm-6">
                  <label className="form-label small">Faculty</label>
                  <input className="form-control mb-3" value={courseForm.faculty} onChange={(event) => setCourseForm({ ...courseForm, faculty: event.target.value })} />
                </div>
                <div className="col-sm-6">
                  <label className="form-label small">Department</label>
                  <input className="form-control mb-3" value={courseForm.department} onChange={(event) => setCourseForm({ ...courseForm, department: event.target.value })} />
                </div>
              </div>

              <label className="form-label small">Duration in years</label>
              <input type="number" min="1" className="form-control mb-3" value={courseForm.durationYears} onChange={(event) => setCourseForm({ ...courseForm, durationYears: event.target.value })} required />
              <button className="btn btn-primary w-100">Create course</button>
            </form>
          </div>

          <div className="card p-4">
            <h6 className="fw-bold mb-3">Add module to course</h6>
            <form onSubmit={submitModule}>
              <label className="form-label small">Course</label>
              <select className="form-select mb-3" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} required>
                <option value="">Select a course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}
              </select>

              <label className="form-label small">Module</label>
              <select className="form-select mb-3" value={moduleForm.moduleId} onChange={(event) => setModuleForm({ ...moduleForm, moduleId: event.target.value })} required>
                <option value="">Select a module</option>
                {modules.map((module) => <option key={module.id} value={module.id}>{module.code} - {module.name}</option>)}
              </select>

              <label className="form-label small">Year level</label>
              <select className="form-select mb-3" value={moduleForm.yearLevel} onChange={(event) => setModuleForm({ ...moduleForm, yearLevel: event.target.value })} required>
                {Array.from({ length: courses.find((course) => course.id === selectedCourseId)?.duration_years || 3 }, (_, index) => index + 1).map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>

              <button className="btn btn-outline-primary w-100" disabled={!selectedCourseId}>Add module</button>
            </form>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-4">
            {selectedCourseId ? (
              <>
                <h6 className="fw-bold mb-4">{courses.find((course) => course.id === selectedCourseId)?.name || "Course modules"}</h6>
                {Object.keys(groupedModules).length === 0 ? <p className="text-muted mb-0">No modules assigned to this course yet.</p> : Object.keys(groupedModules).sort((a, b) => a - b).map((year) => (
                  <div key={year} className="mb-4">
                    <div className="text-uppercase text-muted small fw-semibold border-bottom pb-2 mb-2">Year {year}</div>
                    {groupedModules[year].map((module) => (
                      <div key={module.id} className="d-flex align-items-center justify-content-between border-bottom py-2">
                        <div><span className="fw-semibold">{module.moduleCode}</span><span className="text-muted ms-2">{module.moduleName}</span></div>
                        <button type="button" className="btn btn-outline-danger btn-sm" title="Remove module" aria-label={`Remove ${module.moduleCode} from course`} onClick={() => removeModule(module.id)}><FiTrash2 /></button>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : <p className="text-muted mb-0">Create or select a course to manage its modules.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
