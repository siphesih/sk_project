// =========================================================
// CampusTrack Backend — server.js
// Reorganized into sections. Nothing was deleted — see the
// "DUPLICATE ROUTES" note near the bottom for two routes that
// were defined twice in the original file.
// =========================================================


// =========================================================
// SECTION 1: CONFIG & IMPORTS
// =========================================================

require('dotenv').config() // NEW — needed so process.env.GROQ_API_KEY actually loads for the chatbot route below. This line was missing before.

const express = require("express")
const mysql = require("mysql2/promise")
const cors = require("cors")
const session = require("express-session")
const crypto = require("crypto")

const app = express()
const PORT = 5000


// =========================================================
// SECTION 2: DATABASE
// =========================================================

const pool = mysql.createPool({
    host: "127.0.0.1",
    user: "root",
    password: "",
    database: "campustrack_db",
    port: 3306,

    waitForConnections: true,
    connectionLimit: 10
})

async function testDatabase() {

    try {

        const connection = await pool.getConnection()

        console.log("=================================")
        console.log("MySQL connected successfully")
        console.log("Database: campustrack_db")
        console.log("=================================")

        connection.release()

    } catch (error) {

        console.error("=================================")
        console.error("MySQL connection failed")
        console.error("=================================")
        console.error(error.message)

        process.exit(1)
    }
}


// =========================================================
// SECTION 3: MIDDLEWARE
// =========================================================

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))

app.use(express.json())

app.use(session({
    secret: "campustrack-session-secret",
    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 8
    }
}))

function requireAdmin(req, res, next) {

    if (!req.session.userId || req.session.role !== "admin") {

        return res.status(401).json({
            message: "Not authorized."
        })
    }

    next()
}


// =========================================================
// SECTION 4: SHARED HELPER FUNCTIONS
// Used by both the lecturer roster/at-risk routes, the ML
// prediction route, AND the chatbot
// =========================================================

async function getModuleRoster(moduleId) {
    const [students] = await pool.execute(
        `
        SELECT s.id, s.name, s.student_number AS studentNumber
        FROM enrolments e
        JOIN students s ON s.id = e.student_id
        WHERE e.module_id = ? AND e.status = 'active'
        ORDER BY s.name
        `,
        [moduleId]
    )

    return Promise.all(students.map(async (s) => {
        const [[att]] = await pool.execute(
            `
            SELECT
                COUNT(DISTINCT ses.id) AS total,
                COUNT(DISTINCT a.session_id) AS attended
            FROM sessions ses
            LEFT JOIN attendance a ON a.session_id = ses.id AND a.student_id = ?
            WHERE ses.module_id = ?
            `,
            [s.id, moduleId]
        )

        const attendanceRate = att.total > 0 ? Math.round((att.attended / att.total) * 100) : null

        const [[ratingRow]] = await pool.execute(
            `SELECT AVG(r.rating) AS avgRating
             FROM ratings r
             JOIN sessions ses ON ses.id = r.session_id
             WHERE r.student_id = ? AND ses.module_id = ?`,
            [s.id, moduleId]
        )

        const [[markRow]] = await pool.execute(
            `SELECT AVG(mark / out_of * 100) AS avgMark FROM results WHERE student_id = ? AND module_id = ?`,
            [s.id, moduleId]
        )

        const attendance = attendanceRate ?? 100
        const understanding = ratingRow.avgRating ? Number(Number(ratingRow.avgRating).toFixed(1)) : null
        const avgMark = markRow.avgMark ? Math.round(Number(markRow.avgMark)) : null

        const score = Math.round(
            (attendance * 0.4) +
            ((understanding ?? 3) / 5 * 100 * 0.3) +
            ((avgMark ?? 60) * 0.3)
        )

        const level = score >= 70 ? "low" : score >= 50 ? "medium" : "high"

        return {
            id: s.id,
            name: s.name,
            studentNumber: s.studentNumber,
            attendanceRate,
            understanding,   // NEW — raw average rating (1-5), needed by the ML prediction route
            avgMark,          // NEW — raw average mark %, needed by the ML prediction route
            risk: { level, score }
        }
    }))
}

async function getLecturerAtRiskStudents(lecturerId) {
    const [modules] = await pool.execute(
        `SELECT m.id, m.code FROM modules m JOIN module_lecturers ml ON ml.module_id = m.id WHERE ml.lecturer_id = ?`,
        [lecturerId]
    )

    const seen = new Map()

    for (const m of modules) {
        const roster = await getModuleRoster(m.id)
        for (const r of roster) {
            if (r.risk.level !== "low" && !seen.has(r.id)) {
                seen.set(r.id, { ...r, moduleCode: m.code })
            }
        }
    }

    return Array.from(seen.values()).sort((a, b) => a.risk.score - b.risk.score)
}


// =========================================================
// SECTION 5: HOME
// =========================================================

app.get("/", (req, res) => {
    res.json({ message: "CampusTrack backend is running" })
})


// =========================================================
// SECTION 6: AUTH
// =========================================================

