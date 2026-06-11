const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  LocalClientLoggerHandler,
  LocalSnapshotHandler,
  validateClientLogsPayload,
  validateRoomId,
} = require("../lib/file");

const logger = {
  info() {},
  warn() {},
  error() {},
};

function assertRejectsUnsafeRoomId(roomId) {
  assert.throws(
    () => validateRoomId(roomId),
    /invalid roomId/
  );
}

assert.strictEqual(validateRoomId("room_123-abc"), "room_123-abc");
assertRejectsUnsafeRoomId("");
assertRejectsUnsafeRoomId("../config");
assertRejectsUnsafeRoomId("room/a");
assertRejectsUnsafeRoomId("room\\a");
assertRejectsUnsafeRoomId(".");
assertRejectsUnsafeRoomId("..");
assertRejectsUnsafeRoomId(123);

assert.deepStrictEqual(
  validateClientLogsPayload({
    roomId: "room-a",
    userId: "user-a",
    logs: [{ timestamp: 1000, level: "info" }],
  }),
  {
    roomId: "room-a",
    userId: "user-a",
    logs: [{ timestamp: 1000, level: "info" }],
  }
);

assert.throws(() => validateClientLogsPayload({ roomId: "room-a", logs: [] }), /non-empty logs/);
assert.throws(() => validateClientLogsPayload({ roomId: "room-a" }), /non-empty logs/);
assert.throws(() => validateClientLogsPayload({ roomId: "../bad", logs: [{ timestamp: 1 }] }), /invalid roomId/);
assert.throws(() => validateClientLogsPayload({ roomId: "room-a", logs: [{ level: "info" }] }), /invalid log timestamp/);
assert.throws(() => validateClientLogsPayload({ roomId: "room-a", logs: [{ timestamp: NaN }] }), /invalid log timestamp/);

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-path-safety-"));
  const clientLogRoot = path.join(root, "logs/clientlogs");
  const snapshotRoot = path.join(root, "data");
  const clientLogger = new LocalClientLoggerHandler(clientLogRoot, logger);
  const snapshotHandler = new LocalSnapshotHandler(snapshotRoot, logger);

  assert.throws(
    () => clientLogger.putLogs("../escape", [{ time: 1, contents: [] }]),
    /invalid roomId/
  );
  assert.strictEqual(fs.existsSync(path.join(root, "logs/escape.log")), false);

  await assert.rejects(
    () => snapshotHandler.putSnapshot("../escape", Buffer.from("snapshot")),
    /invalid roomId/
  );
  assert.strictEqual(fs.existsSync(path.join(root, "escape")), false);

  fs.rmSync(root, { recursive: true, force: true });
  console.log("file path safety tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
