const assert = require("assert");
const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  DEFAULT_DISK_RETENTION_POLICY,
  DiskCleaner,
  classifyManagedFile,
  scanManagedFiles,
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

{
  const result = planDiskCleanup({
    files: [
      item("logs/clientlogs/active-room.log", 30, 1000),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxLogAgeDays: 14,
      maxLogGB: 0.0000001,
    },
    nowMs: now,
    freeBytes: 1000,
    activeRelativePaths: new Set(["logs/clientlogs/active-room.log"]),
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), []);
  assert.strictEqual(result.overLimit, true);
}

{
  const result = planDiskCleanup({
    files: [
      item("data/room-a/old.snapshot", 20, 1000),
    ],
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxSnapshotHistoryAgeDays: 7,
      minFreeGB: 0.0000005,
    },
    nowMs: now,
    freeBytes: 0,
  });

  assert.deepStrictEqual(result.deleteFiles.map((file) => file.relativePath), [
    "data/room-a/old.snapshot",
  ]);
  assert.strictEqual(result.overLimit, false);
}

{
  const logger = {
    info() {},
    error() {},
  };
  let processUnhandled = false;
  const onUnhandled = () => {
    processUnhandled = true;
  };
  process.once("unhandledRejection", onUnhandled);

  const cleaner = new DiskCleaner({
    paths: {
      snapshotDataPath: "/tmp/does-not-matter",
      serverLogFilePath: "/tmp/does-not-matter/server.log",
      clientLogPath: "/tmp/does-not-matter/clientlogs",
    },
    policy: DEFAULT_DISK_RETENTION_POLICY,
    logger,
  });

  cleaner.run = async () => {
    throw new Error("background-cleanup-failed");
  };
  cleaner.requestRun("test");

  setTimeout(() => {
    process.removeListener("unhandledRejection", onUnhandled);
    assert.strictEqual(processUnhandled, false);
  }, 20);
}

function writeFile(root, relativePath, content, ageDays) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const mtime = new Date(now - ageDays * day);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "disk-cleaner-"));
  writeFile(root, "data/room-a/latest.snapshot", "latest", 1);
  writeFile(root, "data/room-a/old.snapshot", "old", 20);
  writeFile(root, "logs/server.log", "active", 20);
  writeFile(root, "logs/server.1710000000000.log", "rotated", 20);
  writeFile(root, "logs/clientlogs/room-a.log", "client", 20);

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
  assert.strictEqual(fs.existsSync(path.join(root, "data/room-a")), true);

  fs.rmSync(root, { recursive: true, force: true });

  const emptyRoomRoot = fs.mkdtempSync(path.join(os.tmpdir(), "disk-cleaner-empty-room-"));
  writeFile(emptyRoomRoot, "data/room-b/old.snapshot", "old", 20);

  const cleanupEmptyRoom = await cleanupDisk({
    paths: {
      snapshotDataPath: path.join(emptyRoomRoot, "data"),
      serverLogFilePath: path.join(emptyRoomRoot, "logs/server.log"),
      clientLogPath: path.join(emptyRoomRoot, "logs/clientlogs"),
    },
    policy: {
      ...DEFAULT_DISK_RETENTION_POLICY,
      maxSnapshotHistoryAgeDays: 7,
      maxSnapshotGB: 1,
      maxLogGB: 1,
    },
    nowMs: now,
    freeBytes: 1024,
  });

  assert.strictEqual(cleanupEmptyRoom.deletedCount, 1);
  assert.strictEqual(fs.existsSync(path.join(emptyRoomRoot, "data/room-b")), false);
  fs.rmSync(emptyRoomRoot, { recursive: true, force: true });

  const disappearingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "disk-cleaner-disappearing-"));
  const disappearingLog = writeFile(disappearingRoot, "logs/clientlogs/disappearing.log", "client", 1);
  const originalStat = fsPromises.stat;
  fsPromises.stat = async (filePath) => {
    if (filePath === disappearingLog) {
      fs.rmSync(disappearingLog, { force: true });
      const error = new Error("ENOENT: no such file or directory");
      error.code = "ENOENT";
      throw error;
    }
    return originalStat(filePath);
  };

  let scannedFiles;
  try {
    scannedFiles = await scanManagedFiles({
      snapshotDataPath: path.join(disappearingRoot, "data"),
      serverLogFilePath: path.join(disappearingRoot, "logs/server.log"),
      clientLogPath: path.join(disappearingRoot, "logs/clientlogs"),
    });
  } finally {
    fsPromises.stat = originalStat;
  }

  assert.deepStrictEqual(scannedFiles, []);
  fs.rmSync(disappearingRoot, { recursive: true, force: true });

  const multiMountRoot = fs.mkdtempSync(path.join(os.tmpdir(), "disk-cleaner-mounts-"));
  fs.mkdirSync(path.join(multiMountRoot, "snapshots"), { recursive: true });
  fs.mkdirSync(path.join(multiMountRoot, "logs/clientlogs"), { recursive: true });
  fs.writeFileSync(path.join(multiMountRoot, "logs/server.log"), "seed");

  const originalStatfs = fsPromises.statfs;
  fsPromises.statfs = async (targetPath) => {
    if (targetPath === path.join(multiMountRoot, "snapshots")) {
      return { bavail: 1000, bsize: 1024 };
    }
    if (
      targetPath === path.join(multiMountRoot, "logs/server.log") ||
      targetPath === path.join(multiMountRoot, "logs/clientlogs")
    ) {
      return { bavail: 1, bsize: 1024 };
    }
    return originalStatfs(targetPath);
  };

  const loggerMessages = [];
  try {
    const cleaner = new DiskCleaner({
      paths: {
        snapshotDataPath: path.join(multiMountRoot, "snapshots"),
        serverLogFilePath: path.join(multiMountRoot, "logs/server.log"),
        clientLogPath: path.join(multiMountRoot, "logs/clientlogs"),
      },
      policy: DEFAULT_DISK_RETENTION_POLICY,
      logger: {
        info(message, ctx) {
          loggerMessages.push({ message, ctx });
        },
        error(message, error, ctx) {
          loggerMessages.push({ message, error, ctx });
        },
      },
      deleteFile: async () => undefined,
    });
    await cleaner.run("mount-check");
  } finally {
    fsPromises.statfs = originalStatfs;
  }

  const mountCheckLog = loggerMessages.find((entry) => entry.message === "disk cleanup finished");
  assert(mountCheckLog);
  assert.strictEqual(mountCheckLog.ctx.freeBytes, 1024);
  fs.rmSync(multiMountRoot, { recursive: true, force: true });

  await new Promise((resolve) => setTimeout(resolve, 40));

  console.log("disk cleaner tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
