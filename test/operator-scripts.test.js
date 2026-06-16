const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const doctor = fs.readFileSync(path.join(root, "deploy", "scripts", "doctor.sh"), "utf8");
const smoke = fs.readFileSync(path.join(root, "deploy", "scripts", "smoke-test.sh"), "utf8");
const setup = fs.readFileSync(path.join(root, "deploy", "setup.sh"), "utf8");
const checksum = fs.readFileSync(path.join(root, "deploy", "scripts", "checksum-verify.sh"), "utf8");
const nginxPointer = fs.readFileSync(path.join(root, "deploy", "nginx.conf"), "utf8");

assert(doctor.includes("checksums.sha256"));
assert(doctor.includes("validate-config.js"));
assert(doctor.includes("test -w config"));
assert(doctor.includes("df -k ."));
assert(doctor.includes("tls=enabled"));
assert(doctor.includes("cfg.tls.certPath"));
assert(doctor.includes("cfg.tls.keyPath"));
assert(doctor.includes("docker-common.sh"));
assert(doctor.includes("run_docker info"));
assert(doctor.includes("run_docker_compose version"));
assert(doctor.includes("checksum-verify.sh"));
assert(doctor.includes('SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"'));
assert(doctor.includes('cd "$SCRIPT_DIR/.."'));
assert(checksum.includes("sha256sum"));
assert(checksum.includes("shasum -a 256 -c"));

assert(smoke.includes("/snapshot/test-room"));
assert(smoke.includes("X-Admin-Token"));
assert(smoke.includes("/admin/disk/cleanup/status"));
assert(smoke.includes("https://127.0.0.1"));
assert(smoke.includes("docker-common.sh"));
assert(smoke.includes("run_docker_compose -f docker-compose.generated.yaml -f docker-compose.override.yaml exec"));
assert(!smoke.includes("docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml exec"));
assert(smoke.includes('SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"'));
assert(smoke.includes('cd "$SCRIPT_DIR/.."'));

assert(setup.includes('config/nginx.conf'));
assert(setup.includes('backup/nginx.conf'));
assert(setup.includes('config/tls'));
assert(setup.includes("checksum-verify.sh"));
assert(setup.includes('SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"'));
assert(setup.includes('cd "$SCRIPT_DIR"'));
assert(nginxPointer.includes("nginx.http.conf"));

console.log("operator script tests passed");
