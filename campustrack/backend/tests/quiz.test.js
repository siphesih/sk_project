const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const {
    FIXTURES, CLASSROOM, unique, request, query, today,
    createSession, generateCode, markAttendance, mockGroqRequests
} = require("./helpers/context.js")
const { createStudent, createModule, enrol } = require("./helpers/fixtures.js")

// Waits for the background generation started by logging a session to store its quiz,
// so a test's own request doesn't race it and trigger a second generation.
async function waitForStoredQuiz(sessionId, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const rows = await query(`SELECT session_id FROM session_quizzes WHERE session_id = ?`, [sessionId])
        if (rows.length) return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`The quiz for session ${sessionId} was not stored within ${timeoutMs} ms`)
}

const LECTURER = FIXTURES.lecturer.id
const S1 = FIXTURES.student.id

const studentQuiz = (sessionId, studentId = S1) => request(`/api/student/sessions/${sessionId}/quiz?userId=${studentId}`)
const lecturerQuiz = (sessionId, lecturerId = LECTURER) => request(`/api/lecturer/sessions/${sessionId}/quiz?userId=${lecturerId}`)
const submitQuiz = (sessionId, answers, studentId = S1) => request(`/api/student/sessions/${sessionId}/quiz`, { method: "POST", body: { userId: studentId, answers } })

// A session the given students have signed, ready for its quiz.
async function signedSession(options = {}, students = [S1]) {
    const session = await createSession(options)
    const code = await generateCode(session.id)
    for (const studentId of students) {
        const res = await markAttendance(code, CLASSROOM, { studentId })
        assert.equal(res.status, 201, res.data.message)
    }
    return session
}

async function answerKey(sessionId) {
    const res = await lecturerQuiz(sessionId)
    assert.equal(res.status, 200, res.data.message)
    return res.data.questions.map((q) => q.answerIndex)
}

// `correctCount` right answers followed by wrong ones.
const answersWith = (key, correctCount) => key.map((a, i) => (i < correctCount ? a : (a + 1) % 4))

