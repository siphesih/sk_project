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
const PORT = Number(process.env.PORT || 5000)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:6001"
// Overridable so the automated tests can point the chatbot and quiz generator at a local mock.
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions"
const configuredGeoRadius = Number(process.env.GEO_RADIUS_METERS ?? 100)
const GEO_RADIUS_METERS = Number.isFinite(configuredGeoRadius) && configuredGeoRadius >= 0 ? configuredGeoRadius : 100
// "flag" (default): students outside the radius can still sign, but are recorded as not in class.
// "enforce": students outside the radius are rejected.
const GEO_MODE = process.env.GEO_MODE === "enforce" ? "enforce" : "flag"
// "groq" (default) uses the Groq API; "mock" returns a fixed quiz (for tests / offline dev).
const QUIZ_GENERATOR = process.env.QUIZ_GENERATOR === "mock" ? "mock" : "groq"
const QUIZ_QUESTION_COUNT = 10


// =========================================================
// SECTION 2: DATABASE
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

async function ensureLocationSchema() {
    const [sessionColumns] = await pool.query(
        `SELECT COLUMN_NAME AS column_name
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions'`
    )
    const sessionColumnNames = new Set(sessionColumns.map((column) => column.column_name))
    const sessionChanges = []

    if (!sessionColumnNames.has("lecturer_lat")) {
        sessionChanges.push("ADD COLUMN lecturer_lat DECIMAL(9,6) NULL")
    }
    if (!sessionColumnNames.has("lecturer_lng")) {
        sessionChanges.push("ADD COLUMN lecturer_lng DECIMAL(9,6) NULL")
    }
    if (!sessionColumnNames.has("lecturer_accuracy_m")) {
        sessionChanges.push("ADD COLUMN lecturer_accuracy_m INT NULL")
    }

    if (sessionChanges.length > 0) {
        await pool.query(`ALTER TABLE sessions ${sessionChanges.join(", ")}`)
    }

    const [attendanceColumns] = await pool.query(
        `SELECT COLUMN_NAME AS column_name
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'`
    )
    const attendanceColumnNames = new Set(attendanceColumns.map((column) => column.column_name))
    const attendanceChanges = []

    if (!attendanceColumnNames.has("latitude")) {
        attendanceChanges.push("ADD COLUMN latitude DECIMAL(9,6) NULL")
    }
    if (!attendanceColumnNames.has("longitude")) {
        attendanceChanges.push("ADD COLUMN longitude DECIMAL(9,6) NULL")
    }
    if (!attendanceColumnNames.has("accuracy_m")) {
        attendanceChanges.push("ADD COLUMN accuracy_m INT NULL")
    }
    if (!attendanceColumnNames.has("distance_m")) {
        attendanceChanges.push("ADD COLUMN distance_m INT NULL")
    }
    if (!attendanceColumnNames.has("location_status")) {
        attendanceChanges.push("ADD COLUMN location_status ENUM('verified','outside_radius','no_location','not_checked') NOT NULL DEFAULT 'not_checked'")
    }

    if (attendanceChanges.length > 0) {
        await pool.query(`ALTER TABLE attendance ${attendanceChanges.join(", ")}`)
    }
}

