const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const {
    ENFORCE_API, FIXTURES, CLASSROOM, FAR_AWAY,
    request, query, today, createSession, generateCode, markAttendance
} = require("./helpers/context.js")

const LECTURER = FIXTURES.lecturer.id
const S1 = FIXTURES.student.id
const S2 = FIXTURES.student2.id

// A point the given number of metres north of the classroom.
const metresNorth = (metres, accuracy) => ({ latitude: CLASSROOM.latitude + metres / 111195, longitude: CLASSROOM.longitude, accuracy })

async function newCode(location = CLASSROOM, options = {}) {
    const session = await createSession(options)
    const code = await generateCode(session.id, location)
    return { session, code }
}

const attendanceRows = async (sessionId) => {
    const res = await request(`/api/lecturer/sessions/${sessionId}/attendance?userId=${LECTURER}`)
    assert.equal(res.status, 200, res.data.message)
    return res.data.rows
}

describe("Lecturer: logging sessions and generating codes", () => {
    test("ATT-01 logging a session needs a module, date, topic and a description of what was taught", async () => {
        const base = { moduleCode: FIXTURES.module.code, date: today(), topic: "Topic", description: "A description that is long enough.", userId: LECTURER }
        const cases = [
            [{ ...base, moduleCode: undefined }, 400],
            [{ ...base, date: undefined }, 400],
            [{ ...base, topic: undefined }, 400],
            [{ ...base, description: undefined }, 400],
            [{ ...base, description: "too short" }, 400],
            [{ ...base, description: "x".repeat(3001) }, 400],
            [{ ...base, moduleCode: "NOPE999" }, 404]
        ]
        for (const [body, status] of cases) {
            const res = await request("/api/lecturer/sessions", { method: "POST", body })
            assert.equal(res.status, status, `Expected ${status} for ${JSON.stringify({ ...body, description: body.description?.slice(0, 20) })}`)
        }

        const ok = await request("/api/lecturer/sessions", { method: "POST", body: { ...base, topic: "  Trimmed topic  " } })
        assert.equal(ok.status, 201, ok.data.message)
        assert.equal(ok.data.topic, "Trimmed topic")
        const [row] = await query(`SELECT lecturer_id, description FROM sessions WHERE id = ?`, [ok.data.id])
        assert.deepEqual(row, { lecturer_id: LECTURER, description: base.description })
    })

    test("ATT-02 a lecturer cannot log a session for a module they don't teach", async () => {
        const body = { moduleCode: FIXTURES.module.code, date: today(), topic: "Not mine", description: "A description that is long enough." }
        const other = await request("/api/lecturer/sessions", { method: "POST", body: { ...body, userId: FIXTURES.otherLecturer.id } })
        assert.equal(other.status, 403)

        const noUser = await request("/api/lecturer/sessions", { method: "POST", body })
        assert.equal(noUser.status, 400)
    })

    test("ATT-03 generating a code returns a 6-character code, its expiry and saves the lecturer's location", async () => {
        const session = await createSession()
        const before = Date.now()
        const res = await request(`/api/lecturer/sessions/${session.id}/generate-code`, {
            method: "POST",
            body: { userId: LECTURER, expiresInMinutes: 15, ...CLASSROOM }
        })
        assert.equal(res.status, 200, res.data.message)
        assert.match(res.data.code, /^[A-Z0-9]{6}$/)
        assert.ok(Math.abs(res.data.expiresAt - (before + 15 * 60000)) < 5000, "Expires in 15 minutes")
        assert.equal(res.data.locationAccuracy, 10)

        const [row] = await query(`SELECT attendance_code, expiry_minutes, lecturer_lat, lecturer_lng, lecturer_accuracy_m FROM sessions WHERE id = ?`, [session.id])
        assert.equal(row.attendance_code, res.data.code)
        assert.equal(row.expiry_minutes, 15)
        assert.equal(Number(row.lecturer_lat), CLASSROOM.latitude)
        assert.equal(Number(row.lecturer_lng), CLASSROOM.longitude)
        assert.equal(row.lecturer_accuracy_m, 10)

        const defaults = await request(`/api/lecturer/sessions/${session.id}/generate-code`, { method: "POST", body: { userId: LECTURER } })
        assert.ok(Math.abs(defaults.data.expiresAt - (Date.now() + 10 * 60000)) < 5000, "Defaults to 10 minutes")
        assert.equal(defaults.data.locationAccuracy, null)
    })

    test("ATT-04 codes can only be generated for an existing session of the lecturer's own module", async () => {
        const missing = await request(`/api/lecturer/sessions/no-such-session/generate-code`, { method: "POST", body: { userId: LECTURER } })
        assert.equal(missing.status, 404)

        const session = await createSession()
        const other = await request(`/api/lecturer/sessions/${session.id}/generate-code`, { method: "POST", body: { userId: FIXTURES.otherLecturer.id } })
        assert.equal(other.status, 403)

        const noUser = await request(`/api/lecturer/sessions/${session.id}/generate-code`, { method: "POST", body: {} })
        assert.equal(noUser.status, 400)
    })

    test("ATT-05 invalid lecturer coordinates are rejected", async () => {
        const session = await createSession()
        const bodies = [
            { latitude: 95, longitude: 28 },
            { latitude: -26.2 },
            { longitude: 28 },
            { latitude: "-26.2", longitude: "28.0" },
            { latitude: -26.2, longitude: 28, accuracy: -1 },
            { accuracy: 10 }
        ]
        for (const location of bodies) {
            const res = await request(`/api/lecturer/sessions/${session.id}/generate-code`, { method: "POST", body: { userId: LECTURER, ...location } })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(location)}`)
        }
    })
})

describe("Students signing the register", () => {
    test("ATT-06 a student in the classroom is marked present and verified", async () => {
        const { session, code } = await newCode()
        const res = await markAttendance(code, CLASSROOM)
        assert.equal(res.status, 201, res.data.message)
        assert.equal(res.data.locationStatus, "verified")
        assert.equal(res.data.distanceMeters, 0)

        const row = (await attendanceRows(session.id)).find((r) => r.studentId === S1)
        assert.equal(row.status, "present")
        assert.equal(row.location_status, "verified")
        assert.equal(Number(row.latitude), CLASSROOM.latitude)
        assert.ok(row.signedAt)
    })

    test("ATT-07 flag mode: a student far away is signed in but flagged as not in class, with a pin", async () => {
        const { session, code } = await newCode()
        const res = await markAttendance(code, FAR_AWAY)
        assert.equal(res.status, 201, res.data.message)
        assert.equal(res.data.locationStatus, "outside_radius")
        assert.ok(res.data.distanceMeters > 4000 && res.data.distanceMeters < 6000, `distance ${res.data.distanceMeters}`)
        assert.match(res.data.message, /not in class/)

        const row = (await attendanceRows(session.id)).find((r) => r.studentId === S1)
        assert.equal(row.status, "present")
        assert.equal(row.location_status, "outside_radius")
        assert.equal(Number(row.latitude), FAR_AWAY.latitude)
        assert.equal(Number(row.longitude), FAR_AWAY.longitude)
        assert.equal(row.distance_m, res.data.distanceMeters)
    })

    test("ATT-08 enforce mode: a student far away is rejected and nothing is recorded", async () => {
        const { session, code } = await newCode()
        const res = await markAttendance(code, FAR_AWAY, { base: ENFORCE_API })
        assert.equal(res.status, 403)
        assert.match(res.data.message, /must be in class/)

        const row = (await attendanceRows(session.id)).find((r) => r.studentId === S1)
        assert.equal(row.status, "absent")
        assert.equal(row.signedAt, null)
    })

    test("ATT-09 no location shared: flag mode records 'no_location', enforce mode refuses", async () => {
        const flag = await newCode()
        const flagged = await markAttendance(flag.code, null)
        assert.equal(flagged.status, 201, flagged.data.message)
        assert.equal(flagged.data.locationStatus, "no_location")
        assert.match(flagged.data.message, /couldn't confirm your location/)

        const enforce = await newCode()
        const refused = await markAttendance(enforce.code, null, { base: ENFORCE_API })
        assert.equal(refused.status, 400)
        assert.match(refused.data.message, /Location is required/)

        const enforceInClass = await markAttendance(enforce.code, CLASSROOM, { base: ENFORCE_API })
        assert.equal(enforceInClass.status, 201, enforceInClass.data.message)
        assert.equal(enforceInClass.data.locationStatus, "verified")
    })

    test("ATT-10 if the lecturer shared no location, sign-ins are 'not_checked' in both modes", async () => {
        for (const base of [undefined, ENFORCE_API]) {
            const { code } = await newCode(null)
            const res = await markAttendance(code, FAR_AWAY, { base })
            assert.equal(res.status, 201, res.data.message)
            assert.equal(res.data.locationStatus, "not_checked")
            assert.equal(res.data.distanceMeters, null)
        }
    })

    test("ATT-11 phone accuracy widens the 100 m radius, but by at most 50 m", async () => {
        const cases = [
            [metresNorth(90, 0), "verified"],
            [metresNorth(130, 10), "outside_radius"],
            [metresNorth(130, 40), "verified"],
            [metresNorth(130, 500), "verified"],
            [metresNorth(160, 500), "outside_radius"]
        ]
        for (const [location, expected] of cases) {
            const { code } = await newCode()
            const res = await markAttendance(code, location)
            assert.equal(res.status, 201, res.data.message)
            assert.equal(res.data.locationStatus, expected, `${JSON.stringify(location)} -> ${res.data.distanceMeters} m`)
        }
    })

    test("ATT-12 an unknown code is a 404 and codes are not case-sensitive", async () => {
        const unknown = await markAttendance("ZZZZZZ")
        assert.equal(unknown.status, 404)

        const { code } = await newCode()
        const lower = await markAttendance(` ${code.toLowerCase()} `)
        assert.equal(lower.status, 201, lower.data.message)

        const missing = await request("/api/student/attendance/mark", { method: "POST", body: { userId: S1 } })
        assert.equal(missing.status, 400)
    })

    test("ATT-13 an expired code is a 400", async () => {
        const { session, code } = await newCode()
        await query(`UPDATE sessions SET code_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`, [session.id])
        const res = await markAttendance(code)
        assert.equal(res.status, 400)
        assert.match(res.data.message, /expired/)
    })

    test("ATT-14 signing the same register twice is a 409", async () => {
        const { code } = await newCode()
        assert.equal((await markAttendance(code)).status, 201)
        const second = await markAttendance(code)
        assert.equal(second.status, 409)
    })

    test("ATT-15 a student who is not enrolled in the module cannot sign its register", async () => {
        const { session, code } = await newCode(CLASSROOM, { moduleCode: FIXTURES.module2.code })
        const res = await markAttendance(code, CLASSROOM, { studentId: S2 })
        assert.equal(res.status, 403)

        const rows = await query(`SELECT id FROM attendance WHERE session_id = ? AND student_id = ?`, [session.id, S2])
        assert.equal(rows.length, 0, "No attendance may be stored")
    })

    test("ATT-16 sign-ins sent at the same time give one 201 and 409s, never a 500", async () => {
        const { session, code } = await newCode()
        // Open 8 keep-alive connections first so the sign-ins really arrive together.
        await Promise.all(Array.from({ length: 8 }, () => request("/")))
        const results = await Promise.all(Array.from({ length: 8 }, () => markAttendance(code)))
        const statuses = results.map((r) => r.status).sort()
        assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409])

        const rows = await query(`SELECT id FROM attendance WHERE session_id = ? AND student_id = ?`, [session.id, S1])
        assert.equal(rows.length, 1)
    })

    test("ATT-17 invalid student coordinates are rejected", async () => {
        const { code } = await newCode()
        const bodies = [
            { latitude: -91, longitude: 28 },
            { latitude: -26.2, longitude: 181 },
            { latitude: -26.2 },
            { latitude: "x", longitude: 28 },
            { latitude: -26.2, longitude: 28, accuracy: -3 },
            { accuracy: 5 }
        ]
        for (const location of bodies) {
            const res = await request("/api/student/attendance/mark", { method: "POST", body: { userId: S1, code, ...location } })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(location)}`)
        }
    })
})

