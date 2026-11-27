import React from "react"
import { Link } from "react-router-dom"
import { FiActivity, FiArrowRight, FiCheckSquare, FiMessageSquare } from "react-icons/fi"
import ThemeToggle from "../components/ThemeToggle.jsx"

export default function Home() {
  return (
    <div className="ct-hero">
      <div className="container">
        <div className="ct-topnav">
          <div className="d-flex align-items-center gap-2">
            <div className="ct-brand-icon">CT</div>
            <span className="ct-brand-name">CampusTrack</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <ThemeToggle />
            <Link to="/login" className="btn btn-primary btn-sm d-flex align-items-center gap-2">
              Sign in <FiArrowRight />
            </Link>
          </div>
        </div>
      </div>

      <section className="container pb-5 pt-4">
        <div className="row align-items-center g-4 g-lg-5 py-lg-4">
          <div className="col-lg-7">
            <span className="ct-chip primary mb-3">Department of Computer Science · TUT</span>
            <h1 className="fw-bold mb-3" style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)", lineHeight: 1.06, letterSpacing: "-.035em" }}>
              Know who needs help <span className="text-primary">before</span> the marks arrive.
            </h1>
            <p className="text-muted fs-5 mb-4" style={{ maxWidth: "52ch" }}>
              CampusTrack joins attendance, session understanding and results into one transparent risk score, so lecturers can step in weeks earlier.
            </p>
            <div className="d-flex gap-3 flex-wrap">
              <Link to="/login" className="btn btn-primary btn-lg d-flex align-items-center gap-2 px-4">
                Sign in <FiArrowRight />
              </Link>
              <a href="#how" className="btn btn-outline-secondary btn-lg px-4">How it works</a>
            </div>
          </div>
          <div className="col-lg-5">
            <div className="card p-4">
              <div className="ct-eyebrow mb-3">Risk indicator</div>
              <div className="d-flex flex-wrap align-items-center gap-4">
                <div className="ct-gauge">
                  <svg viewBox="0 0 168 168" aria-hidden="true">
                    <circle cx="84" cy="84" r="70" fill="none" stroke="var(--ct-line-2)" strokeWidth="14" />
                    <circle cx="84" cy="84" r="70" fill="none" stroke="var(--ct-green)" strokeWidth="14" strokeLinecap="round" strokeDasharray="378.2 439.8" />
                  </svg>
                  <div className="num"><b>86</b><span>out of 100</span></div>
                </div>
                <div className="flex-grow-1 d-flex flex-column gap-3" style={{ minWidth: 180 }}>
                  <div>
                    <div className="d-flex justify-content-between small mb-1"><span>Attendance</span><b>96%</b></div>
                    <div className="ct-bar green"><i style={{ width: "96%" }} /></div>
                  </div>
                  <div>
                    <div className="d-flex justify-content-between small mb-1"><span>Understanding</span><b>4.2 / 5</b></div>
                    <div className="ct-bar"><i style={{ width: "84%" }} /></div>
                  </div>
                  <div>
                    <div className="d-flex justify-content-between small mb-1"><span>Marks</span><b>74%</b></div>
                    <div className="ct-bar"><i style={{ width: "74%" }} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-5" id="how">
        <div className="row g-4">
          <div className="col-md-4">
            <div className="card ct-feature">
              <div className="ct-stat-icon bg-soft-primary mb-3"><FiCheckSquare /></div>
              <h5 className="fw-bold">Code-based attendance</h5>
              <p className="text-muted mb-0">The lecturer shows a short code in class and students key it in themselves. It expires, and a code can only be used once per student.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card ct-feature">
              <div className="ct-stat-icon bg-soft-green mb-3"><FiMessageSquare /></div>
              <h5 className="fw-bold">Assistant that knows your data</h5>
              <p className="text-muted mb-0">Ask “when is my next class?” or “what is due next?” and get answers from your own timetable and assignments.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card ct-feature">
              <div className="ct-stat-icon bg-soft-amber mb-3"><FiActivity /></div>
              <h5 className="fw-bold">A score you can explain</h5>
              <p className="text-muted mb-0">Low, Medium or High risk from attendance (40%), understanding (30%) and marks (30%), visible to the student and the lecturer.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-top py-4 text-center text-muted small bg-white">
        Tshwane University of Technology · Department of Computer Science
      </footer>
    </div>
  )
}