// ---- LOGIN ----
app.post("/api/auth/login", async (req, res) => {

    try {

        const { role, studentNumber, staffNumber, password } = req.body

        console.log("")
        console.log("=================================")
        console.log("CampusTrack Login")
        console.log("=================================")
        console.log("Role:", role)

        if (!role) {
            console.error("Role is missing.")
            return res.status(400).json({ message: "Role is required." })
        }

        if (!password) {
            console.error("Password is missing.")
            return res.status(400).json({ message: "Password is required." })
        }

        let rows = []

        if (role === "student") {

            console.log("Login type: Student")
            console.log("Student Number:", studentNumber)

            if (!studentNumber) {
                console.error("Student number is missing.")
                return res.status(400).json({ message: "Student number is required." })
            }

            const [result] = await pool.execute(
                `SELECT * FROM students WHERE student_number = ? LIMIT 1`,
                [studentNumber.trim()]
            )

            rows = result
        }

        else if (role === "lecturer" || role === "admin") {

            console.log("Login type: Staff")
            console.log("Staff Role:", role)
            console.log("Staff Number:", staffNumber)

            if (!staffNumber) {
                console.error("Staff number is missing.")
                return res.status(400).json({ message: "Staff number is required." })
            }

            const [result] = await pool.execute(
                `SELECT * FROM staff WHERE staff_number = ? AND role = ? LIMIT 1`,
                [staffNumber.trim(), role]
            )

            rows = result
        }

        else {
            console.error("Unknown role:", role)
            return res.status(400).json({ message: "Unknown role." })
        }

        if (rows.length === 0) {
            console.error("Account not found.")
            return res.status(401).json({ message: "Incorrect login details." })
        }

        const user = rows[0]

        console.log("Account found.")
        console.log("User ID:", user.id)
        console.log("Name:", user.name)

        if (role === "student") {
            console.log("Student Number:", user.student_number)
        } else {
            console.log("Staff Number:", user.staff_number)
            console.log("Staff Role:", user.role)
        }

        // Passwords are currently stored as plain text.
        if (password !== user.password) {
            console.error("Incorrect password.")
            return res.status(401).json({ message: "Incorrect login details." })
        }

        console.log("Password correct.")

        if (user.status && user.status !== "approved") {
            console.error("Account is not approved. Status:", user.status)
            return res.status(403).json({ message: `Account is ${user.status}.` })
        }

        req.session.userId = user.id
        req.session.role = role

        console.log("Session created.")
        console.log("User ID:", user.id)
        console.log("Role:", role)

        delete user.password
        user.role = role

        console.log("Login successful.")
        console.log("=================================")
        console.log("")

        res.json({ message: "Login successful.", user })

    } catch (error) {
        console.error("")
        console.error("=================================")
        console.error("LOGIN ERROR")
        console.error("=================================")
        console.error(error)
        console.error("=================================")
        console.error("")
        res.status(500).json({ message: "Something went wrong while logging in." })
    }
})

// ---- CURRENT USER ----
app.get("/api/auth/me", async (req, res) => {

    try {

        if (!req.session.userId) {
            return res.status(401).json({ message: "Not signed in." })
        }

        let query

        if (req.session.role === "student") {
            query = `SELECT * FROM students WHERE id = ? LIMIT 1`
        } else {
            query = `SELECT * FROM staff WHERE id = ? LIMIT 1`
        }

        const [rows] = await pool.execute(query, [req.session.userId])

        if (rows.length === 0) {
            req.session.destroy(() => {})
            return res.status(401).json({ message: "User not found." })
        }

        const user = rows[0]
        delete user.password
        user.role = req.session.role

        res.json({ user })

    } catch (error) {
        console.error("ME ERROR:")
        console.error(error)
        res.status(500).json({ message: "Something went wrong." })
    }
})

// ---- LOGOUT ----
app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("LOGOUT ERROR:")
            console.error(error)
            return res.status(500).json({ message: "Could not log out." })
        }
        res.json({ message: "Logged out successfully." })
    })
})


// =========================================================
// SECTION 7: SHARED / PUBLIC LOOKUPS
// (used across roles — students, staff, lecturers, admins, modules)
// =========================================================

app.get("/api/students", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, name, email, student_number, faculty, department, year, status FROM students ORDER BY name`
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load students." })
    }
})

app.get("/api/staff", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, name, staff_number, role, faculty, department, title, status FROM staff ORDER BY name`
        )
        res.json(rows)
    } catch (error) {
        console.error("STAFF ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load staff." })
    }
})

app.get("/api/lecturers", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, name, staff_number, faculty, department, title, status FROM staff WHERE role = 'lecturer' ORDER BY name`
        )
        res.json(rows)
    } catch (error) {
        console.error("LECTURERS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load lecturers." })
    }
})

app.get("/api/admins", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, name, staff_number, role, faculty, department, title, status FROM staff WHERE role = 'admin' ORDER BY name`
        )
        res.json(rows)
    } catch (error) {
        console.error("ADMINS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load administrators." })
    }
})

app.get("/api/modules", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT m.*, ml.lecturer_id
            FROM modules m
            LEFT JOIN module_lecturers ml ON ml.module_id = m.id AND ml.is_primary = 1
            ORDER BY m.code
            `
        )
        res.json(rows)
    } catch (error) {
        console.error("MODULES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load modules." })
    }
})


// =========================================================
// SECTION 8: ADMIN ROUTES
// =========================================================

// ---- OVERVIEW (dashboard counts) ----
app.get("/api/admin/overview", async (req, res) => {
    try {
        const [[{ students }]] = await pool.execute(`SELECT COUNT(*) AS students FROM students`)
        const [[{ lecturers }]] = await pool.execute(`SELECT COUNT(*) AS lecturers FROM staff WHERE role = 'lecturer'`)
        const [[{ modules }]] = await pool.execute(`SELECT COUNT(*) AS modules FROM modules`)

        res.json({ counts: { students, lecturers, modules } })
    } catch (error) {
        console.error("ADMIN OVERVIEW ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load overview." })
    }
})

// ---- USERS (get combined + create) ----
app.get("/api/admin/users", async (req, res) => {
    try {
        const [students] = await pool.execute(
            `
            SELECT id, name, email, student_number, NULL AS staff_number, 'student' AS role,
                   faculty, department, year, NULL AS title, status
            FROM students
            ORDER BY name
            `
        )

        const [staff] = await pool.execute(
            `
            SELECT id, name, email, NULL AS student_number, staff_number, role,
                   faculty, department, NULL AS year, title, status
            FROM staff
            ORDER BY name
            `
        )

        res.json([...students, ...staff])
    } catch (error) {
        console.error("ADMIN USERS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load users." })
    }
})

app.post("/api/admin/users", async (req, res) => {
    try {
        const { role, name, email, studentNumber, password } = req.body

        if (!role) return res.status(400).json({ message: "Role is required." })
        if (!name || !name.trim()) return res.status(400).json({ message: "Name is required." })
        if (!password) return res.status(400).json({ message: "Password is required." })

        const newId = crypto.randomUUID()

        if (role === "student") {

            if (!studentNumber || !studentNumber.trim()) {
                return res.status(400).json({ message: "Student number is required." })
            }

            const normalizedStudentNumber = studentNumber.trim()
            const [existing] = await pool.execute(
                `SELECT id FROM students WHERE student_number = ? LIMIT 1`,
                [normalizedStudentNumber]
            )

            if (existing.length > 0) {
                return res.status(409).json({ message: "A student with this number already exists." })
            }

            await pool.execute(
                `INSERT INTO students (id, student_number, name, password, email) VALUES (?, ?, ?, ?, ?)`,
                [newId, normalizedStudentNumber, name.trim(), password, email ? email.trim() : null]
            )
        }

        else if (role === "lecturer" || role === "admin") {

            if (!email || !email.trim()) {
                return res.status(400).json({ message: "Email is required." })
            }

            const normalizedEmail = email.trim()
            const [existing] = await pool.execute(
                `SELECT id FROM staff WHERE email = ? LIMIT 1`,
                [normalizedEmail]
            )

            if (existing.length > 0) {
                return res.status(409).json({ message: "A staff member with this email already exists." })
            }

            const staffNumber = `STF-${Date.now()}`

            await pool.execute(
                `INSERT INTO staff (id, staff_number, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [newId, staffNumber, name.trim(), normalizedEmail, password, role]
            )
        }

        else {
            return res.status(400).json({ message: "Unknown role." })
        }

        res.status(201).json({ message: "User added successfully.", userId: newId })

    } catch (error) {
        console.error("CREATE USER ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to add user." })
    }
})