async function ensureQuizSchema() {
    const [sessionColumns] = await pool.query(
        `SELECT COLUMN_NAME AS column_name
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'description'`
    )

    if (sessionColumns.length === 0) {
        await pool.query(`ALTER TABLE sessions ADD COLUMN description TEXT NULL AFTER topic`)
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS session_quizzes (
            session_id VARCHAR(36) NOT NULL,
            questions LONGTEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            session_id VARCHAR(36) NOT NULL,
            student_id VARCHAR(36) NOT NULL,
            answers LONGTEXT NOT NULL,
            score INT NOT NULL,
            total INT NOT NULL,
            submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, student_id),
            KEY student_id (student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
}

// Queries join `ratings` to `sessions` and `students` on their id columns, so the
// tables must share one collation. A copy of campustrack_db.sql created `ratings`
// with utf8mb4_general_ci, which makes every such query fail with
// "Illegal mix of collations". This repairs databases created from that copy.
async function ensureMatchingCollations() {
    const [tables] = await pool.query(
        `SELECT TABLE_NAME AS name, TABLE_COLLATION AS tableCollation
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('sessions', 'ratings')`
    )
    const sessions = tables.find((t) => t.name === "sessions")
    const ratings = tables.find((t) => t.name === "ratings")

    if (sessions && ratings && ratings.tableCollation !== sessions.tableCollation && /^[a-z0-9_]+$/.test(sessions.tableCollation)) {
        console.log(`Converting the ratings table to ${sessions.tableCollation} to match the other tables.`)
        await pool.query(`ALTER TABLE ratings CONVERT TO CHARACTER SET utf8mb4 COLLATE ${sessions.tableCollation}`)
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

async function lecturerTeachesModule(moduleId, lecturerId) {
    const [[assignment]] = await pool.execute(
        `SELECT id FROM module_lecturers WHERE module_id = ? AND lecturer_id = ? LIMIT 1`,
        [moduleId, lecturerId]
    )
    return Boolean(assignment)
}

const ATTENDANCE_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// Always 6 characters. (The old Math.random().toString(36) version could, rarely,
// return fewer, which the student page can't submit.)
function generateAttendanceCode() {
    let code = ""
    for (let i = 0; i < 6; i++) {
        code += ATTENDANCE_CODE_CHARACTERS[crypto.randomInt(ATTENDANCE_CODE_CHARACTERS.length)]
    }
    return code
}

function isValidCoordinate(value, minimum, maximum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isValidAccuracy(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function getDistanceMeters(latitude1, longitude1, latitude2, longitude2) {
    const toRadians = (degrees) => degrees * Math.PI / 180
    const earthRadiusMeters = 6371000
    const latitudeDelta = toRadians(latitude2 - latitude1)
    const longitudeDelta = toRadians(longitude2 - longitude1)
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) *
        Math.sin(longitudeDelta / 2) ** 2

    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine))
}

// ---- SESSION QUIZ HELPERS ----

function shuffle(items) {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1)
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

// Checks the AI output has the exact shape we need, then shuffles each question's
// options so the correct answer is not always in the same position.
function normaliseQuizQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions) || rawQuestions.length < QUIZ_QUESTION_COUNT) return null

    const questions = []

    for (const raw of rawQuestions.slice(0, QUIZ_QUESTION_COUNT)) {
        const question = typeof raw?.question === "string" ? raw.question.trim() : ""
        const options = Array.isArray(raw?.options) ? raw.options.map((o) => String(o ?? "").trim()) : []
        const answerIndex = Number(raw?.answerIndex)
        const explanation = typeof raw?.explanation === "string" ? raw.explanation.trim() : ""

        if (!question || options.length !== 4 || options.some((o) => !o)) return null
        if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null
        if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null

        const correctOption = options[answerIndex]
        const shuffledOptions = shuffle(options)

        questions.push({
            question,
            options: shuffledOptions,
            answerIndex: shuffledOptions.indexOf(correctOption),
            explanation
        })
    }

    return questions
}

function buildMockQuiz(topic) {
    return Array.from({ length: QUIZ_QUESTION_COUNT }, (_, i) => ({
        question: `Mock question ${i + 1} about ${topic}?`,
        options: [`Correct answer ${i + 1}`, `Wrong answer ${i + 1}A`, `Wrong answer ${i + 1}B`, `Wrong answer ${i + 1}C`],
        answerIndex: 0,
        explanation: `Mock explanation ${i + 1}.`
    }))
}

async function generateQuizQuestions(topic, description) {
    if (QUIZ_GENERATOR === "mock") return normaliseQuizQuestions(buildMockQuiz(topic))

    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set.")

    const systemPrompt = `You write short multiple-choice quizzes that check whether a university student understood a lecture.

Rules:
- Write exactly ${QUIZ_QUESTION_COUNT} questions, based ONLY on what the lecture description says was taught.
- Each question has exactly 4 different options and exactly one correct answer.
- Mix recall questions with questions that test understanding or applying the idea.
- Keep questions and options short and clear. No "all of the above" or "none of the above".
- The explanation is one or two sentences saying why the correct answer is right.

Return ONLY a JSON object in this shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}
answerIndex is the 0-based position of the correct option.`

    const userPrompt = `Lecture topic: ${topic}\n\nWhat the lecturer taught in this session:\n${description}`

    let lastError = null

    // One retry, because the model occasionally returns a malformed quiz.
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const groqRes = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "openai/gpt-oss-120b",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 6000,
                    reasoning_effort: "low",
                    response_format: { type: "json_object" }
                })
            })

            if (!groqRes.ok) {
                throw new Error(`Groq returned ${groqRes.status}: ${(await groqRes.text()).slice(0, 300)}`)
            }

            const groqData = await groqRes.json()
            const content = groqData.choices?.[0]?.message?.content || ""
            const questions = normaliseQuizQuestions(JSON.parse(content).questions)

            if (questions) return questions
            lastError = new Error("Groq returned a quiz in the wrong format.")
        } catch (error) {
            lastError = error
        }
    }

    throw lastError
}

async function getSessionQuiz(sessionId) {
    const [[row]] = await pool.execute(
        `SELECT questions FROM session_quizzes WHERE session_id = ? LIMIT 1`,
        [sessionId]
    )
    return row ? JSON.parse(row.questions) : null
}

