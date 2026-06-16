const assert = require("assert");
const path = require("path");

const initSource = require("fs").readFileSync(path.join(__dirname, "..", "src", "init.ts"), "utf8");
const bootstrapSource = require("fs").readFileSync(path.join(__dirname, "..", "src", "bootstrap.ts"), "utf8");

assert(initSource.includes("rawConfig.rtm?.appId"));
assert(initSource.includes("rawConfig.rtm?.appCertificate"));
assert(initSource.includes("bootstrapMode: rawConfig.rtm?.bootstrapMode ??"));
assert(initSource.includes("!rawConfig.rtm?.appId"));
assert(initSource.includes("!rawConfig.rtm?.appCertificate"));

assert(bootstrapSource.includes("config.rtm?.bootstrapMode === true"));
assert(bootstrapSource.includes("!config.rtm?.appId"));
assert(bootstrapSource.includes("!config.rtm?.appCertificate"));
assert(bootstrapSource.includes('config.rtm?.appId === "project-appid"'));
assert(bootstrapSource.includes('config.rtm?.appCertificate === "project-appcertificate"'));

console.log("bootstrap config tests passed");
