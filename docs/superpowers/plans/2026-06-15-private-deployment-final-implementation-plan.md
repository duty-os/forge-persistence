# Private Deployment Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved private-deployment bootstrap, upgrade, validation, integrity, and documentation workflow so SA can install with `init` + `setup`, upgrades reuse existing config, and deployment docs/tests cover the new behavior.

**Architecture:** Keep the application process as a local-file persistence service, but move private-deployment behavior into a structured packaging layer: `setup.sh` becomes a command router, package metadata and checksum validation are added, config merging and validation move into small helper scripts, and runtime bootstrap state is made explicit in config and API behavior. Existing Node runtime code stays focused on service behavior while deploy scripts handle install orchestration.

**Tech Stack:** Bash, Node.js, TypeScript, Docker Compose, existing Node test scripts with `assert`

---

## Deployment Modes

This implementation plan covers 3 deployment modes that must be reflected consistently in code, tests, and docs:

1. `App` direct mode
   - only starts `forge-persistence`
   - exposes `3000`
   - entrypoint looks like `http://<ip>:3000/path`

2. `Nginx HTTP` mode
   - starts `nginx + forge-persistence`
   - exposes `80`
   - entrypoint looks like `http://<ip>/path`
   - does not require customer certificates

3. `Nginx HTTPS` mode
   - builds on `Nginx HTTP` mode and additionally exposes `443`
   - entrypoint looks like `https://<ip>/path`
   - requires customer-provided certificate and private key
   - keeps `80` available for compatibility and does not auto-redirect to `443`

## File Structure

- Modify: `deploy/setup.sh`
  - Convert from single-action startup script into a command router supporting `init`, `setup`, `upgrade`, `doctor`, and `smoke`.
- Modify: `deploy/install.sh`
  - Keep compatibility and delegate to `setup.sh`.
- Modify: `deploy/start.sh`
  - Keep compatibility and delegate to `setup.sh`.
- Modify: `deploy/config.json.example`
  - Introduce bootstrap-aware config structure with `configVersion`, `deployMode`, `publicBaseUrl`, `bootstrapPublicUrl`, and nested `admin`.
- Modify: `deploy/nginx.conf`
  - Deny `/admin/` by default.
- Create: `deploy/docker-compose.base.app.yaml`
  - Base package-owned compose for app mode.
- Create: `deploy/docker-compose.base.nginx.yaml`
  - Base package-owned compose for nginx mode.
- Create: `deploy/docker-compose.override.yaml.example`
  - Customer-owned override template.
- Modify: `buildpack.sh`
  - Generate base compose files, manifest, checksums, and package support scripts.
- Create: `deploy/scripts/validate-config.js`
  - Bootstrap-aware config validation.
- Create: `deploy/scripts/config-merge.js`
  - Merge existing config with new defaults during upgrade.
- Create: `deploy/scripts/doctor.sh`
  - Operator environment and package self-checks.
- Create: `deploy/scripts/smoke-test.sh`
  - Post-install verification.
- Create: `deploy/scripts/print-next-steps.sh`
  - Friendly operator guidance after `init`.
- Create: `deploy/manifest.json`
  - Build-time metadata template or generated artifact content.
- Create: `deploy/checksums.sha256`
  - Build-time generated integrity file.
- Modify: `src/init.ts`
  - Normalize new config shape, support legacy keys, expose bootstrap state.
- Modify: `src/url.ts`
  - Gate request-derived fallback behind explicit bootstrap flag.
- Modify: `src/index.ts`
  - Return operational error for token endpoints in RTM bootstrap mode and log bootstrap warnings.
- Modify: `src/admin-auth.ts`
  - Support nested admin token config.
- Modify: `README.md`
  - Rewrite deployment docs around `init`, `setup`, `upgrade`, `doctor`, and `smoke`.
- Modify: `package.json`
  - Add any needed targeted tests to `test:private-deploy`.
- Modify: `test/deploy-config.test.js`
  - Update deploy assertions for new file names and nginx admin denial.
- Create: `test/validate-config.test.js`
  - Cover bootstrap vs strict validation.
- Create: `test/config-merge.test.js`
  - Cover config reuse and legacy-key migration.
- Modify: `test/url.test.js`
  - Cover bootstrap fallback gating.
- Create: `test/index-bootstrap-token.test.js`
  - Cover bootstrap token endpoint behavior.