// Returns the stored quiz, generating and saving it first if it doesn't exist yet.
// Returns null when the session has no description to build a quiz from.
async function getOrCreateSessionQuiz(sessionId) {
    const existing = await getSessionQuiz(sessionId)
    if (existing) return existing

    const [[session]] = await pool.execute(
        `SELECT topic, description FROM sessions WHERE id = ? LIMIT 1`,
        [sessionId]
    )
    if (!session || !session.description || !session.description.trim()) return null

    const questions = await generateQuizQuestions(session.topic, session.description.trim())

    // INSERT IGNORE: if two requests generate at the same time, the first one saved wins
    // and everyone gets that same quiz.
    await pool.execute(
        `INSERT IGNORE INTO session_quizzes (session_id, questions) VALUES (?, ?)`,
        [sessionId, JSON.stringify(questions)]
    )

    return getSessionQuiz(sessionId)
}

// 0-2 correct -> 1, 3-4 -> 2, 5-6 -> 3, 7-8 -> 4, 9-10 -> 5
function quizScoreToRating(score, total) {
    if (!total) return 1
    return Math.min(5, Math.max(1, Math.ceil((score / total) * 5)))
}

function buildQuizReview(questions, answers) {
    return questions.map((q, i) => ({
        question: q.question,
        options: q.options,
        chosenIndex: answers?.[i] ?? null,
        answerIndex: q.answerIndex,
        explanation: q.explanation,
        correct: answers?.[i] === q.answerIndex
    }))
}

// A student may only see/take a session's quiz if they are enrolled and signed the register.
async function getStudentQuizAccess(sessionId, studentId) {
    const [[row]] = await pool.execute(
        `
        SELECT s.id, s.topic, m.code AS moduleCode, a.status AS attendanceStatus,
               (s.description IS NOT NULL AND TRIM(s.description) <> '') AS hasQuiz
        FROM sessions s
        JOIN modules m ON m.id = s.module_id
        JOIN enrolments e ON e.module_id = s.module_id AND e.student_id = ? AND e.status = 'active'
        LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ?
        WHERE s.id = ?
        LIMIT 1
        `,
        [studentId, studentId, sessionId]
    )

    if (!row) return { error: [404, "Session not found."] }
    if (!row.attendanceStatus || row.attendanceStatus === "absent") {
        return { error: [403, "Sign the register for this session to unlock its quiz."] }
    }
    if (!Number(row.hasQuiz)) return { error: [404, "There is no quiz for this session."] }

    return { session: row }
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
                [String(studentNumber).trim()]
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
                [String(staffNumber).trim(), role]
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

        const [[existing]] = await pool.execute(
            `SELECT id, status FROM enrolments WHERE student_id = ? AND module_id = ? LIMIT 1`,
            [studentId, moduleId]
        )

        if (existing && existing.status === "active") {
            return res.status(409).json({ message: "This student is already enrolled in that module." })
        }

        if (existing) {
            // (student_id, module_id) is unique, so a student who was removed earlier
            // is re-enrolled by reactivating their old row instead of inserting a new one.
            await pool.execute(
                `UPDATE enrolments SET status = 'active', enrollment_date = CURDATE() WHERE id = ?`,
                [existing.id]
            )
        } else {
            await pool.execute(
                `INSERT INTO enrolments (student_id, module_id) VALUES (?, ?)`,
                [studentId, moduleId]
            )
        }

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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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
        if (!userId) return res.status(400).json({ message: "Missing user." })

        const [rows] = await pool.execute(
            `
            SELECT
                s.id,
                m.code AS moduleCode,
                s.topic,
                DATE_FORMAT(s.session_date, '%Y-%m-%d') AS date,
                a.status AS attendanceStatus,
                r.rating AS myRating,
                (s.description IS NOT NULL AND TRIM(s.description) <> '') AS hasQuiz,
                qa.score AS quizScore,
                qa.total AS quizTotal
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN sessions s ON s.module_id = m.id
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
            LEFT JOIN ratings r ON r.session_id = s.id AND r.student_id = e.student_id
            LEFT JOIN quiz_attempts qa ON qa.session_id = s.id AND qa.student_id = e.student_id
            WHERE e.student_id = ? AND e.status = 'active'
              AND s.attendance_code IS NOT NULL
              AND s.code_expires_at > NOW()
            ORDER BY s.session_date DESC
            `,
            [userId]
        )

        res.json(rows.map((r) => ({ ...r, hasQuiz: Boolean(Number(r.hasQuiz)) })))
    } catch (error) {
        console.error("OPEN SESSIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load open sessions." })
    }
})

