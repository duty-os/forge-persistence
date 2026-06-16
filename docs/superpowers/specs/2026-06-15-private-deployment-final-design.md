# Forge Persistence Private Deployment Final Design

## Goal

This design defines the final private-deployment packaging and installation workflow for `forge-persistence`.

The design is optimized for two approved goals:

1. SA should be able to run `init app` and `setup app` and get a running service with default bootstrap configuration, without manual config editing.
2. During upgrade, existing customer configuration should be reused automatically when no new required configuration is introduced.

This design explicitly accepts one boundary:

- The service package may bootstrap and run without customer-specific RTM credentials, but customer-specific RTM token generation cannot be guaranteed to work with zero configuration unless the customer later provides their own RTM credentials.

## Design Principles

- Bootstrap first: first install should succeed with safe defaults.
- Preserve customer state: upgrade should not overwrite existing customer configuration.
- Fail only on real blockers: missing required artifacts, broken package integrity, or invalid existing config that prevents startup.
- Make exposure deliberate: admin endpoints must not be remotely exposed by default in nginx mode.
- Separate package-owned files from customer-owned files.

## Final User Workflow

### First install

App mode:

```bash
./setup.sh init app
./setup.sh setup app
```

Nginx mode:

```bash
./setup.sh init nginx
./setup.sh setup nginx
```

Optional inspection:

```bash
./setup.sh doctor app
./setup.sh smoke app
```

### Upgrade

App mode:

```bash
./setup.sh upgrade app
```

Nginx mode:

```bash
./setup.sh upgrade nginx
```

Upgrade must preserve existing config automatically, merge in new optional defaults, and stop only when a new required field must be manually reviewed.

## Deployment Modes

This package currently supports 3 deployment modes:

1. `App` direct mode
   - starts only `forge-persistence`
   - exposes port `3000`
   - customer entrypoint looks like `http://<ip>:3000/path`

2. `Nginx HTTP` mode
   - starts `nginx + forge-persistence`
   - exposes port `80`
   - customer entrypoint looks like `http://<ip>/path`
   - does not require customer-provided certificates

3. `Nginx HTTPS` mode
   - extends `Nginx HTTP` mode with optional `443`
   - customer entrypoint looks like `https://<ip>/path`
   - requires customer-provided certificate and private key
   - keeps `80` available and does not auto-redirect to `443`
   - requires clients to trust the certificate or issuing CA

## Package Layout

The install tar should unpack to a directory containing:

- `setup.sh`
- `manifest.json`
- `checksums.sha256`
- `config.json.example`
- `docker-compose.base.app.yaml`
- `docker-compose.base.nginx.yaml`
- `docker-compose.override.yaml.example`
- `nginx.conf`
- `scripts/validate-config.js`
- `scripts/doctor.sh`
- `scripts/smoke-test.sh`
- `scripts/config-merge.js`
- `scripts/print-next-steps.sh`
- `forge-persistence-private-${VERSION}.tar`
- `nginx.tar`

Generated or customer-owned files after install:

- `config/app.json`
- `config/nginx.conf`
- `docker-compose.override.yaml`
- `docker-compose.generated.yaml`
- `data/`
- `logs/`
- `backup/`

## setup.sh Command Model

`setup.sh` becomes the single public entrypoint with these commands:

- `init [app|nginx]`
- `setup [app|nginx]`
- `upgrade [app|nginx]`
- `doctor [app|nginx]`
- `smoke [app|nginx]`

The old `./setup.sh` and `./setup.sh nginx` behavior should be treated as compatibility aliases:

- no subcommand + `app|nginx` should map to `setup`
- `install.sh` and `start.sh` should continue delegating to `setup.sh`

### init

Responsibilities:

- create `config/`, `logs/`, `data/`, `backup/`
- create `config/app.json` from `config.json.example` if absent
- create `docker-compose.override.yaml` from example if absent
- in nginx mode, create `config/nginx.conf` from template if absent
- generate a random admin token if the config is being created for the first time
- stamp `deployMode` into config
- leave existing customer files untouched
- print next steps

`init` must not load images or start containers.

### setup

Responsibilities:

- verify package integrity using `manifest.json` and `checksums.sha256`
- validate config in bootstrap-compatible mode
- load required image tar files
- generate `docker-compose.generated.yaml` from package-owned base compose
- run `docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml up -d`

`setup` must allow bootstrap startup with default config.

### upgrade

Responsibilities:

- back up existing config and override files
- merge existing config with new defaults
- preserve all existing customer-defined values
- stop only if a new required field cannot be inferred safely
- run package validation
- reload images and restart via compose

### doctor

Responsibilities:

- check Docker and Compose availability
- check package integrity
- check config validity
- check path writability
- check disk free space
- check expected port availability before startup
- print current mode, public URL mode, and admin exposure mode

### smoke

Responsibilities:

- verify container status
- verify snapshot URL generation
- verify local admin access
- verify nginx remote admin denial in nginx mode
- print a short PASS/WARN/FAIL summary

## Configuration Model

The example config should be upgraded to this model:

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
  "tls": {
    "enabled": false,
    "certPath": "./config/tls/tls.crt",
    "keyPath": "./config/tls/tls.key"
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

## Bootstrap Behavior

The package must start successfully even when the customer has not edited config yet.

Bootstrap mode rules:

- if `config/app.json` is auto-created, `init` generates a random admin token
- `publicBaseUrl` may be empty in bootstrap mode
- when `publicBaseUrl` is empty and `bootstrapPublicUrl=true`, snapshot URL generation may fall back to request-derived host/protocol
- `deployMode` is written by `init`
- `rtm.bootstrapMode=true` means RTM token endpoints are not guaranteed to work with real customer credentials yet

Bootstrap warnings should be visible in:

- `doctor`
- startup logs
- `smoke`

Warnings should not block startup.

## RTM Token Boundary

The design must distinguish service startup from customer-specific RTM token readiness.

Rules:

- service startup must not be blocked by placeholder RTM credentials
- if RTM credentials are still placeholders and a token endpoint is requested, the service should return a clear operational error instead of pretending the token is valid
- the error message should instruct the operator to configure real customer RTM credentials

This keeps bootstrap installation easy without embedding unsafe shared credentials into the package.

## Config Validation Rules

Validation has two modes:

- bootstrap-compatible validation for `setup`
- strict validation for `doctor --strict` or future production readiness checks

### Always required

- `serviceType === "localFile"`
- `deployMode` is `app` or `nginx`
- `localFile.snapshotDataPath` exists or can be created
- `localFile.logFilePath` ends with `server.log`
- `localFile.clientlogPath` exists or can be created
- admin token exists and is at least 32 bytes after `init`
- when `tls.enabled=true`, both `tls.certPath` and `tls.keyPath` must be non-empty

### Allowed in bootstrap mode

- placeholder `rtm.appId`
- placeholder `rtm.appCertificate`
- empty `publicBaseUrl` when `bootstrapPublicUrl=true`

### Required in strict mode

- non-placeholder RTM credentials
- non-empty `publicBaseUrl`
- mode-consistent public URL

## Snapshot URL Strategy

Current behavior in `src/url.ts` falls back to request headers when no configured public host exists. That behavior should remain, but only as an explicit bootstrap path.

Target behavior:

- if `publicBaseUrl` is set, always use it
- if `publicBaseUrl` is empty and `bootstrapPublicUrl=true`, use request-derived protocol and host
- `doctor` and `smoke` must warn when request-derived fallback is active

This satisfies the zero-edit first install goal while still making the boundary explicit.

## Admin Exposure Policy

Admin endpoints remain protected by app-layer token auth, but nginx must deny remote access by default.

Default nginx policy:

```nginx
location /admin/ {
  return 403;
}
```

This policy applies when:

- `deployMode=nginx`
- `admin.allowRemoteAccess=false`

Local operational access remains available by:

- `docker compose exec forge-persistence curl http://127.0.0.1:3000/admin/...`

Optional remote admin enablement is allowed only as an explicit operator decision through a separate config path or template, not by default.

## Compose File Ownership

Package-owned:

- `docker-compose.base.app.yaml`
- `docker-compose.base.nginx.yaml`
- `docker-compose.generated.yaml`

Customer-owned:

- `docker-compose.override.yaml`

Rules:

- `setup` regenerates `docker-compose.generated.yaml` every time
- `setup` never overwrites `docker-compose.override.yaml`
- customer customizations must be documented as override-only

Effective startup command:

```bash
docker compose \
  -f docker-compose.generated.yaml \
  -f docker-compose.override.yaml \
  up -d
```

## Package Integrity

`manifest.json` must include:

- `packageVersion`
- `configSchemaVersion`
- `defaultMode`
- `supportedModes`
- artifact filenames
- expected image references

`checksums.sha256` must include:

- app image tar
- nginx tar
- manifest
- setup script
- config example
- compose base files
- override example
- nginx config
- validation and support scripts

`setup` and `upgrade` must refuse to proceed when integrity checks fail.

## Upgrade Behavior

Upgrade must default to reusing existing config.

Detailed behavior:

1. back up current `config/app.json`, `config/nginx.conf`, and `docker-compose.override.yaml`
2. read current config
3. merge new optional defaults into missing fields only
4. preserve all existing populated values
5. keep existing admin token
6. keep existing public URL settings
7. keep existing RTM credentials
8. stop only if a new required field cannot be derived safely

Examples:

- new optional disk retention key: auto-merge default
- new optional admin flag: auto-merge default
- renamed config field: migrate automatically if old value is present
- new required external dependency field with no safe default: stop and require review

## Config Merge Strategy

Add `scripts/config-merge.js` with these rules:

- deep merge object defaults
- never replace existing scalar values
- migrate deprecated top-level keys to new nested keys
- write back normalized config
- update `configVersion`

Migration examples:

- `snapshotHost` -> `publicBaseUrl`
- `adminToken` -> `admin.token`

The merge script should be deterministic and testable.

## doctor Output

`doctor` should print:

- package version
- config version
- selected mode
- Docker availability
- Compose availability
- artifact integrity result
- disk free space
- path writability
- port availability
- bootstrap mode status
- remote admin exposure status
- summary: `PASS`, `WARN`, or `FAIL`

`WARN` is valid when the service can run but bootstrap or non-production defaults are still active.

## smoke Test Requirements

### App mode

- verify `http://127.0.0.1:3000/snapshot/test-room` returns JSON
- verify returned URL shape
- verify admin status with token returns `200`
- verify admin status without token returns `401`

### Nginx mode

- verify `http://127.0.0.1/snapshot/test-room` returns JSON
- verify returned URL shape
- verify `http://127.0.0.1/admin/disk/cleanup/status` returns `403`
- verify local in-container admin status with token returns `200`
- when `tls.enabled=true`, additionally verify `https://127.0.0.1/snapshot/test-room`

### Common

- verify `docker compose ps`
- optionally print recent logs on failure

## Source Code Changes

### `src/url.ts`

- keep configured URL precedence
- make request-derived fallback conditional on explicit bootstrap flag

### `src/init.ts`

- support new config shape
- normalize legacy keys
- expose bootstrap status

### `src/index.ts`

- token endpoints should return clear operational failure when RTM bootstrap placeholders are still in use
- startup logs should include bootstrap warnings

### `src/admin-auth.ts`

- no semantic change required beyond config path adaptation if moving from `adminToken` to `admin.token`

## Build Pipeline Changes

`buildpack.sh` should handle Linux / CI delivery packaging:

- generate base compose files
- generate override example
- write `manifest.json`
- generate `checksums.sha256`
- update packaged script version references
- include support scripts in install tar

`buildpack-local.sh` should support local macOS rehearsal and self-check flows:

- preserve the same packaged artifact layout as delivery builds
- handle local `sed` / `tar` compatibility requirements
- support writing package artifacts to local staging directories for end-to-end validation

## Test Plan

Add or expand the following tests:

- `test/deploy-config.test.js`
  - nginx must deny `/admin/` by default
  - base compose and override files exist
  - setup command model is present

- `test/validate-config.test.js`
  - bootstrap config passes bootstrap validation
  - strict validation fails on placeholder RTM credentials
  - strict validation fails on missing public URL
  - bootstrap mode allows missing public URL

- `test/config-merge.test.js`
  - preserves existing values
  - merges new defaults
  - migrates legacy keys

- `test/url.test.js`
  - configured public URL wins
  - bootstrap fallback works only when enabled

- `test/index-bootstrap-token.test.js`
  - token endpoint returns operational error in bootstrap RTM mode

- `test/setup-script.test.js`
  - verifies `init`, `setup`, `upgrade`, `doctor`, `smoke`

Update `test:private-deploy` to include the new deployment-related tests.

## Documentation Requirements

README must be rewritten around:

- first install with `init` + `setup`
- optional `doctor` and `smoke`
- upgrade with config reuse
- bootstrap warnings and RTM token boundary
- override-only customer customization rule
- admin remote access default denial in nginx mode

## Non-Goals

- embedding shared production RTM credentials into the package
- automatic certificate issuance or renewal inside the package; the package only supports optional customer-provided certificates for HTTPS
- moving persistence away from local file storage in this change set

## Acceptance Criteria

The design is complete when all of the following are true:

1. `./setup.sh init app` followed by `./setup.sh setup app` can start the service without manual config edits.
2. A random admin token is generated automatically on first init.
3. Snapshot URL generation works in bootstrap mode and warns clearly when using fallback behavior.
4. Nginx mode denies remote `/admin/*` by default.
5. Upgrade preserves existing config automatically when no new required config is introduced.
6. Upgrade merges new optional defaults safely.
7. Package integrity failures block setup and upgrade.
8. RTM bootstrap placeholder state does not block startup but does block fake-success token behavior.
9. Customer customizations survive setup and upgrade through override ownership separation.
10. `doctor` and `smoke` provide usable operator feedback.