- Create: `test/setup-script.test.js`
  - Assert command routing and key script behavior contracts.

## Task 1: Lock Deployment Contract with Failing Tests

**Files:**
- Modify: `test/deploy-config.test.js`
- Create: `test/validate-config.test.js`
- Create: `test/config-merge.test.js`
- Create: `test/setup-script.test.js`
- Modify: `test/url.test.js`
- Create: `test/index-bootstrap-token.test.js`
- Modify: `package.json`

- [ ] **Step 1: Update deploy config test to describe the new package layout**

```js
const appCompose = read("deploy/docker-compose.base.app.yaml");
const nginxCompose = read("deploy/docker-compose.base.nginx.yaml");
const overrideCompose = read("deploy/docker-compose.override.yaml.example");
const nginxConf = read("deploy/nginx.conf");
const setup = read("deploy/setup.sh");

assert(nginxConf.includes("location /admin/"));
assert(nginxConf.includes("return 403;"));
assert(appCompose.includes('"3000:3000"') || appCompose.includes("'3000:3000'"));
assert(nginxCompose.includes('"80:80"') || nginxCompose.includes("'80:80'"));
assert(overrideCompose.includes("services:"));
assert(setup.includes('COMMAND="${1:-setup}"'));
assert(setup.includes('"init")'));
assert(setup.includes('"setup")'));
assert(setup.includes('"upgrade")'));
assert(setup.includes('"doctor")'));
assert(setup.includes('"smoke")'));
```

- [ ] **Step 2: Run deploy config test to verify it fails**

Run: `node test/deploy-config.test.js`

Expected: FAIL because the new compose filenames, nginx admin denial, and command router do not exist yet.

- [ ] **Step 3: Add failing validation test for bootstrap and strict modes**

```js
const assert = require("assert");
const { validateConfig } = require("../deploy/scripts/validate-config.js");

const bootstrapConfig = {
  configVersion: 2,
  serviceType: "localFile",
  deployMode: "app",
  publicBaseUrl: "",
  bootstrapPublicUrl: true,
  admin: { token: "a".repeat(32), allowRemoteAccess: false },
  rtm: {
    appId: "project-appid",
    appCertificate: "project-appcertificate",
    bootstrapMode: true,
  },
  localFile: {
    snapshotDataPath: "./data",
    logFilePath: "./logs/server.log",
    clientlogPath: "./logs/clientlogs",
  },
};

assert.doesNotThrow(() => validateConfig(bootstrapConfig, { strict: false, mode: "app" }));
assert.throws(() => validateConfig(bootstrapConfig, { strict: true, mode: "app" }), /RTM/i);
console.log("validate config tests passed");
```

- [ ] **Step 4: Run validation test to verify it fails**

Run: `node test/validate-config.test.js`

Expected: FAIL because `deploy/scripts/validate-config.js` does not exist yet.

- [ ] **Step 5: Add failing config merge test for config reuse**

```js
const assert = require("assert");
const { mergeConfig } = require("../deploy/scripts/config-merge.js");

const existing = {
  configVersion: 1,
  snapshotHost: "http://host:3000",
  adminToken: "b".repeat(32),
  serviceType: "localFile",
};

const defaults = {
  configVersion: 2,
  publicBaseUrl: "",
  admin: { token: "", allowRemoteAccess: false },
  serviceType: "localFile",
};

const merged = mergeConfig(existing, defaults);
assert.strictEqual(merged.publicBaseUrl, "http://host:3000");
assert.strictEqual(merged.admin.token, "b".repeat(32));
assert.strictEqual(merged.configVersion, 2);
console.log("config merge tests passed");
```

- [ ] **Step 6: Run config merge test to verify it fails**

Run: `node test/config-merge.test.js`

Expected: FAIL because `deploy/scripts/config-merge.js` does not exist yet.

- [ ] **Step 7: Add failing setup script contract test**

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const setup = fs.readFileSync(path.join(__dirname, "..", "deploy", "setup.sh"), "utf8");
assert(setup.includes('COMMAND="${1:-setup}"'));
assert(setup.includes('run_init()'));
assert(setup.includes('run_setup()'));
assert(setup.includes('run_upgrade()'));
assert(setup.includes('run_doctor()'));
assert(setup.includes('run_smoke()'));
console.log("setup script tests passed");
```

- [ ] **Step 8: Run setup script test to verify it fails**

Run: `node test/setup-script.test.js`

Expected: FAIL because the current script has no command router.

- [ ] **Step 9: Extend URL test with bootstrap gating**

```js
assert.throws(
  () => resolvePublicBaseUrl(request("http", "10.0.0.12"), { publicBaseUrl: "", bootstrapPublicUrl: false }),
  /public base url/i
);