app.get("/api/student/sessions", async (req, res) => {
    try {
        const { userId } = req.query
        if (!userId) return res.status(400).json({ message: "Missing user." })
        const [rows] = await pool.execute(
            `
            SELECT s.id, m.code AS moduleCode, DATE_FORMAT(s.session_date, '%Y-%m-%d') AS date, s.topic,
                   r.rating AS myRating,
                   a.status AS attendanceStatus,
                   (s.description IS NOT NULL AND TRIM(s.description) <> '') AS hasQuiz,
                   qa.score AS quizScore,
                   qa.total AS quizTotal
            FROM enrolments e
            JOIN modules m ON m.id = e.module_id
            JOIN sessions s ON s.module_id = m.id
            LEFT JOIN ratings r ON r.session_id = s.id AND r.student_id = e.student_id
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
            LEFT JOIN quiz_attempts qa ON qa.session_id = s.id AND qa.student_id = e.student_id
            WHERE e.student_id = ? AND e.status = 'active'
            ORDER BY s.session_date DESC, s.created_at DESC
            `,
            [userId]
        )
        res.json(rows.map((r) => ({ ...r, hasQuiz: Boolean(Number(r.hasQuiz)) })))
    } catch (error) {
        console.error("STUDENT SESSIONS ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load sessions." })
    }
})

// Self-rating was replaced by the session quiz: the rating is now worked out from the quiz score.
app.post("/api/student/sessions/:id/rating", (req, res) => {
    res.status(410).json({ message: "Self-rating is no longer used. Take the session quiz to record your understanding." })
})

// ---- SESSION QUIZ (student) ----
app.get("/api/student/sessions/:id/quiz", async (req, res) => {
    try {
        const { id } = req.params
        const { userId } = req.query

        if (!userId) return res.status(400).json({ message: "Missing user." })

        const access = await getStudentQuizAccess(id, userId)
        if (access.error) return res.status(access.error[0]).json({ message: access.error[1] })

        const [[attempt]] = await pool.execute(
            `SELECT answers, score, total FROM quiz_attempts WHERE session_id = ? AND student_id = ? LIMIT 1`,
            [id, userId]
        )

        let questions
        try {
            questions = await getOrCreateSessionQuiz(id)
        } catch (error) {
            console.error("QUIZ GENERATION ERROR:", error.message)
            return res.status(502).json({ message: "The quiz couldn't be generated right now. Please try again in a moment." })
        }

        if (!questions) return res.status(404).json({ message: "There is no quiz for this session." })

        if (attempt) {
            return res.json({
                completed: true,
                topic: access.session.topic,
                moduleCode: access.session.moduleCode,
                score: attempt.score,
                total: attempt.total,
                rating: quizScoreToRating(attempt.score, attempt.total),
                review: buildQuizReview(questions, JSON.parse(attempt.answers))
            })
        }

        // Never send the answers or explanations before the student submits.
        res.json({
            completed: false,
            topic: access.session.topic,
            moduleCode: access.session.moduleCode,
            questions: questions.map((q) => ({ question: q.question, options: q.options }))
        })
    } catch (error) {
        console.error("STUDENT QUIZ ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load the quiz." })
    }
})

