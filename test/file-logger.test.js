const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fsModule = require("fs");
const { FileLogger } = require("../lib/log");

async function waitForFlush() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-logger-"));
  const logPath = path.join(root, "server.log");
  const logger = new FileLogger(logPath, { maxBytes: 80 });

  logger.info("first log line", { payload: "x".repeat(80) });
  await waitForFlush();
  logger.info("second log line", { payload: "y".repeat(80) });
  await waitForFlush();
  logger.close();

  const files = fs.readdirSync(root).sort();
  assert(files.includes("server.log"));
  assert(files.some((file) => /^server\.\d+\.log$/.test(file)), files.join(","));
  assert(fs.statSync(logPath).size > 0);

  const renameRoot = fs.mkdtempSync(path.join(os.tmpdir(), "file-logger-rename-"));
  const renameLogPath = path.join(renameRoot, "server.log");
  fs.writeFileSync(renameLogPath, "seed");
  const originalRenameSync = fsModule.renameSync;
  let renameAttempts = 0;
  fsModule.renameSync = () => {
    renameAttempts += 1;
    throw new Error("rename failed");
  };

  try {
    const renameLogger = new FileLogger(renameLogPath, { maxBytes: 1 });
    assert.doesNotThrow(() => {
      renameLogger.info("rotation fallback", { payload: "z".repeat(80) });
    });
    assert.doesNotThrow(() => {
      renameLogger.info("rotation fallback second line", { payload: "w".repeat(80) });
    });
    await waitForFlush();
    renameLogger.close();
    assert.strictEqual(renameAttempts, 1);
    assert(fs.existsSync(renameLogPath));
    assert(fs.readFileSync(renameLogPath, "utf8").includes("rotation fallback"));
  } finally {
    fsModule.renameSync = originalRenameSync;
    fs.rmSync(renameRoot, { recursive: true, force: true });
  }

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "file-logger-missing-"));
  const missingLogPath = path.join(missingRoot, "server.log");
  fs.writeFileSync(missingLogPath, "seed");
  const missingLogger = new FileLogger(missingLogPath, { maxBytes: 1 });
  fs.rmSync(missingLogPath, { force: true });
  assert.doesNotThrow(() => {
    missingLogger.info("recreate-after-missing", { payload: "q".repeat(80) });
  });
  await waitForFlush();
  missingLogger.close();
  assert(fs.existsSync(missingLogPath));
  assert(fs.readFileSync(missingLogPath, "utf8").includes("recreate-after-missing"));
  fs.rmSync(missingRoot, { recursive: true, force: true });

  fs.rmSync(root, { recursive: true, force: true });
  console.log("file logger tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