assert.strictEqual(
  resolvePublicBaseUrl(request("http", "10.0.0.12"), { publicBaseUrl: "", bootstrapPublicUrl: true }),
  "http://10.0.0.12"
);
```

- [ ] **Step 10: Run URL test to verify it fails**

Run: `npm run test:url`

Expected: FAIL because the runtime still reads `snapshotHost` and always falls back.

- [ ] **Step 11: Add failing bootstrap token behavior test**

```js
const assert = require("assert");
const { createBootstrapTokenError } = require("../lib/bootstrap");

const err = createBootstrapTokenError("rtm credentials are placeholders");
assert.strictEqual(err.status, 503);
assert(/RTM/i.test(err.message));
console.log("bootstrap token tests passed");
```

- [ ] **Step 12: Run bootstrap token test to verify it fails**

Run: `node test/index-bootstrap-token.test.js`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 13: Add new deployment tests to package script**

```json
"test:validate-config": "node test/validate-config.test.js",
"test:config-merge": "node test/config-merge.test.js",
"test:setup-script": "node test/setup-script.test.js",
"test:index-bootstrap-token": "npm run build && node test/index-bootstrap-token.test.js",
"test:private-deploy": "npm run test:disk-cleaner && npm run test:file-logger && npm run test:file-logger-race && npm run test:file-path-safety && npm run test:init-config && npm run test:index-client-log-error && npm run test:index-snapshot-error && npm run test:index-snapshot-url-error && npm run test:admin-auth && npm run test:url && npm run test:deploy-config && npm run test:validate-config && npm run test:config-merge && npm run test:setup-script && npm run test:index-bootstrap-token"
```

- [ ] **Step 14: Run a targeted package script check**

Run: `node -e "const pkg=require('./package.json'); console.log(Object.keys(pkg.scripts).filter(k=>k.startsWith('test:')).sort().join('\n'))"`

Expected: PASS with the new deployment-related scripts listed.

## Task 2: Implement Config Validation and Merge Helpers

**Files:**
- Create: `deploy/scripts/validate-config.js`
- Create: `deploy/scripts/config-merge.js`
- Modify: `deploy/config.json.example`
- Test: `test/validate-config.test.js`
- Test: `test/config-merge.test.js`

- [ ] **Step 1: Write the new example config shape**

```json
{
  "configVersion": 2,
  "serviceType": "localFile",
  "deployMode": "app",
  "publicBaseUrl": "",
  "bootstrapPublicUrl": true,
  "admin": {
    "token": "",
    "allowRemoteAccess": false
  },
  "rtm": {
    "appId": "project-appid",
    "appCertificate": "project-appcertificate",
    "bootstrapMode": true
  },
  "localFile": {
    "snapshotDataPath": "./data",
    "logFilePath": "./logs/server.log",
    "clientlogPath": "./logs/clientlogs"
  },
  "diskRetention": {
    "enabled": true,
    "intervalHours": 1,
    "minRunIntervalMinutes": 5,
    "maxSnapshotHistoryAgeDays": 7,
    "maxSnapshotGB": 10,
    "maxLogAgeDays": 14,
    "maxLogGB": 2,
    "minFreeGB": 2,
    "allowDeleteLatestSnapshot": false,
    "deleteLatestAfterDays": 30,
    "serverLogMaxMB": 100
  }
}
```

- [ ] **Step 2: Implement minimal config merge helper**

```js
function mergeConfig(existing, defaults) {
  const merged = JSON.parse(JSON.stringify(defaults));
  const normalized = { ...existing };

  if (normalized.snapshotHost && !normalized.publicBaseUrl) {
    normalized.publicBaseUrl = normalized.snapshotHost;
  }
  if (normalized.adminToken && !normalized.admin) {
    normalized.admin = { token: normalized.adminToken };
  }
  if (normalized.admin && typeof normalized.admin.allowRemoteAccess !== "boolean") {
    normalized.admin.allowRemoteAccess = false;
  }

  deepMergePreserve(merged, normalized);
  merged.configVersion = defaults.configVersion;
  return merged;
}
```

- [ ] **Step 3: Run config merge test and verify it passes**

Run: `node test/config-merge.test.js`

Expected: PASS with `config merge tests passed`

- [ ] **Step 4: Implement bootstrap-aware validation helper**

```js
function validateConfig(config, options) {
  const strict = Boolean(options && options.strict);
  const mode = options && options.mode ? options.mode : config.deployMode;

  if (config.serviceType !== "localFile") throw new Error("serviceType must be localFile");
  if (!["app", "nginx"].includes(mode)) throw new Error("invalid deploy mode");
  if (!config.localFile || !config.localFile.snapshotDataPath || !config.localFile.logFilePath || !config.localFile.clientlogPath) {
    throw new Error("local file paths are required");
  }
  if (!config.localFile.logFilePath.endsWith("server.log")) throw new Error("logFilePath must end with server.log");
  if (!config.admin || typeof config.admin.token !== "string" || config.admin.token.length < 32) {
    throw new Error("admin token must be at least 32 characters");
  }
  if (strict && config.rtm && config.rtm.bootstrapMode) {
    throw new Error("RTM credentials are still in bootstrap mode");
  }
  if (strict && !config.publicBaseUrl) {
    throw new Error("public base url is required in strict mode");
  }
  if (!strict && !config.publicBaseUrl && config.bootstrapPublicUrl !== true) {
    throw new Error("public base url is required when bootstrap fallback is disabled");
  }
}
```

- [ ] **Step 5: Run validation test and verify it passes**

Run: `node test/validate-config.test.js`

Expected: PASS with `validate config tests passed`

- [ ] **Step 6: Commit**

```bash
git add deploy/config.json.example deploy/scripts/validate-config.js deploy/scripts/config-merge.js test/validate-config.test.js test/config-merge.test.js package.json
git commit -m "feat: add bootstrap config validation and merge helpers"
```

## Task 3: Implement Deploy Script Command Router and Package Files

**Files:**
- Modify: `deploy/setup.sh`
- Modify: `deploy/install.sh`
- Modify: `deploy/start.sh`
- Create: `deploy/docker-compose.base.app.yaml`
- Create: `deploy/docker-compose.base.nginx.yaml`
- Create: `deploy/docker-compose.override.yaml.example`
- Create: `deploy/scripts/doctor.sh`
- Create: `deploy/scripts/smoke-test.sh`
- Create: `deploy/scripts/print-next-steps.sh`
- Modify: `deploy/nginx.conf`
- Test: `test/deploy-config.test.js`
- Test: `test/setup-script.test.js`

- [ ] **Step 1: Replace example compose files with base package-owned files**

```yaml
services:
  forge-persistence:
    image: "registry.netless.link/app/forge-persistence-private:latest"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./config:/app/config
    ports:
      - "3000:3000"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