describe("Session quiz: generation and access", () => {
    test("QUIZ-01 logging a session generates its 10-question quiz in the background", async () => {
        const topic = unique("Background quiz")
        const session = await createSession({ topic })
        await waitForStoredQuiz(session.id)

        const res = await lecturerQuiz(session.id)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.questions.length, 10)
        assert.equal(res.data.attempts, 0)
        assert.equal(res.data.avgScore, null)
        for (const q of res.data.questions) {
            assert.equal(q.options.length, 4)
            assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
            assert.ok(q.explanation)
        }

        const sent = (await mockGroqRequests()).filter((r) => r.body.messages[1].content.includes(topic))
        assert.equal(sent.length, 1, "Exactly one generation request, made when the session was logged")
    })

    test("QUIZ-02 the request to Groq carries the lecturer's description and asks for JSON", async () => {
        const description = `${unique("Description")}: binary search trees, insertion, in-order traversal and balancing.`
        const session = await createSession({ description })
        await waitForStoredQuiz(session.id)

        const sent = (await mockGroqRequests()).find((r) => r.body.messages[1].content.includes(description))
        assert.ok(sent, "Groq should receive the description")
        assert.equal(sent.authorization, "Bearer test-key")
        assert.equal(sent.body.model, "openai/gpt-oss-120b")
        assert.deepEqual(sent.body.response_format, { type: "json_object" })
        assert.match(sent.body.messages[0].content, /exactly 10 questions/)
    })

    test("QUIZ-03 the quiz stays locked until the student signs the register", async () => {
        const session = await createSession()
        const locked = await studentQuiz(session.id)
        assert.equal(locked.status, 403)
        assert.match(locked.data.message, /Sign the register/)

        const code = await generateCode(session.id)
        assert.equal((await markAttendance(code)).status, 201)
        assert.equal((await studentQuiz(session.id)).status, 200)
    })

    test("QUIZ-04 students get the questions but never the answers or explanations", async () => {
        const session = await signedSession()
        const res = await studentQuiz(session.id)
        assert.equal(res.status, 200)
        assert.equal(res.data.completed, false)
        assert.equal(res.data.questions.length, 10)
        for (const q of res.data.questions) {
            assert.deepEqual(Object.keys(q).sort(), ["options", "question"])
        }
        const lecturer = await lecturerQuiz(session.id)
        assert.deepEqual(res.data.questions.map((q) => q.question), lecturer.data.questions.map((q) => q.question))
    })

    test("QUIZ-05 only the module's lecturer can see the answers", async () => {
        const session = await createSession()
        assert.equal((await lecturerQuiz(session.id, S1)).status, 403)
        assert.equal((await lecturerQuiz(session.id, FIXTURES.otherLecturer.id)).status, 403)
        assert.equal((await lecturerQuiz("no-such-session")).status, 404)
        assert.equal((await request(`/api/lecturer/sessions/${session.id}/quiz`)).status, 400)
    })

    test("QUIZ-06 a student who is not enrolled in the module cannot open its quiz", async () => {
        const session = await createSession()
        const outsider = await createStudent("Quiz outsider")
        const res = await studentQuiz(session.id, outsider.id)
        assert.equal(res.status, 404)
        assert.equal((await request(`/api/student/sessions/${session.id}/quiz`)).status, 400)
    })

    test("QUIZ-07 answer positions are shuffled, so the right answer is not always first", async () => {
        // The mock always returns the right answer as option 0.
        const session = await createSession()
        const key = await answerKey(session.id)
        assert.ok(key.some((a) => a !== 0), `Answer positions: ${key.join(",")}`)

        const res = await lecturerQuiz(session.id)
        res.data.questions.forEach((q, i) => {
            assert.equal(q.options[q.answerIndex], `Right answer ${i + 1}`, "answerIndex must follow the shuffle")
        })
    })

    test("QUIZ-08 a malformed AI reply is retried once and the quiz is still produced", async () => {
        const description = `${unique("Retry")} [[MALFORMED_ONCE]] stacks and queues, push, pop and enqueue.`
        const session = await createSession({ description })
        await waitForStoredQuiz(session.id)

        const res = await lecturerQuiz(session.id)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.questions.length, 10)

        const sent = (await mockGroqRequests()).filter((r) => r.body.messages[1].content.includes(description))
        assert.equal(sent.length, 2, "One malformed reply, one retry")
    })

    test("QUIZ-09 if the AI keeps failing, students get a friendly 502 and nothing is saved", async () => {
        for (const marker of ["[[ALWAYS_MALFORMED]]", "[[HTTP_500]]"]) {
            const session = await signedSession({ description: `${unique("Failing")} ${marker} recursion and the call stack.` })
            const res = await studentQuiz(session.id)
            assert.equal(res.status, 502, `${marker}: ${res.data.message}`)
            assert.match(res.data.message, /couldn't be generated/)
            assert.equal((await lecturerQuiz(session.id)).status, 502)

            const stored = await query(`SELECT session_id FROM session_quizzes WHERE session_id = ?`, [session.id])
            assert.equal(stored.length, 0)
        }
    })

    test("QUIZ-10 sessions logged without a description have no quiz", async () => {
        const id = unique("no-description")
        await query(
            `INSERT INTO sessions (id, module_id, lecturer_id, session_date, topic) VALUES (?, ?, ?, ?, 'Old session')`,
            [id, FIXTURES.module.id, LECTURER, today()]
        )
        const code = await generateCode(id)
        assert.equal((await markAttendance(code)).status, 201)

        const student = await studentQuiz(id)
        assert.equal(student.status, 404)
        assert.match(student.data.message, /no quiz/)

        const lecturer = await lecturerQuiz(id)
        assert.equal(lecturer.status, 200)
        assert.equal(lecturer.data.description, null)
        assert.equal(lecturer.data.questions, null)

        const listed = await request(`/api/student/sessions?userId=${S1}`)
        assert.equal(listed.data.find((s) => s.id === id).hasQuiz, false)
    })
})

