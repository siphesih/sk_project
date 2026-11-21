const { describe, test, before } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request, query, createSession, generateCode, markAttendance, CLASSROOM } = require("./helpers/context.js")
const { createCohort, createModule, createStudent, enrol, expectedRisk } = require("./helpers/fixtures.js")

const S1 = FIXTURES.student.id
const S2 = FIXTURES.student2.id
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

describe("Student: timetable, assignments, notifications and results", () => {
    test("STU-01 the timetable lists the student's classes from Monday to Friday", async () => {
        const res = await request(`/api/student/timetable?userId=${S1}`)
        assert.equal(res.status, 200)
        assert.deepEqual(res.data.map((r) => `${r.day} ${r.moduleCode}`), [
            "Monday ISJ107V",
            "Tuesday SEC117V",
            "Wednesday ISJ107V",
            "Thursday DTD117V"
        ])
        const dayIndexes = res.data.map((r) => WEEKDAYS.indexOf(r.day))
        assert.deepEqual(dayIndexes, [...dayIndexes].sort((a, b) => a - b))
    })

    test("STU-02 the timetable only includes modules the student is enrolled in", async () => {
        const res = await request(`/api/student/timetable?userId=${S2}`)
        assert.equal(res.status, 200)
        assert.ok(res.data.length > 0)
        assert.ok(res.data.every((r) => r.moduleCode === FIXTURES.module.code))
    })

    test("STU-03 assignments are listed by due date for the student's modules only", async () => {
        const all = await request(`/api/student/assignments?userId=${S1}`)
        assert.equal(all.status, 200)
        const dues = all.data.map((a) => new Date(a.due).getTime())
        assert.deepEqual(dues, [...dues].sort((a, b) => a - b))
        assert.ok(all.data.length >= 4)

        const onlyIsj = await request(`/api/student/assignments?userId=${S2}`)
        assert.ok(onlyIsj.data.length > 0)
        assert.ok(onlyIsj.data.every((a) => a.moduleCode === FIXTURES.module.code))
    })

    test("STU-04 notifications only show the student's own modules", async () => {
        const s1 = await request(`/api/student/notifications?userId=${S1}`)
        assert.equal(s1.status, 200)
        assert.ok(s1.data.some((n) => n.moduleCode === FIXTURES.module3.code), "student-1 takes DTD117V and should see its notice")

        const s2 = await request(`/api/student/notifications?userId=${S2}`)
        assert.ok(s2.data.every((n) => n.moduleCode === FIXTURES.module.code), "student-2 only takes ISJ107V")
    })

    test("STU-05 results only show the student's own marks", async () => {
        const s1 = await request(`/api/student/results?userId=${S1}`)
        assert.equal(s1.status, 200)
        const seeded = s1.data.filter((r) => ["Class Test 1", "Assignment 1", "Written Test 1"].includes(r.title))
        assert.ok(seeded.length >= 4)
        for (const r of s1.data) {
            assert.ok(Number(r.mark) <= Number(r.outOf))
            assert.ok(r.moduleCode)
        }

        const [{ n }] = await query(`SELECT COUNT(*) AS n FROM results WHERE student_id = ?`, [S2])
        const s2 = await request(`/api/student/results?userId=${S2}`)
        assert.equal(s2.data.length, n)
    })
})