app.post("/api/student/sessions/:id/quiz", async (req, res) => {
    try {
        const { id } = req.params
        const { userId, answers } = req.body

        if (!userId) return res.status(400).json({ message: "Missing user." })

        const access = await getStudentQuizAccess(id, userId)
        if (access.error) return res.status(access.error[0]).json({ message: access.error[1] })

        const questions = await getSessionQuiz(id)
        if (!questions) return res.status(404).json({ message: "There is no quiz for this session yet." })

        const validAnswers = Array.isArray(answers) &&
            answers.length === questions.length &&
            answers.every((a) => Number.isInteger(a) && a >= 0 && a < 4)

        if (!validAnswers) {
            return res.status(400).json({ message: `Please answer all ${questions.length} questions.` })
        }

        const score = questions.reduce((total, q, i) => total + (answers[i] === q.answerIndex ? 1 : 0), 0)
        const total = questions.length
        const rating = quizScoreToRating(score, total)

        try {
            await pool.execute(
                `INSERT INTO quiz_attempts (session_id, student_id, answers, score, total) VALUES (?, ?, ?, ?, ?)`,
                [id, userId, JSON.stringify(answers), score, total]
            )
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ message: "You've already completed this quiz." })
            }
            throw error
        }

        await pool.execute(
            `INSERT INTO ratings (session_id, student_id, rating) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [id, userId, rating]
        )

        res.status(201).json({
            completed: true,
            topic: access.session.topic,
            moduleCode: access.session.moduleCode,
            score,
            total,
            rating,
            review: buildQuizReview(questions, answers)
        })
    } catch (error) {
        console.error("SUBMIT QUIZ ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to submit the quiz." })
    }
})

app.post("/api/student/attendance/mark", async (req, res) => {
    try {
        const { userId, code, latitude, longitude, accuracy } = req.body

        if (!userId) return res.status(400).json({ message: "Missing user." })
        if (!code) return res.status(400).json({ message: "Attendance code is required." })

        const hasLatitude = latitude !== undefined && latitude !== null
        const hasLongitude = longitude !== undefined && longitude !== null
        const hasAccuracy = accuracy !== undefined && accuracy !== null
        if (hasLatitude !== hasLongitude || hasAccuracy && !hasLatitude) {
            return res.status(400).json({ message: "A valid location is required." })
        }
        if (hasLatitude && (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180))) {
            return res.status(400).json({ message: "A valid location is required." })
        }
        if (hasAccuracy && !isValidAccuracy(accuracy)) {
            return res.status(400).json({ message: "Location accuracy must be a non-negative number." })
        }

        const [[session]] = await pool.execute(
            `SELECT id, module_id, code_expires_at, lecturer_lat, lecturer_lng FROM sessions WHERE attendance_code = ? LIMIT 1`,
            [String(code).trim().toUpperCase()]
        )

        if (!session) {
            return res.status(404).json({ message: "Invalid attendance code." })
        }

        if (session.code_expires_at && new Date(session.code_expires_at) < new Date()) {
            return res.status(400).json({ message: "This code has expired." })
        }

        const [[enrolment]] = await pool.execute(
            `SELECT id FROM enrolments WHERE student_id = ? AND module_id = ? AND status = 'active' LIMIT 1`,
            [userId, session.module_id]
        )

        if (!enrolment) {
            return res.status(403).json({ message: "You are not enrolled in this module, so you can't sign its register." })
        }

        const [existing] = await pool.execute(
            `SELECT id FROM attendance WHERE session_id = ? AND student_id = ? LIMIT 1`,
            [session.id, userId]
        )

        if (existing.length > 0) {
            return res.status(409).json({ message: "You've already been marked for this session." })
        }

        let locationStatus = "not_checked"
        let distanceMeters = null
        if (session.lecturer_lat !== null && session.lecturer_lng !== null) {
            if (!hasLatitude) {
                if (GEO_MODE === "enforce") {
                    return res.status(400).json({ message: "Location is required to sign the register." })
                }
                locationStatus = "no_location"
            } else {
                const exactDistanceMeters = getDistanceMeters(
                    Number(session.lecturer_lat),
                    Number(session.lecturer_lng),
                    latitude,
                    longitude
                )
                distanceMeters = Math.round(exactDistanceMeters)
                const allowedDistance = GEO_RADIUS_METERS + Math.min(hasAccuracy ? accuracy : 0, 50)
                if (exactDistanceMeters > allowedDistance) {
                    if (GEO_MODE === "enforce") {
                        return res.status(403).json({
                            message: `You appear to be about ${distanceMeters} m from the lecturer. You must be in class to sign.`
                        })
                    }
                    locationStatus = "outside_radius"
                } else {
                    locationStatus = "verified"
                }
            }
        }

        try {
            await pool.execute(
                `INSERT INTO attendance (session_id, student_id, status, marked_at, latitude, longitude, accuracy_m, distance_m, location_status)
                 VALUES (?, ?, 'present', NOW(), ?, ?, ?, ?, ?)`,
                [
                    session.id,
                    userId,
                    hasLatitude ? latitude : null,
                    hasLongitude ? longitude : null,
                    hasAccuracy ? Math.round(accuracy) : null,
                    distanceMeters,
                    locationStatus
                ]
            )
        } catch (error) {
            // Two requests at once (e.g. a double tap) can both pass the check above;
            // the unique key on (session_id, student_id) stops the second one.
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ message: "You've already been marked for this session." })
            }
            throw error
        }

        const locationMessages = {
            outside_radius: " Your location doesn't match the classroom, so your lecturer will see you as not in class.",
            no_location: " We couldn't confirm your location, so your lecturer will see it as unknown."
        }

        res.status(201).json({
            message: `You've been marked present.${locationMessages[locationStatus] || ""}`,
            locationStatus,
            distanceMeters
        })
    } catch (error) {
        console.error("MARK ATTENDANCE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to mark attendance." })
    }
})

