// CampusTrack backend test runner — `npm test`
//
//  1. Re-creates a throwaway test database from campustrack_db.sql
//     (default name campustrack_autotest; your real campustrack_db is never touched).
//  2. Starts local mock versions of Groq and the ML service (no internet or API key needed).
//  3. Starts two copies of the API on free ports: one with GEO_MODE=flag, one with GEO_MODE=enforce.
//  4. Runs every tests/*.test.js file, one file at a time.
//  5. Writes tests/results/: results.json (every test), coverage.json, server logs.
//
// Run one area only:  npm test -- quiz attendance
// Keep the test database afterwards for inspection:  KEEP_TEST_DB=1 npm test

const fs = require("node:fs")
const path = require("node:path")
const net = require("node:net")
const { fork, spawn } = require("node:child_process")
const { pathToFileURL } = require("node:url")
const mysql = require("mysql2/promise")

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true })

const { startMockGroq, startMockMl } = require("./helpers/mock_services.js")
const { computeCoverage } = require("./helpers/coverage.js")

const BACKEND_DIR = path.join(__dirname, "..")
const RESULTS_DIR = path.join(__dirname, "results")
const COVERAGE_DIR = path.join(RESULTS_DIR, "v8-coverage")
const DUMP_FILE = path.join(BACKEND_DIR, "campustrack_db.sql")
const SERVER_FILE = path.join(BACKEND_DIR, "server.js")
const TEST_DB_NAME = process.env.TEST_DB_NAME || "campustrack_autotest"

const db = {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306)
}

function log(message) {
    console.log(`[test-runner] ${message}`)
}

async function resetTestDatabase() {
    if (!/^[A-Za-z0-9_]+$/.test(TEST_DB_NAME)) throw new Error(`Invalid TEST_DB_NAME "${TEST_DB_NAME}".`)
    if (TEST_DB_NAME === (process.env.DB_NAME || "campustrack_db")) {
        throw new Error("TEST_DB_NAME must be different from your real database (DB_NAME).")
    }

    let connection
    try {
        connection = await mysql.createConnection({ ...db, multipleStatements: true })
    } catch (error) {
        throw new Error(`Cannot connect to MySQL at ${db.host}:${db.port} (${error.code || error.message}). Start MySQL (e.g. in XAMPP) and try again.`)
    }

    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``)
        await connection.query(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        await connection.query(`USE \`${TEST_DB_NAME}\``)
        await connection.query(fs.readFileSync(DUMP_FILE, "utf8"))
    } finally {
        await connection.end()
    }
}

async function dropTestDatabase() {
    const connection = await mysql.createConnection(db)
    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``)
    } finally {
        await connection.end()
    }
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.unref()
        server.on("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
    })
}

async function startApi(name, env) {
    const port = await freePort()
    const logFile = path.join(RESULTS_DIR, `server-${name}.log`)
    const logStream = fs.createWriteStream(logFile)

    const child = fork(path.join(__dirname, "helpers", "server_wrapper.js"), [], {
        cwd: BACKEND_DIR,
        env: { ...env, PORT: String(port), NODE_V8_COVERAGE: COVERAGE_DIR },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
    })
    child.stdout.pipe(logStream)
    child.stderr.pipe(logStream)

    let exited = false
    child.on("exit", () => { exited = true })

    const url = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
        if (exited) break
        try {
            const response = await fetch(`${url}/`)
            if (response.ok) return { name, url, child, logFile }
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }

    child.kill()
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-1500) : ""
    throw new Error(`The ${name} API server did not start.\n${tail}`)
}

function stopApi(api) {
    if (!api || api.child.exitCode !== null) return Promise.resolve()
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            api.child.kill()
            resolve()
        }, 8000)
        api.child.once("exit", () => {
            clearTimeout(timer)
            resolve()
        })
        api.child.send("shutdown")
    })
}

function runTests(files, env) {
    const resultsFile = path.join(RESULTS_DIR, "results.jsonl")
    const args = [
        "--test",
        "--test-concurrency=1",
        "--test-reporter=spec",
        "--test-reporter-destination=stdout",
        `--test-reporter=${pathToFileURL(path.join(__dirname, "helpers", "json_reporter.js")).href}`,
        `--test-reporter-destination=${resultsFile}`,
        ...files
    ]

    return new Promise((resolve) => {
        const child = spawn(process.execPath, args, { cwd: BACKEND_DIR, env, stdio: "inherit" })
        child.on("exit", (code) => resolve(code ?? 1))
    })
}

