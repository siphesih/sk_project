// Local stand-ins for the two external services the API calls, so the tests run
// offline, need no API key, and can force error cases on purpose.
//
//  - Mock Groq:  answers the chatbot and the quiz generator like the real
//                chat-completions endpoint. Markers in the request text trigger
//                failures: [[HTTP_500]], [[MALFORMED_ONCE]], [[ALWAYS_MALFORMED]].
//                GET /__requests returns every request received (for assertions).
//  - Mock ML:    behaves like campustrack_ml_model/predict_service.py.
//                POST /__mode {"mode":"ok"|"error"|"down"} switches its behaviour.

const http = require("node:http")

function readJson(req) {
    return new Promise((resolve) => {
        let body = ""
        req.on("data", (chunk) => { body += chunk })
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : null)
            } catch {
                resolve(null)
            }
        })
        req.on("error", () => resolve(null))
    })
}

function send(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify(data))
}

function listen(server) {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address()
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((done) => {
                    server.closeAllConnections()
                    server.close(() => done())
                })
            })
        })
    })
}

function buildQuiz(topic) {
    return {
        questions: Array.from({ length: 10 }, (_, i) => ({
            question: `Question ${i + 1} about ${topic}?`,
            options: [`Right answer ${i + 1}`, `Wrong answer ${i + 1}a`, `Wrong answer ${i + 1}b`, `Wrong answer ${i + 1}c`],
            answerIndex: 0,
            explanation: `Explanation ${i + 1}.`
        }))
    }
}

function startMockGroq() {
    const requests = []
    const malformedOnceSeen = new Map()

    const server = http.createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/__requests") return send(res, 200, requests)

        const body = await readJson(req)
        const system = body?.messages?.[0]?.content || ""
        const user = body?.messages?.[1]?.content || ""
        requests.push({ path: req.url, authorization: req.headers.authorization || null, body })

        if (`${system}\n${user}`.includes("[[HTTP_500]]")) {
            return send(res, 500, { error: { message: "Mock Groq failure" } })
        }

        const reply = (content) => send(res, 200, { choices: [{ message: { role: "assistant", content } }] })

        if (system.includes("multiple-choice quizzes")) {
            const topic = (user.match(/Lecture topic: (.*)/) || [])[1] || "the topic"

            if (user.includes("[[ALWAYS_MALFORMED]]")) {
                return reply(JSON.stringify({ questions: buildQuiz(topic).questions.slice(0, 3) }))
            }
            if (user.includes("[[MALFORMED_ONCE]]")) {
                const seen = (malformedOnceSeen.get(user) || 0) + 1
                malformedOnceSeen.set(user, seen)
                if (seen === 1) return reply("Sorry, here is your quiz: not valid JSON")
            }
            return reply(JSON.stringify(buildQuiz(topic)))
        }

        return reply(`Mock assistant reply to: ${user}`)
    })

    return listen(server)
}

function startMockMl() {
    let mode = "ok"
    let calls = 0

    const server = http.createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/__mode") {
            const body = await readJson(req)
            mode = body?.mode || "ok"
            return send(res, 200, { mode })
        }
        if (req.method === "GET" && req.url === "/__stats") return send(res, 200, { mode, calls })
        if (req.method === "GET" && req.url === "/health") return send(res, 200, { status: "ok", model: "mock" })

        if (req.method === "POST" && req.url === "/predict") {
            calls++
            if (mode === "down") {
                req.socket.destroy()
                return
            }
            if (mode === "error") return send(res, 500, { error: "Mock ML failure" })

            const data = (await readJson(req)) || {}
            const features = ["attendance_pct", "avg_understanding_rating", "avg_ca_mark_pct"]
            const missing = features.filter((f) => !(f in data))
            if (missing.length) return send(res, 400, { error: `Missing fields: ${missing.join(", ")}` })

            const values = features.map((f) => Number(data[f]))
            if (values.some((v) => !Number.isFinite(v))) return send(res, 400, { error: "All fields must be numeric." })

            const [attendance, rating, mark] = values
            const passProbability = Math.min(1, Math.max(0, 0.35 * attendance / 100 + 0.25 * rating / 5 + 0.4 * mark / 100))
            const riskLevel = passProbability >= 0.7 ? "Low" : passProbability >= 0.45 ? "Medium" : "High"

            return send(res, 200, {
                passProbability: Number(passProbability.toFixed(4)),
                predictedOutcome: passProbability >= 0.5 ? "pass" : "fail",
                riskLevel,
                confidence: Number((Math.abs(passProbability - 0.5) * 2).toFixed(4))
            })
        }

        send(res, 404, { error: "Not found" })
    })

    return listen(server)
}

module.exports = { startMockGroq, startMockMl }