app.get("/api/student/overview", async (req, res) => {
    try {
        const { userId } = req.query
        if (!userId) return res.status(400).json({ message: "Missing user." })

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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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

        // Ask the ML service about every student first, so a failure part-way
        // through doesn't leave a mix of new and old predictions behind.
        for (const student of roster) {
            let mlRes
            try {
                mlRes = await fetch(`${ML_SERVICE_URL}/predict`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        attendance_pct: student.attendanceRate ?? 100,
                        avg_understanding_rating: student.understanding ?? 3,
                        avg_ca_mark_pct: student.avgMark ?? 60
                    })
                })
            } catch (error) {
                console.error("ML SERVICE UNREACHABLE:", error.message)
                return res.status(503).json({ message: "The prediction service is not available right now." })
            }

            if (!mlRes.ok) {
                console.error("ML SERVICE ERROR:", mlRes.status, (await mlRes.text()).slice(0, 300))
                return res.status(503).json({ message: "The prediction service returned an error. Try again later." })
            }

            results.push({ ...student, prediction: await mlRes.json() })
        }

        // predictions has no unique key on (student_id, module_id), so update the
        // student's existing prediction for this module, or add one if there is none.
        for (const { id: studentId, prediction } of results) {
            const values = [prediction.predictedOutcome, String(prediction.riskLevel).toLowerCase(), Math.round(prediction.confidence * 100)]
            const [updated] = await pool.execute(
                `UPDATE predictions SET predicted_grade = ?, risk_level = ?, confidence = ?, created_at = CURRENT_TIMESTAMP
                 WHERE student_id = ? AND module_id = ?`,
                [...values, studentId, module.id]
            )
            if (updated.affectedRows === 0) {
                await pool.execute(
                    `INSERT INTO predictions (id, student_id, module_id, predicted_grade, risk_level, confidence) VALUES (?, ?, ?, ?, ?, ?)`,
                    [crypto.randomUUID(), studentId, module.id, ...values]
                )
            }
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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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
        const { userId } = req.query

        if (!userId) return res.status(400).json({ message: "Missing user." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })
        if (!(await lecturerTeachesModule(module.id, userId))) {
            return res.status(403).json({ message: "You are not assigned to this module." })
        }

        const [rows] = await pool.execute(
            `
            SELECT id, DATE_FORMAT(session_date, '%Y-%m-%d') AS date, topic, attendance_code AS code, code_expires_at AS expiresAt
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

app.get("/api/lecturer/modules/:moduleCode/sessions-summary", async (req, res) => {
    try {
        const { moduleCode } = req.params
        const { userId } = req.query

        if (!userId) return res.status(400).json({ message: "Missing user." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })
        if (!(await lecturerTeachesModule(module.id, userId))) {
            return res.status(403).json({ message: "You are not assigned to this module." })
        }

        const [rows] = await pool.execute(
            `
            SELECT
                s.id,
                DATE_FORMAT(s.session_date, '%Y-%m-%d') AS date,
                s.topic,
                COUNT(e.student_id) AS enrolled,
                COUNT(CASE WHEN a.status IN ('present', 'late') THEN 1 END) AS present,
                COUNT(CASE WHEN a.status IN ('present', 'late') AND a.location_status = 'verified' THEN 1 END) AS verified,
                COUNT(CASE WHEN a.status IN ('present', 'late') AND a.location_status = 'outside_radius' THEN 1 END) AS outsideRadius,
                COUNT(qa.student_id) AS quizAttempts,
                AVG(qa.score / qa.total * 10) AS avgQuizScore
            FROM sessions s
            LEFT JOIN enrolments e ON e.module_id = s.module_id AND e.status = 'active'
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = e.student_id
            LEFT JOIN quiz_attempts qa ON qa.session_id = s.id AND qa.student_id = e.student_id
            WHERE s.module_id = ?
            GROUP BY s.id, s.session_date, s.topic
            ORDER BY s.session_date DESC
            `,
            [module.id]
        )

        res.json(rows.map((r) => {
            const enrolled = Number(r.enrolled)
            const present = Number(r.present)
            return {
                id: r.id,
                date: r.date,
                topic: r.topic,
                enrolled,
                present,
                verified: Number(r.verified),
                outsideRadius: Number(r.outsideRadius),
                attendancePct: enrolled > 0 ? Math.round((present / enrolled) * 100) : null,
                quizAttempts: Number(r.quizAttempts),
                avgQuizScore: r.avgQuizScore === null ? null : Number(Number(r.avgQuizScore).toFixed(1))
            }
        }))
    } catch (error) {
        console.error("LECTURER SESSIONS SUMMARY ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load sessions summary." })
    }
})

app.post("/api/lecturer/sessions", async (req, res) => {
    try {
        const { moduleCode, date, topic, description, userId } = req.body

        const cleanTopic = topic === undefined || topic === null ? "" : String(topic).trim()

        if (!moduleCode) return res.status(400).json({ message: "Module is required." })
        if (!date)       return res.status(400).json({ message: "Date is required." })
        if (!cleanTopic) return res.status(400).json({ message: "Topic is required." })

        const cleanDescription = typeof description === "string" ? description.trim() : ""
        if (cleanDescription.length < 20) {
            return res.status(400).json({ message: "Describe what was taught (at least 20 characters) so the quiz can be generated." })
        }
        if (cleanDescription.length > 3000) {
            return res.status(400).json({ message: "The description is too long (maximum 3000 characters)." })
        }
        if (!userId) return res.status(400).json({ message: "Missing user." })

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })
        if (!(await lecturerTeachesModule(module.id, userId))) {
            return res.status(403).json({ message: "You are not assigned to this module." })
        }

        const sessionId = crypto.randomUUID()

        await pool.execute(
            `INSERT INTO sessions (id, module_id, lecturer_id, session_date, topic, description) VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, module.id, userId, date, cleanTopic, cleanDescription]
        )

        // Build the quiz in the background so it is ready by the time students sign.
        // If this fails, it is generated again the first time someone opens the quiz.
        getOrCreateSessionQuiz(sessionId).catch((error) => {
            console.error("BACKGROUND QUIZ GENERATION ERROR:", error.message)
        })

        res.status(201).json({ id: sessionId, date, topic: cleanTopic, description: cleanDescription })
    } catch (error) {
        console.error("CREATE SESSION ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to log session." })
    }
})