// ---- MODULES (get + create) ----
app.get("/api/admin/modules", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT m.*, ml.lecturer_id
            FROM modules m
            LEFT JOIN module_lecturers ml ON ml.module_id = m.id AND ml.is_primary = 1
            ORDER BY m.code
            `
        )
        res.json(rows)
    } catch (error) {
        console.error("ADMIN MODULES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load modules." })
    }
})

app.post("/api/admin/modules", async (req, res) => {
    try {
        const { code, name, period, lecturerId, userId } = req.body

        if (!code)   return res.status(400).json({ message: "Module code is required." })
        if (!name)   return res.status(400).json({ message: "Module name is required." })
        if (!period) return res.status(400).json({ message: "Academic period is required." })

        const [existing] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [code.trim()]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "A module with this code already exists." })
        }

        // Generate the primary key yourself — modules.id has no default/auto-increment
        const moduleId = crypto.randomUUID()

        await pool.execute(
            `INSERT INTO modules (id, code, name, period, created_by) VALUES (?, ?, ?, ?, ?)`,
            [moduleId, code.trim().toUpperCase(), name.trim(), period, userId || null]
        )

        // Lecturer assignment goes in module_lecturers, not modules.lecturer_id
        if (lecturerId) {
            await pool.execute(
                `INSERT INTO module_lecturers (id, module_id, lecturer_id, is_primary, assigned_by) VALUES (?, ?, ?, 1, ?)`,
                [crypto.randomUUID(), moduleId, lecturerId, userId || null]
            )
        }

        res.status(201).json({ message: "Module created successfully.", moduleId })

    } catch (error) {
        console.error("CREATE MODULE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to create module." })
    }
})

// ---- ENROLMENTS (get + create + remove) ----
app.get("/api/admin/enrolments", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT
                e.id, e.student_id, s.name AS studentName, s.student_number AS studentNumber,
                e.module_id, m.code AS moduleCode, m.name AS moduleName, e.status, e.enrollment_date
            FROM enrolments e
            JOIN students s ON s.id = e.student_id
            JOIN modules m ON m.id = e.module_id
            WHERE e.status = 'active'
            ORDER BY s.name, m.code
            `
        )
        res.json(rows)
    } catch (error) {
        console.error("ADMIN ENROLMENTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load enrolments." })
    }
})

app.post("/api/admin/enrolments", async (req, res) => {
    try {
        const { studentId, moduleId } = req.body

        if (!studentId) return res.status(400).json({ message: "Student is required." })
        if (!moduleId) return res.status(400).json({ message: "Module is required." })

        const [existing] = await pool.execute(
            `SELECT id FROM enrolments WHERE student_id = ? AND module_id = ? AND status = 'active' LIMIT 1`,
            [studentId, moduleId]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "This student is already enrolled in that module." })
        }

        await pool.execute(
            `INSERT INTO enrolments (student_id, module_id) VALUES (?, ?)`,
            [studentId, moduleId]
        )

        res.status(201).json({ message: "Student enrolled successfully." })

    } catch (error) {
        console.error("CREATE ENROLMENT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to enrol student." })
    }
})

app.delete("/api/admin/enrolments/:id", async (req, res) => {
    try {
        const { id } = req.params

        await pool.execute(
            `UPDATE enrolments SET status = 'dropped' WHERE id = ?`,
            [id]
        )

        res.json({ message: "Student removed from module." })

    } catch (error) {
        console.error("DELETE ENROLMENT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to remove enrolment." })
    }
})

// ---- COURSES (get + create + module links) ----
app.get("/api/admin/courses", async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT * FROM courses ORDER BY code`)
        res.json(rows)
    } catch (error) {
        console.error("ADMIN COURSES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load courses." })
    }
})

app.post("/api/admin/courses", async (req, res) => {
    try {
        const { code, name, faculty, department, durationYears } = req.body

        if (!code || !code.trim()) return res.status(400).json({ message: "Course code is required." })
        if (!name || !name.trim()) return res.status(400).json({ message: "Course name is required." })

        const normalizedCode = code.trim().toUpperCase()
        const [existing] = await pool.execute(
            `SELECT id FROM courses WHERE code = ? LIMIT 1`,
            [normalizedCode]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "A course with this code already exists." })
        }

        const courseId = crypto.randomUUID()
        const parsedDuration = Number(durationYears)
        const courseDuration = Number.isInteger(parsedDuration) && parsedDuration > 0 ? parsedDuration : 3

        await pool.execute(
            `INSERT INTO courses (id, code, name, faculty, department, duration_years) VALUES (?, ?, ?, ?, ?, ?)`,
            [courseId, normalizedCode, name.trim(), faculty?.trim() || null, department?.trim() || null, courseDuration]
        )

        res.status(201).json({ message: "Course created successfully.", courseId })

    } catch (error) {
        console.error("CREATE COURSE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to create course." })
    }
})

app.get("/api/admin/courses/:courseId/modules", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT cm.id, cm.year_level, m.id AS moduleId, m.code AS moduleCode, m.name AS moduleName
            FROM course_modules cm
            JOIN modules m ON m.id = cm.module_id
            WHERE cm.course_id = ?
            ORDER BY cm.year_level, m.code
            `,
            [req.params.courseId]
        )
        res.json(rows)
    } catch (error) {
        console.error("COURSE MODULES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load course modules." })
    }
})

