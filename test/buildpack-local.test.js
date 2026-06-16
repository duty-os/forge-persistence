const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildpackLocal = fs.readFileSync(path.join(root, "buildpack-local.sh"), "utf8");

assert(buildpackLocal.includes("/private/tmp/forge-persistence-package"));
assert(buildpackLocal.includes("sed -i.bak"));
assert(buildpackLocal.includes("STAGE_DIR=/private/tmp/forge-persistence-package"));
assert(buildpackLocal.includes('tar -czvf forge-persistence-private-$VERSION-install.tar -C "$STAGE_DIR" forge-persistence'));
assert(buildpackLocal.includes("perl -0pe"));
assert(buildpackLocal.includes("forge-persistence-private:$VERSION"));
assert(!buildpackLocal.includes("forge-persistence-private:latest"));

console.log("buildpack local tests passed");
