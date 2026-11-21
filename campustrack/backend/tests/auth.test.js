const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request, login, query } = require("./helpers/context.js")
const { uniqueStudentNumber } = require("./helpers/fixtures.js")

describe("Authentication", () => {
    test("AUTH-01 a student signs in with their student number and password", async () => {
        const res = await login("student", FIXTURES.student.number, FIXTURES.student.password)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.user.id, FIXTURES.student.id)
        assert.equal(res.data.user.role, "student")
        assert.ok(!Object.hasOwn(res.data.user, "password"), "The password must never be sent back")
        assert.match(res.cookie, /connect\.sid=/, "A session cookie should be set")
    })

    test("AUTH-02 a lecturer signs in with their staff number", async () => {
        const res = await login("lecturer", FIXTURES.lecturer.number, FIXTURES.lecturer.password)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.user.id, FIXTURES.lecturer.id)
        assert.equal(res.data.user.role, "lecturer")
        assert.ok(!Object.hasOwn(res.data.user, "password"))
    })

    test("AUTH-03 an admin signs in with their staff number", async () => {
        const res = await login("admin", FIXTURES.admin.number, FIXTURES.admin.password)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.user.id, FIXTURES.admin.id)
        assert.equal(res.data.user.role, "admin")
    })

    test("AUTH-04 a lecturer cannot sign in through the admin role", async () => {
        const res = await login("admin", FIXTURES.lecturer.number, FIXTURES.lecturer.password)
        assert.equal(res.status, 401)
    })

    test("AUTH-05 a wrong password and an unknown account get the same 401 message", async () => {
        const wrongPassword = await login("student", FIXTURES.student.number, "not-the-password")
        const unknownAccount = await login("student", "000000000", "whatever")
        assert.equal(wrongPassword.status, 401)
        assert.equal(unknownAccount.status, 401)
        assert.equal(wrongPassword.data.message, unknownAccount.data.message, "Messages must not reveal which accounts exist")
        assert.equal(wrongPassword.cookie, "", "No session for a failed sign-in")
    })

    test("AUTH-06 a missing role, password, student number or staff number is a 400", async () => {
        const bodies = [
            { password: "x", studentNumber: "1" },
            { role: "student", studentNumber: "1" },
            { role: "student", password: "x" },
            { role: "lecturer", password: "x" },
            { role: "admin", password: "x" }
        ]
        for (const body of bodies) {
            const res = await request("/api/auth/login", { method: "POST", body })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`)
        }
    })

    test("AUTH-07 an unknown role is a 400", async () => {
        const res = await request("/api/auth/login", { method: "POST", body: { role: "parent", password: "x", studentNumber: "1" } })
        assert.equal(res.status, 400)
    })

    test("AUTH-08 pending and rejected accounts cannot sign in", async () => {
        const number = uniqueStudentNumber()
        const id = `test-pending-${number}`
        await query(
            `INSERT INTO students (id, student_number, name, password, status) VALUES (?, ?, 'Pending Student', 'secret123', 'pending')`,
            [id, number]
        )

        const pending = await login("student", number, "secret123")
        assert.equal(pending.status, 403)
        assert.match(pending.data.message, /pending/)

        await query(`UPDATE students SET status = 'rejected' WHERE id = ?`, [id])
        const rejected = await login("student", number, "secret123")
        assert.equal(rejected.status, 403)
        assert.match(rejected.data.message, /rejected/)
    })

    test("AUTH-09 surrounding spaces in the student number are ignored", async () => {
        const res = await login("student", `  ${FIXTURES.student.number}  `, FIXTURES.student.password)
        assert.equal(res.status, 200, res.data.message)
    })

    test("AUTH-10 a student number sent as a JSON number does not crash the server", async () => {
        const res = await request("/api/auth/login", {
            method: "POST",
            body: { role: "student", studentNumber: Number(FIXTURES.student.number), password: FIXTURES.student.password }
        })
        assert.equal(res.status, 200, res.data.message)
    })

    test("AUTH-11 /api/auth/me returns the signed-in user from the session cookie", async () => {
        const { cookie } = await login("lecturer", FIXTURES.lecturer.number, FIXTURES.lecturer.password)
        const me = await request("/api/auth/me", { cookie })
        assert.equal(me.status, 200, me.data.message)
        assert.equal(me.data.user.id, FIXTURES.lecturer.id)
        assert.equal(me.data.user.role, "lecturer")
        assert.ok(!Object.hasOwn(me.data.user, "password"))
    })

    test("AUTH-12 /api/auth/me without a session is a 401", async () => {
        const me = await request("/api/auth/me")
        assert.equal(me.status, 401)
    })

    test("AUTH-14 a session for an account that was deleted is ended", async () => {
        const number = uniqueStudentNumber()
        const id = `test-deleted-${number}`
        await query(`INSERT INTO students (id, student_number, name, password) VALUES (?, ?, 'Soon Deleted', 'secret123')`, [id, number])
        const { cookie } = await login("student", number, "secret123")
        await query(`DELETE FROM students WHERE id = ?`, [id])

        const me = await request("/api/auth/me", { cookie })
        assert.equal(me.status, 401)
        assert.match(me.data.message, /not found/)
        assert.equal((await request("/api/auth/me", { cookie })).data.message, "Not signed in.", "The session is destroyed")
    })

    test("AUTH-13 signing out ends the session", async () => {
        const { cookie } = await login("student", FIXTURES.student.number, FIXTURES.student.password)
        const before = await request("/api/auth/me", { cookie })
        assert.equal(before.status, 200)

        const out = await request("/api/auth/logout", { method: "POST", cookie })
        assert.equal(out.status, 200)

        const after = await request("/api/auth/me", { cookie })
        assert.equal(after.status, 401)
    })
})
