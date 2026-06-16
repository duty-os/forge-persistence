const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const config = JSON.parse(read("deploy/config.json.example"));
assert.strictEqual(config.serviceType, "localFile");
assert.strictEqual(config.configVersion, 2);
assert.strictEqual(config.deployMode, "app");
assert.strictEqual(config.diskRetention.enabled, true);
assert.strictEqual(config.diskRetention.intervalHours, 1);
assert.strictEqual(config.diskRetention.maxLogGB, 2);
assert.strictEqual(config.diskRetention.maxSnapshotGB, 10);
assert.strictEqual(config.diskRetention.allowDeleteLatestSnapshot, false);
assert.strictEqual(config.diskRetention.serverLogMaxMB, 100);
assert.strictEqual(config.bootstrapPublicUrl, true);
assert.strictEqual(typeof config.admin.token, "string");
assert.strictEqual(config.admin.allowRemoteAccess, false);
assert.strictEqual(config.tls.enabled, false);
assert.strictEqual(config.tls.certPath, "./config/tls/tls.crt");
assert.strictEqual(config.tls.keyPath, "./config/tls/tls.key");

const nginxConf = read("deploy/nginx.conf");
assert(nginxConf.includes("nginx.http.conf"));
assert(nginxConf.includes("nginx.https.conf"));

const nginxHttpConf = read("deploy/nginx.http.conf");
assert(nginxHttpConf.includes("listen 80"));
assert(nginxHttpConf.includes("upstream forge_persistence_upstream"));
assert(nginxHttpConf.includes("proxy_pass http://forge_persistence_upstream;"));
assert(!nginxHttpConf.includes("listen 443 ssl"));
assert(nginxHttpConf.includes("location /admin/"));
assert(nginxHttpConf.includes("return 403;"));

const nginxHttpsConf = read("deploy/nginx.https.conf");
assert(nginxHttpsConf.includes("listen 80"));
assert(nginxHttpsConf.includes("listen 443 ssl"));
assert(nginxHttpsConf.includes("ssl_certificate /etc/nginx/tls/tls.crt;"));
assert(nginxHttpsConf.includes("ssl_certificate_key /etc/nginx/tls/tls.key;"));
assert(nginxHttpsConf.includes("proxy_pass http://forge_persistence_upstream;"));

const appCompose = read("deploy/docker-compose.base.app.yaml");
assert(appCompose.includes("forge-persistence:"));
assert(!appCompose.includes("nginx:"));
assert(appCompose.includes('"3000:3000"') || appCompose.includes("'3000:3000'"));
assert(appCompose.includes('driver: "json-file"'));
assert(appCompose.includes('max-size: "50m"'));
assert(appCompose.includes('max-file: "3"'));

const nginxCompose = read("deploy/docker-compose.base.nginx.yaml");
assert(nginxCompose.includes("forge-persistence:"));
assert(nginxCompose.includes("nginx:"));
assert(nginxCompose.includes("nginx:1.27.5-alpine"));
assert(!nginxCompose.includes("nginx:latest"));
assert(!nginxCompose.includes('"3000:3000"'));
assert(!nginxCompose.includes("'3000:3000'"));
assert(nginxCompose.includes('"80:80"') || nginxCompose.includes("'80:80'"));
assert(nginxCompose.includes('"443:443"') || nginxCompose.includes("'443:443'"));
assert(nginxCompose.includes("./config/tls"));
assert(nginxCompose.includes('driver: "json-file"'));
assert(nginxCompose.includes('max-size: "50m"'));
assert(nginxCompose.includes('max-file: "3"'));

const overrideCompose = read("deploy/docker-compose.override.yaml.example");
assert(overrideCompose.includes("services:"));

const setup = read("deploy/setup.sh");
assert(setup.includes('COMMAND="${1:-setup}"'));
assert(setup.includes('"init")'));
assert(setup.includes('"setup")'));
assert(setup.includes('"upgrade")'));
assert(setup.includes('"doctor")'));
assert(setup.includes('"smoke")'));
assert(setup.includes("nginx.tar"));
assert(setup.includes('docker-compose.base.${mode}.yaml'));
assert(setup.includes("docker-compose.override.yaml"));
assert(setup.includes("config/tls"));
assert(setup.includes("render_nginx_config"));
assert(setup.includes("tls.enabled"));
assert(setup.includes("nginx.http.conf"));
assert(setup.includes("nginx.https.conf"));
assert(setup.includes("scripts/docker-common.sh"));
assert(setup.includes("tls certificates must stay under ./config/tls"));
assert(setup.includes('[ -f "$cert_path" ]'));
assert(setup.includes('[ -f "$key_path" ]'));

console.log("deploy config tests passed");