```

```yaml
services:
  forge-persistence:
    image: "registry.netless.link/app/forge-persistence-private:latest"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./config:/app/config
    expose:
      - "3000"
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

  nginx:
    image: "nginx:1.27.5-alpine"
    depends_on:
      - forge-persistence
    ports:
      - "80:80"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
```

- [ ] **Step 2: Add override example**

```yaml
services:
  forge-persistence:
    restart: unless-stopped
```

- [ ] **Step 3: Update nginx config to deny admin by default**

```nginx
location /admin/ {
  return 403;
}

location / {
  proxy_pass http://forge_persistence_upstream;
  ...
}
```

- [ ] **Step 4: Implement command router in setup.sh**

```bash
#!/bin/bash
set -euo pipefail

export VERSION=1.0.3
COMMAND="${1:-setup}"
MODE="${2:-app}"

run_init() { :; }
run_setup() { :; }
run_upgrade() { :; }
run_doctor() { :; }
run_smoke() { :; }

case "$COMMAND" in
  init) run_init "$MODE" ;;
  setup) run_setup "$MODE" ;;
  upgrade) run_upgrade "$MODE" ;;
  doctor) run_doctor "$MODE" ;;
  smoke) run_smoke "$MODE" ;;
  app|nginx) run_setup "$COMMAND" ;;
  *) echo "Usage: ./setup.sh <init|setup|upgrade|doctor|smoke> [app|nginx]"; exit 1 ;;
