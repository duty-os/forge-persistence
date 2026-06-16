const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const whiteboardDeployment = fs.readFileSync(path.join(root, "docs", "whiteboard-deployment-5.5.md"), "utf8");
const designZh = fs.readFileSync(path.join(root, "docs", "superpowers", "specs", "2026-06-15-private-deployment-final-design-zh.md"), "utf8");
const designEn = fs.readFileSync(path.join(root, "docs", "superpowers", "specs", "2026-06-15-private-deployment-final-design.md"), "utf8");

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
assert(readme.includes("config/tls/tls.crt"));
assert(readme.includes("config/tls/tls.key"));
assert(readme.includes("不要改成其他路径"));

assert(whiteboardDeployment.includes("config/tls/tls.crt"));
assert(whiteboardDeployment.includes("config/tls/tls.key"));
assert(designZh.includes("./config/tls/tls.crt"));
assert(designZh.includes("./config/tls/tls.key"));
assert(designZh.includes("只支持"));
assert(designEn.includes("./config/tls/tls.crt"));
assert(designEn.includes("./config/tls/tls.key"));
assert(designEn.includes("only supports"));

console.log("readme private deploy tests passed");
