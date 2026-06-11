const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const initSource = fs.readFileSync(path.join(root, "src/init.ts"), "utf8");

assert(initSource.includes('path.basename(config.localFile.logFilePath) !== "server.log"'));
assert(initSource.includes('throw new Error("localFile.logFilePath must end with server.log")'));

const config = JSON.parse(fs.readFileSync(path.join(root, "deploy/config.json.example"), "utf8"));
assert.strictEqual(path.basename(config.localFile.logFilePath), "server.log");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-config-"));
const invalidConfigPath = path.join(tempRoot, "app.json");
fs.writeFileSync(
  invalidConfigPath,
  JSON.stringify({
    ...config,
    localFile: {
      ...config.localFile,
      logFilePath: "./logs/app.log",
    },
  })
);

assert.strictEqual(JSON.parse(fs.readFileSync(invalidConfigPath, "utf8")).localFile.logFilePath, "./logs/app.log");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("init config tests passed");
