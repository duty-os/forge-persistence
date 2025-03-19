import { constants, createWriteStream, mkdirSync, writeFile } from "fs";
import { access, mkdir, readFile } from "fs/promises";
import { Logger } from "./log";

export class LocalClientLoggerHandler {

  private streams: Map<string, { timestamp: number, stream: import("fs").WriteStream; }>;
  private path: string;
  logger: Logger;

  constructor(path: string, logger: Logger) {
    this.path = path;
    this.logger = logger;
    this.streams = new Map();
    mkdirSync(`${this.path}`, { recursive: true });
    setInterval(this.clearStream.bind(this), 60 * 1000);
  }
  clearStream() {
    const curr = new Date().getTime();
    this.streams.forEach((v, k) => {
      if (curr - v.timestamp > 10 * 60 * 1000) {
        // 清理大于10分钟的文件句柄
        v.stream.close();
        this.streams.delete(k);
      }
    });
  }

  public putLogs(roomId: string, logs: { time: number, contents: Array<any>; }) {
    const curr = new Date().getTime();
    let stream = this.streams.get(roomId);
    if (!stream) {
      stream = {
        timestamp: curr,
        stream: createWriteStream(this.path + `/${roomId}.log`, { flags: 'a+' })
      };
    }
    stream.timestamp = curr;
    stream.stream.write(JSON.stringify(logs) + '\r\n');
    stream.stream.end();
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
    await mkdir(`${this.path}/${roomId}`, { recursive: true });
    await this.write(`${this.path}/${roomId}/latest.snapshot`, snapshot);
    await this.write(`${this.path}/${roomId}/${new Date().getTime()}.snapshot`, snapshot);
  }

  public async getLatestSnapshot(roomId: string): Promise<Buffer<ArrayBuffer> | null> {
    const path = this.path + `/${roomId}/latest.snapshot`
    try {
      const buf = await readFile(path);
      return Buffer.from(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    } catch(err) {
      if (err.message.indexOf("ENOENT: no such file or directory") > -1) {
        return null;
      } else {
        throw err
      }
    }
  }
}