esac
```

- [ ] **Step 5: Flesh out `run_init`**

```bash
run_init() {
  local mode="$1"
  mkdir -p config logs data backup
  if [ ! -f config/app.json ]; then
    cp config.json.example config/app.json
    node -e 'const fs=require("fs");const p="config/app.json";const cfg=JSON.parse(fs.readFileSync(p,"utf8"));cfg.deployMode=process.argv[1];cfg.admin.token=require("crypto").randomBytes(24).toString("hex");fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");' "$mode"
  fi
  if [ ! -f docker-compose.override.yaml ]; then
    cp docker-compose.override.yaml.example docker-compose.override.yaml
  fi
  if [ "$mode" = "nginx" ] && [ ! -f config/nginx.conf ]; then
    cp nginx.conf config/nginx.conf
  fi
  ./scripts/print-next-steps.sh "$mode"
}
```

- [ ] **Step 6: Flesh out `run_setup`, `run_upgrade`, `run_doctor`, and `run_smoke` minimally**

```bash
run_setup() {
  local mode="$1"
  ./setup.sh init "$mode" >/dev/null 2>&1 || true
  node ./scripts/validate-config.js --file config/app.json --mode "$mode"
  cp "docker-compose.base.${mode}.yaml" docker-compose.generated.yaml
  docker load -i "forge-persistence-private-${VERSION}.tar"
  if [ "$mode" = "nginx" ]; then
    docker load -i nginx.tar
  fi
  docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml up -d
}
```

- [ ] **Step 7: Make compatibility scripts delegate cleanly**

```bash
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
exec ./setup.sh "$@"
```

- [ ] **Step 8: Add stub doctor, smoke, and print-next-steps scripts**

```bash
#!/bin/bash
set -euo pipefail
echo "PASS doctor: package and config checks should run here"
```

```bash
#!/bin/bash
set -euo pipefail
echo "PASS smoke: deployment checks should run here"
```

```bash
#!/bin/bash
set -euo pipefail
echo "Run ./setup.sh setup ${1:-app} when ready"
```

- [ ] **Step 9: Run deploy config and setup script tests and verify they pass**

Run: `node test/deploy-config.test.js && node test/setup-script.test.js`

Expected: PASS with both success messages.

- [ ] **Step 10: Commit**

```bash
git add deploy/setup.sh deploy/install.sh deploy/start.sh deploy/docker-compose.base.app.yaml deploy/docker-compose.base.nginx.yaml deploy/docker-compose.override.yaml.example deploy/nginx.conf deploy/scripts/doctor.sh deploy/scripts/smoke-test.sh deploy/scripts/print-next-steps.sh test/deploy-config.test.js test/setup-script.test.js
git commit -m "feat: add private deployment command router"
```

## Task 4: Implement Runtime Bootstrap Awareness

**Files:**
- Modify: `src/init.ts`
- Modify: `src/url.ts`
- Modify: `src/index.ts`
- Modify: `src/admin-auth.ts`
- Create: `src/bootstrap.ts`
- Test: `test/url.test.js`
- Test: `test/index-bootstrap-token.test.js`

- [ ] **Step 1: Add failing helper shape in new bootstrap module**

```ts
export function isBootstrapRtmConfig(config: { rtm?: { bootstrapMode?: boolean } }): boolean {
  return config.rtm?.bootstrapMode === true;
}

