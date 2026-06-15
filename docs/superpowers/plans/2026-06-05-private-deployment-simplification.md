# 私有化部署磁盘治理实施计划

> **给 agentic worker 的要求：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪进度。

**目标：** 管理 `forge-persistence` 私有化部署里所有会持续落盘增长的内容：snapshot、服务端日志、客户端日志、容器 stdout 日志；通过滚动删除/滚动截断/compose 日志上限，避免宿主机磁盘被写满导致服务中断。

**架构：** 保持现有 app service 作为唯一应用进程。`snapshotDataPath`、`logFilePath`、`clientlogPath` 继续由配置指定，但新增一个进程内 `DiskCleaner` 只管理这些显式传入的路径：按保留天数删除历史文件、按目录总量删除最旧文件、按单文件大小滚动 server log，并在磁盘剩余空间不足时优先清理可丢弃文件。`latest.snapshot` 默认永不自动删除，必须显式配置才允许作为紧急空间保护对象；client log 删除必须先和当前打开的 stream 协调，不能直接 unlink 正在写入的文件。nginx 不默认启用；安装时通过 `./setup.sh nginx` 显式选择 nginx 反代模式，未带参数的 `./setup.sh` 使用独立 app 部署模式。HTTPS 和域名仍由客户侧或 SA 在包外处理。Docker 自身 stdout 日志不由 Node 进程删除，而是在 compose 中配置 `json-file` 的 `max-size/max-file`。

**技术栈：** Node.js 20、TypeScript、Express 4、Node `fs/promises`、Docker、Docker Compose、nginx。

---

## 当前全量存盘点

代码和部署文件里当前会持续写盘的内容只有这几类：

- `./data/<roomId>/latest.snapshot`：每个 room 的最新 snapshot，来自 `LocalSnapshotHandler.putSnapshot()`。
- `./data/<roomId>/<timestamp>.snapshot`：每次上传 snapshot 都会新增的历史 snapshot，当前永不删除。
- `./logs/server.log`：服务端结构化日志，`FileLogger` 用 `createWriteStream(..., { flags: "a+" })` 一直 append。
- `./logs/clientlogs/<roomId>.log`：客户端上报日志，`LocalClientLoggerHandler.putLogs()` 按 roomId 追加写入。
- Docker/compose stdout 日志：`FileLogger.handler()` 也会 `console.log(jsonedLog)`，所以容器运行时还会有 Docker json log；这个日志不在 repo 的 `./logs` 目录里，但同样会占宿主机磁盘。

当前只有 `clearStream()` 会关闭超过 10 分钟未写入的客户端日志文件句柄；它 **不会删除日志文件**。所以 snapshot 和日志都需要纳入滚动治理。

## 不做什么

- 不新增文件托管服务。
- 不新增静态 `/files` server。
- 不把日志上传到外部服务。
- 不开放公网日志下载接口。
- 不让 Node 进程直接操作 Docker daemon 的日志文件。

## 已采纳的风险修正

- `/admin/disk/cleanup` 和 `/admin/disk/cleanup/status` 必须有应用层 token 保护。接口可以开放外网访问，但必须要求 `X-Admin-Token` 命中配置里的 `adminToken`，token 缺失或错误统一返回 `401`；鉴权逻辑不能信任 `X-Forwarded-For`，也不能从 query string 读取 token。
- 示例配置里的默认 `adminToken` 占位符必须被代码判为无效，避免客户忘记替换后形成公开默认口令。
- `DiskCleaner` 只能接收明确的受管路径：`snapshotDataPath`、`serverLogFilePath`、`clientLogPath`。不能假设它们都在同一个 `./data` 或 `./logs` 父目录下，也不能扫描这些路径之外的父目录。
- 删除 client log 必须通过 `LocalClientLoggerHandler` 协调：如果文件仍有 active stream，先 close 并从 stream map 移除，再 unlink；不要直接删除打开句柄背后的 inode。
- `latest.snapshot` 是房间恢复入口，默认不参与自动删除。只有配置显式设置 `allowDeleteLatestSnapshot: true`，并且文件超过 `deleteLatestAfterDays`，才允许在容量超限或低磁盘场景下作为最后一档清理对象。
- 部署兼容性必须保留：`./setup.sh` 默认仍是 app 直连 `3000:3000`；只有 `./setup.sh nginx` 才切到 nginx 暴露 `80:80`。README 需要写清楚从旧包迁移时 endpoint、端口、HTTP/TLS 的差异。
- 计划执行时不做中间 commit。所有任务只做 checkpoint，最终提交前先运行 `gitnexus_detect_changes(scope: "all", repo: "forge-persistence")`，满足 AGENTS.md 的 commit 前检查要求。
- nginx 镜像不能使用 `nginx:latest`。buildpack 使用固定版本镜像，例如 `nginx:1.27.5-alpine`，并在部署配置测试里断言没有 `nginx:latest`。

## GitNexus 影响面快照

计划前已执行 `npx gitnexus analyze --force` 刷新索引。预编辑影响面如下：

- `src/file.ts` 中的 `putSnapshot`：LOW 风险，1 个直接调用方（`src/index.ts`），0 个受影响流程。
- `src/file.ts` 中的 `LocalSnapshotHandler`：LOW 风险，1 个直接依赖（`src/init.ts`），0 个受影响流程。
- `src/log.ts` 中的 `FileLogger`：LOW 风险，2 个直接依赖（`src/init.ts`、`src/file.ts`），0 个受影响流程。
- `src/file.ts` 中的 `LocalClientLoggerHandler`：LOW 风险，1 个直接依赖（`src/init.ts`），0 个受影响流程。
- `src/file.ts` 中的 `putLogs`：LOW 风险，1 个直接调用方（`src/index.ts`），0 个受影响流程。
- `src/index.ts` 中的 `expressObject`：LOW 风险，0 个直接调用方，0 个受影响流程。

