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
  fsModule.renameSync = () => {
    throw new Error("rename failed");
  };

  try {
    const renameLogger = new FileLogger(renameLogPath, { maxBytes: 1 });
    assert.doesNotThrow(() => {
      renameLogger.info("rotation fallback", { payload: "z".repeat(80) });
    });
    await waitForFlush();
    renameLogger.close();
    assert(fs.existsSync(renameLogPath));
    assert(fs.readFileSync(renameLogPath, "utf8").includes("rotation fallback"));
  } finally {
    fsModule.renameSync = originalRenameSync;
    fs.rmSync(renameRoot, { recursive: true, force: true });
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log("file logger tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
