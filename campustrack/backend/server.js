const express = require("express")
const mysql = require("mysql2/promise")
const cors = require("cors")
const session = require("express-session")
const crypto = require("crypto")

const app = express()

const PORT = Number(process.env.PORT || 5000)

// =========================================================
// DATABASE
// =========================================================

const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "campustrack_db",
    port: Number(process.env.DB_PORT || 3306),

    waitForConnections: true,
    connectionLimit: 10
})

// =========================================================
// MIDDLEWARE
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

// =========================================================
// TEST DATABASE
// =========================================================

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
// ADMIN GUARD
// =========================================================

function requireAdmin(req, res, next) {

    if (!req.session.userId || req.session.role !== "admin") {

        return res.status(401).json({
            message: "Not authorized."
        })
    }

    next()
}

// =========================================================
// HOME
// =========================================================

app.get("/", (req, res) => {

    res.json({
        message: "CampusTrack backend is running"
    })

})

// =========================================================
// LOGIN
// =========================================================

app.post("/api/auth/login", async (req, res) => {

    try {

        const {
            role,
            studentNumber,
            staffNumber,
            password
        } = req.body

        console.log("")
        console.log("=================================")
        console.log("CampusTrack Login")
        console.log("=================================")
        console.log("Role:", role)

        // =====================================================
        // BASIC VALIDATION
        // =====================================================

        if (!role) {

            console.error("Role is missing.")

            return res.status(400).json({
                message: "Role is required."
            })
        }

        if (!password) {

            console.error("Password is missing.")

            return res.status(400).json({
                message: "Password is required."
            })
        }

        let rows = []

        // =====================================================
        // STUDENT LOGIN
        // Student uses:
        // student number + password
        // =====================================================

        if (role === "student") {

            console.log("Login type: Student")
            console.log("Student Number:", studentNumber)

            if (!studentNumber) {

                console.error("Student number is missing.")

                return res.status(400).json({
                    message: "Student number is required."
                })
            }

            const [result] = await pool.execute(
                `
                SELECT *
                FROM students
                WHERE student_number = ?
                LIMIT 1
                `,
                [studentNumber.trim()]
            )

            rows = result
        }

        // =====================================================
        // STAFF LOGIN
        // Staff uses:
        // staff number + password
        //
        // NO EMAIL
        // =====================================================

        else if (role === "lecturer" || role === "admin") {

            console.log("Login type: Staff")
            console.log("Staff Role:", role)
            console.log("Staff Number:", staffNumber)

            if (!staffNumber) {

                console.error("Staff number is missing.")

                return res.status(400).json({
                    message: "Staff number is required."
                })
            }

            const [result] = await pool.execute(
                `
                SELECT *
                FROM staff
                WHERE staff_number = ?
                AND role = ?
                LIMIT 1
                `,
                [
                    staffNumber.trim(),
                    role
                ]
            )

            rows = result
        }

        // =====================================================
        // UNKNOWN ROLE
        // =====================================================

        else {

            console.error("Unknown role:", role)

            return res.status(400).json({
                message: "Unknown role."
            })
        }

        // =====================================================
        // ACCOUNT NOT FOUND
        // =====================================================

        if (rows.length === 0) {

            console.error("Account not found.")

            return res.status(401).json({
                message: "Incorrect login details."
            })
        }

        // =====================================================
        // GET ACCOUNT
        // =====================================================

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

        // =====================================================
        // PASSWORD
        // =====================================================
        // Passwords are currently stored as plain text.
        // =====================================================

        if (password !== user.password) {

            console.error("Incorrect password.")

            return res.status(401).json({
                message: "Incorrect login details."
            })
        }

        console.log("Password correct.")

        // =====================================================
        // CHECK ACCOUNT STATUS
        // =====================================================

        if (user.status && user.status !== "approved") {

            console.error(
                "Account is not approved. Status:",
                user.status
            )

            return res.status(403).json({
                message: `Account is ${user.status}.`
            })
        }

        // =====================================================
        // CREATE SESSION
        // =====================================================

        req.session.userId = user.id
        req.session.role = role

        console.log("Session created.")
        console.log("User ID:", user.id)
        console.log("Role:", role)

        // =====================================================
        // REMOVE PASSWORD
        // =====================================================

        delete user.password

        // Make sure frontend gets the correct role
        user.role = role

        // =====================================================
        // SUCCESS
        // =====================================================

        console.log("Login successful.")
        console.log("=================================")
        console.log("")

        res.json({
            message: "Login successful.",
            user
        })

    } catch (error) {

        console.error("")
        console.error("=================================")
        console.error("LOGIN ERROR")
        console.error("=================================")
        console.error(error)
        console.error("=================================")
        console.error("")

        res.status(500).json({
            message: "Something went wrong while logging in."
        })
    }

})

