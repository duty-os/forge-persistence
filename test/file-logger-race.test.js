const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fsModule = require("fs");
const { FileLogger } = require("../lib/log");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-logger-race-"));
const logPath = path.join(root, "server.log");
fs.writeFileSync(logPath, "seed");

const originalStatSync = fsModule.statSync;
let statCalls = 0;
fsModule.statSync = (targetPath) => {
  if (targetPath === logPath) {
    statCalls += 1;
    if (statCalls === 1 || statCalls === 2) {
      const error = new Error("ENOENT: no such file or directory");
      error.code = "ENOENT";
      throw error;
    }
  }
  return originalStatSync(targetPath);
};

try {
  assert.doesNotThrow(() => {
    const logger = new FileLogger(logPath, { maxBytes: 1 });
    logger.info("race-safe", { payload: "x".repeat(80) });
    logger.close();
  });
} finally {
  fsModule.statSync = originalStatSync;
  setTimeout(() => {
    fs.rmSync(root, { recursive: true, force: true });
  }, 20);
}

console.log("file logger race tests passed");