function writeResults(meta, coverage) {
    const resultsFile = path.join(RESULTS_DIR, "results.jsonl")
    const entries = fs.existsSync(resultsFile)
        ? fs.readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
        : []
    const tests = entries.filter((e) => e.kind === "test" && !/\.js$/.test(e.name))

    const summary = {
        ...meta,
        finishedAt: new Date().toISOString(),
        totals: {
            tests: tests.length,
            passed: tests.filter((t) => t.status === "passed").length,
            failed: tests.filter((t) => t.status === "failed").length,
            skipped: tests.filter((t) => t.status === "skipped").length
        },
        tests
    }

    fs.writeFileSync(path.join(RESULTS_DIR, "results.json"), JSON.stringify(summary, null, 2))
    if (coverage) fs.writeFileSync(path.join(RESULTS_DIR, "coverage.json"), JSON.stringify(coverage, null, 2))
    return summary
}

async function main() {
    const filters = process.argv.slice(2).map((f) => f.toLowerCase())
    const files = fs.readdirSync(__dirname)
        .filter((f) => f.endsWith(".test.js"))
        .filter((f) => filters.length === 0 || filters.some((filter) => f.toLowerCase().includes(filter)))
        .sort()
        .map((f) => path.join(__dirname, f))

    if (files.length === 0) throw new Error(`No test files match: ${filters.join(", ")}`)

    fs.rmSync(RESULTS_DIR, { recursive: true, force: true })
    fs.mkdirSync(COVERAGE_DIR, { recursive: true })

    const startedAt = new Date().toISOString()
    log(`Preparing test database "${TEST_DB_NAME}" from campustrack_db.sql`)
    await resetTestDatabase()

    const groq = await startMockGroq()
    const ml = await startMockMl()

    const baseEnv = {
        ...process.env,
        DB_HOST: db.host,
        DB_PORT: String(db.port),
        DB_USER: db.user,
        DB_PASSWORD: db.password,
        DB_NAME: TEST_DB_NAME,
        // Never let the tests reach the real Groq API or use a real key.
        GROQ_API_KEY: "test-key",
        GROQ_API_URL: `${groq.url}/openai/v1/chat/completions`,
        ML_SERVICE_URL: ml.url,
        QUIZ_GENERATOR: "groq",
        GEO_RADIUS_METERS: "100"
    }
    delete baseEnv.NODE_V8_COVERAGE

    let flagApi
    let enforceApi
    let exitCode = 1
    let coverage = null

    try {
        flagApi = await startApi("flag", { ...baseEnv, GEO_MODE: "flag" })
        enforceApi = await startApi("enforce", { ...baseEnv, GEO_MODE: "enforce" })
        log(`API (GEO_MODE=flag) on ${flagApi.url}, API (GEO_MODE=enforce) on ${enforceApi.url}`)
        log(`Running ${files.length} test file(s)\n`)

        exitCode = await runTests(files, {
            ...baseEnv,
            API_BASE_URL: flagApi.url,
            API_ENFORCE_URL: enforceApi.url,
            MOCK_GROQ_URL: groq.url,
            MOCK_ML_URL: ml.url,
            TEST_DB_NAME,
            // For tests that start their own server (upgrade.test.js), so it is measured too.
            SERVER_COVERAGE_DIR: COVERAGE_DIR,
            SERVER_WRAPPER: path.join(__dirname, "helpers", "server_wrapper.js")
        })
    } finally {
        await stopApi(flagApi)
        await stopApi(enforceApi)
        await groq.close()
        await ml.close()

        coverage = computeCoverage(COVERAGE_DIR, SERVER_FILE)
        fs.rmSync(COVERAGE_DIR, { recursive: true, force: true })

        if (process.env.KEEP_TEST_DB) log(`Kept test database "${TEST_DB_NAME}"`)
        else await dropTestDatabase().catch((error) => log(`Could not drop the test database: ${error.message}`))
    }

    const summary = writeResults({
        startedAt,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        testDatabase: TEST_DB_NAME,
        files: files.map((f) => path.basename(f))
    }, coverage)

    console.log("")
    log(`Tests: ${summary.totals.passed} passed, ${summary.totals.failed} failed, ${summary.totals.skipped} skipped (${summary.totals.tests} total)`)
    if (coverage && !coverage.error) {
        log(`server.js coverage: lines ${coverage.lines.pct}% (${coverage.lines.covered}/${coverage.lines.total}), ` +
            `functions ${coverage.functions.pct}%, blocks ${coverage.blocks.pct}%`)
        const untested = coverage.routes.filter((r) => r.requests === 0)
        if (untested.length) log(`Routes with no test requests: ${untested.map((r) => `${r.method} ${r.path}`).join(", ")}`)
    } else if (coverage?.error) {
        log(coverage.error)
    }
    log(`Details: ${path.relative(BACKEND_DIR, RESULTS_DIR)}${path.sep}results.json and coverage.json`)

    process.exit(exitCode)
}

main().catch((error) => {
    console.error(`[test-runner] ${error.message}`)
    process.exit(1)
})