// =========================================================
// CURRENT USER
// =========================================================

app.get("/api/auth/me", async (req, res) => {

    try {

        if (!req.session.userId) {

            return res.status(401).json({
                message: "Not signed in."
            })
        }

        let query

        // =====================================================
        // STUDENT
        // =====================================================

        if (req.session.role === "student") {

            query = `
                SELECT *
                FROM students
                WHERE id = ?
                LIMIT 1
            `
        }

        // =====================================================
        // STAFF
        // =====================================================

        else {

            query = `
                SELECT *
                FROM staff
                WHERE id = ?
                LIMIT 1
            `
        }

        const [rows] = await pool.execute(
            query,
            [req.session.userId]
        )

        if (rows.length === 0) {

            req.session.destroy(() => {})

            return res.status(401).json({
                message: "User not found."
            })
        }

        const user = rows[0]

        // Never send password
        delete user.password

        // Add role from session
        user.role = req.session.role

        res.json({
            user
        })

    } catch (error) {

        console.error("ME ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Something went wrong."
        })
    }

})

// =========================================================
// LOGOUT
// =========================================================

app.post("/api/auth/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.error("LOGOUT ERROR:")
            console.error(error)

            return res.status(500).json({
                message: "Could not log out."
            })
        }

        res.json({
            message: "Logged out successfully."
        })
    })

})

// =========================================================
// GET ALL STUDENTS
// =========================================================

app.get("/api/students", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                id,
                name,
                email,
                student_number,
                faculty,
                department,
                year,
                status
            FROM students
            ORDER BY name
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("STUDENTS ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load students."
        })
    }

})

// =========================================================
// GET ALL STAFF
// =========================================================

app.get("/api/staff", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                id,
                name,
                staff_number,
                role,
                faculty,
                department,
                title,
                status
            FROM staff
            ORDER BY name
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("STAFF ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load staff."
        })
    }

})

// =========================================================
// GET LECTURERS
// =========================================================

app.get("/api/lecturers", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                id,
                name,
                staff_number,
                faculty,
                department,
                title,
                status
            FROM staff
            WHERE role = 'lecturer'
            ORDER BY name
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("LECTURERS ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load lecturers."
        })
    }

})

// =========================================================
// GET ADMINS
// =========================================================

app.get("/api/admins", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                id,
                name,
                staff_number,
                role,
                faculty,
                department,
                title,
                status
            FROM staff
            WHERE role = 'admin'
            ORDER BY name
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("ADMINS ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load administrators."
        })
    }

})

// =========================================================
// MODULES
// =========================================================

app.get("/api/modules", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT m.*, ml.lecturer_id
            FROM modules m
            LEFT JOIN module_lecturers ml
                ON ml.module_id = m.id
                AND ml.is_primary = 1
            ORDER BY m.code
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("MODULES ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load modules."
        })
    }

})


// =========================================================
// ADMIN - OVERVIEW (dashboard counts)
// =========================================================

app.get("/api/admin/overview", async (req, res) => {

    try {

        const [[{ students }]] = await pool.execute(
            `SELECT COUNT(*) AS students FROM students`
        )

        const [[{ lecturers }]] = await pool.execute(
            `SELECT COUNT(*) AS lecturers FROM staff WHERE role = 'lecturer'`
        )

        const [[{ modules }]] = await pool.execute(
            `SELECT COUNT(*) AS modules FROM modules`
        )

        res.json({
            counts: {
                students,
                lecturers,
                modules
            }
        })

    } catch (error) {
        console.error("ADMIN OVERVIEW ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load overview." })
    }
})


