// Shared helpers for the API tests. The runner (tests/run_tests.js) starts the
// API against a throwaway test database and passes its addresses in env vars.

const mysql = require("mysql2/promise")

const API = process.env.API_BASE_URL
if (!API) {
    throw new Error("Run the API tests with `npm test` (tests/run_tests.js). It creates the test database and mock services they need.")
}

const ENFORCE_API = process.env.API_ENFORCE_URL
const MOCK_GROQ_URL = process.env.MOCK_GROQ_URL
const MOCK_ML_URL = process.env.MOCK_ML_URL

// Seed data from campustrack_db.sql that the tests rely on.
const FIXTURES = {
    student: { id: "student-1", number: "219524579", password: "password123", name: "S. Mathebula" },
    student2: { id: "student-2", number: "219524580", password: "password123", name: "K. Dlamini" },
    student3: { id: "student-3", number: "219524581", password: "password123", name: "T. Sithole" },
    lecturer: { id: "staff-lect-1", number: "100045678", password: "password123", name: "Dr. S. Khumalo" },
    // Teaches EUP117V, OOP207V and WEB207V, but none of staff-lect-1's modules.
    otherLecturer: { id: "staff-lect-2", number: "100045680", password: "password123" },
    admin: { id: "staff-admin-1", number: "100045677", password: "password123", name: "Thandi Nkosi" },
    // staff-lect-1 teaches these; student-1 is enrolled in all three,
    // student-2 and student-3 only in ISJ107V.
    module: { id: "mod-isj107v", code: "ISJ107V" },
    module2: { id: "mod-sec117v", code: "SEC117V" },
    module3: { id: "mod-dtd117v", code: "DTD117V" }
}

const CLASSROOM = { latitude: -26.2041, longitude: 28.0473, accuracy: 10 }
// About 4.9 km north of CLASSROOM.
const FAR_AWAY = { latitude: -26.16, longitude: 28.0473, accuracy: 10 }

let counter = 0
const unique = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

async function request(path, { method = "GET", body, base = API, cookie, rawBody } = {}) {
    const headers = { "Content-Type": "application/json" }
    if (cookie) headers.Cookie = cookie

    const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await response.text()
    let data
    try {
        data = text ? JSON.parse(text) : {}
    } catch {
        data = { raw: text }
    }

    return { status: response.status, data, headers: response.headers }
}

const dbConfig = () => ({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.TEST_DB_NAME
})

// Direct database access, for setting up fixtures and checking what was stored.
async function query(sql, params = []) {
    const connection = await mysql.createConnection(dbConfig())
    try {
        const [rows] = await connection.execute(sql, params)
        return rows
    } finally {
        await connection.end()
    }
}

async function login(role, number, password) {
    const body = { role, password }
    if (role === "student") body.studentNumber = number
    else body.staffNumber = number

    const result = await request("/api/auth/login", { method: "POST", body })
    const setCookie = result.headers.getSetCookie?.() || []
    const cookie = setCookie.map((c) => c.split(";")[0]).join("; ")
    return { ...result, cookie }
}

const today = () => new Date().toISOString().slice(0, 10)

async function createSession({
    topic = unique("Session"),
    description = "Singly linked lists: nodes and next pointers, inserting at the head and tail, deleting a node and traversal.",
    moduleCode = FIXTURES.module.code,
    lecturerId = FIXTURES.lecturer.id,
    date = today()
} = {}) {
    const result = await request("/api/lecturer/sessions", {
        method: "POST",
        body: { moduleCode, date, topic, description, userId: lecturerId }
    })
    if (result.status !== 201) {
        throw new Error(`Creating a test session failed (${result.status}): ${result.data.message}`)
    }
    return result.data
}

async function generateCode(sessionId, location = CLASSROOM, { lecturerId = FIXTURES.lecturer.id, minutes = 10 } = {}) {
    const result = await request(`/api/lecturer/sessions/${sessionId}/generate-code`, {
        method: "POST",
        body: { userId: lecturerId, expiresInMinutes: minutes, ...(location || {}) }
    })
    if (result.status !== 200) {
        throw new Error(`Generating a test code failed (${result.status}): ${result.data.message}`)
    }
    return result.data.code
}

function markAttendance(code, location = CLASSROOM, { studentId = FIXTURES.student.id, base = API } = {}) {
    return request("/api/student/attendance/mark", {
        method: "POST",
        base,
        body: { userId: studentId, code, ...(location || {}) }
    })
}

async function mockGroqRequests() {
    const response = await fetch(`${MOCK_GROQ_URL}/__requests`)
    return response.json()
}

async function setMlMode(mode) {
    await fetch(`${MOCK_ML_URL}/__mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
    })
}

async function mlStats() {
    const response = await fetch(`${MOCK_ML_URL}/__stats`)
    return response.json()
}

module.exports = {
    API,
    ENFORCE_API,
    FIXTURES,
    CLASSROOM,
    FAR_AWAY,
    unique,
    request,
    query,
    login,
    today,
    createSession,
    generateCode,
    markAttendance,
    mockGroqRequests,
    setMlMode,
    mlStats
}
