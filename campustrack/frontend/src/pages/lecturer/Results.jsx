import React, { useEffect, useState } from "react"
import * as XLSX from "xlsx"
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

const CATEGORIES = { CT: "Class Test", WR: "Written Test", AS: "Assignment" }

export default function Results() {
  const { auth } = useAuth()
  const [modules, setModules] = useState([])
  const [moduleCode, setModuleCode] = useState("")
  const [roster, setRoster] = useState([])
  const [results, setResults] = useState([])
  const [form, setForm] = useState({ studentId: "", category: "CT", title: "", mark: "", outOf: 100 })
  const [saved, setSaved] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchJson(`/api/lecturer/modules?userId=${auth.user.id}`).then((m) => {
      setModules(m)
      if (m[0]) setModuleCode(m[0].code)
    })
  }, [])

  useEffect(() => {
    if (!moduleCode) return
    fetchJson(`/api/lecturer/modules/${moduleCode}/roster?userId=${auth.user.id}`).then(setRoster)
    fetchJson(`/api/lecturer/results/${moduleCode}?userId=${auth.user.id}`).then(setResults)
  }, [moduleCode])

  const submit = async (e) => {
    e.preventDefault()
    await fetchJson("/api/lecturer/results", {
      method: "POST",
      body: { ...form, moduleCode, userId: auth.user.id },
    })
    const fresh = await fetchJson(`/api/lecturer/results/${moduleCode}?userId=${auth.user.id}`)
    setResults(fresh)
    setForm({ studentId: "", category: "CT", title: "", mark: "", outOf: 100 })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet)

      const res = await fetchJson("/api/lecturer/results/bulk", {
        method: "POST",
        body: { moduleCode, rows, userId: auth.user.id },
      })

      setUploadResult(res)

      const fresh = await fetchJson(`/api/lecturer/results/${moduleCode}?userId=${auth.user.id}`)
      setResults(fresh)
    } catch (err) {
      setUploadResult({ message: err.message, errors: [] })
    } finally {
      setUploading(false)
      e.target.value = "" // reset the file input so the same file can be re-selected
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-1">Results</h4>
      <p className="text-muted mb-4">Upload marks against the department's CT / WR / AS structure.</p>

      <select className="form-select mb-4" style={{ maxWidth: 320 }} value={moduleCode} onChange={(e) => setModuleCode(e.target.value)}>
        {modules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
      </select>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card p-4">
            <div className="fw-semibold mb-3">Capture a mark</div>
            {saved && <div className="alert alert-success py-2">Result saved.</div>}
            <form onSubmit={submit}>
              <label className="form-label small">Student</label>
              <select className="form-select mb-3" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                <option value="">— select —</option>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.studentNumber})</option>)}
              </select>

              <label className="form-label small">Category</label>
              <select className="form-select mb-3" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v} ({k})</option>)}
              </select>

              <label className="form-label small">Title</label>
              <input className="form-control mb-3" placeholder="e.g. Class Test 1" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required />

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label small">Mark</label>
                  <input type="number" className="form-control" value={form.mark}
                    onChange={(e) => setForm({ ...form, mark: e.target.value })} required />
                </div>
                <div className="col-6">
                  <label className="form-label small">Out of</label>
                  <input type="number" className="form-control" value={form.outOf}
                    onChange={(e) => setForm({ ...form, outOf: e.target.value })} required />
                </div>
              </div>

              <button className="btn btn-primary w-100">Save result</button>
            </form>
          </div>

          <div className="card p-4 mt-4">
            <div className="fw-semibold mb-2">Or upload a spreadsheet</div>
            <p className="text-muted small mb-3">
              Columns required: <code>studentNumber</code>, <code>category</code> (CT/WR/AS/EXAM/OTHER),{" "}
              <code>title</code>, <code>mark</code>, <code>outOf</code>.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="form-control mb-2"
              onChange={handleFileUpload}
              disabled={uploading || !moduleCode}
            />
            {uploading && <div className="text-muted small">Uploading…</div>}
            {uploadResult && (
              <div className={`alert py-2 mt-2 ${uploadResult.errors?.length ? "alert-warning" : "alert-success"}`}>
                <div>{uploadResult.message}</div>
                {uploadResult.errors?.length > 0 && (
                  <ul className="mb-0 mt-2 small">
                    {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-0">
            <div className="p-3 border-bottom fw-semibold">Captured results — {moduleCode}</div>
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr className="text-muted small text-uppercase">
                    <th className="ps-4">Student</th>
                    <th>Category</th>
                    <th>Title</th>
                    <th className="pe-4">Mark</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">No results captured yet.</td></tr>
                  ) : results.map((r, i) => {
                    const student = roster.find((s) => s.id === r.studentId)
                    return (
                      <tr key={i}>
                        <td className="ps-4">{student?.name || r.studentId}</td>
                        <td>{r.category}</td>
                        <td>{r.title}</td>
                        <td className="pe-4">{r.mark}/{r.outOf}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
