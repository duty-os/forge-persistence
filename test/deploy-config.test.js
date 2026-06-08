const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const config = JSON.parse(read("deploy/config.json.example"));
assert.strictEqual(config.serviceType, "localFile");
assert.strictEqual(config.diskRetention.enabled, true);
assert.strictEqual(config.diskRetention.intervalHours, 1);
assert.strictEqual(config.diskRetention.maxLogGB, 2);
assert.strictEqual(config.diskRetention.maxSnapshotGB, 10);
assert.strictEqual(config.diskRetention.allowDeleteLatestSnapshot, false);
assert.strictEqual(config.diskRetention.serverLogMaxMB, 100);
assert.strictEqual(typeof config.adminToken, "string");
assert(config.adminToken.length >= 32);

const nginxConf = read("deploy/nginx.conf");
assert(nginxConf.includes("listen 80"));
assert(nginxConf.includes("proxy_pass http://forge-persistence:3000"));
assert(!nginxConf.includes("location /admin/"));
assert(!nginxConf.includes("return 404"));

const appCompose = read("deploy/docker-compose.app.yaml.example");
assert(appCompose.includes("forge-persistence:"));
assert(!appCompose.includes("nginx:"));
assert(appCompose.includes('"3000:3000"') || appCompose.includes("'3000:3000'"));
assert(appCompose.includes('driver: "json-file"'));
assert(appCompose.includes('max-size: "50m"'));
assert(appCompose.includes('max-file: "3"'));

const nginxCompose = read("deploy/docker-compose.nginx.yaml.example");
assert(nginxCompose.includes("forge-persistence:"));
assert(nginxCompose.includes("nginx:"));
assert(nginxCompose.includes("nginx:1.27.5-alpine"));
assert(!nginxCompose.includes("nginx:latest"));
assert(!nginxCompose.includes('"3000:3000"'));
assert(!nginxCompose.includes("'3000:3000'"));
assert(nginxCompose.includes('"80:80"') || nginxCompose.includes("'80:80'"));
assert(nginxCompose.includes('driver: "json-file"'));
assert(nginxCompose.includes('max-size: "50m"'));
assert(nginxCompose.includes('max-file: "3"'));

const setup = read("deploy/setup.sh");
assert(setup.includes('MODE="${1:-app}"'));
assert(setup.includes('"app")'));
assert(setup.includes('"nginx")'));
assert(setup.includes('COMPOSE_FILE="docker-compose.app.yaml"'));
assert(setup.includes('COMPOSE_FALLBACK="docker-compose.app.yaml.example"'));
assert(setup.includes('COMPOSE_FILE="docker-compose.nginx.yaml"'));
assert(setup.includes('COMPOSE_FALLBACK="docker-compose.nginx.yaml.example"'));
assert(setup.includes('if [ ! -f "$COMPOSE_FILE" ]; then'));
assert(setup.includes('COMPOSE_FILE="$COMPOSE_FALLBACK"'));
assert(setup.includes("nginx.tar"));
assert(setup.includes("Usage: ./setup.sh [nginx]"));
assert(setup.includes("cp -n config.json.example config/app.json"));
assert(setup.includes("cp -n nginx.conf config/nginx.conf"));

console.log("deploy config tests passed");
