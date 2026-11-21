// Turns the raw V8 coverage files that Node writes (NODE_V8_COVERAGE) into
// line, function, block and per-route coverage for server.js. No npm packages:
// V8 already counts how often every function and block ran; this file just maps
// those counts back onto the source lines.

const fs = require("node:fs")
const path = require("node:path")
const { fileURLToPath } = require("node:url")

// Marks the characters that are real code: not whitespace, not comments, and
// not the text inside template literals (multi-line SQL), whose lines are part
// of a single statement rather than statements of their own.
function codeMask(source) {
    const mask = new Uint8Array(source.length)
    const templateBraceStack = []
    let braceDepth = 0
    let state = "code"
    let i = 0

    while (i < source.length) {
        const ch = source[i]
        const next = source[i + 1]

        if (state === "code") {
            if (ch === "/" && next === "/") { state = "line"; i += 2; continue }
            if (ch === "/" && next === "*") { state = "block"; i += 2; continue }
            if (ch === "'" || ch === "\"") { state = ch; mask[i] = 1; i++; continue }
            if (ch === "`") { state = "template"; mask[i] = 1; i++; continue }
            if (ch === "{") braceDepth++
            if (ch === "}") {
                if (templateBraceStack.length && templateBraceStack[templateBraceStack.length - 1] === braceDepth) {
                    templateBraceStack.pop()
                    braceDepth--
                    state = "template"
                    mask[i] = 1
                    i++
                    continue
                }
                braceDepth--
            }
            if (!/\s/.test(ch)) mask[i] = 1
            i++
            continue
        }

        if (state === "line") {
            if (ch === "\n") state = "code"
            i++
            continue
        }

        if (state === "block") {
            if (ch === "*" && next === "/") { state = "code"; i += 2; continue }
            i++
            continue
        }

        if (state === "'" || state === "\"") {
            mask[i] = 1
            if (ch === "\\") { mask[i + 1] = 1; i += 2; continue }
            if (ch === state || ch === "\n") state = "code"
            i++
            continue
        }

        // template literal text
        if (ch === "\\") { i += 2; continue }
        if (ch === "`") { mask[i] = 1; state = "code"; i++; continue }
        if (ch === "$" && next === "{") {
            mask[i] = 1
            mask[i + 1] = 1
            braceDepth++
            templateBraceStack.push(braceDepth)
            state = "code"
            i += 2
            continue
        }
        i++
    }

    return mask
}

function lineStarts(source) {
    const starts = [0]
    for (let i = 0; i < source.length; i++) {
        if (source[i] === "\n") starts.push(i + 1)
    }
    return starts
}

function samePath(a, b) {
    const normalise = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase()
    return normalise(a) === normalise(b)
}

function readScriptCoverage(coverageDir, sourceFile) {
    const scripts = []
    if (!fs.existsSync(coverageDir)) return scripts

    for (const name of fs.readdirSync(coverageDir)) {
        if (!name.endsWith(".json")) continue
        const raw = JSON.parse(fs.readFileSync(path.join(coverageDir, name), "utf8"))
        for (const script of raw.result || []) {
            if (!script.url || !script.url.startsWith("file:")) continue
            if (samePath(fileURLToPath(script.url), sourceFile)) scripts.push(script)
        }
    }
    return scripts
}

