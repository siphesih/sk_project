const { describe, test, before } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request, login, query, unique } = require("./helpers/context.js")
const { uniqueStudentNumber, createModule, createStudent } = require("./helpers/fixtures.js")

const hasNoPasswords = (rows) => rows.every((row) => !Object.hasOwn(row, "password"))

describe("Admin: overview and users", () => {
    test("ADM-01 the overview counts match the database", async () => {
        const res = await request("/api/admin/overview")
        assert.equal(res.status, 200)
        const [[students], [lecturers], [modules]] = await Promise.all([
            query(`SELECT COUNT(*) AS n FROM students`),
            query(`SELECT COUNT(*) AS n FROM staff WHERE role = 'lecturer'`),
            query(`SELECT COUNT(*) AS n FROM modules`)
        ])
        assert.deepEqual(res.data.counts, { students: students.n, lecturers: lecturers.n, modules: modules.n })
    })

    test("ADM-02 the users list combines students and staff without passwords", async () => {
        const res = await request("/api/admin/users")
        assert.equal(res.status, 200)
        const roles = new Set(res.data.map((u) => u.role))
        assert.ok(roles.has("student") && roles.has("lecturer") && roles.has("admin"))
        assert.ok(hasNoPasswords(res.data))
    })

    test("ADM-03 an admin adds a student who can then sign in", async () => {
        const number = uniqueStudentNumber()
        const created = await request("/api/admin/users", {
            method: "POST",
            body: { role: "student", name: "  New Student  ", studentNumber: ` ${number} `, password: "first-pass", email: `${number}@example.com` }
        })
        assert.equal(created.status, 201, created.data.message)
        assert.ok(created.data.userId)

        const [row] = await query(`SELECT name, student_number, email FROM students WHERE id = ?`, [created.data.userId])
        assert.deepEqual(row, { name: "New Student", student_number: number, email: `${number}@example.com` })

        const signedIn = await login("student", number, "first-pass")
        assert.equal(signedIn.status, 200, signedIn.data.message)
    })

    test("ADM-04 adding a student with an existing student number is a 409", async () => {
        const res = await request("/api/admin/users", {
            method: "POST",
            body: { role: "student", name: "Duplicate", studentNumber: FIXTURES.student.number, password: "x" }
        })
        assert.equal(res.status, 409)
    })

    test("ADM-05 adding a lecturer generates a staff number and the lecturer can sign in", async () => {
        const email = `${unique("lecturer")}@example.com`
        const created = await request("/api/admin/users", {
            method: "POST",
            body: { role: "lecturer", name: "New Lecturer", email, password: "lect-pass" }
        })
        assert.equal(created.status, 201, created.data.message)

        const [row] = await query(`SELECT staff_number, role FROM staff WHERE id = ?`, [created.data.userId])
        assert.equal(row.role, "lecturer")
        assert.match(row.staff_number, /^STF-\d+$/)

        const signedIn = await login("lecturer", row.staff_number, "lect-pass")
        assert.equal(signedIn.status, 200, signedIn.data.message)
    })

    test("ADM-06 adding staff with an existing email is a 409", async () => {
        const res = await request("/api/admin/users", {
            method: "POST",
            body: { role: "admin", name: "Duplicate Admin", email: "admin@tut.ac.za", password: "x" }
        })
        assert.equal(res.status, 409)
    })

    test("ADM-07 missing required user fields are rejected with 400", async () => {
        const bodies = [
            { name: "No role", password: "x", studentNumber: "1" },
            { role: "student", password: "x", studentNumber: "1" },
            { role: "student", name: "   ", password: "x", studentNumber: "1" },
            { role: "student", name: "No password", studentNumber: "1" },
            { role: "student", name: "No number", password: "x" },
            { role: "lecturer", name: "No email", password: "x" }
        ]
        for (const body of bodies) {
            const res = await request("/api/admin/users", { method: "POST", body })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`)
        }
    })

    test("ADM-08 an unknown role is a 400", async () => {
        const res = await request("/api/admin/users", { method: "POST", body: { role: "parent", name: "X", password: "x" } })
        assert.equal(res.status, 400)
    })
})

describe("Admin: modules", () => {
    test("ADM-09 creating a module stores the code in upper case and assigns the lecturer", async () => {
        const code = unique("mod").replace(/[^A-Za-z0-9]/g, "").slice(-12).toLowerCase()
        const created = await request("/api/admin/modules", {
            method: "POST",
            body: { code: ` ${code} `, name: "Lowercase Module", period: "Second Semester", lecturerId: FIXTURES.lecturer.id, userId: FIXTURES.admin.id }
        })
        assert.equal(created.status, 201, created.data.message)

        const list = await request("/api/admin/modules")
        const module = list.data.find((m) => m.id === created.data.moduleId)
        assert.equal(module.code, code.toUpperCase())
        assert.equal(module.lecturer_id, FIXTURES.lecturer.id)
        assert.equal(module.created_by, FIXTURES.admin.id)

        const lecturerModules = await request(`/api/lecturer/modules?userId=${FIXTURES.lecturer.id}`)
        assert.ok(lecturerModules.data.some((m) => m.id === created.data.moduleId), "The lecturer should now see the module")
    })

    test("ADM-10 a duplicate module code is a 409, whatever the letter case", async () => {
        const res = await request("/api/admin/modules", {
            method: "POST",
            body: { code: FIXTURES.module.code.toLowerCase(), name: "Copy", period: "First Semester" }
        })
        assert.equal(res.status, 409)
    })

    test("ADM-11 a missing module code, name or period is a 400", async () => {
        for (const body of [{ name: "n", period: "p" }, { code: "C1", period: "p" }, { code: "C1", name: "n" }]) {
            const res = await request("/api/admin/modules", { method: "POST", body })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`)
        }
    })

    test("ADM-12 a module created without a lecturer has no primary lecturer", async () => {
        const code = unique("nolect").replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()
        const created = await request("/api/admin/modules", { method: "POST", body: { code, name: "Unassigned", period: "First Semester" } })
        assert.equal(created.status, 201, created.data.message)
        const list = await request("/api/modules")
        assert.equal(list.data.find((m) => m.code === code).lecturer_id, null)
    })
})

