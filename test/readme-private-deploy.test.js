const assert = require("assert");
const fs = require("fs");
const path = require("path");

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

assert(readme.includes("./setup.sh init app"));
assert(readme.includes("./setup.sh setup app"));
assert(readme.includes("./setup.sh doctor app"));
assert(readme.includes("./setup.sh smoke app"));
assert(readme.includes("./setup.sh upgrade app"));
assert(readme.includes("docker-compose.override.yaml"));
assert(readme.includes("自动生成"));
assert(readme.includes("bootstrap"));
assert(readme.includes("RTM"));
assert(readme.includes("/admin/*"));
assert(readme.includes("443"));
assert(readme.includes("tls.crt"));
assert(readme.includes("tls.key"));
assert(readme.includes("https://<ip>/path"));

console.log("readme private deploy tests passed");
