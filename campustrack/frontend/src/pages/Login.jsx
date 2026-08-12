import React, { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  FiUser,
  FiBriefcase,
  FiAlertCircle
} from "react-icons/fi"
import { useAuth } from "../context/AuthContext.jsx"

export default function Login() {
  const [tab, setTab] = useState("student")

  const [studentNumber, setStudentNumber] = useState("")
  const [staffNumber, setStaffNumber] = useState("")
  const [password, setPassword] = useState("")

  const [staffRole, setStaffRole] = useState("lecturer")

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const { signIn } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()

    setError("")
    setLoading(true)

    console.log("=================================")
    console.log("CampusTrack Login")
    console.log("=================================")

    try {
      // =========================================
      // STUDENT LOGIN
      // =========================================

      const payload =
        tab === "student"
          ? {
              role: "student",
              studentNumber: studentNumber.trim(),
              password
            }
          : {
              role: staffRole,
              staffNumber: staffNumber.trim(),
              password
            }

      console.log("Login request:")
      console.log("Role:", payload.role)

      if (payload.role === "student") {
        console.log("Student Number:", payload.studentNumber)
      } else {
        console.log("Staff Number:", payload.staffNumber)
      }

      console.log("Sending request to backend...")
      console.log("Payload:", {
        ...payload,
        password: "********"
      })

      // =========================================
      // SEND LOGIN REQUEST
      // =========================================

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      console.log("Backend HTTP status:", response.status)

      const result = await response.json().catch(() => ({}))

      console.log("Backend response:", result)

      if (!response.ok) {
        throw new Error(
          result.message ||
          result.error ||
          `Login failed with status ${response.status}`
        )
      }

      // =========================================
      // LOGIN SUCCESSFUL
      // =========================================

      const { user } = result

      if (!user) {
        throw new Error("Backend did not return a user.")
      }

      console.log("=================================")
      console.log("Login successful!")
      console.log("=================================")

      console.log("User returned from backend:")
      console.log(user)

      console.log("User ID:", user.id)
      console.log("User Name:", user.name)
      console.log("User Role:", user.role)

      if (user.student_number) {
        console.log("Student Number:", user.student_number)
      }

      if (user.staff_number) {
        console.log("Staff Number:", user.staff_number)
      }

      console.log("=================================")

      // =========================================
      // SAVE USER IN AUTH CONTEXT
      // =========================================

      signIn(user)

      // =========================================
      // REDIRECT
      // =========================================

      if (user.role === "student") {
        console.log("Redirecting to student page...")
        navigate("/student")
      } else if (user.role === "lecturer") {
        console.log("Redirecting to lecturer page...")
        navigate("/lecturer")
      } else if (user.role === "admin") {
        console.log("Redirecting to admin page...")
        navigate("/admin")
      } else {
        console.warn("Unknown user role:", user.role)
        setError("Unknown user role.")
      }

    } catch (err) {
      // =========================================
      // LOGIN ERROR
      // =========================================

      console.error("=================================")
      console.error("CampusTrack Login Failed")
      console.error("=================================")

      console.error("Error message:", err.message)
      console.error("Full error:", err)

      console.error("=================================")

      // Show error on page
      setError(
        err.message ||
        "Something went wrong while logging in."
      )

    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center ct-auth-hero px-3">

      <div
        className="card p-4 p-md-5"
        style={{
          maxWidth: 440,
          width: "100%"
        }}
      >

        {/* =========================================
            BRAND
        ========================================= */}

        <div className="d-flex align-items-center gap-2 mb-4 justify-content-center">

          <div className="ct-brand-icon">
            CT
          </div>

          <span className="fw-bold fs-5">
            CampusTrack
          </span>

        </div>

        {/* =========================================
            LOGIN TABS
        ========================================= */}

        <ul className="nav nav-pills nav-fill mb-4">

          {/* STUDENT */}

          <li className="nav-item">

            <button
              className={
                "nav-link d-flex align-items-center justify-content-center gap-2 " +
                (tab === "student" ? "active" : "")
              }

              onClick={() => {
                setTab("student")
                setError("")

                console.log("Login tab changed to: Student")
              }}

              type="button"
            >

              <FiUser />

              Student

            </button>

          </li>

          {/* STAFF */}

          <li className="nav-item">

            <button
              className={
                "nav-link d-flex align-items-center justify-content-center gap-2 " +
                (tab === "staff" ? "active" : "")
              }

              onClick={() => {
                setTab("staff")
                setError("")

                console.log("Login tab changed to: Staff")
              }}

              type="button"
            >

              <FiBriefcase />

              Staff

            </button>

          </li>

        </ul>

        {/* =========================================
            ERROR MESSAGE
        ========================================= */}

        {error && (
          <div className="alert alert-danger d-flex align-items-center gap-2 py-2">

            <FiAlertCircle />

            <span className="small">
              {error}
            </span>

          </div>
        )}

        {/* =========================================
            LOGIN FORM
        ========================================= */}

        <form onSubmit={submit}>

          {/* =======================================
              STUDENT LOGIN
          ======================================= */}

          {tab === "student" ? (

            <div className="mb-3">

              <label className="form-label small fw-semibold">
                Student number
              </label>

              <input
                type="text"
                className="form-control"
                placeholder="219524579"
                value={studentNumber}
                onChange={(e) =>
                  setStudentNumber(e.target.value)
                }
                required
              />

            </div>

          ) : (

            /* =====================================
               STAFF LOGIN
            ===================================== */

            <>

              <div className="mb-3">

                <label className="form-label small fw-semibold">
                  Sign in as
                </label>

                <select
                  className="form-select"
                  value={staffRole}
                  onChange={(e) =>
                    setStaffRole(e.target.value)
                  }
                >

                  <option value="lecturer">
                    Lecturer
                  </option>

                  <option value="admin">
                    Admin
                  </option>

                </select>

              </div>

              <div className="mb-3">

                <label className="form-label small fw-semibold">
                  Staff number
                </label>

                <input
                  type="text"
                  className="form-control"
                  placeholder="100045678"
                  value={staffNumber}
                  onChange={(e) =>
                    setStaffNumber(e.target.value)
                  }
                  required
                />

              </div>

            </>

          )}

          {/* =========================================
              PASSWORD
          ========================================= */}

          <div className="mb-3">

            <label className="form-label small fw-semibold">
              Password
            </label>

            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
            />

          </div>

          {/* =========================================
              LOGIN BUTTON
          ========================================= */}

          <button
            className="btn btn-primary w-100"
            disabled={loading}
          >

            {loading
              ? "Signing in..."
              : "Sign in"
            }

          </button>

        </form>

        {/* =========================================
            TEST LOGIN INFORMATION
        ========================================= */}

        <p className="text-muted small text-center mt-4 mb-0">

          Student:

          {" "}

          <code>
            219524579
          </code>

          {" | "}

          Staff:

          {" "}

          <code>
            100045678
          </code>

          {" | "}

          Password:

          {" "}

          <code>
            password123
          </code>

        </p>

        {/* =========================================
            BACK TO HOME
        ========================================= */}

        <p className="text-center small mt-2 mb-0">

          <Link to="/">
            ← Back to home
          </Link>

        </p>

      </div>

    </div>
  )
}