app.post("/api/admin/courses/:courseId/modules", async (req, res) => {
    try {
        const { moduleId, yearLevel } = req.body
        const parsedYear = Number(yearLevel)

        if (!moduleId) return res.status(400).json({ message: "Module is required." })
        if (!Number.isInteger(parsedYear) || parsedYear < 1) {
            return res.status(400).json({ message: "Year level is required." })
        }

        const [existing] = await pool.execute(
            `SELECT id FROM course_modules WHERE course_id = ? AND module_id = ? LIMIT 1`,
            [req.params.courseId, moduleId]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "This module is already part of the course." })
        }

        await pool.execute(
            `INSERT INTO course_modules (id, course_id, module_id, year_level) VALUES (?, ?, ?, ?)`,
            [crypto.randomUUID(), req.params.courseId, moduleId, parsedYear]
        )

        res.status(201).json({ message: "Module added to course." })

    } catch (error) {
        console.error("ADD COURSE MODULE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to add module to course." })
    }
})

app.delete("/api/admin/courses/:courseId/modules/:linkId", async (req, res) => {
    try {
        await pool.execute(
            `DELETE FROM course_modules WHERE id = ? AND course_id = ?`,
            [req.params.linkId, req.params.courseId]
        )
        res.json({ message: "Module removed from course." })
    } catch (error) {
        console.error("REMOVE COURSE MODULE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to remove module from course." })
    }
})


// =========================================================
// SECTION 9: STUDENT ROUTES
// =========================================================

app.get("/api/student/timetable", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT m.code AS moduleCode, t.day, t.time, t.venue
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN timetable t ON t.module_id = m.id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY FIELD(t.day, 'Monday','Tuesday','Wednesday','Thursday','Friday'), t.time
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENT TIMETABLE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load timetable." })
    }
})

app.get("/api/student/assignments", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT a.id, a.title, m.code AS moduleCode, a.due
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN assignments a ON a.module_id = m.id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY a.due ASC
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENT ASSIGNMENTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load assignments." })
    }
})

app.get("/api/student/attendance/open-sessions", async (req, res) => {
    try {
        const { userId } = req.query

        const [rows] = await pool.execute(
            `
            SELECT
                s.id,
                m.code AS moduleCode,
                s.topic,
                s.session_date AS date,
                a.status AS attendanceStatus,
                r.rating AS myRating
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN sessions s ON s.module_id = m.id
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
            LEFT JOIN ratings r ON r.session_id = s.id AND r.student_id = e.student_id
            WHERE e.student_id = ? AND e.status = 'active'
              AND s.attendance_code IS NOT NULL
              AND s.code_expires_at > NOW()
            ORDER BY s.session_date DESC
            `,
            [userId]
        )

        res.json(rows)
    } catch (error) {
        console.error("OPEN SESSIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load open sessions." })
    }
})