// =========================================================
// ADMIN - GET USERS
// Combines students and staff
// =========================================================

app.get("/api/admin/users", async (req, res) => {

    try {

        // Get students
        const [students] = await pool.execute(
            `
            SELECT
                id,
                name,
                email,
                student_number,
                NULL AS staff_number,
                'student' AS role,
                faculty,
                department,
                year,
                NULL AS title,
                status
            FROM students
            ORDER BY name
            `
        )


        // Get staff
        const [staff] = await pool.execute(
            `
            SELECT
                id,
                name,
                email,
                NULL AS student_number,
                staff_number,
                role,
                faculty,
                department,
                NULL AS year,
                title,
                status
            FROM staff
            ORDER BY name
            `
        )

        // Combine both tables
        const users = [
            ...students,
            ...staff
        ]

        res.json(users)

    } catch (error) {

        console.error("ADMIN USERS ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load users."
        })
    }

})


// =========================================================
// ADMIN - CREATE USER
// =========================================================

app.post("/api/admin/users", async (req, res) => {

    try {

        const {
            role,
            name,
            email,
            studentNumber,
            password
        } = req.body

        if (!role) {
            return res.status(400).json({ message: "Role is required." })
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name is required." })
        }

        if (!password) {
            return res.status(400).json({ message: "Password is required." })
        }

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
                `
                INSERT INTO students
                (id, student_number, name, password, email)
                VALUES (?, ?, ?, ?, ?)
                `,
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
                `
                INSERT INTO staff
                (id, staff_number, name, email, password, role)
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [newId, staffNumber, name.trim(), normalizedEmail, password, role]
            )
        }

        else {
            return res.status(400).json({ message: "Unknown role." })
        }

        res.status(201).json({
            message: "User added successfully.",
            userId: newId
        })

    } catch (error) {

        console.error("CREATE USER ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to add user."
        })
    }

})


// =========================================================
// ADMIN - GET MODULES
// =========================================================

app.get("/api/admin/modules", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT m.*, ml.lecturer_id
            FROM modules m
            LEFT JOIN module_lecturers ml
                ON ml.module_id = m.id
                AND ml.is_primary = 1
            ORDER BY m.code
            `
        )

        res.json(rows)

    } catch (error) {

        console.error("ADMIN MODULES ERROR:")
        console.error(error)

        res.status(500).json({
            message: "Failed to load modules."
        })
    }

})



// =========================================================
// ADMIN - CREATE MODULE
// =========================================================

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
            `
            INSERT INTO modules
            (id, code, name, period, created_by)
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                moduleId,
                code.trim().toUpperCase(),
                name.trim(),
                period,
                userId || null
            ]
        )

        // Lecturer assignment goes in module_lecturers, not modules.lecturer_id
        if (lecturerId) {
            await pool.execute(
                `
                INSERT INTO module_lecturers
                (id, module_id, lecturer_id, is_primary, assigned_by)
                VALUES (?, ?, ?, 1, ?)
                `,
                [crypto.randomUUID(), moduleId, lecturerId, userId || null]
            )
        }

        res.status(201).json({
            message: "Module created successfully.",
            moduleId
        })

    } catch (error) {
        console.error("CREATE MODULE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to create module." })
    }

})


// =========================================================
// ADMIN - GET ENROLMENTS
// =========================================================

app.get("/api/admin/enrolments", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                e.id,
                e.student_id,
                s.name AS studentName,
                s.student_number AS studentNumber,
                e.module_id,
                m.code AS moduleCode,
                m.name AS moduleName,
                e.status,
                e.enrollment_date
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


// =========================================================
// ADMIN - CREATE ENROLMENT
// =========================================================

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
            `
            INSERT INTO enrolments (student_id, module_id)
            VALUES (?, ?)
            `,
            [studentId, moduleId]
        )

        res.status(201).json({ message: "Student enrolled successfully." })

    } catch (error) {
        console.error("CREATE ENROLMENT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to enrol student." })
    }
})


// =========================================================
// ADMIN - REMOVE ENROLMENT
// =========================================================

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


// =========================================================
// ADMIN - GET COURSES
// =========================================================

app.get("/api/admin/courses", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `SELECT * FROM courses ORDER BY code`
        )

        res.json(rows)

    } catch (error) {
        console.error("ADMIN COURSES ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load courses." })
    }
})


// =========================================================
// ADMIN - CREATE COURSE
// =========================================================

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
            `
            INSERT INTO courses (id, code, name, faculty, department, duration_years)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [courseId, normalizedCode, name.trim(), faculty?.trim() || null, department?.trim() || null, courseDuration]
        )

        res.status(201).json({ message: "Course created successfully.", courseId })

    } catch (error) {
        console.error("CREATE COURSE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to create course." })
    }
})