describe("Admin: enrolments", () => {
    let module
    let student
    let enrolmentId

    before(async () => {
        module = await createModule()
        student = await createStudent("Enrolment")
    })

    test("ADM-13 enrolling a student adds them to the module roster", async () => {
        const res = await request("/api/admin/enrolments", { method: "POST", body: { studentId: student.id, moduleId: module.id } })
        assert.equal(res.status, 201, res.data.message)

        const list = await request("/api/admin/enrolments")
        const row = list.data.find((e) => e.student_id === student.id && e.module_id === module.id)
        assert.ok(row, "The new enrolment should be listed")
        assert.equal(row.status, "active")
        assert.equal(row.moduleCode, module.code)
        enrolmentId = row.id

        const roster = await request(`/api/lecturer/modules/${module.code}/roster?userId=${FIXTURES.lecturer.id}`)
        assert.ok(roster.data.some((r) => r.id === student.id))
    })

    test("ADM-14 enrolling the same student twice is a 409", async () => {
        const res = await request("/api/admin/enrolments", { method: "POST", body: { studentId: student.id, moduleId: module.id } })
        assert.equal(res.status, 409)
    })

    test("ADM-15 a missing student or module is a 400", async () => {
        for (const body of [{ moduleId: module.id }, { studentId: student.id }]) {
            const res = await request("/api/admin/enrolments", { method: "POST", body })
            assert.equal(res.status, 400)
        }
    })

    test("ADM-16 removing an enrolment marks it dropped and hides it from lists", async () => {
        const res = await request(`/api/admin/enrolments/${enrolmentId}`, { method: "DELETE" })
        assert.equal(res.status, 200)

        const [row] = await query(`SELECT status FROM enrolments WHERE id = ?`, [enrolmentId])
        assert.equal(row.status, "dropped")

        const list = await request("/api/admin/enrolments")
        assert.ok(!list.data.some((e) => e.id === enrolmentId))

        const roster = await request(`/api/lecturer/modules/${module.code}/roster?userId=${FIXTURES.lecturer.id}`)
        assert.ok(!roster.data.some((r) => r.id === student.id), "Dropped students leave the roster")
    })

    test("ADM-17 a removed student can be enrolled again", async () => {
        const res = await request("/api/admin/enrolments", { method: "POST", body: { studentId: student.id, moduleId: module.id } })
        assert.equal(res.status, 201, res.data.message)

        const list = await request("/api/admin/enrolments")
        assert.ok(list.data.some((e) => e.student_id === student.id && e.module_id === module.id && e.status === "active"))
    })
})

