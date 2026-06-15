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

assert.strictEqual(resolvePublicBaseUrl(request("http", "10.0.0.12"), {}), "http://10.0.0.12");
assert.strictEqual(
  resolvePublicBaseUrl(request("http", "10.0.0.12"), { snapshotHost: "https://white.example.com/" }),
  "https://white.example.com"
);
assert.strictEqual(snapshotDownloadPath("room-001"), "/room-001/snapshots/latest.snapshot");
assert.strictEqual(
  snapshotPublicUrl(request("http", "10.0.0.12"), {}, "room-001"),
  "http://10.0.0.12/room-001/snapshots/latest.snapshot"
);
assert.throws(() => resolvePublicBaseUrl(request("http", undefined), {}), /missing Host header/);

console.log("url tests passed");