未出现 HIGH 或 CRITICAL 风险提示。

## 文件结构

- 新建 `src/disk-cleaner.ts`：统一扫描、规划和执行本地磁盘清理，只扫描配置显式传入的 snapshot、server log、client log 路径，覆盖 snapshot 历史文件、可选过旧 latest、客户端日志、服务端轮转日志、目录容量限制和低磁盘空间清理。
- 修改 `src/log.ts`：让 `FileLogger` 支持按大小滚动当前 `server.log`，滚动成 `server.<timestamp>.log`，继续写新的 `server.log`。
- 修改 `src/file.ts`：保留现有 snapshot 和 client log 写入路径，增加路径 accessor，修复 client log stream 未缓存的问题，并提供 client log 安全删除方法（active stream 先 close 再 unlink）。
- 修改 `src/init.ts`：增加 `diskRetention` 配置，实例化 `diskCleaner`，把 `FileLogger` 的滚动大小从配置传进去。
- 新建 `src/url.ts`：集中生成现有 snapshot 下载路由的公网 URL，仍指向 `/:roomId/snapshots/latest.snapshot`。
- 新建 `src/admin-auth.ts`：封装 admin 接口应用层 token 保护，只接受有效 `X-Admin-Token`，且不信任 proxy header 或 query string。token 校验必须使用 constant-time compare。
- 修改 `src/index.ts`：信任 nginx proxy header；snapshot 写入后触发节流清理；启动定时清理；增加 `/admin/disk/cleanup/status` 和 `/admin/disk/cleanup`，并在路由上使用 `requireAdminAccess`。
- 新建 `test/disk-cleaner.test.js`：覆盖所有落盘文件类型的清理决策。
- 新建 `test/file-logger.test.js`：覆盖 `server.log` 达到大小后滚动。
- 新建 `test/admin-auth.test.js`：覆盖 admin 接口 token 保护。
- 新建 `test/url.test.js`：验证 snapshot URL 仍使用现有下载接口。
- 新建 `test/deploy-config.test.js`：验证严格 JSON 配置、HTTP nginx 可选模式、独立 app 模式、Docker 日志上限。
- 修改 `package.json`：增加聚焦测试脚本。
- 修改 `deploy/nginx.conf`：普通 HTTP 反代模板，`/admin/` 也反代到 app，由应用层 token 统一鉴权。
- 新建 `deploy/docker-compose.app.yaml.example` 和 `deploy/docker-compose.nginx.yaml.example` 两种模板，并都配置 Docker json log 上限。
- 修改 `deploy/config.json.example`：严格 JSON，加入 `diskRetention` 默认值。
- 新建 `deploy/setup.sh`：根据参数选择是否加载 nginx 镜像，初始化目录/配置，不覆盖客户已有配置。
- 修改 `deploy/install.sh`：保留为兼容入口，转发到 `setup.sh`。
- 修改 `deploy/start.sh`：保留为兼容入口，委托 `setup.sh` 或提示使用 `setup.sh`。
- 修改 `buildpack.sh`：打包 app 镜像和可选 nginx 镜像，并生成独立/nginx 两套带版本号的 compose 模板。
- 修改 `Dockerfile`：构建时编译 TypeScript，运行 `node lib/index.js`。
- 修改 `README.md`：文档化所有落盘内容、滚动清理策略、SA 手动清理、滚动更新和日志获取。

---

### 任务 1：为所有落盘内容增加清理决策测试

**文件：**
- 新建：`test/disk-cleaner.test.js`
- 新建：`src/disk-cleaner.ts`
- 修改：`package.json`

- [ ] **步骤 1：编写失败测试**

创建 `test/disk-cleaner.test.js`，覆盖这些场景：

- `./data/<roomId>/<timestamp>.snapshot` 被识别为历史 snapshot。
- `./data/<roomId>/latest.snapshot` 被识别为 latest snapshot。
- `./logs/server.log` 被识别为当前服务端日志，不由 cleaner 直接删除。
- `./logs/server.<timestamp>.log` 被识别为已滚动服务端日志，可按保留策略删除。
- `./logs/clientlogs/<roomId>.log` 被识别为客户端日志，可按保留策略删除。
- 过期历史 snapshot 会被删除。
- snapshot 总量超限时，优先删除最旧的历史 snapshot。
- 日志总量超限时，优先删除最旧的已滚动 server log 和客户端日志。
- 未过期 `latest.snapshot` 默认保护。
- 默认配置下 `latest.snapshot` 即使超过 `deleteLatestAfterDays` 也不会自动删除。
- 只有显式开启 `allowDeleteLatestSnapshot: true` 后，`latest.snapshot` 超过 `deleteLatestAfterDays` 且仍超限/低磁盘时，才可以作为最后一档清理对象。
- client log 正在写入时不能被直接 unlink，必须通过 active log guard 跳过或通过 handler 先 close 再删。
- 实际执行清理会删除文件，并尝试移除空 room 目录。

测试可按这个结构写：

