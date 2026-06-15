const assert = require("assert");
const { mergeConfig } = require("../deploy/scripts/config-merge.js");

const existing = {
  configVersion: 1,
  snapshotHost: "http://host:3000",
  adminToken: "b".repeat(32),
  rtm: {
    appId: "real-app-id",
    appCertificate: "real-app-cert",
  },
  serviceType: "localFile",
};

const defaults = {
  configVersion: 2,
  publicBaseUrl: "",
  admin: {
    token: "",
    allowRemoteAccess: false,
  },
  rtm: {
    appId: "project-appid",
    appCertificate: "project-appcertificate",
    bootstrapMode: true,
  },
  serviceType: "localFile",
};

const merged = mergeConfig(existing, defaults);
assert.strictEqual(merged.publicBaseUrl, "http://host:3000");
assert.strictEqual(merged.admin.token, "b".repeat(32));
assert.strictEqual(merged.configVersion, 2);
assert.strictEqual(merged.rtm.bootstrapMode, false);

console.log("config merge tests passed");
