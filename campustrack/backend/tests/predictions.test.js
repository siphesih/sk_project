const { describe, test, before, after } = require("node:test")
const assert = require("node:assert/strict")
const { FIXTURES, request, query, setMlMode, mlStats } = require("./helpers/context.js")
const { createCohort } = require("./helpers/fixtures.js")

describe("Lecturer: ML risk predictions", () => {
    let cohort
    const path = () => `/api/lecturer/modules/${cohort.module.code}/predictions?userId=${FIXTURES.lecturer.id}`
    const storedRows = () => query(
        `SELECT student_id, predicted_grade, risk_level, confidence FROM predictions WHERE module_id = ? ORDER BY student_id`,
        [cohort.module.id]
    )

    before(async () => {
        await setMlMode("ok")
        cohort = await createCohort()
    })

    after(async () => {
        await setMlMode("ok")
    })

    test("PRED-01 predictions are requested from the ML service for every enrolled student and stored", async () => {
        const callsBefore = (await mlStats()).calls
        const res = await request(path())
        assert.equal(res.status, 200, res.data.message)
        assert.equal(res.data.length, 3)
        assert.equal((await mlStats()).calls - callsBefore, 3, "One ML call per student")

        const byId = Object.fromEntries(res.data.map((r) => [r.id, r.prediction]))
        assert.equal(byId[cohort.students.good.id].riskLevel, "Low")
        assert.equal(byId[cohort.students.medium.id].riskLevel, "Medium")
        assert.equal(byId[cohort.students.high.id].riskLevel, "High")
        assert.equal(byId[cohort.students.high.id].predictedOutcome, "fail")

        const rows = await storedRows()
        assert.equal(rows.length, 3)
        for (const row of rows) {
            assert.ok(["low", "medium", "high"].includes(row.risk_level))
            assert.ok(["pass", "fail"].includes(row.predicted_grade))
            assert.ok(Number.isInteger(row.confidence) && row.confidence >= 0 && row.confidence <= 100)
        }
    })

    test("PRED-02 running predictions again updates the stored rows instead of adding duplicates", async () => {
        const again = await request(path())
        assert.equal(again.status, 200, again.data.message)
        const rows = await storedRows()
        assert.equal(rows.length, 3, "Still one stored prediction per student")
    })

    test("PRED-03 if the ML service returns an error the lecturer gets a clear 503", async () => {
        await setMlMode("error")
        const res = await request(path())
        assert.equal(res.status, 503)
        assert.match(res.data.message, /prediction service/i)
        assert.equal((await storedRows()).length, 3)
    })

    test("PRED-04 if the ML service is unreachable the lecturer gets a clear 503", async () => {
        await setMlMode("down")
        const res = await request(path())
        assert.equal(res.status, 503)
        assert.match(res.data.message, /prediction service/i)
        await setMlMode("ok")
    })

    test("PRED-05 predictions for an unknown module are a 404", async () => {
        const res = await request(`/api/lecturer/modules/NOPE999/predictions`)
        assert.equal(res.status, 404)
    })
})