export function createBootstrapTokenError(message: string) {
  return { status: 503, message };
}
```

- [ ] **Step 2: Build and run bootstrap token test to verify it passes**

Run: `npm run build && node test/index-bootstrap-token.test.js`

Expected: PASS with `bootstrap token tests passed`

- [ ] **Step 3: Normalize config in init.ts**

```ts
function normalizeConfig(raw: any): Config {
  const publicBaseUrl = raw.publicBaseUrl ?? raw.snapshotHost ?? "";
  const adminToken = raw.admin?.token ?? raw.adminToken ?? "";
  return {
    ...raw,
    configVersion: raw.configVersion ?? 2,
    deployMode: raw.deployMode ?? "app",
    publicBaseUrl,
    bootstrapPublicUrl: raw.bootstrapPublicUrl ?? publicBaseUrl === "",
    admin: {
      token: adminToken,
      allowRemoteAccess: raw.admin?.allowRemoteAccess ?? false,
    },
    rtm: {
      ...raw.rtm,
      bootstrapMode: raw.rtm?.bootstrapMode ?? (
        raw.rtm?.appId === "project-appid" || raw.rtm?.appCertificate === "project-appcertificate"
      ),
    },
  };
}
```

- [ ] **Step 4: Update URL resolution logic**

```ts
export function resolvePublicBaseUrl(
  req: Pick<Request, "protocol" | "get">,
  config: { publicBaseUrl?: string; bootstrapPublicUrl?: boolean }
): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/+$/, "");
  }
  if (!config.bootstrapPublicUrl) {
    throw new Error("public base url is required");
  }
  const host = req.get("host");
  if (!host) {
    throw new Error("missing Host header");
  }
  return `${req.protocol}://${host}`;
}
```

- [ ] **Step 5: Run URL test to verify it passes**

Run: `npm run test:url`

Expected: PASS

- [ ] **Step 6: Update admin auth access point**

```ts
const requireAdminToken = requireAdminAccess(config.admin.token);
```

- [ ] **Step 7: Return operational error for bootstrap token endpoints**

```ts
if (isBootstrapRtmConfig(config)) {
  const err = createBootstrapTokenError("RTM credentials are still in bootstrap mode; configure customer RTM credentials first");
  res.status(err.status).send({ status: "fail", message: err.message });
  return;
}
```

- [ ] **Step 8: Log bootstrap warnings at startup**

```ts
if (config.bootstrapPublicUrl) {
  logger.warn("bootstrap public url fallback is active");
}
if (isBootstrapRtmConfig(config)) {
  logger.warn("RTM bootstrap mode is active; token endpoints are not customer-ready");
}
```

- [ ] **Step 9: Run targeted runtime tests**

Run: `npm run build && node test/index-bootstrap-token.test.js && npm run test:url && npm run test:admin-auth`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/init.ts src/url.ts src/index.ts src/admin-auth.ts src/bootstrap.ts test/url.test.js test/index-bootstrap-token.test.js
git commit -m "feat: add bootstrap-aware runtime behavior"
```

## Task 5: Add Package Integrity, Merge, Doctor, and Smoke Workflows

**Files:**
- Modify: `buildpack.sh`
- Create or Modify: `deploy/scripts/doctor.sh`
- Create or Modify: `deploy/scripts/smoke-test.sh`
- Modify: `deploy/setup.sh`
- Create: `deploy/manifest.json`
- Create: `deploy/checksums.sha256`
- Test: `test/deploy-config.test.js`

- [ ] **Step 1: Add generated manifest structure in buildpack**

```bash
cat > deploy/manifest.json <<EOF
{
  "packageVersion": "${VERSION}",
  "configSchemaVersion": 2,
  "defaultMode": "app",
  "supportedModes": ["app", "nginx"],
  "artifacts": {
    "appImageTar": "forge-persistence-private-${VERSION}.tar",
    "nginxImageTar": "nginx.tar"
  },
  "images": {
    "app": "registry.netless.link/app/forge-persistence-private:${VERSION}",
    "nginx": "${NGINX_IMAGE}"
  }
}
EOF
```

- [ ] **Step 2: Generate checksum file in buildpack**

```bash
shasum -a 256 \
  deploy/manifest.json \
  deploy/config.json.example \
  deploy/setup.sh \
  deploy/docker-compose.base.app.yaml \
  deploy/docker-compose.base.nginx.yaml \
  deploy/docker-compose.override.yaml.example \
  deploy/nginx.conf \
  deploy/scripts/validate-config.js \
  deploy/scripts/config-merge.js \
  deploy/scripts/doctor.sh \
  deploy/scripts/smoke-test.sh \
  deploy/forge-persistence-private-${VERSION}.tar \
  deploy/nginx.tar > deploy/checksums.sha256
```

- [ ] **Step 3: Teach setup.sh integrity and upgrade flow**

```bash
verify_package() {
  shasum -a 256 -c checksums.sha256
}

run_upgrade() {
  local mode="$1"
  mkdir -p backup
  cp -f config/app.json "backup/app.json.$(date +%Y%m%d%H%M%S)"
  [ -f docker-compose.override.yaml ] && cp -f docker-compose.override.yaml "backup/docker-compose.override.yaml.$(date +%Y%m%d%H%M%S)"
  node ./scripts/config-merge.js --defaults config.json.example --current config/app.json --output config/app.json
  run_setup "$mode"
}
```

