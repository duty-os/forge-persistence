const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const buildpack = fs.readFileSync(path.join(root, "buildpack.sh"), "utf8");

assert(!buildpack.includes("/private/tmp/forge-persistence-package"));
assert(!buildpack.includes("sed -i.bak"));
assert(buildpack.includes("deploy/docker-compose.base.app.yaml"));
assert(buildpack.includes("deploy/docker-compose.base.nginx.yaml"));
assert(buildpack.includes("docker-compose.override.yaml.example"));
assert(buildpack.includes("deploy/manifest.json"));
assert(buildpack.includes("> checksums.sha256"));
assert(buildpack.includes("shasum -a 256"));
assert(buildpack.includes("cd deploy"));
assert(buildpack.includes("nginx.http.conf"));
assert(buildpack.includes("nginx.https.conf"));
assert(buildpack.includes("scripts/print-next-steps.sh"));
assert(buildpack.includes("scripts/docker-common.sh"));

const manifestPath = path.join(root, "deploy", "manifest.json");
assert(fs.existsSync(manifestPath));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.strictEqual(manifest.configSchemaVersion, 2);
assert.deepStrictEqual(manifest.supportedModes, ["app", "nginx"]);
assert.strictEqual(typeof manifest.artifacts.appImageTar, "string");
assert.strictEqual(typeof manifest.artifacts.nginxImageTar, "string");

const checksumPath = path.join(root, "deploy", "checksums.sha256");
assert(fs.existsSync(checksumPath));
const checksumContent = fs.readFileSync(checksumPath, "utf8");
assert(checksumContent.includes("manifest.json"));
const checksumEntries = checksumContent
  .trim()
  .split("\n")
  .map((line) => line.trim().split(/\s+/).slice(1).join(" "));
const checksumArtifacts = checksumEntries.filter((entry) => /\.tar$/.test(entry));
assert(checksumArtifacts.length > 0);
if (checksumArtifacts.every((entry) => fs.existsSync(path.join(root, "deploy", entry)))) {
  execFileSync("shasum", ["-a", "256", "-c", "checksums.sha256"], {
    cwd: path.join(root, "deploy"),
    stdio: "pipe",
  });
}

console.log("buildpack tests passed");
