const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexSource = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");

assert(indexSource.includes('expressObject.get("/snapshot/:roomId"'));
assert(indexSource.includes('expressObject.get("/v2/snapshot/:roomId"'));
assert(indexSource.includes('validateRoomId(req.params.roomId)'));
assert(indexSource.includes('next(e)') || indexSource.includes('res.status(400).send({ status: "fail", message: e.message })'));

console.log("index snapshot url error tests passed");