describe("Student: overview and risk score", () => {
    let cohort

    before(async () => {
        cohort = await createCohort()
    })

    test("STU-06 the overview calculates the risk score from attendance, quiz understanding and marks", async () => {
        const cases = [
            { student: cohort.students.good, attendance: 100, understanding: 5, avgMark: 90 },
            { student: cohort.students.medium, attendance: 75, understanding: null, avgMark: 50 },
            { student: cohort.students.high, attendance: 0, understanding: null, avgMark: 20 }
        ]
        for (const c of cases) {
            const res = await request(`/api/student/overview?userId=${c.student.id}`)
            assert.equal(res.status, 200, res.data.message)
            const expected = expectedRisk(c.attendance, c.understanding, c.avgMark)
            assert.deepEqual(res.data.risk, {
                level: expected.level,
                score: expected.score,
                attendance: c.attendance,
                understanding: c.understanding,
                avgMark: c.avgMark
            }, c.student.name)
            assert.deepEqual(res.data.modules.map((m) => m.code), [cohort.module.code])
        }
        // 97 / low, 63 / medium, 24 / high
        assert.equal(expectedRisk(100, 5, 90).level, "low")
        assert.equal(expectedRisk(75, null, 50).level, "medium")
        assert.equal(expectedRisk(0, null, 20).level, "high")
    })

    test("STU-07 a student with no sessions or marks gets the neutral defaults", async () => {
        const student = await createStudent("No data")
        const res = await request(`/api/student/overview?userId=${student.id}`)
        assert.equal(res.status, 200)
        const expected = expectedRisk(100, null, null)
        assert.deepEqual(res.data.risk, { level: expected.level, score: expected.score, attendance: 100, understanding: null, avgMark: null })
        assert.equal(res.data.nextAssignment, null)
        assert.deepEqual(res.data.modules, [])
    })

    test("STU-08 the overview shows the next assignment that is not yet due", async () => {
        const module = await createModule()
        const student = await createStudent("Assignments")
        await enrol(student.id, module.id)

        const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
        await query(
            `INSERT INTO assignments (id, title, module_id, due) VALUES (?, 'Past assignment', ?, ?), (?, 'Soon assignment', ?, ?), (?, 'Later assignment', ?, ?)`,
            [`a-past-${module.code}`, module.id, inDays(-3), `a-soon-${module.code}`, module.id, inDays(2), `a-later-${module.code}`, module.id, inDays(9)]
        )

        const res = await request(`/api/student/overview?userId=${student.id}`)
        assert.equal(res.data.nextAssignment.title, "Soon assignment")
        assert.equal(res.data.nextAssignment.moduleCode, module.code)
    })
})

describe("Student: sessions and privacy", () => {
    test("STU-09 the sessions list returns plain dates, newest first, with attendance and quiz status", async () => {
        const session = await createSession()
        const code = await generateCode(session.id)
        const signed = await markAttendance(code)
        assert.equal(signed.status, 201, signed.data.message)

        const res = await request(`/api/student/sessions?userId=${S1}`)
        assert.equal(res.status, 200)
        for (const row of res.data) assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/)
        const dates = res.data.map((r) => r.date)
        assert.deepEqual(dates, [...dates].sort().reverse())

        const mine = res.data.find((r) => r.id === session.id)
        assert.equal(mine.attendanceStatus, "present")
        assert.equal(mine.hasQuiz, true)
        assert.equal(mine.quizScore, null)
    })

    test("STU-10 open sessions only include sessions with a live code", async () => {
        const session = await createSession()
        const before = await request(`/api/student/attendance/open-sessions?userId=${S1}`)
        assert.ok(!before.data.some((s) => s.id === session.id), "No code yet")

        await generateCode(session.id)
        const open = await request(`/api/student/attendance/open-sessions?userId=${S1}`)
        const row = open.data.find((s) => s.id === session.id)
        assert.ok(row, "Visible while the code is live")
        assert.equal(row.attendanceStatus, null)
        assert.equal(row.hasQuiz, true)

        await query(`UPDATE sessions SET code_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`, [session.id])
        const after = await request(`/api/student/attendance/open-sessions?userId=${S1}`)
        assert.ok(!after.data.some((s) => s.id === session.id), "Hidden once the code expires")
    })

    test("STU-11 students never receive the lecturer's coordinates or other students' locations", async () => {
        const session = await createSession()
        const code = await generateCode(session.id, CLASSROOM)
        const signed = await markAttendance(code, CLASSROOM)
        assert.equal(signed.status, 201)

        const forbidden = ["lecturer_lat", "lecturer_lng", "lecturer_accuracy_m", "latitude", "longitude", "accuracy_m"]
        for (const path of [`/api/student/attendance/open-sessions?userId=${S1}`, `/api/student/sessions?userId=${S1}`]) {
            const res = await request(path)
            for (const row of res.data) {
                for (const field of forbidden) assert.ok(!Object.hasOwn(row, field), `${path} must not return ${field}`)
            }
        }
        for (const field of forbidden) assert.ok(!Object.hasOwn(signed.data, field), `The sign-in response must not return ${field}`)
    })

    test("STU-12 student pages without a userId are rejected with 400", async () => {
        const paths = ["timetable", "assignments", "attendance/open-sessions", "sessions", "overview", "notifications", "results"]
        for (const path of paths) {
            const res = await request(`/api/student/${path}`)
            assert.equal(res.status, 400, `/api/student/${path} should need a userId`)
        }
    })
})