function computeCoverage(coverageDir, sourceFile) {
    const source = fs.readFileSync(sourceFile, "utf8")
    const mask = codeMask(source)
    const starts = lineStarts(source)
    const scripts = readScriptCoverage(coverageDir, sourceFile)

    if (scripts.length === 0) {
        return { processes: 0, error: "No coverage data was written for server.js." }
    }

    // One count per character, summed over every server process.
    const combined = new Float64Array(source.length)
    const functions = new Map()
    const blocks = new Map()

    for (const script of scripts) {
        const perChar = new Float64Array(source.length)
        const ranges = []

        for (const fn of script.functions) {
            fn.ranges.forEach((range, index) => {
                ranges.push(range)
                const key = `${range.startOffset}:${range.endOffset}`
                const table = index === 0 ? functions : blocks
                const entry = table.get(key) || { start: range.startOffset, end: range.endOffset, count: 0, name: fn.functionName }
                entry.count += range.count
                table.set(key, entry)
            })
        }

        // Paint outer ranges first so the innermost range decides each character.
        ranges.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset))
        for (const range of ranges) {
            perChar.fill(range.count, range.startOffset, Math.min(range.endOffset, source.length))
        }
        for (let i = 0; i < source.length; i++) combined[i] += perChar[i]
    }

    // The module wrapper itself is not a "function" anyone wrote.
    for (const [key, entry] of functions) {
        if (entry.start === 0 && entry.end >= source.length - 1) functions.delete(key)
    }

    const lines = []
    for (let line = 0; line < starts.length; line++) {
        const start = starts[line]
        const end = line + 1 < starts.length ? starts[line + 1] : source.length
        let hasCode = false
        let maxCount = 0
        for (let i = start; i < end; i++) {
            if (!mask[i]) continue
            hasCode = true
            if (combined[i] > maxCount) maxCount = combined[i]
        }
        lines.push({ number: line + 1, hasCode, covered: hasCode && maxCount > 0 })
    }

    const codeLines = lines.filter((l) => l.hasCode)
    const coveredLines = codeLines.filter((l) => l.covered)
    const functionList = [...functions.values()]
    const blockList = [...blocks.values()]

    const pct = (covered, total) => (total === 0 ? 100 : Number(((covered / total) * 100).toFixed(1)))

    // Group consecutive uncovered code lines into ranges like [120, 124].
    const uncovered = []
    for (const l of codeLines) {
        if (l.covered) continue
        const last = uncovered[uncovered.length - 1]
        const previousCodeLine = codeLines[codeLines.indexOf(l) - 1]
        if (last && previousCodeLine && !previousCodeLine.covered && last[1] === previousCodeLine.number) {
            last[1] = l.number
        } else {
            uncovered.push([l.number, l.number])
        }
    }

    // Per-route: how many requests each handler served, and its line coverage.
    const lineOf = (offset) => {
        let lo = 0
        let hi = starts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (starts[mid] <= offset) lo = mid
            else hi = mid - 1
        }
        return lo + 1
    }

    const routeMatches = []
    const routeRegex = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g
    let match
    while ((match = routeRegex.exec(source))) {
        if (!mask[match.index]) continue
        routeMatches.push({ method: match[1].toUpperCase(), path: match[2], offset: match.index })
    }

    const routes = routeMatches.map((route, index) => {
        const spanEnd = index + 1 < routeMatches.length ? routeMatches[index + 1].offset : source.length
        const handler = functionList
            .filter((f) => f.start > route.offset && f.start < spanEnd)
            .sort((a, b) => a.start - b.start)[0]
        const firstLine = lineOf(route.offset)
        const lastLine = lineOf(handler ? handler.end : spanEnd)
        const spanLines = codeLines.filter((l) => l.number >= firstLine && l.number <= lastLine)
        return {
            method: route.method,
            path: route.path,
            line: firstLine,
            requests: handler ? handler.count : 0,
            lines: { covered: spanLines.filter((l) => l.covered).length, total: spanLines.length }
        }
    })

    return {
        processes: scripts.length,
        file: path.basename(sourceFile),
        lines: { covered: coveredLines.length, total: codeLines.length, pct: pct(coveredLines.length, codeLines.length) },
        functions: {
            covered: functionList.filter((f) => f.count > 0).length,
            total: functionList.length,
            pct: pct(functionList.filter((f) => f.count > 0).length, functionList.length)
        },
        blocks: {
            covered: blockList.filter((b) => b.count > 0).length,
            total: blockList.length,
            pct: pct(blockList.filter((b) => b.count > 0).length, blockList.length)
        },
        routes,
        uncovered
    }
}

module.exports = { computeCoverage, codeMask }