describe("Session quiz: marking and ratings", () => {
    test("QUIZ-11 the server marks the quiz and the score becomes the 1-5 rating", async () => {
        const session = await signedSession()
        const key = await answerKey(session.id)

        const res = await submitQuiz(session.id, answersWith(key, 7))
        assert.equal(res.status, 201, res.data.message)
        assert.deepEqual({ score: res.data.score, total: res.data.total, rating: res.data.rating }, { score: 7, total: 10, rating: 4 })
        assert.equal(res.data.review.length, 10)
        assert.equal(res.data.review.filter((q) => q.correct).length, 7)
        for (const q of res.data.review) {
            assert.ok(Object.hasOwn(q, "answerIndex") && Object.hasOwn(q, "explanation"), "The review shows answers after submitting")
        }

        const [rating] = await query(`SELECT rating FROM ratings WHERE session_id = ? AND student_id = ?`, [session.id, S1])
        assert.equal(rating.rating, 4)

        const row = (await request(`/api/lecturer/sessions/${session.id}/attendance?userId=${LECTURER}`)).data.rows.find((r) => r.studentId === S1)
        assert.deepEqual({ rating: row.rating, quizScore: row.quizScore, quizTotal: row.quizTotal }, { rating: 4, quizScore: 7, quizTotal: 10 })
    })

    test("QUIZ-12 every score maps to the right rating (0-2:1, 3-4:2, 5-6:3, 7-8:4, 9-10:5)", async () => {
        const expected = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
        const module = await createModule()
        const students = []
        for (let i = 0; i <= 10; i++) {
            const student = await createStudent(`Rating ${i}`)
            await enrol(student.id, module.id)
            students.push(student)
        }

        const session = await signedSession({ moduleCode: module.code }, students.map((s) => s.id))
        const key = await answerKey(session.id)
        for (let score = 0; score <= 10; score++) {
            const res = await submitQuiz(session.id, answersWith(key, score), students[score].id)
            assert.equal(res.status, 201, res.data.message)
            assert.equal(res.data.score, score)
            assert.equal(res.data.rating, expected[score], `score ${score}`)
        }

        const summary = await request(`/api/lecturer/modules/${module.code}/sessions-summary?userId=${LECTURER}`)
        const row = summary.data.find((r) => r.id === session.id)
        assert.equal(row.quizAttempts, 11)
        assert.equal(row.avgQuizScore, 5)
        assert.equal(row.present, 11)
        assert.equal(row.attendancePct, 100)
    })

    test("QUIZ-13 only one attempt is allowed, and incomplete or invalid answers are a 400", async () => {
        const session = await signedSession()
        const key = await answerKey(session.id)

        for (const answers of [key.slice(0, 9), [...key, 0], key.map((a, i) => (i === 0 ? 4 : a)), key.map((a, i) => (i === 0 ? "1" : a)), key.map((a, i) => (i === 0 ? null : a)), "all"]) {
            const res = await submitQuiz(session.id, answers)
            assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(answers)}`)
        }

        assert.equal((await submitQuiz(session.id, key)).status, 201)
        const again = await submitQuiz(session.id, key)
        assert.equal(again.status, 409)
    })

    test("QUIZ-14 a completed quiz can be reviewed but not retaken", async () => {
        const session = await signedSession()
        const key = await answerKey(session.id)
        await submitQuiz(session.id, answersWith(key, 10))

        const res = await studentQuiz(session.id)
        assert.equal(res.status, 200)
        assert.equal(res.data.completed, true)
        assert.equal(res.data.score, 10)
        assert.equal(res.data.rating, 5)
        assert.ok(res.data.review.every((q) => q.correct))
    })

    test("QUIZ-15 the quiz score feeds the student's understanding and the session list", async () => {
        const session = await signedSession()
        const key = await answerKey(session.id)
        await submitQuiz(session.id, answersWith(key, 2))

        const listed = await request(`/api/student/sessions?userId=${S1}`)
        const row = listed.data.find((s) => s.id === session.id)
        assert.deepEqual({ myRating: row.myRating, quizScore: row.quizScore, quizTotal: row.quizTotal }, { myRating: 1, quizScore: 2, quizTotal: 10 })

        const open = await request(`/api/student/attendance/open-sessions?userId=${S1}`)
        assert.equal(open.data.find((s) => s.id === session.id).quizScore, 2)
    })

    test("QUIZ-16 students can no longer rate themselves", async () => {
        const session = await createSession()
        const res = await request(`/api/student/sessions/${session.id}/rating`, { method: "POST", body: { userId: S1, rating: 5 } })
        assert.equal(res.status, 410)
        const rows = await query(`SELECT rating FROM ratings WHERE session_id = ?`, [session.id])
        assert.equal(rows.length, 0)
    })
})

describe("Session quiz: lecturer regenerates", () => {
    test("QUIZ-17 a lecturer can regenerate the quiz with a new description before anyone takes it", async () => {
        const session = await createSession()
        const description = "Doubly linked lists: previous and next pointers, and deleting a node in O(1) time."
        const res = await request(`/api/lecturer/sessions/${session.id}/quiz/regenerate`, { method: "POST", body: { userId: LECTURER, description } })
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.questions.length, 10)
        assert.equal(res.data.description, description)

        const [row] = await query(`SELECT description FROM sessions WHERE id = ?`, [session.id])
        assert.equal(row.description, description)
    })

    test("QUIZ-18 regenerating is validated and locked once a student has answered", async () => {
        const session = await signedSession()
        const regenerate = (body) => request(`/api/lecturer/sessions/${session.id}/quiz/regenerate`, { method: "POST", body })

        assert.equal((await regenerate({ userId: LECTURER, description: "too short" })).status, 400)
        assert.equal((await regenerate({ userId: LECTURER, description: "x".repeat(3001) })).status, 400)
        assert.equal((await regenerate({ userId: FIXTURES.otherLecturer.id })).status, 403)
        assert.equal((await regenerate({})).status, 400)
        assert.equal((await request(`/api/lecturer/sessions/no-such-session/quiz/regenerate`, { method: "POST", body: { userId: LECTURER } })).status, 404)

        const key = await answerKey(session.id)
        await submitQuiz(session.id, key)
        const locked = await regenerate({ userId: LECTURER })
        assert.equal(locked.status, 409)
    })

    test("QUIZ-19 an old session without a description gets a quiz once the lecturer adds one", async () => {
        const id = unique("old-session")
        await query(
            `INSERT INTO sessions (id, module_id, lecturer_id, session_date, topic) VALUES (?, ?, ?, ?, 'Old topic')`,
            [id, FIXTURES.module.id, LECTURER, today()]
        )
        const regenerate = (body) => request(`/api/lecturer/sessions/${id}/quiz/regenerate`, { method: "POST", body: { userId: LECTURER, ...body } })

        const noDescription = await regenerate({})
        assert.equal(noDescription.status, 400)
        assert.match(noDescription.data.message, /Add a description/)

        const aiDown = await regenerate({ description: "[[HTTP_500]] Graph traversal: breadth-first and depth-first search." })
        assert.equal(aiDown.status, 502)
        const [unchanged] = await query(`SELECT description FROM sessions WHERE id = ?`, [id])
        assert.equal(unchanged.description, null, "A failed generation leaves the session unchanged")

        const added = await regenerate({ description: "Graph traversal: breadth-first and depth-first search." })
        assert.equal(added.status, 200, added.data.message)
        assert.equal(added.data.questions.length, 10)
        assert.equal((await lecturerQuiz(id)).data.description, "Graph traversal: breadth-first and depth-first search.")
    })
})
