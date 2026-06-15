import { constants, createWriteStream, mkdirSync, writeFile } from "fs";
import { access, mkdir, readFile, rm } from "fs/promises";
import path from "path";
import { Logger } from "./log";

export function validateRoomId(roomId: unknown): string {
  if (
    typeof roomId !== "string" ||
    roomId.length === 0 ||
    roomId.length > 256 ||
    roomId === "." ||
    roomId === ".." ||
    roomId.includes("/") ||
    roomId.includes("\\")
  ) {
    throw new Error("invalid roomId");
  }
  return roomId;
}

export function validateClientLogsPayload(body: any): {
  roomId: string;
  userId: string | undefined;
  logs: Array<{ timestamp: number; [key: string]: any }>;
} {
  const roomId = validateRoomId(body?.roomId);
  const logs = body?.logs;
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new Error("client logs payload must include non-empty logs");
  }
  logs.forEach((log) => {
    if (typeof log?.timestamp !== "number" || !Number.isFinite(log.timestamp)) {
      throw new Error("invalid log timestamp");
    }
  });
  return {
    roomId,
    userId: body?.userId,
    logs,
  };
}

export class LocalClientLoggerHandler {

  private streams: Map<string, { timestamp: number, stream: import("fs").WriteStream; }>;
  private path: string;
  logger: Logger;

  constructor(path: string, logger: Logger) {
    this.path = path;
    this.logger = logger;
    this.streams = new Map();
    mkdirSync(`${this.path}`, { recursive: true });
    const timer = setInterval(this.clearStream.bind(this), 60 * 1000);
    timer.unref?.();
  }
  clearStream() {
    const curr = new Date().getTime();
    this.streams.forEach((v, k) => {
      if (curr - v.timestamp > 10 * 60 * 1000) {
        // 清理大于10分钟的文件句柄
        v.stream.end();
        v.stream.close();
        this.streams.delete(k);
      }
    });
  }

  public putLogs(roomId: string, logs: Array<{ time: number, contents: Array<any>; }>) {
    validateRoomId(roomId);
    const curr = new Date().getTime();
    let stream = this.streams.get(roomId);
    if (!stream) {
      stream = {
        timestamp: curr,
        stream: createWriteStream(this.path + `/${roomId}.log`, { flags: 'a+' })
      };
      this.streams.set(roomId, stream);
    }
    stream.timestamp = curr;
    stream.stream.write(JSON.stringify(logs) + '\r\n');
  }

  public getLogRoot(): string {
    return this.path;
  }

  public getActiveLogRelativePaths(): Set<string> {
    return new Set(
      Array.from(this.streams.keys()).map((roomId) => `logs/clientlogs/${validateRoomId(roomId)}.log`)
    );
  }

  public async deleteClientLogSafely(filePath: string): Promise<void> {
    const roomId = path.basename(filePath, ".log");
    const stream = this.streams.get(roomId);
    if (stream) {
      stream.stream.end();
      stream.stream.close();
      this.streams.delete(roomId);
    }
    await rm(filePath, { force: true });
  }

}

export class LocalSnapshotHandler {
  path: string;
  logger: Logger;

  constructor(path: string, logger: Logger) {
    this.path = path;
    this.logger = logger;
    mkdirSync(`${this.path}`, { recursive: true });
  }

  async write(path: string, snapshot: Buffer<ArrayBuffer>): Promise<void> {
    return new Promise((resolve, reject) => {
      writeFile(path, snapshot, "binary", (err) => {
        if (err) {
          // logger.error(`write ${path} error`, err);
          reject(err);
        } else {
          resolve();
        }
      }
      );
    });
  }

  public async putSnapshot(roomId: string, snapshot: Buffer<ArrayBuffer>): Promise<void> {
    validateRoomId(roomId);
    await mkdir(`${this.path}/${roomId}`, { recursive: true });
    await this.write(`${this.path}/${roomId}/latest.snapshot`, snapshot);
    await this.write(`${this.path}/${roomId}/${new Date().getTime()}.snapshot`, snapshot);
  }

  public getSnapshotRoot(): string {
    return this.path;
  }

  public async getLatestSnapshot(roomId: string): Promise<Buffer<ArrayBuffer> | null> {
    validateRoomId(roomId);
    const path = this.path + `/${roomId}/latest.snapshot`;
    try {
      const buf = await readFile(path);
      return Buffer.from(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return null;
      } else {
        throw err;
      }
    }
  }
}
