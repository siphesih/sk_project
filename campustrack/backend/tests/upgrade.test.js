// Starts a third copy of the API against a database that looks like one created
// from an older campustrack_db.sql (no location columns, no quiz tables, and the
// mismatched `ratings` collation), and checks the server upgrades it on start-up.
const { describe, test, before, after } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const net = require("node:net")
const { fork } = require("node:child_process")
const mysql = require("mysql2/promise")
const { FIXTURES, request } = require("./helpers/context.js")

const LEGACY_DB = `${process.env.TEST_DB_NAME}_legacy`
const DUMP_FILE = path.join(__dirname, "..", "campustrack_db.sql")

const connectionConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306)
}

const DOWNGRADE = `
    ALTER TABLE sessions DROP COLUMN lecturer_lat, DROP COLUMN lecturer_lng, DROP COLUMN lecturer_accuracy_m, DROP COLUMN description;
    ALTER TABLE attendance DROP COLUMN latitude, DROP COLUMN longitude, DROP COLUMN accuracy_m, DROP COLUMN distance_m, DROP COLUMN location_status;
    DROP TABLE session_quizzes;
    DROP TABLE quiz_attempts;
    ALTER TABLE ratings CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
`

function freePort() {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
    })
}

async function legacyQuery(sql, params = []) {
    const connection = await mysql.createConnection({ ...connectionConfig, database: LEGACY_DB })
    try {
        const [rows] = await connection.execute(sql, params)
        return rows
    } finally {
        await connection.end()
    }
}

describe("Upgrading an older database on start-up", () => {
    let child
    let base
    let output = ""

    before(async () => {
        const admin = await mysql.createConnection({ ...connectionConfig, multipleStatements: true })
        try {
            await admin.query(`DROP DATABASE IF EXISTS \`${LEGACY_DB}\``)
            await admin.query(`CREATE DATABASE \`${LEGACY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
            await admin.query(`USE \`${LEGACY_DB}\``)
            await admin.query(fs.readFileSync(DUMP_FILE, "utf8"))
            await admin.query(DOWNGRADE)
        } finally {
            await admin.end()
        }

        const port = await freePort()
        base = `http://127.0.0.1:${port}`
        child = fork(process.env.SERVER_WRAPPER, [], {
            cwd: path.join(__dirname, ".."),
            env: {
                ...process.env,
                PORT: String(port),
                DB_NAME: LEGACY_DB,
                QUIZ_GENERATOR: "mock",
                GEO_MODE: "flag",
                NODE_V8_COVERAGE: process.env.SERVER_COVERAGE_DIR
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"]
        })
        child.stdout.on("data", (chunk) => { output += chunk })
        child.stderr.on("data", (chunk) => { output += chunk })

        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
            try {
                if ((await fetch(`${base}/`)).ok) return
            } catch {
                // still starting
            }
            if (child.exitCode !== null) break
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error(`The upgrade server did not start:\n${output.slice(-1500)}`)
    })

    after(async () => {
        if (child && child.exitCode === null) {
            await new Promise((resolve) => {
                child.once("exit", resolve)
                child.send("shutdown")
            })
        }
        const admin = await mysql.createConnection(connectionConfig)
        await admin.query(`DROP DATABASE IF EXISTS \`${LEGACY_DB}\``)
        await admin.end()
    })

    test("UPG-01 the server adds the missing columns and quiz tables and fixes the ratings collation", async () => {
        const columns = await legacyQuery(
            `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('sessions', 'attendance')`
        )
        const has = (table, column) => columns.some((r) => r.t === table && r.c === column)
        for (const column of ["lecturer_lat", "lecturer_lng", "lecturer_accuracy_m", "description"]) assert.ok(has("sessions", column), `sessions.${column}`)
        for (const column of ["latitude", "longitude", "accuracy_m", "distance_m", "location_status"]) assert.ok(has("attendance", column), `attendance.${column}`)

        const tables = await legacyQuery(
            `SELECT TABLE_NAME AS t, TABLE_COLLATION AS collation FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
        )
        assert.ok(tables.some((r) => r.t === "session_quizzes"))
        assert.ok(tables.some((r) => r.t === "quiz_attempts"))
        assert.equal(tables.find((r) => r.t === "ratings").collation, "utf8mb4_unicode_ci")
        assert.match(output, /Converting the ratings table/)

        const [ratingCount] = await legacyQuery(`SELECT COUNT(*) AS n FROM ratings`)
        assert.ok(ratingCount.n >= 5, "Existing ratings are kept")
    })

    test("UPG-02 pages that join ratings work on the upgraded database", async () => {
        const roster = await request(`/api/lecturer/modules/${FIXTURES.module.code}/roster?userId=${FIXTURES.lecturer.id}`, { base })
        assert.equal(roster.status, 200, roster.data.message)
        assert.ok(roster.data.some((r) => r.id === FIXTURES.student.id))

        const sessions = await request(`/api/student/sessions?userId=${FIXTURES.student.id}`, { base })
        assert.equal(sessions.status, 200, sessions.data.message)
    })

    test("UPG-03 the offline quiz generator (QUIZ_GENERATOR=mock) produces a valid shuffled quiz", async () => {
        const created = await request("/api/lecturer/sessions", {
            base,
            method: "POST",
            body: { moduleCode: FIXTURES.module.code, date: new Date().toISOString().slice(0, 10), topic: "Offline quiz", description: "Hash tables: hashing, collisions and chaining.", userId: FIXTURES.lecturer.id }
        })
        assert.equal(created.status, 201, created.data.message)

        const quiz = await request(`/api/lecturer/sessions/${created.data.id}/quiz?userId=${FIXTURES.lecturer.id}`, { base })
        assert.equal(quiz.status, 200, quiz.data.message)
        assert.equal(quiz.data.questions.length, 10)
        quiz.data.questions.forEach((q, i) => {
            assert.equal(q.question, `Mock question ${i + 1} about Offline quiz?`)
            assert.equal(q.options[q.answerIndex], `Correct answer ${i + 1}`)
        })
    })
})