app.post("/api/lecturer/sessions/:id/generate-code", async (req, res) => {
    try {
        const { id } = req.params
        const { expiresInMinutes, latitude, longitude, accuracy, userId } = req.body

        if (!userId) return res.status(400).json({ message: "Missing user." })

        const found = await getLecturerSession(id, userId)
        if (found.error) return res.status(found.error[0]).json({ message: found.error[1] })

        const hasLatitude = latitude !== undefined && latitude !== null
        const hasLongitude = longitude !== undefined && longitude !== null
        const hasAccuracy = accuracy !== undefined && accuracy !== null
        if (hasLatitude !== hasLongitude || hasAccuracy && !hasLatitude) {
            return res.status(400).json({ message: "A valid location is required." })
        }
        if (hasLatitude && (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180))) {
            return res.status(400).json({ message: "A valid location is required." })
        }
        if (hasAccuracy && !isValidAccuracy(accuracy)) {
            return res.status(400).json({ message: "Location accuracy must be a non-negative number." })
        }

        const minutes = Number(expiresInMinutes) || 10
        const code = generateAttendanceCode()
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000)

        await pool.execute(
            `UPDATE sessions SET attendance_code = ?, code_expires_at = ?, expiry_minutes = ?, lecturer_lat = ?, lecturer_lng = ?, lecturer_accuracy_m = ? WHERE id = ?`,
            [code, expiresAt, minutes, hasLatitude ? latitude : null, hasLongitude ? longitude : null, hasAccuracy ? Math.round(accuracy) : null, id]
        )

        res.json({ code, expiresAt: expiresAt.getTime(), locationAccuracy: hasAccuracy ? Math.round(accuracy) : null })
    } catch (error) {
        console.error("GENERATE CODE ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to generate code." })
    }
})

// ---- SESSION QUIZ (lecturer preview + regenerate) ----
async function getLecturerSession(sessionId, lecturerId) {
    const [[session]] = await pool.execute(
        `SELECT id, module_id, topic, description FROM sessions WHERE id = ? LIMIT 1`,
        [sessionId]
    )
    if (!session) return { error: [404, "Session not found."] }
    if (!(await lecturerTeachesModule(session.module_id, lecturerId))) {
        return { error: [403, "You are not assigned to this module."] }
    }
    return { session }
}

async function countQuizAttempts(sessionId) {
    const [[row]] = await pool.execute(
        `SELECT COUNT(*) AS attempts, AVG(score / total * 10) AS avgScore FROM quiz_attempts WHERE session_id = ?`,
        [sessionId]
    )
    return {
        attempts: Number(row.attempts),
        avgScore: row.avgScore === null ? null : Number(Number(row.avgScore).toFixed(1))
    }
}

app.get("/api/lecturer/sessions/:id/quiz", async (req, res) => {
    try {
        const { userId } = req.query
        if (!userId) return res.status(400).json({ message: "Missing user." })

        const found = await getLecturerSession(req.params.id, userId)
        if (found.error) return res.status(found.error[0]).json({ message: found.error[1] })

        const { session } = found
        const stats = await countQuizAttempts(session.id)

        if (!session.description || !session.description.trim()) {
            return res.json({ description: null, questions: null, ...stats })
        }

        let questions
        try {
            questions = await getOrCreateSessionQuiz(session.id)
        } catch (error) {
            console.error("QUIZ GENERATION ERROR:", error.message)
            return res.status(502).json({ message: "The quiz couldn't be generated right now. Try again in a moment." })
        }

        res.json({ description: session.description, questions, ...stats })
    } catch (error) {
        console.error("LECTURER QUIZ ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to load the quiz." })
    }
})

app.post("/api/lecturer/sessions/:id/quiz/regenerate", async (req, res) => {
    try {
        const { userId, description } = req.body
        if (!userId) return res.status(400).json({ message: "Missing user." })

        const found = await getLecturerSession(req.params.id, userId)
        if (found.error) return res.status(found.error[0]).json({ message: found.error[1] })

        const { session } = found
        const stats = await countQuizAttempts(session.id)

        // Changing the quiz after students answered would make their scores meaningless.
        if (stats.attempts > 0) {
            return res.status(409).json({ message: "Students have already taken this quiz, so it can't be changed." })
        }

        let nextDescription = session.description ? session.description.trim() : ""
        if (description !== undefined) {
            nextDescription = typeof description === "string" ? description.trim() : ""
            if (nextDescription.length < 20) {
                return res.status(400).json({ message: "Describe what was taught (at least 20 characters)." })
            }
            if (nextDescription.length > 3000) {
                return res.status(400).json({ message: "The description is too long (maximum 3000 characters)." })
            }
        }
        if (!nextDescription) {
            return res.status(400).json({ message: "Add a description of what was taught first." })
        }

        let questions
        try {
            questions = await generateQuizQuestions(session.topic, nextDescription)
        } catch (error) {
            console.error("QUIZ GENERATION ERROR:", error.message)
            return res.status(502).json({ message: "The quiz couldn't be generated right now. Try again in a moment." })
        }

        await pool.execute(`UPDATE sessions SET description = ? WHERE id = ?`, [nextDescription, session.id])
        await pool.execute(
            `INSERT INTO session_quizzes (session_id, questions) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE questions = VALUES(questions), created_at = CURRENT_TIMESTAMP`,
            [session.id, JSON.stringify(questions)]
        )

        res.json({ description: nextDescription, questions, ...stats })
    } catch (error) {
        console.error("REGENERATE QUIZ ERROR:")
        console.error(error)
        res.status(500).json({ message: "Failed to regenerate the quiz." })
    }
})

