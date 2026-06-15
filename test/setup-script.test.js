const assert = require("assert");
const fs = require("fs");
const path = require("path");

const setup = fs.readFileSync(path.join(__dirname, "..", "deploy", "setup.sh"), "utf8");

assert(setup.includes('COMMAND="${1:-setup}"'));
assert(setup.includes("run_init()"));
assert(setup.includes("run_setup()"));
assert(setup.includes("run_upgrade()"));
assert(setup.includes("run_doctor()"));
assert(setup.includes("run_smoke()"));
assert(setup.includes("verify_package()"));
assert(setup.includes("checksums.sha256"));
assert(setup.includes("manifest.json"));
assert(setup.includes("run_docker()"));
assert(setup.includes("run_docker_compose()"));
assert(setup.includes("run_init \"$mode\""));

console.log("setup script tests passed");
