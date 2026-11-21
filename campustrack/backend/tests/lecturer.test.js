const { describe, test, before } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request, query, unique } = require("./helpers/context.js")
const { createCohort, createModule, createStudent, enrol, expectedRisk } = require("./helpers/fixtures.js")

const LECTURER = FIXTURES.lecturer.id

describe("Lecturer: modules, roster and at-risk students", () => {
    let cohort

    before(async () => {
        cohort = await createCohort()
    })

    test("LEC-01 a lecturer only sees the modules they teach", async () => {
        const res = await request(`/api/lecturer/modules?userId=${LECTURER}`)
        assert.equal(res.status, 200)
        const codes = res.data.map((m) => m.code)
        for (const code of ["ISJ107V", "SEC117V", "DTD117V", "DBS207V", cohort.module.code]) assert.ok(codes.includes(code), code)
        assert.ok(!codes.includes("EUP117V"), "EUP117V belongs to another lecturer")

        const other = await request(`/api/lecturer/modules?userId=${FIXTURES.otherLecturer.id}`)
        assert.deepEqual(other.data.map((m) => m.code).sort(), ["EUP117V", "OOP207V", "WEB207V"])
    })

    test("LEC-02 the roster shows each enrolled student's attendance, understanding, marks and risk", async () => {
        const res = await request(`/api/lecturer/modules/${cohort.module.code}/roster?userId=${LECTURER}`)
        assert.equal(res.status, 200)
        const byId = Object.fromEntries(res.data.map((r) => [r.id, r]))
        const cases = [
            [cohort.students.good, 100, 5, 90],
            [cohort.students.medium, 75, null, 50],
            [cohort.students.high, 0, null, 20]
        ]
        for (const [student, attendance, understanding, avgMark] of cases) {
            const row = byId[student.id]
            assert.ok(row, `${student.name} should be on the roster`)
            assert.equal(row.studentNumber, student.number)
            assert.equal(row.attendanceRate, attendance)
            assert.equal(row.understanding, understanding)
            assert.equal(row.avgMark, avgMark)
            assert.deepEqual(row.risk, expectedRisk(attendance, understanding, avgMark))
        }
        const names = res.data.map((r) => r.name)
        assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
    })

    test("LEC-03 the at-risk list holds only medium and high risk students, lowest score first", async () => {
        const res = await request(`/api/lecturer/at-risk?userId=${LECTURER}`)
        assert.equal(res.status, 200)
        const ids = res.data.map((r) => r.id)
        assert.ok(ids.includes(cohort.students.high.id))
        assert.ok(ids.includes(cohort.students.medium.id))
        assert.ok(!ids.includes(cohort.students.good.id), "Low-risk students are not listed")
        assert.ok(res.data.every((r) => r.level === "medium" || r.level === "high"))
        const scores = res.data.map((r) => r.score)
        assert.deepEqual(scores, [...scores].sort((a, b) => a - b))

        const high = res.data.find((r) => r.id === cohort.students.high.id)
        assert.deepEqual({ level: high.level, score: high.score, attendance: high.attendance }, { level: "high", score: 24, attendance: 0 })
    })

    test("LEC-04 the roster of an unknown module is a 404", async () => {
        const res = await request(`/api/lecturer/modules/NOPE999/roster?userId=${LECTURER}`)
        assert.equal(res.status, 404)
    })

    test("LEC-05 lecturer pages without a userId are rejected with 400", async () => {
        for (const path of ["/api/lecturer/modules", "/api/lecturer/at-risk", "/api/lecturer/notifications"]) {
            const res = await request(path)
            assert.equal(res.status, 400, `${path} should need a userId`)
        }
    })
})

