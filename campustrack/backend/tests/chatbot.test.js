const { describe, test } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, unique, request, createSession, generateCode, markAttendance, mockGroqRequests } = require("./helpers/context.js")

const ask = (userId, message) => request("/api/chatbot", { method: "POST", body: { userId, message } })

async function sentFor(message) {
    const requests = await mockGroqRequests()
    const found = requests.filter((r) => r.body.messages?.[1]?.content === message)
    assert.equal(found.length, 1, "Exactly one request should reach Groq")
    return found[0]
}

describe("AI assistant (chatbot)", () => {
    test("CHAT-01 a missing user or an empty message is a 400", async () => {
        assert.equal((await request("/api/chatbot", { method: "POST", body: { message: "Hi" } })).status, 400)
        assert.equal((await ask(FIXTURES.student.id, "   ")).status, 400)
        assert.equal((await request("/api/chatbot", { method: "POST", body: { userId: FIXTURES.student.id } })).status, 400)
    })

    test("CHAT-02 admins and unknown users cannot use the assistant", async () => {
        assert.equal((await ask(FIXTURES.admin.id, "Hello")).status, 403)
        assert.equal((await ask("nobody-at-all", "Hello")).status, 403)
    })

    test("CHAT-03 a student's question is answered using only their own data", async () => {
        const message = unique("When is my next class?")
        const res = await ask(FIXTURES.student.id, message)
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.reply, `Mock assistant reply to: ${message}`)

        const sent = await sentFor(message)
        const system = sent.body.messages[0].content
        assert.match(system, /helping a STUDENT/)
        assert.match(system, /STUDENT: S\. Mathebula/)
        for (const code of ["ISJ107V", "SEC117V", "DTD117V"]) assert.ok(system.includes(code), `Prompt should mention ${code}`)
        assert.match(system, /Next class: (ISJ107V|SEC117V|DTD117V) on \w+day at/)
        assert.match(system, /Attendance rate: \d+%/)
        assert.ok(!system.includes(FIXTURES.student2.name), "Another student's name must not be sent")
        assert.ok(!system.includes("password"))
    })

    test("CHAT-04 a lecturer's question includes their modules and at-risk students", async () => {
        const message = unique("Who is at risk?")
        const res = await ask(FIXTURES.lecturer.id, message)
        assert.equal(res.status, 200, res.data.message)

        const system = (await sentFor(message)).body.messages[0].content
        assert.match(system, /helping a LECTURER/)
        assert.match(system, /LECTURER: Dr\. S\. Khumalo/)
        assert.match(system, /Modules taught: .*ISJ107V/)
        assert.match(system, /At-risk students \(medium\/high risk\):/)
        assert.match(system, /Total at-risk count: \d+/)
        assert.match(system, /Average attendance across all your modules: (\d+%|No sessions logged yet\.)/)
    })

    test("CHAT-05 topics a student scored badly on are passed so the assistant can explain them", async () => {
        const topic = unique("Pointer arithmetic")
        const session = await createSession({ topic })
        const code = await generateCode(session.id)
        assert.equal((await markAttendance(code)).status, 201)

        const quiz = await request(`/api/lecturer/sessions/${session.id}/quiz?userId=${FIXTURES.lecturer.id}`)
        const wrong = quiz.data.questions.map((q) => (q.answerIndex + 1) % 4)
        const submitted = await request(`/api/student/sessions/${session.id}/quiz`, { method: "POST", body: { userId: FIXTURES.student.id, answers: wrong } })
        assert.equal(submitted.data.rating, 1)

        const message = unique("Explain what I got wrong")
        assert.equal((await ask(FIXTURES.student.id, message)).status, 200)
        const system = (await sentFor(message)).body.messages[0].content
        assert.ok(system.includes(`"${topic}" (1/5)`), "The low-scoring topic should be in the prompt")
    })

    test("CHAT-06 Groq is called with the API key as a bearer token and the configured model", async () => {
        const message = unique("Hello there")
        await ask(FIXTURES.student.id, message)
        const sent = await sentFor(message)
        assert.equal(sent.authorization, "Bearer test-key")
        assert.equal(sent.body.model, "openai/gpt-oss-120b")
        assert.equal(sent.body.temperature, 0.3)
        assert.equal(sent.body.max_tokens, 500)
    })

    test("CHAT-08 a student with no modules, classes or marks still gets an answer", async () => {
        const { createStudent } = require("./helpers/fixtures.js")
        const student = await createStudent("New starter")
        const message = unique("What should I do first?")
        const res = await ask(student.id, message)
        assert.equal(res.status, 200, res.data.message)

        const system = (await sentFor(message)).body.messages[0].content
        assert.match(system, /Enrolled modules: none/)
        assert.match(system, /Next class: No timetable entries found\./)
        assert.match(system, /Next assignment due: Nothing currently due\./)
        assert.match(system, /Attendance rate: 100%/)
        assert.match(system, /Topics rated poorly understood \(1-2 out of 5\): None recorded\./)
    })

    test("CHAT-07 when Groq fails the assistant returns a friendly 502", async () => {
        const res = await ask(FIXTURES.student.id, `${unique("Break")} [[HTTP_500]]`)
        assert.equal(res.status, 502)
        assert.match(res.data.message, /temporarily unavailable/)
    })
})
