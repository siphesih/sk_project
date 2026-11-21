// Starts server.js inside a child process that the test runner controls.
// The runner sends "shutdown" when the tests finish; exiting cleanly (instead of
// being killed) is what lets Node write the V8 code-coverage files.
process.on("message", (message) => {
    if (message === "shutdown") process.exit(0)
})

require("../../server.js")