describe("Lecturer: results", () => {
    let module
    let student

    before(async () => {
        module = await createModule()
        student = await createStudent("Results")
        await enrol(student.id, module.id)
    })

    test("LEC-06 a lecturer adds a single result and it appears for the lecturer and the student", async () => {
        const res = await request("/api/lecturer/results", {
            method: "POST",
            body: { studentId: student.id, moduleCode: module.code, category: "AS", title: "  Assignment 1  ", mark: 34, outOf: 40, userId: LECTURER }
        })
        assert.equal(res.status, 201, res.data.message)

        const lecturerView = await request(`/api/lecturer/results/${module.code}?userId=${LECTURER}`)
        assert.equal(lecturerView.status, 200)
        const row = lecturerView.data.find((r) => r.studentId === student.id)
        assert.deepEqual({ category: row.category, title: row.title, mark: Number(row.mark), outOf: Number(row.outOf) }, { category: "AS", title: "Assignment 1", mark: 34, outOf: 40 })

        const studentView = await request(`/api/student/results?userId=${student.id}`)
        assert.ok(studentView.data.some((r) => r.title === "Assignment 1" && r.moduleCode === module.code))
    })

    test("LEC-07 a result without outOf defaults to 100", async () => {
        const res = await request("/api/lecturer/results", {
            method: "POST",
            body: { studentId: student.id, moduleCode: module.code, category: "CT", title: "Class Test 2", mark: 61 }
        })
        assert.equal(res.status, 201, res.data.message)
        const [row] = await query(`SELECT out_of FROM results WHERE student_id = ? AND title = 'Class Test 2'`, [student.id])
        assert.equal(Number(row.out_of), 100)
    })

    test("LEC-08 single results are validated: missing fields, unknown module, bad category or mark", async () => {
        const base = { studentId: student.id, moduleCode: module.code, category: "CT", title: "Test", mark: 50 }
        const cases = [
            [{ ...base, studentId: undefined }, 400],
            [{ ...base, title: "" }, 400],
            [{ ...base, mark: "" }, 400],
            [{ ...base, mark: undefined }, 400],
            [{ ...base, moduleCode: "NOPE999" }, 404],
            [{ ...base, category: "QUIZ" }, 400],
            [{ ...base, category: undefined }, 400],
            [{ ...base, mark: "eighty" }, 400],
            [{ ...base, mark: -5 }, 400]
        ]
        for (const [body, status] of cases) {
            const res = await request("/api/lecturer/results", { method: "POST", body })
            assert.equal(res.status, status, `Expected ${status} for ${JSON.stringify(body)}`)
        }
    })

    test("LEC-09 bulk upload saves valid rows and reports invalid rows by spreadsheet row", async () => {
        const title = unique("Bulk")
        const rows = [
            { studentNumber: student.number, category: "ct", title, mark: 70, outOf: 100 },
            { studentNumber: "", category: "CT", title, mark: 50 },
            { studentNumber: student.number, category: "QUIZ", title, mark: 50 },
            { studentNumber: student.number, category: "WR", title: " ", mark: 50 },
            { studentNumber: student.number, category: "WR", title, mark: "abc" },
            { studentNumber: student.number, category: "WR", title, mark: "" },
            { studentNumber: student.number, category: "WR", title, mark: -2 },
            { studentNumber: "000000001", category: "EXAM", title, mark: 50 },
            { studentNumber: ` ${student.number} `, category: "EXAM", title, mark: "88" }
        ]
        const res = await request("/api/lecturer/results/bulk", { method: "POST", body: { moduleCode: module.code, rows, userId: LECTURER } })
        assert.equal(res.status, 201, res.data.message)
        assert.equal(res.data.inserted, 2)
        assert.equal(res.data.message, "2 of 9 results uploaded.")
        assert.deepEqual(res.data.errors.map((e) => e.split(":")[0]), ["Row 3", "Row 4", "Row 5", "Row 6", "Row 7", "Row 8", "Row 9"])
        assert.match(res.data.errors[0], /missing student number/)
        assert.match(res.data.errors[1], /invalid category/)
        assert.match(res.data.errors[2], /missing title/)
        assert.match(res.data.errors[3], /invalid mark/)
        assert.match(res.data.errors[4], /invalid mark/, "An empty mark is not saved as 0")
        assert.match(res.data.errors[5], /invalid mark/, "A negative mark is rejected")
        assert.match(res.data.errors[6], /no student found/)

        const saved = await query(`SELECT category, mark FROM results WHERE student_id = ? AND title = ? ORDER BY mark`, [student.id, title])
        assert.deepEqual(saved.map((r) => [r.category, Number(r.mark)]), [["CT", 70], ["EXAM", 88]])
    })

    test("LEC-10 bulk upload needs a module and at least one row", async () => {
        const cases = [
            [{ rows: [{}] }, 400],
            [{ moduleCode: module.code, rows: [] }, 400],
            [{ moduleCode: module.code, rows: "not-a-list" }, 400],
            [{ moduleCode: "NOPE999", rows: [{ studentNumber: "1" }] }, 404]
        ]
        for (const [body, status] of cases) {
            const res = await request("/api/lecturer/results/bulk", { method: "POST", body })
            assert.equal(res.status, status, `Expected ${status} for ${JSON.stringify(body)}`)
        }
    })
})

describe("Lecturer: notifications", () => {
    test("LEC-11 a lecturer posts a notification and the module's students see it", async () => {
        const title = unique("Reminder")
        const res = await request("/api/lecturer/notifications", {
            method: "POST",
            body: { moduleCode: FIXTURES.module.code, title: `  ${title}  `, message: "  Bring your laptop.  ", userId: LECTURER }
        })
        assert.equal(res.status, 201, res.data.message)

        const lecturerView = await request(`/api/lecturer/notifications?userId=${LECTURER}`)
        assert.ok(lecturerView.data.some((n) => n.title === title && n.message === "Bring your laptop."))

        const enrolled = await request(`/api/student/notifications?userId=${FIXTURES.student2.id}`)
        assert.ok(enrolled.data.some((n) => n.title === title), "An enrolled student sees it")

        const outsider = await createStudent("Outsider")
        const notEnrolled = await request(`/api/student/notifications?userId=${outsider.id}`)
        assert.ok(!notEnrolled.data.some((n) => n.title === title), "Other students do not")
    })

    test("LEC-12 notifications are validated: module, title and message are required", async () => {
        const base = { moduleCode: FIXTURES.module.code, title: "T", message: "M" }
        const cases = [
            [{ ...base, moduleCode: undefined }, 400],
            [{ ...base, title: "" }, 400],
            [{ ...base, message: "" }, 400],
            [{ ...base, moduleCode: "NOPE999" }, 404]
        ]
        for (const [body, status] of cases) {
            const res = await request("/api/lecturer/notifications", { method: "POST", body })
            assert.equal(res.status, status, `Expected ${status} for ${JSON.stringify(body)}`)
        }
    })

    test("LEC-13 a lecturer only sees notifications for their own modules", async () => {
        const res = await request(`/api/lecturer/notifications?userId=${FIXTURES.otherLecturer.id}`)
        assert.equal(res.status, 200)
        assert.ok(res.data.every((n) => ["EUP117V", "OOP207V", "WEB207V"].includes(n.moduleCode)))
    })
})