app.get("/api/student/sessions", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT s.id, m.code AS moduleCode, s.session_date AS date, s.topic, r.rating AS myRating
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN sessions s ON s.module_id = m.id
            LEFT JOIN ratings r ON r.session_id = s.id AND r.student_id = ?
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY s.session_date DESC
            `,
            [userId, userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENT SESSIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load sessions." })
    }
})

app.post("/api/student/sessions/:id/rating", async (req, res) => {
    try {
        const { id } = req.params
        const { userId, rating } = req.body

        if (!rating) return res.status(400).json({ message: "Rating is required." })

        const [existing] = await pool.execute(
            `SELECT session_id FROM ratings WHERE session_id = ? AND student_id = ? LIMIT 1`,
            [id, userId]
        )

        if (existing.length > 0) {
            await pool.execute(
                `UPDATE ratings SET rating = ? WHERE session_id = ? AND student_id = ?`,
                [rating, id, userId]
            )
        } else {
            await pool.execute(
                `INSERT INTO ratings (session_id, student_id, rating) VALUES (?, ?, ?)`,
                [id, userId, rating]
            )
        }

        res.json({ message: "Rating saved." })
    } catch (error) {
        console.error("SESSION RATING ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to save rating." })
    }
})

app.post("/api/student/attendance/mark", async (req, res) => {
    try {
        const { userId, code } = req.body

        if (!code) return res.status(400).json({ message: "Attendance code is required." })

        const [[session]] = await pool.execute(
            `SELECT id, code_expires_at FROM sessions WHERE attendance_code = ? LIMIT 1`,
            [code.trim().toUpperCase()]
        )

        if (!session) {
            return res.status(404).json({ message: "Invalid attendance code." })
        }

        if (session.code_expires_at && new Date(session.code_expires_at) < new Date()) {
            return res.status(400).json({ message: "This code has expired." })
        }

        const [existing] = await pool.execute(
            `SELECT id FROM attendance WHERE session_id = ? AND student_id = ? LIMIT 1`,
            [session.id, userId]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "You've already been marked for this session." })
        }

        await pool.execute(
            `INSERT INTO attendance (session_id, student_id, status, marked_at) VALUES (?, ?, 'present', NOW())`,
            [session.id, userId]
        )

        res.status(201).json({ message: "You've been marked present." })
    } catch (error) {
        console.error("MARK ATTENDANCE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to mark attendance." })
    }
})

app.get("/api/student/overview", async (req, res) => {
    try {
        const { userId } = req.query

        const [modules] = await pool.execute(
            `
            SELECT m.code, m.name, m.period
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY m.code
            `,
            [userId]
        )

        const [[attendanceRow]] = await pool.execute(
            `
            SELECT COUNT(DISTINCT s.id) AS totalSessions, COUNT(DISTINCT a.session_id) AS attended
            FROM enrolments e
            JOIN sessions s ON s.module_id = e.module_id
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
            WHERE e.student_id = ? AND e.status = 'active'
            `,
            [userId]
        )

        const attendancePct = attendanceRow.totalSessions > 0
            ? Math.round((attendanceRow.attended / attendanceRow.totalSessions) * 100)
            : 100

        const [[ratingRow]] = await pool.execute(
            `SELECT AVG(rating) AS avgRating FROM ratings WHERE student_id = ?`,
            [userId]
        )

        const [[markRow]] = await pool.execute(
            `SELECT AVG(mark / out_of * 100) AS avgMark FROM results WHERE student_id = ?`,
            [userId]
        )

        const understanding = ratingRow.avgRating ? Number(Number(ratingRow.avgRating).toFixed(1)) : null
        const avgMark = markRow.avgMark ? Math.round(Number(markRow.avgMark)) : null

        const score = Math.round(
            (attendancePct * 0.4) +
            ((understanding ?? 3) / 5 * 100 * 0.3) +
            ((avgMark ?? 60) * 0.3)
        )

        const level = score >= 70 ? "low" : score >= 50 ? "medium" : "high"

        const [[nextAssignment]] = await pool.execute(
            `
            SELECT a.title, m.code AS moduleCode, a.due
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN assignments a ON a.module_id = m.id
            WHERE e.student_id = ? AND e.status = 'active' AND a.due >= CURDATE()
            ORDER BY a.due ASC
            LIMIT 1
            `,
            [userId]
        )

        res.json({
            risk: { level, score, attendance: attendancePct, understanding, avgMark },
            nextAssignment: nextAssignment || null,
            modules
        })
    } catch (error) {
        console.error("STUDENT OVERVIEW ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load overview." })
    }
})

app.get("/api/student/notifications", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT n.id, m.code AS moduleCode, m.name AS moduleName, n.title, n.message, n.created_at AS date
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN notifications n ON n.module_id = m.id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY n.created_at DESC
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENT NOTIFICATIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load notifications." })
    }
})

app.get("/api/student/results", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT r.id, m.code AS moduleCode, m.name AS moduleName, r.category, r.title, r.mark, r.out_of AS outOf
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN results r ON r.module_id = m.id AND r.student_id = e.student_id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY m.code, r.title
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("STUDENT RESULTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load results." })
    }
})


// =========================================================
// SECTION 10: LECTURER ROUTES
// =========================================================

app.get("/api/lecturer/modules", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT m.id, m.code, m.name, m.period
            FROM modules m
            JOIN module_lecturers ml ON ml.module_id = m.id
            WHERE ml.lecturer_id = ?
            ORDER BY m.code
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("LECTURER MODULES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load modules." })
    }
})

app.get("/api/lecturer/modules/:moduleCode/roster", async (req, res) => {
    try {
        const { moduleCode } = req.params

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const rows = await getModuleRoster(module.id)
        res.json(rows)
    } catch (error) {
        console.error("LECTURER ROSTER ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load roster." })
    }
})

// ---- ML PREDICTIONS (NEW) — calls the Python risk model, stores results ----
app.get("/api/lecturer/modules/:moduleCode/predictions", async (req, res) => {
    try {
        const { moduleCode } = req.params

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )
        if (!module) return res.status(404).json({ message: "Module not found." })

        const roster = await getModuleRoster(module.id)
        const results = []

        for (const student of roster) {
            const mlRes = await fetch("http://localhost:6000/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    attendance_pct: student.attendanceRate ?? 100,
                    avg_understanding_rating: student.understanding ?? 3,
                    avg_ca_mark_pct: student.avgMark ?? 60
                })
            })

            if (!mlRes.ok) continue
            const prediction = await mlRes.json()

            await pool.execute(
                `
                INSERT INTO predictions (id, student_id, module_id, predicted_grade, risk_level, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    predicted_grade = VALUES(predicted_grade),
                    risk_level = VALUES(risk_level),
                    confidence = VALUES(confidence)
                `,
                [
                    crypto.randomUUID(), student.id, module.id,
                    prediction.predictedOutcome, prediction.riskLevel,
                    Math.round(prediction.confidence * 100)
                ]
            )

            results.push({ ...student, prediction })
        }

        res.json(results)

    } catch (error) {
        console.error("ML PREDICTION ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to get predictions." })
    }
})

app.get("/api/lecturer/at-risk", async (req, res) => {
    try {
        const { userId } = req.query
        const rows = await getLecturerAtRiskStudents(userId)

        res.json(rows.map((r) => ({
            id: r.id,
            name: r.name,
            studentNumber: r.studentNumber,
            attendance: r.attendanceRate ?? 100,
            level: r.risk.level,
            score: r.risk.score
        })))
    } catch (error) {
        console.error("LECTURER AT-RISK ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load at-risk students." })
    }
})

app.get("/api/lecturer/modules/:moduleCode/sessions", async (req, res) => {
    try {
        const { moduleCode } = req.params

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const [rows] = await pool.execute(
            `
            SELECT id, session_date AS date, topic, attendance_code AS code, code_expires_at AS expiresAt
            FROM sessions
            WHERE module_id = ?
            ORDER BY session_date DESC
            `,
            [module.id]
        )

        res.json(rows)
    } catch (error) {
        console.error("LECTURER SESSIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load sessions." })
    }
})

app.post("/api/lecturer/sessions", async (req, res) => {
    try {
        const { moduleCode, date, topic, userId } = req.body

        if (!moduleCode) return res.status(400).json({ message: "Module is required." })
        if (!date)       return res.status(400).json({ message: "Date is required." })
        if (!topic)      return res.status(400).json({ message: "Topic is required." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const sessionId = crypto.randomUUID()

        await pool.execute(
            `INSERT INTO sessions (id, module_id, lecturer_id, session_date, topic) VALUES (?, ?, ?, ?, ?)`,
            [sessionId, module.id, userId, date, topic.trim()]
        )

        res.status(201).json({ id: sessionId, date, topic: topic.trim() })
    } catch (error) {
        console.error("CREATE SESSION ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to log session." })
    }
})

app.post("/api/lecturer/sessions/:id/generate-code", async (req, res) => {
    try {
        const { id } = req.params
        const { expiresInMinutes } = req.body

        const minutes = Number(expiresInMinutes) || 10
        const code = Math.random().toString(36).slice(2, 8).toUpperCase()
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000)

        await pool.execute(
            `UPDATE sessions SET attendance_code = ?, code_expires_at = ?, expiry_minutes = ? WHERE id = ?`,
            [code, expiresAt, minutes, id]
        )

        res.json({ code, expiresAt: expiresAt.getTime() })
    } catch (error) {
        console.error("GENERATE CODE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to generate code." })
    }
})

app.get("/api/lecturer/sessions/:id/attendance", async (req, res) => {
    try {
        const { id } = req.params

        const [[session]] = await pool.execute(
            `SELECT module_id FROM sessions WHERE id = ? LIMIT 1`,
            [id]
        )

        if (!session) return res.status(404).json({ message: "Session not found." })

        const [rows] = await pool.execute(
            `
            SELECT s.id AS studentId, s.name, s.student_number AS studentNumber, a.status, r.rating
            FROM enrolments e
            JOIN students s ON s.id = e.student_id
            LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = s.id
            LEFT JOIN ratings r ON r.session_id = ? AND r.student_id = s.id
            WHERE e.module_id = ? AND e.status = 'active'
            ORDER BY s.name
            `,
            [id, id, session.module_id]
        )

        res.json({ rows: rows.map((r) => ({ ...r, status: r.status || "absent" })) })
    } catch (error) {
        console.error("SESSION ATTENDANCE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load attendance." })
    }
})

app.get("/api/lecturer/results/:moduleCode", async (req, res) => {
    try {
        const { moduleCode } = req.params

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const [rows] = await pool.execute(
            `
            SELECT id, student_id AS studentId, category, title, mark, out_of AS outOf
            FROM results
            WHERE module_id = ?
            ORDER BY title
            `,
            [module.id]
        )

        res.json(rows)
    } catch (error) {
        console.error("LECTURER RESULTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load results." })
    }
})

app.post("/api/lecturer/results", async (req, res) => {
    try {
        const { studentId, moduleCode, category, title, mark, outOf } = req.body

        if (!studentId) return res.status(400).json({ message: "Student is required." })
        if (!title)     return res.status(400).json({ message: "Title is required." })
        if (mark === undefined || mark === "") return res.status(400).json({ message: "Mark is required." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        await pool.execute(
            `INSERT INTO results (student_id, module_id, category, title, mark, out_of) VALUES (?, ?, ?, ?, ?, ?)`,
            [studentId, module.id, category, title.trim(), mark, outOf || 100]
        )

        res.status(201).json({ message: "Result saved." })
    } catch (error) {
        console.error("SAVE RESULT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to save result." })
    }
})

app.post("/api/lecturer/results/bulk", async (req, res) => {
    try {
        const { moduleCode, rows } = req.body

        if (!moduleCode) return res.status(400).json({ message: "Module is required." })
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: "No rows to upload." })
        }

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const errors = []
        let inserted = 0

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rowNum = i + 2 // +2 because row 1 is the header in the spreadsheet

            const studentNumber = String(row.studentNumber || "").trim()
            const category = String(row.category || "").trim().toUpperCase()
            const title = String(row.title || "").trim()
            const mark = Number(row.mark)
            const outOf = Number(row.outOf) || 100

            if (!studentNumber) { errors.push(`Row ${rowNum}: missing student number.`); continue }
            if (!["CT", "WR", "AS", "EXAM", "OTHER"].includes(category)) {
                errors.push(`Row ${rowNum}: invalid category "${row.category}".`); continue
            }
            if (!title) { errors.push(`Row ${rowNum}: missing title.`); continue }
            if (isNaN(mark)) { errors.push(`Row ${rowNum}: invalid mark "${row.mark}".`); continue }

            const [[student]] = await pool.execute(
                `SELECT id FROM students WHERE student_number = ? LIMIT 1`,
                [studentNumber]
            )

            if (!student) {
                errors.push(`Row ${rowNum}: no student found with number ${studentNumber}.`)
                continue
            }

            await pool.execute(
                `INSERT INTO results (student_id, module_id, category, title, mark, out_of) VALUES (?, ?, ?, ?, ?, ?)`,
                [student.id, module.id, category, title, mark, outOf]
            )

            inserted++
        }

        res.status(201).json({
            message: `${inserted} of ${rows.length} results uploaded.`,
            inserted,
            errors
        })

    } catch (error) {
        console.error("BULK RESULTS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to upload results." })
    }
})

app.get("/api/lecturer/notifications", async (req, res) => {
    try {
        const { userId } = req.query
        const [rows] = await pool.execute(
            `
            SELECT n.id, m.code AS moduleCode, n.title, n.message, n.created_at AS date
            FROM notifications n
            JOIN modules m ON m.id = n.module_id
            JOIN module_lecturers ml ON ml.module_id = m.id
            WHERE ml.lecturer_id = ?
            ORDER BY n.created_at DESC
            `,
            [userId]
        )
        res.json(rows)
    } catch (error) {
        console.error("LECTURER NOTIFICATIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load notifications." })
    }
})

app.post("/api/lecturer/notifications", async (req, res) => {
    try {
        const { moduleCode, title, message } = req.body

        if (!moduleCode) return res.status(400).json({ message: "Module is required." })
        if (!title)      return res.status(400).json({ message: "Title is required." })
        if (!message)    return res.status(400).json({ message: "Message is required." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        await pool.execute(
            `INSERT INTO notifications (id, module_id, title, message) VALUES (?, ?, ?, ?)`,
            [crypto.randomUUID(), module.id, title.trim(), message.trim()]
        )

        res.status(201).json({ message: "Notification posted." })
    } catch (error) {
        console.error("POST NOTIFICATION ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to post notification." })
    }
})


// =========================================================
// SECTION 11: CHATBOT (Groq, grounded in real CampusTrack data)
// =========================================================

app.post("/api/chatbot", async (req, res) => {
    try {
        const { userId, message } = req.body

        if (!userId) return res.status(400).json({ message: "Missing user." })
        if (!message || !message.trim()) return res.status(400).json({ message: "Message is required." })

        const [[student]] = await pool.execute(
            `SELECT id, name FROM students WHERE id = ? LIMIT 1`,
            [userId]
        )

        let contextBlock = ""
        let systemIntro = ""

        if (student) {
            // ---- STUDENT CONTEXT ----

            const [modules] = await pool.execute(
                `
                SELECT m.code, m.name
                FROM enrolments e JOIN modules m ON m.id = e.module_id
                WHERE e.student_id = ? AND e.status = 'active'
                ORDER BY m.code
                `,
                [userId]
            )

            const [timetableRows] = await pool.execute(
                `
                SELECT m.code AS moduleCode, t.day, t.time, t.venue
                FROM enrolments e
                JOIN modules m ON m.id = e.module_id
                JOIN timetable t ON t.module_id = m.id
                WHERE e.student_id = ? AND e.status = 'active'
                `,
                [userId]
            )

            const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
            const now = new Date()
            const jsDay = now.getDay()
            const todayIndex = jsDay === 0 ? -1 : jsDay === 6 ? 5 : jsDay - 1
            const nowTime = now.toTimeString().slice(0, 5)

            const sorted = [...timetableRows].sort((a, b) => {
                const da = DAY_ORDER.indexOf(a.day), db = DAY_ORDER.indexOf(b.day)
                return da !== db ? da - db : a.time.localeCompare(b.time)
            })

            let nextClass = sorted.find((r) => {
                const idx = DAY_ORDER.indexOf(r.day)
                return idx > todayIndex || (idx === todayIndex && r.time.slice(0, 5) > nowTime)
            })
            if (!nextClass) nextClass = sorted[0]

            const [[nextAssignment]] = await pool.execute(
                `
                SELECT a.title, m.code AS moduleCode, a.due
                FROM enrolments e
                JOIN modules m ON m.id = e.module_id
                JOIN assignments a ON a.module_id = m.id
                WHERE e.student_id = ? AND e.status = 'active' AND a.due >= CURDATE()
                ORDER BY a.due ASC LIMIT 1
                `,
                [userId]
            )

            const [lowRatings] = await pool.execute(
                `
                SELECT m.code AS moduleCode, s.topic, r.rating
                FROM ratings r
                JOIN sessions s ON s.id = r.session_id
                JOIN modules m ON m.id = s.module_id
                WHERE r.student_id = ? AND r.rating <= 2
                ORDER BY s.session_date DESC LIMIT 5
                `,
                [userId]
            )

            const [[attendanceRow]] = await pool.execute(
                `
                SELECT COUNT(DISTINCT s.id) AS totalSessions, COUNT(DISTINCT a.session_id) AS attended
                FROM enrolments e
                JOIN sessions s ON s.module_id = e.module_id
                LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
                WHERE e.student_id = ? AND e.status = 'active'
                `,
                [userId]
            )

            const attendancePct = attendanceRow.totalSessions > 0
                ? Math.round((attendanceRow.attended / attendanceRow.totalSessions) * 100)
                : 100

            contextBlock = `
STUDENT: ${student.name}
Enrolled modules: ${modules.map((m) => `${m.code} (${m.name})`).join(", ") || "none"}
Next class: ${nextClass ? `${nextClass.moduleCode} on ${nextClass.day} at ${nextClass.time} in ${nextClass.venue}` : "No timetable entries found."}
Next assignment due: ${nextAssignment ? `"${nextAssignment.title}" for ${nextAssignment.moduleCode}, due ${nextAssignment.due}` : "Nothing currently due."}
Attendance rate: ${attendancePct}%
Topics rated poorly understood (1-2 out of 5): ${lowRatings.length ? lowRatings.map((r) => `${r.moduleCode}: "${r.topic}" (${r.rating}/5)`).join("; ") : "None recorded."}
`
            systemIntro = "You are the CampusTrack assistant helping a STUDENT."

        } else {
            // ---- LECTURER CONTEXT ----

            const [[staff]] = await pool.execute(
                `SELECT id, name, role FROM staff WHERE id = ? LIMIT 1`,
                [userId]
            )

            if (!staff || staff.role !== "lecturer") {
                return res.status(403).json({ message: "Assistant is only available for students and lecturers." })
            }

            const [modules] = await pool.execute(
                `SELECT m.id, m.code, m.name FROM modules m JOIN module_lecturers ml ON ml.module_id = m.id WHERE ml.lecturer_id = ?`,
                [userId]
            )

            const atRisk = await getLecturerAtRiskStudents(userId)

            let avgAttendance = null
            if (modules.length) {
                const placeholders = modules.map(() => "?").join(",")
                const [[attRow]] = await pool.execute(
                    `
                    SELECT
                        COUNT(DISTINCT CONCAT(s.id, '-', e.student_id)) AS totalPossible,
                        COUNT(DISTINCT CONCAT(a.session_id, '-', a.student_id)) AS attended
                    FROM sessions s
                    JOIN enrolments e ON e.module_id = s.module_id AND e.status = 'active'
                    LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
                    WHERE s.module_id IN (${placeholders})
                    `,
                    modules.map((m) => m.id)
                )
                avgAttendance = attRow.totalPossible > 0 ? Math.round((attRow.attended / attRow.totalPossible) * 100) : null
            }

            contextBlock = `
LECTURER: ${staff.name}
Modules taught: ${modules.map((m) => `${m.code} (${m.name})`).join(", ") || "none"}
Average attendance across all your modules: ${avgAttendance !== null ? avgAttendance + "%" : "No sessions logged yet."}
At-risk students (medium/high risk): ${atRisk.length ? atRisk.map((s) => `${s.name} (${s.studentNumber}) - ${s.risk.level} risk, score ${s.risk.score}`).join("; ") : "None currently flagged."}
Total at-risk count: ${atRisk.length}
`
            systemIntro = "You are the CampusTrack assistant helping a LECTURER."
        }

        const systemPrompt = `${systemIntro}

You have two different jobs, and it matters which one applies:

1. FACTS ABOUT THIS PERSON'S OWN RECORD (schedule, assignments, attendance, marks, risk status,
   which students are at risk, etc.) — answer ONLY using the DATA block below. Never invent or
   guess a date, mark, or name that isn't in the data. If it's not there, say you don't have
   that information yet.

2. EXPLAINING A TOPIC OR CONCEPT — if the person asks you to explain something they didn't
   understand (especially topics listed under "Topics rated poorly understood" in the DATA
   block), actually teach it properly using your own general knowledge. Give a clear, accurate,
   self-contained explanation like a good tutor would — don't limit yourself to the DATA block
   for this, since the DATA block only tells you WHICH topic to explain, not what the topic
   actually means.

Keep answers short and conversational — a few sentences for facts, a bit more room for a real
explanation, but never a wall of text.

DATA:
${contextBlock}`

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.3,
                max_tokens: 300
            })
        })

        if (!groqRes.ok) {
            const errText = await groqRes.text()
            console.error("GROQ API ERROR:", groqRes.status, errText)
            return res.status(502).json({ message: "The assistant is temporarily unavailable." })
        }

        const groqData = await groqRes.json()
        const reply = groqData.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't come up with an answer."

        res.json({ reply })

    } catch (error) {
        console.error("CHATBOT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to get a response from the assistant." })
    }
})


// =========================================================
// SECTION 12: DUPLICATE ROUTES FROM THE ORIGINAL FILE
// These two routes were defined a SECOND time earlier in your
// original server.js, after Sections 9-10 already defined them
// once. Express only ever runs the FIRST definition of a given
// path — these two never actually execute. Nothing removed per
// your request, but they're dead code. Safe to delete once
// you've confirmed the app still works fully without them.
// =========================================================

/*
app.get("/api/lecturer/modules/:moduleCode/roster", async (req, res) => {
    try {
        const { moduleCode } = req.params

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        const [students] = await pool.execute(
            `
            SELECT s.id, s.name, s.student_number AS studentNumber
            FROM enrolments e
            JOIN students s ON s.id = e.student_id
            WHERE e.module_id = ? AND e.status = 'active'
            ORDER BY s.name
            `,
            [module.id]
        )

        const rows = await Promise.all(students.map(async (s) => {
            const [[att]] = await pool.execute(
                `
                SELECT
                    COUNT(DISTINCT ses.id) AS total,
                    COUNT(DISTINCT a.session_id) AS attended
                FROM sessions ses
                LEFT JOIN attendance a ON a.session_id = ses.id AND a.student_id = ?
                WHERE ses.module_id = ?
                `,
                [s.id, module.id]
            )

            const attendanceRate = att.total > 0 ? Math.round((att.attended / att.total) * 100) : null

            const [[ratingRow]] = await pool.execute(
                `SELECT AVG(r.rating) AS avgRating
                 FROM ratings r
                 JOIN sessions ses ON ses.id = r.session_id
                 WHERE r.student_id = ? AND ses.module_id = ?`,
                [s.id, module.id]
            )

            const [[markRow]] = await pool.execute(
                `SELECT AVG(mark / out_of * 100) AS avgMark FROM results WHERE student_id = ? AND module_id = ?`,
                [s.id, module.id]
            )

            const attendance = attendanceRate ?? 100
            const understanding = ratingRow.avgRating ? Number(Number(ratingRow.avgRating).toFixed(1)) : null
            const avgMark = markRow.avgMark ? Math.round(Number(markRow.avgMark)) : null

            const score = Math.round(
                (attendance * 0.4) +
                ((understanding ?? 3) / 5 * 100 * 0.3) +
                ((avgMark ?? 60) * 0.3)
            )

            const level = score >= 70 ? "low" : score >= 50 ? "medium" : "high"

            return {
                id: s.id,
                name: s.name,
                studentNumber: s.studentNumber,
                attendanceRate,
                risk: { level, score }
            }
        }))

        res.json(rows)
    } catch (error) {
        console.error("LECTURER ROSTER ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load roster." })
    }
})

app.get("/api/lecturer/at-risk", async (req, res) => {
    try {
        const { userId } = req.query

        const [modules] = await pool.execute(
            `SELECT m.code FROM modules m JOIN module_lecturers ml ON ml.module_id = m.id WHERE ml.lecturer_id = ?`,
            [userId]
        )

        const seen = new Map()

        for (const m of modules) {
            const rosterRes = await fetch(`http://localhost:${PORT}/api/lecturer/modules/${m.code}/roster?userId=${userId}`)
            const roster = await rosterRes.json()

            for (const r of roster) {
                if (r.risk.level !== "low" && !seen.has(r.id)) {
                    seen.set(r.id, {
                        id: r.id,
                        name: r.name,
                        studentNumber: r.studentNumber,
                        attendance: r.attendanceRate ?? 100,
                        understanding: null,
                        avgMark: null,
                        level: r.risk.level,
                        score: r.risk.score
                    })
                }
            }
        }

        res.json(Array.from(seen.values()).sort((a, b) => a.score - b.score))
    } catch (error) {
        console.error("LECTURER AT-RISK ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load at-risk students." })
    }
})
*/


// =========================================================
// SECTION 13: START SERVER
// =========================================================

async function startServer() {

    await testDatabase()

    app.listen(PORT, () => {

        console.log("")
        console.log("=================================")
        console.log("CampusTrack Backend")
        console.log("=================================")
        console.log(`http://localhost:${PORT}`)
        console.log("=================================")
        console.log("Student login: Student Number + Password")
        console.log("Staff login: Staff Number + Password")
        console.log("Authentication: Express Session")
        console.log("JWT/Tokens: NOT USED")
        console.log("=================================")
        console.log("")

    })
}

startServer()