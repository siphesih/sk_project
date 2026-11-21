// Static checks across the frontend and backend source code (no server needed).
const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { codeMask } = require("./helpers/coverage.js")

const SERVER_FILE = path.join(__dirname, "..", "server.js")
const FRONTEND_SRC = path.join(__dirname, "..", "..", "frontend", "src")

// Backend routes the frontend deliberately does not call.
const API_ONLY_ROUTES = {
    "GET /": "Health check used by Docker and the test runner",
    "GET /api/auth/me": "Session check; the frontend keeps the signed-in user in localStorage",
    "POST /api/auth/logout": "The frontend signs out by clearing localStorage",
    "GET /api/staff": "Lookup kept for API clients",
    "GET /api/admins": "Lookup kept for API clients",
    "GET /api/lecturer/modules/:moduleCode/predictions": "ML predictions have no page yet",
    "POST /api/student/sessions/:id/rating": "Retired: returns 410 now that ratings come from the quiz"
}

function backendRoutes() {
    const source = fs.readFileSync(SERVER_FILE, "utf8")
    const mask = codeMask(source)
    const routes = []
    const regex = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g
    let match
    while ((match = regex.exec(source))) {
        if (mask[match.index]) routes.push({ method: match[1].toUpperCase(), path: match[2] })
    }
    return routes
}

function frontendCalls() {
    const calls = []
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
                const source = fs.readFileSync(full, "utf8")
                for (const match of source.matchAll(/[`"'](\/api\/[^`"']*)[`"']/g)) {
                    const callPath = match[1].split("?")[0].replace(/\$\{[^}]*\}/g, ":param")
                    calls.push({ file: path.relative(FRONTEND_SRC, full), path: callPath })
                }
            }
        }
    }
    walk(FRONTEND_SRC)
    return calls
}

const routeMatches = (routePath, callPath) => {
    const pattern = new RegExp(`^${routePath.replace(/:[^/]+/g, "[^/]+")}$`)
    return pattern.test(callPath.replace(/:param/g, "x"))
}

describe("Frontend and backend contract (static checks)", () => {
    test("CON-01 every API path the frontend calls exists on the backend", () => {
        const routes = backendRoutes()
        const calls = frontendCalls()
        assert.ok(calls.length > 30, "Expected to find the frontend's API calls")
        const missing = calls.filter((call) => !routes.some((route) => routeMatches(route.path, call.path)))
        assert.deepEqual(missing, [], "Frontend calls with no backend route")
    })

    test("CON-02 every backend route is used by the frontend or is a documented API-only route", () => {
        const calls = frontendCalls()
        const unused = backendRoutes()
            .filter((route) => !calls.some((call) => routeMatches(route.path, call.path)))
            .map((route) => `${route.method} ${route.path}`)
        assert.deepEqual(unused.sort(), Object.keys(API_ONLY_ROUTES).sort())
    })

    test("CON-03 each method and path is registered only once", () => {
        const seen = new Map()
        for (const route of backendRoutes()) {
            const key = `${route.method} ${route.path}`
            seen.set(key, (seen.get(key) || 0) + 1)
        }
        const duplicates = [...seen].filter(([, count]) => count > 1).map(([key]) => key)
        assert.deepEqual(duplicates, [])
    })

    test("CON-04 the server never logs coordinates", () => {
        const source = fs.readFileSync(SERVER_FILE, "utf8")
        const offending = source.split("\n")
            .map((line, i) => [i + 1, line])
            .filter(([, line]) => /console\.(log|error|warn|info)\(/.test(line) && /latitude|longitude|\blat\b|\blng\b|coords/i.test(line))
        assert.deepEqual(offending, [])
    })

    test("CON-06 every table in campustrack_db.sql uses the same character set and collation", () => {
        // Tables are joined on their id columns; mixing collations makes MariaDB/MySQL
        // reject those queries ("Illegal mix of collations").
        const dump = fs.readFileSync(path.join(__dirname, "..", "campustrack_db.sql"), "utf8")
        const tables = [...dump.matchAll(/CREATE TABLE `(\w+)`[\s\S]*?\) ENGINE=\w+ DEFAULT CHARSET=(\w+) COLLATE=(\w+);/g)]
            .map((m) => ({ table: m[1], charset: m[2], collation: m[3] }))
        assert.ok(tables.length >= 15, `Found ${tables.length} tables`)
        assert.deepEqual(tables.filter((t) => t.charset !== "utf8mb4" || t.collation !== "utf8mb4_unicode_ci"), [])
    })

    test("CON-05 the frontend sends API requests through the Vite proxy to the backend", () => {
        const config = fs.readFileSync(path.join(__dirname, "..", "..", "frontend", "vite.config.js"), "utf8")
        assert.match(config, /"\/api":\s*process\.env\.API_PROXY_TARGET \|\| "http:\/\/localhost:5000"/)
    })
})
