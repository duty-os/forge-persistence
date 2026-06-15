const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexSource = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");

assert(indexSource.includes('logger.error("snapshot upload failed"'));
assert(indexSource.includes('res.status(400).send({ status: "fail", message: e.message })'));
assert(indexSource.includes('res.status(500).send({ status: "fail", message: e.message })'));
assert(indexSource.includes('if (e instanceof Error && e.message === "invalid roomId")'));

console.log("index snapshot error tests passed");