app.get("/api/lecturer/sessions/:id/attendance", async (req, res) => {
    try {
        const { id } = req.params
        const { userId } = req.query
        if (!userId) return res.status(400).json({ message: "Missing user." })

        const [[session]] = await pool.execute(
            `SELECT module_id FROM sessions WHERE id = ? LIMIT 1`,
            [id]
        )

        if (!session) return res.status(404).json({ message: "Session not found." })

        const [[assignment]] = await pool.execute(
            `SELECT id FROM module_lecturers WHERE module_id = ? AND lecturer_id = ? LIMIT 1`,
            [session.module_id, userId]
        )
        if (!assignment) return res.status(403).json({ message: "You are not assigned to this module." })

        const [rows] = await pool.execute(
            `
            SELECT s.id AS studentId, s.name, s.student_number AS studentNumber, a.status, r.rating,
                   a.marked_at AS signedAt,
                   a.latitude, a.longitude, a.accuracy_m, a.distance_m, a.location_status,
                   qa.score AS quizScore, qa.total AS quizTotal
            FROM enrolments e
            JOIN students s ON s.id = e.student_id
            LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = s.id
            LEFT JOIN ratings r ON r.session_id = ? AND r.student_id = s.id
            LEFT JOIN quiz_attempts qa ON qa.session_id = ? AND qa.student_id = s.id
            WHERE e.module_id = ? AND e.status = 'active'
            ORDER BY s.name
            `,
            [id, id, id, session.module_id]
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

const RESULT_CATEGORIES = ["CT", "WR", "AS", "EXAM", "OTHER"]

app.post("/api/lecturer/results", async (req, res) => {
    try {
        const { studentId, moduleCode, category, title, mark, outOf } = req.body
        const cleanTitle = title === undefined || title === null ? "" : String(title).trim()
        const cleanCategory = String(category || "").trim().toUpperCase()
        const numericMark = Number(mark)

        if (!studentId)  return res.status(400).json({ message: "Student is required." })
        if (!moduleCode) return res.status(400).json({ message: "Module is required." })
        if (!cleanTitle) return res.status(400).json({ message: "Title is required." })
        if (mark === undefined || mark === null || mark === "") return res.status(400).json({ message: "Mark is required." })
        if (!RESULT_CATEGORIES.includes(cleanCategory)) {
            return res.status(400).json({ message: `Category must be one of ${RESULT_CATEGORIES.join(", ")}.` })
        }
        if (!Number.isFinite(numericMark) || numericMark < 0) {
            return res.status(400).json({ message: "Mark must be a number of 0 or more." })
        }

        const [[module]] = await pool.execute(
            `SELECT id FROM modules WHERE code = ? LIMIT 1`,
            [moduleCode]
        )

        if (!module) return res.status(404).json({ message: "Module not found." })

        await pool.execute(
            `INSERT INTO results (student_id, module_id, category, title, mark, out_of) VALUES (?, ?, ?, ?, ?, ?)`,
            [studentId, module.id, cleanCategory, cleanTitle, numericMark, Number(outOf) || 100]
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

            // Number("") is 0, so an empty mark cell must be caught before it is saved as zero.
            const markMissing = row.mark === undefined || row.mark === null || String(row.mark).trim() === ""

            if (!studentNumber) { errors.push(`Row ${rowNum}: missing student number.`); continue }
            if (!RESULT_CATEGORIES.includes(category)) {
                errors.push(`Row ${rowNum}: invalid category "${row.category}".`); continue
            }
            if (!title) { errors.push(`Row ${rowNum}: missing title.`); continue }
            if (markMissing || isNaN(mark) || mark < 0) { errors.push(`Row ${rowNum}: invalid mark "${row.mark ?? ""}".`); continue }

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
        if (!userId) return res.status(400).json({ message: "Missing user." })
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

        const groqRes = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.3,
                max_tokens: 500
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
    await ensureLocationSchema()
    await ensureQuizSchema()
    await ensureMatchingCollations()

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