describe("Lecturer: attendance lists and session summary", () => {
    test("ATT-18 the attendance list has every enrolled student, absent by default, with location fields", async () => {
        const { session, code } = await newCode()
        assert.equal((await markAttendance(code, CLASSROOM)).status, 201)

        const rows = await attendanceRows(session.id)
        const [{ n }] = await query(`SELECT COUNT(*) AS n FROM enrolments WHERE module_id = ? AND status = 'active'`, [FIXTURES.module.id])
        assert.equal(rows.length, n)

        for (const row of rows) {
            for (const field of ["studentId", "name", "studentNumber", "status", "rating", "signedAt", "latitude", "longitude", "accuracy_m", "distance_m", "location_status", "quizScore", "quizTotal"]) {
                assert.ok(Object.hasOwn(row, field), `Row should include ${field}`)
            }
            if (row.studentId === S1) {
                assert.equal(row.status, "present")
                assert.ok(!Number.isNaN(new Date(row.signedAt).getTime()))
            } else {
                assert.equal(row.status, "absent")
                assert.equal(row.signedAt, null)
                assert.equal(row.latitude, null)
            }
        }
    })

    test("ATT-19 only the module's lecturer can view a session's attendance", async () => {
        const session = await createSession()
        const other = await request(`/api/lecturer/sessions/${session.id}/attendance?userId=${FIXTURES.otherLecturer.id}`)
        assert.equal(other.status, 403)
        const student = await request(`/api/lecturer/sessions/${session.id}/attendance?userId=${S1}`)
        assert.equal(student.status, 403)
        const unknown = await request(`/api/lecturer/sessions/no-such-session/attendance?userId=${LECTURER}`)
        assert.equal(unknown.status, 404)
        const noUser = await request(`/api/lecturer/sessions/${session.id}/attendance`)
        assert.equal(noUser.status, 400)
    })

    test("ATT-20 the sessions list uses plain dates, newest first, and only for the module's lecturer", async () => {
        await createSession()
        const res = await request(`/api/lecturer/modules/${FIXTURES.module.code}/sessions?userId=${LECTURER}`)
        assert.equal(res.status, 200)
        assert.ok(res.data.length > 0)
        for (const row of res.data) {
            assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/)
            assert.ok(row.topic)
        }
        const dates = res.data.map((r) => r.date)
        assert.deepEqual(dates, [...dates].sort().reverse())

        for (const path of ["sessions", "sessions-summary"]) {
            const asStudent = await request(`/api/lecturer/modules/${FIXTURES.module.code}/${path}?userId=${S1}`)
            assert.equal(asStudent.status, 403, `${path} should reject a non-lecturer`)
            const noUser = await request(`/api/lecturer/modules/${FIXTURES.module.code}/${path}`)
            assert.equal(noUser.status, 400, `${path} should require a user`)
            const unknown = await request(`/api/lecturer/modules/NOPE999/${path}?userId=${LECTURER}`)
            assert.equal(unknown.status, 404)
        }
    })

    test("ATT-21 the summary counts present, enrolled, in class and not in class for each session", async () => {
        const { session, code } = await newCode()
        assert.equal((await markAttendance(code, CLASSROOM, { studentId: S1 })).status, 201)
        assert.equal((await markAttendance(code, FAR_AWAY, { studentId: S2 })).status, 201)

        const res = await request(`/api/lecturer/modules/${FIXTURES.module.code}/sessions-summary?userId=${LECTURER}`)
        assert.equal(res.status, 200)
        const row = res.data.find((r) => r.id === session.id)
        const [{ n }] = await query(`SELECT COUNT(*) AS n FROM enrolments WHERE module_id = ? AND status = 'active'`, [FIXTURES.module.id])

        assert.deepEqual(
            { enrolled: row.enrolled, present: row.present, verified: row.verified, outsideRadius: row.outsideRadius, attendancePct: row.attendancePct, quizAttempts: row.quizAttempts, avgQuizScore: row.avgQuizScore },
            { enrolled: n, present: 2, verified: 1, outsideRadius: 1, attendancePct: Math.round((2 / n) * 100), quizAttempts: 0, avgQuizScore: null }
        )
        assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/)
        const dates = res.data.map((r) => r.date)
        assert.deepEqual(dates, [...dates].sort().reverse())
    })
})
