const assert = require("assert");
const {
  resolvePublicBaseUrl,
  snapshotDownloadPath,
  snapshotPublicUrl,
} = require("../lib/url");

function request(protocol, host) {
  return {
    protocol,
    get(name) {
      return name.toLowerCase() === "host" ? host : undefined;
    },
  };
}

assert.strictEqual(
  resolvePublicBaseUrl(request("http", "10.0.0.12"), { publicBaseUrl: "https://white.example.com/" }),
  "https://white.example.com"
);
assert.strictEqual(
  resolvePublicBaseUrl(request("http", "10.0.0.12"), { publicBaseUrl: "", bootstrapPublicUrl: true }),
  "http://10.0.0.12"
);
assert.throws(
  () => resolvePublicBaseUrl(request("http", "10.0.0.12"), { publicBaseUrl: "", bootstrapPublicUrl: false }),
  /public base url/i
);
assert.strictEqual(snapshotDownloadPath("room-001"), "/room-001/snapshots/latest.snapshot");
assert.strictEqual(
  snapshotPublicUrl(request("http", "10.0.0.12"), { publicBaseUrl: "", bootstrapPublicUrl: true }, "room-001"),
  "http://10.0.0.12/room-001/snapshots/latest.snapshot"
);
assert.throws(
  () => resolvePublicBaseUrl(request("http", undefined), { publicBaseUrl: "", bootstrapPublicUrl: true }),
  /missing Host header/
);

console.log("url tests passed");
