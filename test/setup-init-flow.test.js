const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forge-private-init-"));
const deployRoot = path.join(tempRoot, "deploy");

fs.cpSync(path.join(root, "deploy"), deployRoot, { recursive: true });

execFileSync("bash", ["./setup.sh", "init", "app"], { cwd: deployRoot, stdio: "pipe" });

const configPath = path.join(deployRoot, "config", "app.json");
const overridePath = path.join(deployRoot, "docker-compose.override.yaml");
assert(fs.existsSync(configPath));
assert(fs.existsSync(overridePath));

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
assert.strictEqual(config.deployMode, "app");
assert.strictEqual(typeof config.admin.token, "string");
assert.strictEqual(config.admin.token.length, 64);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("setup init flow tests passed");
