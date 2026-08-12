import React from "react"
import { Link } from "react-router-dom"
import { FiCheckSquare, FiMessageSquare, FiActivity, FiArrowRight } from "react-icons/fi"

export default function Home() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <header className="ct-topbar d-flex align-items-center justify-content-between px-4">
        <div className="d-flex align-items-center gap-2">
          <div className="ct-brand-icon">CT</div>
          <span className="fw-bold">CampusTrack</span>
        </div>
        <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
      </header>

      <section className="ct-auth-hero py-5">
        <div className="container py-4">
          <div className="row align-items-center g-5">
            <div className="col-lg-7">
              <span className="badge rounded-pill text-bg-light border mb-3">Department of Computer Science · TUT</span>
              <h1 className="display-6 fw-bold mb-3">Attendance, engagement and academic risk — in one place.</h1>
              <p className="text-muted fs-5 mb-4">
                CampusTrack joins attendance, session understanding and results into a single,
                transparent risk score, so lecturers can step in weeks before results confirm a problem.
              </p>
              <div className="d-flex gap-3">
                <Link to="/login" className="btn btn-primary d-flex align-items-center gap-2">
                  Sign in <FiArrowRight />
                </Link>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card p-4">
                <div className="d-flex align-items-center gap-2 mb-3">
                  <FiActivity className="text-success" />
                  <span className="fw-semibold">Risk indicator</span>
                </div>
                <div className="ct-risk-badge low mb-3">Low risk · 81/100</div>
                <div className="small text-muted">Attendance: 100% · Understanding: 3/5 · Avg mark: 83%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-5">
        <div className="row g-4">
          <div className="col-md-4">
            <div className="card h-100 p-4">
              <div className="ct-stat-icon bg-primary bg-opacity-10 mb-3">
                <FiCheckSquare className="text-primary" />
              </div>
              <h5>Code-based attendance</h5>
              <p className="text-muted mb-0 small">
                Lecturers display a short code in class; students key it in themselves to mark present — no app scan required.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100 p-4">
              <div className="ct-stat-icon bg-success bg-opacity-10 mb-3">
                <FiMessageSquare className="text-success" />
              </div>
              <h5>CampusTrack assistant</h5>
              <p className="text-muted mb-0 small">
                Answers "when is my next class" and "what's due next" directly from your own timetable and assignment data.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100 p-4">
              <div className="ct-stat-icon bg-warning bg-opacity-10 mb-3">
                <FiActivity className="text-warning" />
              </div>
              <h5>Transparent risk score</h5>
              <p className="text-muted mb-0 small">
                A rule-based Low/Medium/High score combining attendance, self-rated understanding and marks-to-date.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-top py-4 text-center text-muted small">
        Tshwane University of Technology · Department of Computer Science
      </footer>
    </div>
  )
}