```javascript
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_DISK_RETENTION_POLICY,
  classifyManagedFile,
  planDiskCleanup,
  cleanupDisk,
} = require("../lib/disk-cleaner");

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 5, 5, 8, 0, 0);

function item(relativePath, ageDays, size) {
  return {
    relativePath,
    path: `/app/${relativePath}`,
    size,
    mtimeMs: now - ageDays * day,
    kind: classifyManagedFile(relativePath).kind,
    protected: classifyManagedFile(relativePath).protected,
  };
}

assert.deepStrictEqual(classifyManagedFile("data/room-a/latest.snapshot"), {
  managed: true,
  kind: "latest-snapshot",
  protected: true,
});
assert.deepStrictEqual(classifyManagedFile("data/room-a/1710000000000.snapshot"), {
  managed: true,
  kind: "history-snapshot",
  protected: false,
});
assert.deepStrictEqual(classifyManagedFile("logs/server.log"), {
  managed: true,
  kind: "active-server-log",
  protected: true,
});
assert.deepStrictEqual(classifyManagedFile("logs/server.1710000000000.log"), {
  managed: true,
  kind: "rotated-server-log",
  protected: false,
});
assert.deepStrictEqual(classifyManagedFile("logs/clientlogs/room-a.log"), {
  managed: true,
  kind: "client-log",
  protected: false,
});

{
  const result = planDiskCleanup({
    files: [
      item("data/room-a/latest.snapshot", 1, 10),
      item("data/room-a/old.snapshot", 20, 10),
      item("logs/server.log", 20, 100),
      item("logs/server.1710000000000.log", 20, 100),
      item("logs/clientlogs/room-a.log", 20, 100),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxSnapshotHistoryAgeDays: 7,
      maxLogAgeDays: 14,
      maxSnapshotGB: 1,
      maxLogGB: 1,
    },
    nowMs: now,
    freeBytes: 1000,
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), [
    "data/room-a/old.snapshot",
    "logs/server.1710000000000.log",
    "logs/clientlogs/room-a.log",
  ]);
  assert.strictEqual(result.deleteFiles.some((file) => file.relativePath === "logs/server.log"), false);
  assert.strictEqual(result.deleteFiles.some((file) => file.relativePath.endsWith("latest.snapshot")), false);
}

{
  const result = planDiskCleanup({
    files: [
      item("data/room-a/latest.snapshot", 60, 80),
      item("data/room-b/latest.snapshot", 2, 80),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxSnapshotGB: 0.0000001,
      deleteLatestAfterDays: 30,
    },
    nowMs: now,
    freeBytes: 1000,
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), []);
  assert.strictEqual(result.overLimit, true);
}

{
  const result = planDiskCleanup({
    files: [
      item("data/room-a/latest.snapshot", 60, 80),
      item("data/room-b/latest.snapshot", 2, 80),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      allowDeleteLatestSnapshot: true,
      maxSnapshotGB: 0.0000001,
      deleteLatestAfterDays: 30,
    },
    nowMs: now,
    freeBytes: 1000,
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), [
    "data/room-a/latest.snapshot",
  ]);
}

{
  const result = planDiskCleanup({
    files: [
      item("logs/clientlogs/active-room.log", 30, 100),
      item("logs/clientlogs/idle-room.log", 30, 100),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxLogAgeDays: 14,
      maxLogGB: 1,
    },
    nowMs: now,
    freeBytes: 1000,
    activeRelativePaths: new Set(["logs/clientlogs/active-room.log"]),
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), [
    "logs/clientlogs/idle-room.log",
  ]);
}

async function writeFile(root, relativePath, content, ageDays) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const mtime = new Date(now - ageDays * day);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "disk-cleaner-"));
  await writeFile(root, "data/room-a/latest.snapshot", "latest", 1);
  await writeFile(root, "data/room-a/old.snapshot", "old", 20);
  await writeFile(root, "logs/server.log", "active", 20);
  await writeFile(root, "logs/server.1710000000000.log", "rotated", 20);
  await writeFile(root, "logs/clientlogs/room-a.log", "client", 20);

  const result = await cleanupDisk({
    paths: {
      snapshotDataPath: path.join(root, "data"),
      serverLogFilePath: path.join(root, "logs/server.log"),
      clientLogPath: path.join(root, "logs/clientlogs"),
    },
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxSnapshotHistoryAgeDays: 7,
      maxLogAgeDays: 14,
      maxSnapshotGB: 1,
      maxLogGB: 1,
    },
    nowMs: now,
    freeBytes: 1024,
  });

  assert.strictEqual(result.deletedCount, 3);
  assert.strictEqual(fs.existsSync(path.join(root, "data/room-a/latest.snapshot")), true);
  assert.strictEqual(fs.existsSync(path.join(root, "logs/server.log")), true);
  assert.strictEqual(fs.existsSync(path.join(root, "data/room-a/old.snapshot")), false);
  assert.strictEqual(fs.existsSync(path.join(root, "logs/server.1710000000000.log")), false);
  assert.strictEqual(fs.existsSync(path.join(root, "logs/clientlogs/room-a.log")), false);

  fs.rmSync(root, { recursive: true, force: true });
  console.log("disk cleaner tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **步骤 2：添加测试脚本**

修改 `package.json` 的 `scripts`：

```json
{
  "build": "rm -rf ./lib && tsc",
  "debug": "node lib/index.js",
  "dev": "ts-node ./src/index.ts",
  "test:admin-auth": "npm run build && node test/admin-auth.test.js",
  "test:disk-cleaner": "npm run build && node test/disk-cleaner.test.js",
  "test:file-logger": "npm run build && node test/file-logger.test.js",
  "test:url": "npm run build && node test/url.test.js",
  "test:deploy-config": "node test/deploy-config.test.js",
  "test:private-deploy": "npm run test:disk-cleaner && npm run test:file-logger && npm run test:admin-auth && npm run test:url && npm run test:deploy-config"
}
```

- [ ] **步骤 3：运行测试，确认失败原因正确**

运行：

```bash
npm run test:disk-cleaner
```

预期：`node test/disk-cleaner.test.js` 失败，错误为 `Cannot find module '../lib/disk-cleaner'`。

- [ ] **步骤 4：实现 `src/disk-cleaner.ts`**

实现这些导出：

- `DiskRetentionPolicy`
- `ManagedFileKind`
- `ManagedFileInfo`
- `CleanupResult`
- `DEFAULT_DISK_RETENTION_POLICY`
- `classifyManagedFile(relativePath)`
- `scanManagedFiles(paths)`
- `planDiskCleanup(input)`
- `cleanupDisk(input)`

路径输入类型必须是显式受管路径：

```typescript
export interface ManagedPaths {
    snapshotDataPath: string;
    serverLogFilePath: string;
    clientLogPath: string;
}
```

`scanManagedFiles(paths)` 只允许扫描：

- `paths.snapshotDataPath` 下的 room 子目录。
- `paths.serverLogFilePath` 指向的当前 server log，以及同目录中形如 `server.<timestamp>.log` 的滚动日志。
- `paths.clientLogPath` 下的 `*.log`。

不要从这些路径推导共同父目录，也不要递归扫描共同父目录。

默认策略：

```typescript
export const DEFAULT_DISK_RETENTION_POLICY: DiskRetentionPolicy = {
    enabled: true,
    intervalHours: 1,
    minRunIntervalMinutes: 5,
    maxSnapshotHistoryAgeDays: 7,
    maxSnapshotGB: 10,
    maxLogAgeDays: 14,
    maxLogGB: 2,
    minFreeGB: 2,
    allowDeleteLatestSnapshot: false,
    deleteLatestAfterDays: 30,
};
```

配置字段对 SA/客户使用人类可读单位：

- `intervalHours: 1` 表示每 1 小时检查一次。
- `minRunIntervalMinutes: 5` 表示写入触发清理时，最短 5 分钟实际跑一次。
- `maxSnapshotGB: 10` 表示 snapshot 总量上限是 10GB。
- `maxLogGB: 2` 表示日志总量上限是 2GB。
- `minFreeGB: 2` 表示磁盘剩余空间低于 2GB 时触发空间保护清理。
- `serverLogMaxMB: 100` 表示当前 `server.log` 达到 100MB 后滚动。
- `allowDeleteLatestSnapshot: false` 表示 latest snapshot 默认永不自动删除。
- `deleteLatestAfterDays: 30` 只有在 `allowDeleteLatestSnapshot: true` 时才生效。

GB/MB 配置允许使用小数，例如 `maxSnapshotGB: 0.5` 表示 512MB。代码内部需要把这些配置统一换算成 bytes / milliseconds 后再比较。不要直接拿 `maxLogGB` 和文件 byte size 比较。

分类规则：

- `data/*/latest.snapshot`：`latest-snapshot`，默认 protected。
- `data/*/*.snapshot`：`history-snapshot`，可删除。
- `logs/server.log`：`active-server-log`，protected，不由 cleaner 删除。
- `logs/server.*.log`：`rotated-server-log`，可删除。
- `logs/clientlogs/*.log`：`client-log`，可删除。
- 其他文件忽略。
- `classifyManagedFile(relativePath)` 的 `relativePath` 是 cleaner 内部生成的逻辑路径，例如 `data/room-a/latest.snapshot`、`logs/server.log`、`logs/clientlogs/room-a.log`；真实文件路径来自 `ManagedPaths`，不能靠 `path.join(root, relativePath)` 推导。

删除规则：

- 先删超过 `maxSnapshotHistoryAgeDays` 的历史 snapshot。
- 再删超过 `maxLogAgeDays` 的已滚动 server log 和 client log。
- 如果 snapshot 总量仍超过 `maxSnapshotGB`，按最旧历史 snapshot 继续删。
- 如果 log 总量仍超过 `maxLogGB`，按最旧可删日志继续删。
- 如果磁盘剩余空间低于 `minFreeGB`，按“历史 snapshot -> 可删日志 -> 显式允许删除的过旧 latest”的顺序继续删。
- `latest.snapshot` 默认不删；只有 `allowDeleteLatestSnapshot: true` 且超过 `deleteLatestAfterDays` 时，才可在最后一档删除。
- 当前 `logs/server.log` 不删。
- `activeRelativePaths` 里的 client log 不进入删除候选；运行时由 `LocalClientLoggerHandler.deleteClientLogSafely()` 负责先 close active stream 再删除。
- 清理后如果仍超限，返回 `overLimit: true`，由日志告警并交给 SA 处理。

- [ ] **步骤 5：运行测试**

```bash
npm run test:disk-cleaner
```

预期：退出码为 `0`，输出 `disk cleaner tests passed`。

- [ ] **步骤 6：检查点**

```bash
git add package.json src/disk-cleaner.ts test/disk-cleaner.test.js
git diff --cached --stat
```

预期：只包含 `package.json`、`src/disk-cleaner.ts`、`test/disk-cleaner.test.js`。

---

### 任务 2：给服务端日志增加按大小滚动

**文件：**
- 新建：`test/file-logger.test.js`
- 修改：`src/log.ts`

- [ ] **步骤 1：编写 FileLogger 滚动测试**

创建 `test/file-logger.test.js`：

```javascript
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileLogger } = require("../lib/log");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-logger-"));
const logPath = path.join(root, "server.log");
const logger = new FileLogger(logPath, { maxBytes: 80 });

logger.info("first message", { payload: "x".repeat(80) });
logger.info("second message", { payload: "y".repeat(80) });
logger.close();

const files = fs.readdirSync(root).sort();
assert(files.includes("server.log"));
assert(files.some((name) => /^server\.\d+\.log$/.test(name)));

fs.rmSync(root, { recursive: true, force: true });
console.log("file logger tests passed");
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
npm run test:file-logger
```

预期：失败，因为 `FileLogger` 目前不支持 `maxBytes` 和 `close()`。

- [ ] **步骤 3：修改 `src/log.ts`**

给 `FileLogger` 增加：

- 构造参数 `options?: { maxBytes?: number }`。
- 写入前检查当前文件大小加上新日志长度是否超过 `maxBytes`。
- 超过时关闭当前 stream，把 `server.log` rename 成 `server.<Date.now()>.log`，再打开新的 `server.log`。
- 增加 `close()` 用于测试和优雅释放。

注意：

- `console.log(jsonedLog)` 保留，Docker stdout 仍可采集。
- 滚动只处理 app 自己写的 `./logs/server.log`；Docker stdout 日志由 compose logging options 管。

- [ ] **步骤 4：运行测试**

```bash
npm run test:file-logger
```

预期：退出码为 `0`，输出 `file logger tests passed`。

- [ ] **步骤 5：检查点**

```bash
git add src/log.ts test/file-logger.test.js
git diff --cached --stat
```

预期：只包含 `src/log.ts` 和 `test/file-logger.test.js`。

---

### 任务 3：把 DiskCleaner 接入运行时

**文件：**
- 修改：`src/init.ts`
- 修改：`src/file.ts`
- 修改：`src/index.ts`
- 新建：`src/admin-auth.ts`
- 新建：`test/admin-auth.test.js`

- [ ] **步骤 0：编写 admin 鉴权测试**

创建 `test/admin-auth.test.js`：

```javascript
const assert = require("assert");
const { hasAdminAccess } = require("../lib/admin-auth");

assert.strictEqual(hasAdminAccess({ token: undefined, expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: "wrong", expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: ["secret"], expectedToken: "secret" }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: undefined }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: "" }), false);
assert.strictEqual(hasAdminAccess({ token: "secret", expectedToken: "secret" }), true);

console.log("admin auth tests passed");
```

运行：

```bash
npm run test:admin-auth
```

预期：失败，错误为 `Cannot find module '../lib/admin-auth'`。

- [ ] **步骤 1：更新配置类型和初始化**

在 `src/init.ts` 中：

- 将 `serviceType` 收敛为 `"localFile"`。
- 增加可选 `snapshotHost?: string`。
- 增加可选 `adminToken?: string`；执行 `/admin/` 必须配置这个 token，并通过请求头 `X-Admin-Token` 传入。token 缺失或错误统一返回 `401`。
- 增加 `diskRetention?: Partial<DiskRetentionPolicy> & { serverLogMaxMB?: number }`。
- 校验 `localFile.snapshotDataPath`、`localFile.logFilePath`、`localFile.clientlogPath`。
- 将 `FileLogger` 初始化为：

```typescript
export const logger = new FileLogger(config.localFile.logFilePath, {
    maxBytes: mbToBytes(diskRetentionPolicy.serverLogMaxMB),
});
```

- 实例化并导出 `diskCleaner`。

`DiskCleaner` 需要：

- `getStatus()`
- `start()`
- `requestRun(reason)`
- `run(reason)`

其中 `run()` 使用 `statfs(root)` 获取剩余空间，调用 `cleanupDisk()`，并通过 `logger.info` 记录删除数量、删除字节数、剩余大小、是否仍超限。`intervalHours` 和 `minRunIntervalMinutes` 在调度时换算成毫秒；`maxSnapshotGB`、`maxLogGB`、`minFreeGB`、`serverLogMaxMB` 在比较文件大小时换算成 bytes。

`diskCleaner` 构造参数必须使用显式路径，不允许传一个父目录后宽泛扫描：

```typescript
export const diskCleaner = new DiskCleaner({
    snapshotDataPath: config.localFile.snapshotDataPath,
    serverLogFilePath: config.localFile.logFilePath,
    clientLogPath: config.localFile.clientlogPath,
    clientLogger,
    policy: diskRetentionPolicy,
    logger,
});
```

- [ ] **步骤 2：修复本地文件 handler**

在 `src/file.ts`：

- 给 `LocalSnapshotHandler` 增加 `getSnapshotRoot()`。
- 给 `LocalClientLoggerHandler` 增加 `getLogRoot()`。
- 修复 `putLogs()` 创建 stream 后没有 `this.streams.set(roomId, stream)` 的问题。
- 给 `LocalClientLoggerHandler` 增加 `getActiveLogRelativePaths()`，返回正在写入的逻辑路径集合，用于让 cleaner 跳过 active stream。
- 给 `LocalClientLoggerHandler` 增加 `deleteClientLogSafely(filePath)`：如果 filePath 对应 roomId 仍在 `streams` map 中，先 `stream.close()`，再从 map 中删除，最后 `fs.unlink(filePath)`。

- [ ] **步骤 2.5：实现 admin 应用层保护**

新建 `src/admin-auth.ts`：

```typescript
import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

export function hasAdminAccess(input: {
    token?: string | string[];
    expectedToken?: string;
}): boolean {
    if (!input.expectedToken || !input.token || Array.isArray(input.token)) {
        return false;
    }
    const token = Buffer.from(input.token);
    const expectedToken = Buffer.from(input.expectedToken);
    return token.length === expectedToken.length && timingSafeEqual(token, expectedToken);
}

export function requireAdminAccess(expectedToken?: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const allowed = hasAdminAccess({
            token: req.header("X-Admin-Token"),
            expectedToken,
        });
        if (!allowed) {
            res.status(401).send({ status: "fail", message: "unauthorized" });
            return;
        }
        next();
    };
}
```

注意：这里刻意不读取 `X-Forwarded-For`，也不从 query string 读取 token。公网 HTTP 会明文传输 token，生产环境建议叠加 HTTPS、VPN 或安全组白名单。

- [ ] **步骤 3：接入 Express 管理接口**

在 `src/index.ts`：

- 从 `./init` 导入 `diskCleaner`。
- 从 `./admin-auth` 导入 `requireAdminAccess`。
- 在 snapshot 成功写入后调用 `diskCleaner.requestRun("snapshot-write")`。
- 在 `/client/logs` 成功写入后调用 `diskCleaner.requestRun("client-log-write")`，受 `minRunIntervalMinutes` 节流保护。
- 增加 token 保护的 admin 接口：

```typescript
const requireAdminToken = requireAdminAccess(config.adminToken);

expressObject.get("/admin/disk/cleanup/status", requireAdminToken, async (req, res) => {
    res.status(200).send({
        status: "ok",
        cleanup: diskCleaner.getStatus(),
    });
});

expressObject.post("/admin/disk/cleanup", requireAdminToken, async (req, res) => {
    try {
        const result = await diskCleaner.run("manual");
        res.status(200).send({ status: "ok", result });
    } catch (e: any) {
        logger.error("manual disk cleanup failed", e as Error);
        res.status(500).send({ status: "fail", message: e.message });
    }
});
```

- 服务启动后调用 `diskCleaner.start()`。

- [ ] **步骤 4：运行验证**

```bash
npm run test:disk-cleaner
npm run test:file-logger
npm run test:admin-auth
npm run build
```

预期：全部退出码为 `0`。

- [ ] **步骤 5：本地 smoke test**

一个终端运行：

```bash
npm run build
mkdir -p config data/demo-room logs/clientlogs
cp deploy/config.json.example config/app.json
printf 'latest' > data/demo-room/latest.snapshot
printf 'old' > data/demo-room/old.snapshot
printf 'client log' > logs/clientlogs/demo-room.log
node lib/index.js
```

另一个终端运行：

```bash
curl -s http://127.0.0.1:3000/admin/disk/cleanup/status
curl -s -X POST http://127.0.0.1:3000/admin/disk/cleanup
```

预期：两个响应都返回 JSON，且 `status` 为 `"ok"`。

- [ ] **步骤 6：检查点**

```bash
git add src/init.ts src/file.ts src/index.ts src/admin-auth.ts test/admin-auth.test.js
git diff --cached --stat
```

预期：只包含运行时接入、admin 鉴权和对应测试。

---

### 任务 4：保持 snapshot URL 兼容 nginx HTTP 部署

**文件：**
- 新建：`test/url.test.js`
- 新建：`src/url.ts`
- 修改：`src/index.ts`

- [ ] **步骤 1：编写 URL 测试**

创建 `test/url.test.js`，验证：

- 未配置 `snapshotHost` 时，使用请求 host。
- 配置 `snapshotHost` 时，优先使用配置值。
- URL 路径仍然是现有 `/:roomId/snapshots/latest.snapshot`。

测试结构：

```javascript
const assert = require("assert");
const {
  resolvePublicBaseUrl,
  snapshotDownloadPath,
  snapshotPublicUrl,
} = require("../lib/url");

function request(protocol, host) {
  return {
    protocol,
    get(name) {
      return name.toLowerCase() === "host" ? host : undefined;
    },
  };
}

assert.strictEqual(resolvePublicBaseUrl(request("http", "10.0.0.12"), {}), "http://10.0.0.12");
assert.strictEqual(
  resolvePublicBaseUrl(request("http", "10.0.0.12"), { snapshotHost: "https://white.example.com/" }),
  "https://white.example.com"
);
assert.strictEqual(snapshotDownloadPath("room-001"), "/room-001/snapshots/latest.snapshot");
assert.strictEqual(
  snapshotPublicUrl(request("http", "10.0.0.12"), {}, "room-001"),
  "http://10.0.0.12/room-001/snapshots/latest.snapshot"
);
assert.throws(() => resolvePublicBaseUrl(request("http", undefined), {}), /missing Host header/);

console.log("url tests passed");
```

- [ ] **步骤 2：实现 `src/url.ts` 并接入 `src/index.ts`**

实现 `resolvePublicBaseUrl()`、`snapshotDownloadPath()`、`snapshotPublicUrl()`，并替换 `/snapshot/:roomId` 和 `/v2/snapshot/:roomId` 中手拼 `config.snapshotHost` 的逻辑。

- [ ] **步骤 3：运行测试**

```bash
npm run test:url
```

预期：退出码为 `0`，输出 `url tests passed`。

- [ ] **步骤 4：检查点**

```bash
git add src/url.ts src/index.ts test/url.test.js
git diff --cached --stat
```

预期：只包含 snapshot URL 生成和对应测试。

---

### 任务 5：增加 setup 模式选择，并限制 Docker stdout 日志

**文件：**
- 新建：`test/deploy-config.test.js`
- 修改：`deploy/nginx.conf`
- 新建：`deploy/docker-compose.app.yaml.example`
- 新建：`deploy/docker-compose.nginx.yaml.example`
- 修改：`deploy/config.json.example`
- 新建：`deploy/setup.sh`
- 修改：`deploy/install.sh`
- 修改：`deploy/start.sh`

- [ ] **步骤 1：编写部署配置测试**

创建 `test/deploy-config.test.js`，验证：

- `deploy/config.json.example` 是严格 JSON。
- `diskRetention` 默认配置存在。
- nginx 监听 `80`，反代到 `forge-persistence:3000`。
- nginx 不特殊拦截 `/admin/`，admin 鉴权统一由 app 返回 `401` 或 `200`。
- `setup.sh` 默认使用独立 app 模式。
- `setup.sh nginx` 使用 nginx 反代模式。
- nginx 模式下 app 不直接暴露 `3000:3000` 到宿主机；独立 app 模式下 app 暴露 `3000:3000`。
- 两种部署模式都配置 Docker json log 上限。
- nginx compose 使用固定镜像版本，例如 `nginx:1.27.5-alpine`，不能出现 `nginx:latest`。

- [ ] **步骤 2：保留 nginx 配置为可选 HTTP 反代模板**

`deploy/nginx.conf` 改成 HTTP 反代。不要添加单独的 `/admin/` 阻断规则，admin 接口由 app 统一执行 token 鉴权。

- [ ] **步骤 3：拆分 compose 模板**

新增 `deploy/docker-compose.app.yaml.example`，只包含 `forge-persistence`；新增 `deploy/docker-compose.nginx.yaml.example`，包含 `forge-persistence` 和 `nginx`。两个模板里的 service 都加入：

```yaml
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
```

独立 app 模式下 `forge-persistence` 使用 `ports: ["3000:3000"]`。nginx 模式下 `forge-persistence` 只使用 `expose: ["3000"]`，nginx 使用 `ports: ["80:80"]`。

- [ ] **步骤 4：更新 app 示例配置**

`deploy/config.json.example` 改成严格 JSON，并加入：

```json
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
```

- [ ] **步骤 5：新增 setup.sh 并保留兼容脚本**

`setup.sh`：

- `./setup.sh`：加载 app 镜像，复制 `docker-compose.app.yaml.example` 为 `docker-compose.yaml`，启动独立 app 模式。
- `./setup.sh nginx`：加载 app 镜像和 `nginx.tar`，复制 `docker-compose.nginx.yaml.example` 为 `docker-compose.yaml`，初始化 `config/nginx.conf`，启动 nginx 反代模式。
- 两种模式都创建 `config`、`logs`、`data`。
- 不覆盖已有 `config/app.json` 和 `config/nginx.conf`。
- 不支持其他参数；非法参数输出 usage 并退出非 0。

`install.sh` 和 `start.sh`：保留为兼容入口，内部调用 `setup.sh "$@"` 或提示改用 `setup.sh`。

- [ ] **步骤 6：运行部署配置测试**

```bash
npm run test:deploy-config
```

预期：退出码为 `0`，输出 `deploy config tests passed`。

- [ ] **步骤 7：检查点**

```bash
git add deploy/nginx.conf deploy/docker-compose.app.yaml.example deploy/docker-compose.nginx.yaml.example deploy/config.json.example deploy/setup.sh deploy/install.sh deploy/start.sh test/deploy-config.test.js package.json
git diff --cached --stat
```

预期：只包含部署模板、示例配置、setup 脚本和部署配置测试。

---

### 任务 6：让镜像和安装包构建更确定

**文件：**
- 修改：`Dockerfile`
- 修改：`buildpack.sh`

- [ ] **步骤 1：镜像构建时编译 TypeScript**

`Dockerfile` 改成构建时执行 `yarn build`，运行时执行：

```dockerfile
ENTRYPOINT ["node", "./lib/index.js"]
```

- [ ] **步骤 2：buildpack 同时打包 app 和固定版本 nginx**

`buildpack.sh` 需要：

- 从 `package.json` 读取版本。
- 生成带版本号的 `deploy/docker-compose.app.yaml` 和 `deploy/docker-compose.nginx.yaml`。
- 构建 `registry.netless.link/app/forge-persistence-private:${VERSION}`。
- 设置 `NGINX_IMAGE=nginx:1.27.5-alpine`。
- `docker pull ${NGINX_IMAGE}`。
- 保存 `deploy/nginx.tar`，供 `setup.sh nginx` 使用。
- 保存 `deploy/forge-persistence-private-${VERSION}.tar`。
- 更新 `deploy/setup.sh`、`deploy/install.sh`、`deploy/start.sh` 中的 `export VERSION`。
- 输出 `forge-persistence-private-${VERSION}-install.tar`。

- [ ] **步骤 3：验证**

```bash
bash -n buildpack.sh deploy/setup.sh deploy/install.sh deploy/start.sh
npm run build
```

预期：全部退出码为 `0`。

- [ ] **步骤 4：检查点**

```bash
git add Dockerfile buildpack.sh deploy/docker-compose.app.yaml deploy/docker-compose.nginx.yaml
git diff --cached --stat
```

预期：只包含 Dockerfile、buildpack 和生成的两套 compose 文件。

---

### 任务 7：文档化所有落盘内容和滚动清理策略

**文件：**
- 修改：`README.md`

- [ ] **步骤 1：更新 README**

README 需要说明这些内容：

- 客户端 `sdkConfig.region` 设置为 `private`。
- `endpoint` 使用私有化部署入口，例如 `http://10.0.0.12`。
- 默认安装只需要修改 `rtm.appId` 和 `rtm.appCertificate`。
- 当前包只配置 HTTP；域名和 HTTPS 由客户侧或 SA 在统一网关、负载均衡或外部反代处理。
- 部署模式兼容说明：`./setup.sh` 保留旧的 app 直连 `3000:3000` 行为；`./setup.sh nginx` 才使用 nginx 暴露 `80:80`。如果客户旧 endpoint 写的是 `http://host:3000`，默认模式不需要改 endpoint；切到 nginx 模式时 endpoint 改成 `http://host`。
- 旧 TLS 示例不再作为默认路径；需要 TLS 的客户应在外部网关/负载均衡/客户自有 nginx 上终止 HTTPS，或由 SA 按现场要求维护单独示例。

列出所有落盘内容：

```text
./data/<roomId>/latest.snapshot
./data/<roomId>/<timestamp>.snapshot
./logs/server.log
./logs/server.<timestamp>.log
./logs/clientlogs/<roomId>.log
Docker json-file logs
```

说明滚动策略：

- 历史 snapshot 超过 `maxSnapshotHistoryAgeDays` 后删除。
- snapshot 总量超过 `maxSnapshotGB` 时，优先删除最旧历史 snapshot。
- 服务端 `server.log` 超过 `serverLogMaxMB` 后滚动成 `server.<timestamp>.log`。
- 已滚动 server log 和 client log 超过 `maxLogAgeDays` 后删除。
- 日志总量超过 `maxLogGB` 时，优先删除最旧可删日志。
- 磁盘剩余空间低于 `minFreeGB` 时，按历史 snapshot、可删日志、显式允许删除的过旧 latest 的顺序清理。
- `latest.snapshot` 和当前 `server.log` 默认保护；只有设置 `allowDeleteLatestSnapshot: true` 且超过 `deleteLatestAfterDays` 后，latest 才可能作为最后一档被删除。
- Docker stdout 日志由 compose `logging.max-size/max-file` 限制。

SA 手动清理：

```bash
sudo docker compose exec forge-persistence curl -s http://127.0.0.1:3000/admin/disk/cleanup/status
sudo docker compose exec forge-persistence curl -s -X POST http://127.0.0.1:3000/admin/disk/cleanup
```

SA 滚动更新：

```bash
tar -xzvf forge-persistence-private-${NEW_VERSION}-install.tar
cd forge-persistence
./setup.sh

# 如果需要 nginx 反代模式：
./setup.sh nginx
```

SA 日志获取：

```bash
sudo docker compose logs --tail=200 forge-persistence
# 仅 nginx 模式需要：
sudo docker compose logs --tail=200 nginx
tar -czvf forge-persistence-logs-$(date +%Y%m%d%H%M%S).tar.gz logs
```

- [ ] **步骤 2：验证**

```bash
npm run test:private-deploy
bash -n buildpack.sh deploy/setup.sh deploy/install.sh deploy/start.sh
```

预期：全部退出码为 `0`。

- [ ] **步骤 3：检查点**

```bash
git add README.md
git diff --cached --stat
```

预期：只包含 `README.md`。

---

### 任务 8：最终验证和变更影响检查

**文件：**
- 不新增文件
- 验证所有已修改文件

- [ ] **步骤 1：运行本地验证**

```bash
npm run test:private-deploy
bash -n buildpack.sh deploy/setup.sh deploy/install.sh deploy/start.sh
```

预期：所有命令都退出码为 `0`。

- [ ] **步骤 2：如果 Docker Compose 可用，验证 compose 语法**

```bash
docker compose -f deploy/docker-compose.app.yaml.example config
docker compose -f deploy/docker-compose.nginx.yaml.example config
```

预期：退出码为 `0`，输出规范化后的 compose 配置，独立模板包含 `forge-persistence`，nginx 模板包含 `forge-persistence` 和 `nginx`，两者都包含 logging 限制。

- [ ] **步骤 3：最终提交前运行 GitNexus change detection**

```bash
gitnexus_detect_changes(scope: "all", repo: "forge-persistence")
```

预期：受影响范围限制在本地磁盘清理、日志滚动、本地文件处理、snapshot URL 生成、私有化部署脚本、nginx 配置和文档。

- [ ] **步骤 4：检查 git diff**

```bash
git status --short
git diff --stat
```

预期修改文件：

```text
Dockerfile
README.md
buildpack.sh
deploy/config.json.example
deploy/docker-compose.app.yaml.example
deploy/docker-compose.nginx.yaml.example
deploy/docker-compose.yaml
deploy/docker-compose.yaml.example
deploy/install.sh
deploy/nginx.conf
deploy/setup.sh
deploy/start.sh
package.json
src/disk-cleaner.ts
src/file.ts
src/index.ts
src/init.ts
src/log.ts
src/admin-auth.ts
src/url.ts
test/admin-auth.test.js
test/deploy-config.test.js
test/disk-cleaner.test.js
test/file-logger.test.js
test/url.test.js
tsconfig.json
```

- [ ] **步骤 5：最终提交**

```bash
git add Dockerfile README.md buildpack.sh deploy/config.json.example deploy/docker-compose.app.yaml.example deploy/docker-compose.nginx.yaml.example deploy/docker-compose.yaml deploy/docker-compose.yaml.example deploy/install.sh deploy/nginx.conf deploy/setup.sh deploy/start.sh package.json src/admin-auth.ts src/disk-cleaner.ts src/file.ts src/index.ts src/init.ts src/log.ts src/url.ts test/admin-auth.test.js test/deploy-config.test.js test/disk-cleaner.test.js test/file-logger.test.js test/url.test.js tsconfig.json
git commit -m "feat: simplify private deployment and manage disk retention"
```

---

## 自检

- 需求覆盖：已搜索当前代码和部署文件里的所有本地写盘点，计划覆盖 `./data`、`./logs/server.log`、`./logs/clientlogs`、Docker stdout 日志。
- snapshot：历史文件有过期删除、目录容量上限和低磁盘空间清理；`latest.snapshot` 默认永不自动删除，只有显式配置后才作为最后一档处理。
- 服务端日志：有按大小滚动，滚动后的旧日志纳入保留天数和容量治理。
- 客户端日志：按保留天数和日志总量治理，并通过 handler 协调 active stream，避免直接 unlink 正在写入的文件。
- Docker 日志：通过 compose `logging.max-size/max-file` 治理。
- admin：`/admin/disk/cleanup` 有应用层 token 保护，token 缺失或错误返回 `401`；nginx 模式下也反代到 app，由 app 统一鉴权。
- 部署：`setup.sh` 默认独立 app 模式，`setup.sh nginx` 才启用 nginx HTTP 反代模式；默认端口兼容旧的 `3000:3000`。
- 不新增文件托管服务，不新增静态 `/files` server，不上传日志，不开放公网日志下载。