// =========================================================
// ADMIN - GET MODULES FOR A COURSE
// =========================================================

app.get("/api/admin/courses/:courseId/modules", async (req, res) => {

    try {

        const [rows] = await pool.execute(
            `
            SELECT
                cm.id,
                cm.year_level,
                m.id AS moduleId,
                m.code AS moduleCode,
                m.name AS moduleName
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


// =========================================================
// ADMIN - ADD MODULE TO COURSE
// =========================================================

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
            `
            INSERT INTO course_modules (id, course_id, module_id, year_level)
            VALUES (?, ?, ?, ?)
            `,
            [crypto.randomUUID(), req.params.courseId, moduleId, parsedYear]
        )

        res.status(201).json({ message: "Module added to course." })

    } catch (error) {
        console.error("ADD COURSE MODULE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to add module to course." })
    }
})


// =========================================================
// ADMIN - REMOVE MODULE FROM COURSE
// =========================================================

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
// STUDENT - TIMETABLE
// Only shows classes for modules the student is enrolled in
// =========================================================

app.get("/api/student/timetable", async (req, res) => {
    try {
        const { userId } = req.query

        const [rows] = await pool.execute(
            `
            SELECT
                m.code AS moduleCode,
                t.day,
                t.time,
                t.venue
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


// =========================================================
// STUDENT - ASSIGNMENTS
// =========================================================

app.get("/api/student/assignments", async (req, res) => {
    try {
        const { userId } = req.query

        const [rows] = await pool.execute(
            `
            SELECT
                a.id,
                a.title,
                m.code AS moduleCode,
                a.due
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


// =========================================================
// STUDENT - SESSIONS (for rating)
// =========================================================

app.get("/api/student/sessions", async (req, res) => {
    try {
        const { userId } = req.query

        const [rows] = await pool.execute(
            `
            SELECT
                s.id,
                m.code AS moduleCode,
                s.session_date AS date,
                s.topic,
                r.rating AS myRating
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


// =========================================================
// STUDENT - RATE A SESSION
// =========================================================

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


// =========================================================
// STUDENT - MARK ATTENDANCE
// =========================================================

app.post("/api/student/attendance/mark", async (req, res) => {
    try {
        const { userId, code } = req.body

        if (!code) return res.status(400).json({ message: "Attendance code is required." })

        const [[session]] = await pool.execute(
            `
            SELECT id, code_expires_at
            FROM sessions
            WHERE attendance_code = ?
            LIMIT 1
            `,
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
            `
            INSERT INTO attendance (session_id, student_id, status, marked_at)
            VALUES (?, ?, 'present', NOW())
            `,
            [session.id, userId]
        )

        res.status(201).json({ message: "You've been marked present." })
    } catch (error) {
        console.error("MARK ATTENDANCE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to mark attendance." })
    }
})


// =========================================================
// STUDENT - OVERVIEW (risk indicator + next assignment + modules)
// =========================================================

app.get("/api/student/overview", async (req, res) => {
    try {
        const { userId } = req.query

        // Modules the student is enrolled in
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

        // Attendance rate: present sessions / total sessions held for enrolled modules
        const [[attendanceRow]] = await pool.execute(
            `
            SELECT
                COUNT(DISTINCT s.id) AS totalSessions,
                COUNT(DISTINCT a.session_id) AS attended
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

        // Average self-rated understanding
        const [[ratingRow]] = await pool.execute(
            `SELECT AVG(rating) AS avgRating FROM ratings WHERE student_id = ?`,
            [userId]
        )

        // Average mark across results
        const [[markRow]] = await pool.execute(
            `SELECT AVG(mark / out_of * 100) AS avgMark FROM results WHERE student_id = ?`,
            [userId]
        )

        const understanding = ratingRow.avgRating ? Number(ratingRow.avgRating.toFixed(1)) : null
        const avgMark = markRow.avgMark ? Math.round(markRow.avgMark) : null

        // Simple explainable risk score out of 100
        const score = Math.round(
            (attendancePct * 0.4) +
            ((understanding ?? 3) / 5 * 100 * 0.3) +
            ((avgMark ?? 60) * 0.3)
        )

        const level = score >= 70 ? "low" : score >= 50 ? "medium" : "high"

        // Next assignment due
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


// =========================================================
// LECTURER - MODULES (already covered earlier, confirm this exists)
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


// =========================================================
// LECTURER - ROSTER (per module, with attendance % and risk)
// =========================================================

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

        // Attendance % and risk per student, for this module only
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
            const understanding = ratingRow.avgRating ? Number(ratingRow.avgRating.toFixed(1)) : null
            const avgMark = markRow.avgMark ? Math.round(markRow.avgMark) : null

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


// =========================================================
// LECTURER - AT-RISK (across all their modules)
// =========================================================

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


// =========================================================
// LECTURER - SESSIONS FOR A MODULE
// =========================================================

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
            SELECT id, session_date AS date, topic
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


// =========================================================
// LECTURER - CREATE SESSION
// =========================================================

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
            `
            INSERT INTO sessions (id, module_id, lecturer_id, session_date, topic)
            VALUES (?, ?, ?, ?, ?)
            `,
            [sessionId, module.id, userId, date, topic.trim()]
        )

        res.status(201).json({ id: sessionId, date, topic: topic.trim() })
    } catch (error) {
        console.error("CREATE SESSION ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to log session." })
    }
})


// =========================================================
// LECTURER - GENERATE ATTENDANCE CODE
// =========================================================

app.post("/api/lecturer/sessions/:id/generate-code", async (req, res) => {
    try {
        const { id } = req.params
        const { expiresInMinutes } = req.body

        const minutes = Number(expiresInMinutes) || 10
        const code = Math.random().toString(36).slice(2, 8).toUpperCase()
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000)

        await pool.execute(
            `
            UPDATE sessions
            SET attendance_code = ?, code_expires_at = ?, expiry_minutes = ?
            WHERE id = ?
            `,
            [code, expiresAt, minutes, id]
        )

        res.json({ code, expiresAt: expiresAt.getTime() })
    } catch (error) {
        console.error("GENERATE CODE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to generate code." })
    }
})


// =========================================================
// LECTURER - VIEW ATTENDANCE FOR A SESSION
// =========================================================

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
            SELECT
                s.id AS studentId,
                s.name,
                s.student_number AS studentNumber,
                a.status,
                r.rating
            FROM enrolments e
            JOIN students s ON s.id = e.student_id
            LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = s.id
            LEFT JOIN ratings r ON r.session_id = ? AND r.student_id = s.id
            WHERE e.module_id = ? AND e.status = 'active'
            ORDER BY s.name
            `,
            [id, id, session.module_id]
        )

        res.json({
            rows: rows.map((r) => ({ ...r, status: r.status || "absent" }))
        })
    } catch (error) {
        console.error("SESSION ATTENDANCE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load attendance." })
    }
})


// =========================================================
// LECTURER - RESULTS (get + create)
// =========================================================

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
            `
            INSERT INTO results (student_id, module_id, category, title, mark, out_of)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [studentId, module.id, category, title.trim(), mark, outOf || 100]
        )

        res.status(201).json({ message: "Result saved." })
    } catch (error) {
        console.error("SAVE RESULT ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to save result." })
    }
})

// =========================================================
// START SERVER
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