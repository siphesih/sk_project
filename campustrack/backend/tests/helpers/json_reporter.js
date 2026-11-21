// node:test reporter that writes one JSON line per finished test or suite.
// The runner uses it to build tests/results/results.json for the test report.
const path = require("node:path")

module.exports = async function* jsonReporter(source) {
    for await (const event of source) {
        if (event.type !== "test:pass" && event.type !== "test:fail") continue

        const data = event.data
        const error = data.details?.error
        const cause = error?.cause

        yield `${JSON.stringify({
            status: event.type === "test:pass" ? (data.skip ? "skipped" : "passed") : "failed",
            name: data.name,
            kind: data.details?.type || "test",
            nesting: data.nesting,
            file: data.file ? path.basename(data.file) : null,
            durationMs: Number((data.details?.duration_ms || 0).toFixed(1)),
            error: error ? String(cause?.message || error.message || error).slice(0, 2000) : null
        })}\n`
    }
}
