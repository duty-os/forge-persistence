const assert = require("assert");
const { validateConfig } = require("../deploy/scripts/validate-config.js");

const bootstrapConfig = {
  configVersion: 2,
  serviceType: "localFile",
  deployMode: "app",
  publicBaseUrl: "",
  bootstrapPublicUrl: true,
  admin: {
    token: "a".repeat(32),
    allowRemoteAccess: false,
  },
  tls: {
    enabled: false,
    certPath: "./config/tls.crt",
    keyPath: "./config/tls.key",
  },
  rtm: {
    appId: "project-appid",
    appCertificate: "project-appcertificate",
    bootstrapMode: true,
  },
  localFile: {
    snapshotDataPath: "./data",
    logFilePath: "./logs/server.log",
    clientlogPath: "./logs/clientlogs",
  },
};

assert.doesNotThrow(() => validateConfig(bootstrapConfig, { strict: false, mode: "app" }));
assert.doesNotThrow(() => validateConfig({ ...bootstrapConfig, deployMode: "nginx", tls: { enabled: true, certPath: "./config/tls.crt", keyPath: "./config/tls.key" } }, { strict: false, mode: "nginx" }));
assert.throws(() => validateConfig(bootstrapConfig, { strict: true, mode: "app" }), /RTM/i);
assert.throws(
  () => validateConfig({ ...bootstrapConfig, bootstrapPublicUrl: false }, { strict: false, mode: "app" }),
  /public base url/i
);
assert.throws(
  () => validateConfig({ ...bootstrapConfig, deployMode: "nginx", tls: { enabled: true, certPath: "", keyPath: "./config/tls.key" } }, { strict: false, mode: "nginx" }),
  /tls/i
);

console.log("validate config tests passed");
