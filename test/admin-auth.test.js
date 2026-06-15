const assert = require("assert");
const { ADMIN_TOKEN_PLACEHOLDER, hasAdminAccess } = require("../lib/admin-auth");

assert.strictEqual(hasAdminAccess({ token: undefined, expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: "wrong", expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: ["secret"], expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: undefined }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: "" }), false);
assert.strictEqual(hasAdminAccess({ token: ADMIN_TOKEN_PLACEHOLDER, expectedToken: ADMIN_TOKEN_PLACEHOLDER }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: "secret" }), true);

console.log("admin auth tests passed");
