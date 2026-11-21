// Builds a small, fully known class through the public API so risk scores,
// rosters and predictions can be checked against exact expected values.
//
//   module:   a brand-new module taught by staff-lect-1
//   sessions: 4, each with a live attendance code
//   good:     attends 4/4, mark 90%, scores 10/10 on session 1's quiz -> rating 5
//   medium:   attends 3/4, mark 50%
//   high:     attends 0/4, mark 20%

const assert = require("node:assert/strict")
const { FIXTURES, CLASSROOM, unique, request, createSession, generateCode, markAttendance } = require("./context.js")

let numberCounter = 0
const uniqueStudentNumber = () => `9${Date.now().toString().slice(-7)}${String(numberCounter++).padStart(2, "0")}`

async function createModule({ lecturerId = FIXTURES.lecturer.id } = {}) {
    const code = unique("M").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-12)
    const result = await request("/api/admin/modules", {
        method: "POST",
        body: { code, name: `Test module ${code}`, period: "First Semester", lecturerId, userId: FIXTURES.admin.id }
    })
    assert.equal(result.status, 201, result.data.message)
    return { id: result.data.moduleId, code }
}

async function createStudent(label) {
    const number = uniqueStudentNumber()
    const name = `${label} ${number}`
    const result = await request("/api/admin/users", {
        method: "POST",
        body: { role: "student", name, studentNumber: number, password: "password123" }
    })
    assert.equal(result.status, 201, result.data.message)
    return { id: result.data.userId, number, name, password: "password123" }
}

async function enrol(studentId, moduleId) {
    const result = await request("/api/admin/enrolments", { method: "POST", body: { studentId, moduleId } })
    assert.equal(result.status, 201, result.data.message)
}

async function sign(code, studentId) {
    const result = await markAttendance(code, CLASSROOM, { studentId })
    assert.equal(result.status, 201, result.data.message)
}

async function addResult(studentId, moduleCode, mark) {
    const result = await request("/api/lecturer/results", {
        method: "POST",
        body: { studentId, moduleCode, category: "CT", title: "Class Test 1", mark, outOf: 100, userId: FIXTURES.lecturer.id }
    })
    assert.equal(result.status, 201, result.data.message)
}

async function completeQuizPerfectly(sessionId, studentId) {
    const lecturerQuiz = await request(`/api/lecturer/sessions/${sessionId}/quiz?userId=${FIXTURES.lecturer.id}`)
    assert.equal(lecturerQuiz.status, 200, lecturerQuiz.data.message)
    const answers = lecturerQuiz.data.questions.map((q) => q.answerIndex)
    const submitted = await request(`/api/student/sessions/${sessionId}/quiz`, {
        method: "POST",
        body: { userId: studentId, answers }
    })
    assert.equal(submitted.status, 201, submitted.data.message)
    return submitted.data
}

async function createCohort() {
    const module = await createModule()
    const students = {
        good: await createStudent("Cohort A"),
        medium: await createStudent("Cohort B"),
        high: await createStudent("Cohort C")
    }
    for (const student of Object.values(students)) await enrol(student.id, module.id)

    const sessions = []
    for (let i = 1; i <= 4; i++) {
        const session = await createSession({ moduleCode: module.code, topic: `Cohort session ${i}` })
        sessions.push({ ...session, code: await generateCode(session.id) })
    }

    for (const session of sessions) await sign(session.code, students.good.id)
    for (const session of sessions.slice(0, 3)) await sign(session.code, students.medium.id)

    await addResult(students.good.id, module.code, 90)
    await addResult(students.medium.id, module.code, 50)
    await addResult(students.high.id, module.code, 20)

    await completeQuizPerfectly(sessions[0].id, students.good.id)

    return { module, students, sessions }
}

// The rule-based risk score used by the API (server.js getModuleRoster / student overview).
function expectedRisk(attendance, understanding, avgMark) {
    const score = Math.round(attendance * 0.4 + ((understanding ?? 3) / 5) * 100 * 0.3 + (avgMark ?? 60) * 0.3)
    return { score, level: score >= 70 ? "low" : score >= 50 ? "medium" : "high" }
}

module.exports = {
    uniqueStudentNumber,
    createModule,
    createStudent,
    enrol,
    sign,
    addResult,
    completeQuizPerfectly,
    createCohort,
    expectedRisk
}
