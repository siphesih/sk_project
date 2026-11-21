const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request } = require("./helpers/context.js")

const hasNoPasswords = (rows) => rows.every((row) => !Object.hasOwn(row, "password"))

describe("Health check and shared lookups", () => {
    test("LOOK-01 GET / reports that the API is running", async () => {
        const res = await request("/")
        assert.equal(res.status, 200)
        assert.match(res.data.message, /running/)
    })

    test("LOOK-02 /api/students lists students without their passwords", async () => {
        const res = await request("/api/students")
        assert.equal(res.status, 200)
        assert.ok(res.data.some((s) => s.id === FIXTURES.student.id && s.student_number === FIXTURES.student.number))
        assert.ok(hasNoPasswords(res.data), "No password field may be returned")
    })

    test("LOOK-03 /api/staff lists staff without their passwords", async () => {
        const res = await request("/api/staff")
        assert.equal(res.status, 200)
        assert.ok(res.data.some((s) => s.id === FIXTURES.lecturer.id))
        assert.ok(res.data.some((s) => s.id === FIXTURES.admin.id))
        assert.ok(hasNoPasswords(res.data))
    })

    test("LOOK-04 /api/lecturers returns lecturers only", async () => {
        const res = await request("/api/lecturers")
        assert.equal(res.status, 200)
        const ids = res.data.map((s) => s.id)
        assert.ok(ids.includes(FIXTURES.lecturer.id))
        assert.ok(!ids.includes(FIXTURES.admin.id), "Admins must not be listed as lecturers")
        assert.ok(hasNoPasswords(res.data))
    })

    test("LOOK-05 /api/admins returns admins only", async () => {
        const res = await request("/api/admins")
        assert.equal(res.status, 200)
        assert.ok(res.data.length > 0)
        assert.ok(res.data.every((s) => s.role === "admin"))
        assert.ok(hasNoPasswords(res.data))
    })

    test("LOOK-06 /api/modules lists modules by code with their primary lecturer", async () => {
        const res = await request("/api/modules")
        assert.equal(res.status, 200)
        const isj = res.data.find((m) => m.code === FIXTURES.module.code)
        assert.ok(isj, "ISJ107V should be listed")
        assert.equal(isj.lecturer_id, FIXTURES.lecturer.id)
        const codes = res.data.map((m) => m.code)
        assert.deepEqual(codes, [...codes].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })))
    })

    test("LOOK-07 an unknown API route returns 404", async () => {
        const res = await request("/api/does-not-exist")
        assert.equal(res.status, 404)
    })
})