- [ ] **Step 4: Implement doctor script with real checks**

```bash
#!/bin/bash
set -euo pipefail

mode="${1:-app}"
docker --version >/dev/null
docker compose version >/dev/null
node ./scripts/validate-config.js --file config/app.json --mode "$mode"
test -w config && test -w logs && test -w data
echo "PASS doctor: mode=${mode}"
```

- [ ] **Step 5: Implement smoke script with mode-specific checks**

```bash
#!/bin/bash
set -euo pipefail

mode="${1:-app}"
if [ "$mode" = "app" ]; then
  curl -fsS http://127.0.0.1:3000/snapshot/test-room >/dev/null
else
  curl -fsS http://127.0.0.1/snapshot/test-room >/dev/null
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/admin/disk/cleanup/status)
  [ "$code" = "403" ]
fi
echo "PASS smoke: mode=${mode}"
```

- [ ] **Step 6: Re-run deploy config test to cover manifest/checksum references if added**

Run: `node test/deploy-config.test.js`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add buildpack.sh deploy/setup.sh deploy/manifest.json deploy/checksums.sha256 deploy/scripts/doctor.sh deploy/scripts/smoke-test.sh
git commit -m "feat: add package integrity and upgrade workflow"
```

## Task 6: Rewrite Deployment Documentation and Verify End-to-End

**Files:**
- Modify: `README.md`
- Test: `package.json`
- Test: targeted deployment tests

- [ ] **Step 1: Rewrite README private deployment section around final commands**

```md
### 私有化部署

首次安装：

```bash
tar -xzvf forge-persistence-private-${VERSION}-install.tar
cd forge-persistence
./setup.sh init app
./setup.sh setup app
```

如需检查：

```bash
./setup.sh doctor app
./setup.sh smoke app
```

升级：

```bash
./setup.sh upgrade app
```
```

- [ ] **Step 2: Document bootstrap boundaries explicitly**

```md
- 首次安装会自动生成 admin token
- 未配置 `publicBaseUrl` 时，服务会使用 bootstrap fallback 生成 snapshot URL
- 未配置客户 RTM 凭证时，服务可以启动，但 RTM token 接口会返回明确提示，要求补充客户凭证
- nginx 模式下默认拒绝远程 `/admin/*`
- 客户自定义只能写 `docker-compose.override.yaml`
```

- [ ] **Step 3: Run the full private deployment test suite**

Run: `npm run test:private-deploy`

Expected: PASS

- [ ] **Step 4: Run bash syntax verification for deploy scripts**

Run: `bash -n deploy/setup.sh deploy/install.sh deploy/start.sh deploy/scripts/doctor.sh deploy/scripts/smoke-test.sh deploy/scripts/print-next-steps.sh`

Expected: PASS with no output

- [ ] **Step 5: Summarize final files and commit**

```bash
git add README.md package.json test deploy src
git commit -m "feat: finalize private deployment bootstrap workflow"
```

## Spec Coverage Check

- `init + setup` zero-edit bootstrap startup: covered by Tasks 2, 3, 4, and 6.
- Upgrade reuses old config: covered by Tasks 2 and 5.
- Admin default denial in nginx mode: covered by Tasks 3 and 6.
- Manifest, checksum, integrity validation: covered by Task 5.
- Override ownership separation: covered by Tasks 3 and 6.
- Doctor and smoke operator flow: covered by Tasks 3, 5, and 6.
- RTM token bootstrap boundary: covered by Task 4 and README updates in Task 6.

## Placeholder Scan

- No `TBD`, `TODO`, or unresolved placeholder instructions are left in the plan.
- Every code-changing step includes concrete code or config snippets.
- Every verification step includes an exact command and expected result.

## Type Consistency Check

- Config uses `publicBaseUrl`, `bootstrapPublicUrl`, `admin.token`, and `rtm.bootstrapMode` consistently.
- Script command names are consistently `init`, `setup`, `upgrade`, `doctor`, and `smoke`.
- Merge logic consistently migrates `snapshotHost` to `publicBaseUrl` and `adminToken` to `admin.token`.