describe("Admin: courses", () => {
    let course
    let module
    let linkId

    before(async () => {
        module = await createModule()
    })

    test("ADM-18 creating a course upper-cases the code and defaults to 3 years", async () => {
        const code = unique("dip").replace(/[^A-Za-z0-9]/g, "").slice(-12).toLowerCase()
        const created = await request("/api/admin/courses", {
            method: "POST",
            body: { code, name: "Diploma in Testing", faculty: " IT ", department: "", durationYears: "abc" }
        })
        assert.equal(created.status, 201, created.data.message)

        const list = await request("/api/admin/courses")
        course = list.data.find((c) => c.id === created.data.courseId)
        assert.equal(course.code, code.toUpperCase())
        assert.equal(course.duration_years, 3)
        assert.equal(course.faculty, "IT")
        assert.equal(course.department, null)
    })

    test("ADM-19 a duplicate course code is a 409", async () => {
        const res = await request("/api/admin/courses", { method: "POST", body: { code: course.code.toLowerCase(), name: "Copy" } })
        assert.equal(res.status, 409)
    })

    test("ADM-20 a missing course code or name is a 400", async () => {
        for (const body of [{ name: "No code" }, { code: "NONAME" }, { code: "  ", name: "Blank code" }]) {
            const res = await request("/api/admin/courses", { method: "POST", body })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`)
        }
    })

    test("ADM-21 modules are linked to a course by year level and listed in year order", async () => {
        const second = await createModule()
        const addYear2 = await request(`/api/admin/courses/${course.id}/modules`, { method: "POST", body: { moduleId: module.id, yearLevel: 2 } })
        const addYear1 = await request(`/api/admin/courses/${course.id}/modules`, { method: "POST", body: { moduleId: second.id, yearLevel: "1" } })
        assert.equal(addYear2.status, 201, addYear2.data.message)
        assert.equal(addYear1.status, 201, addYear1.data.message)

        const list = await request(`/api/admin/courses/${course.id}/modules`)
        assert.equal(list.status, 200)
        assert.deepEqual(list.data.map((r) => [r.year_level, r.moduleCode]), [[1, second.code], [2, module.code]])
        linkId = list.data.find((r) => r.moduleId === module.id).id
    })

    test("ADM-22 linking the same module twice is a 409 and a bad year or missing module is a 400", async () => {
        const duplicate = await request(`/api/admin/courses/${course.id}/modules`, { method: "POST", body: { moduleId: module.id, yearLevel: 3 } })
        assert.equal(duplicate.status, 409)

        for (const body of [{ yearLevel: 1 }, { moduleId: module.id, yearLevel: 0 }, { moduleId: module.id, yearLevel: "first" }, { moduleId: module.id, yearLevel: 1.5 }]) {
            const res = await request(`/api/admin/courses/${course.id}/modules`, { method: "POST", body })
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`)
        }
    })

    test("ADM-23 removing a module link removes it from the course", async () => {
        const res = await request(`/api/admin/courses/${course.id}/modules/${linkId}`, { method: "DELETE" })
        assert.equal(res.status, 200)
        const list = await request(`/api/admin/courses/${course.id}/modules`)
        assert.ok(!list.data.some((r) => r.id === linkId))
        assert.equal(list.data.length, 1)
    })
})
