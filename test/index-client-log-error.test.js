const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexSource = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");

assert(indexSource.includes('res.status(400).send({ status: "fail", message: e.message })'));
assert(indexSource.includes('logger.error("client log upload failed"'));
assert(indexSource.includes('res.status(500).send({ status: "fail", message: e.message })'));

console.log("index client log error tests passed");
