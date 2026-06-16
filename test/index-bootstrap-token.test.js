const assert = require("assert");
const { createBootstrapTokenError } = require("../lib/bootstrap");

const err = createBootstrapTokenError("rtm credentials are placeholders");
assert.strictEqual(err.status, 503);
assert(/RTM/i.test(err.message));

console.log("bootstrap token tests passed");
