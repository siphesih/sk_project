const express = require("express")
const mysql = require("mysql2/promise")
const cors = require("cors")
const session = require("express-session")
const crypto = require("crypto")

const app = express()

const PORT = 5000

// =========================================================
// DATABASE
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
                NULL AS email,
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