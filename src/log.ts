import { hostname } from "os";
import { createWriteStream, existsSync, renameSync, statSync } from "fs";
import path from "path";

export interface LoggerHandler {
  handler(jsonedLog: string);
}

export type Log = {
  level: "debug" | "info" | "warn" | "error";
  ctx: any;
  message: string;
  timestamp: number;
  datetime: Date;
  error?: {
    stack: string;
    errMessage: string;
  };
};

export interface Logger {
  info(msg: string, ctx?: any): void;
  warn(msg: string, error?: Error, ctx?: any): void;
  error(msg: string, error?: Error, ctx?: any): void;
  debug(msg: string, ctx?: any): void;
}

export class FileLogger implements LoggerHandler, Logger {

  private globalContext: any;
  private path: string;
  private stream: import("fs").WriteStream;
  private maxBytes?: number;
  private currentBytes: number;

  constructor(path: string, options?: { maxBytes?: number }) {
    this.path = path;
    this.maxBytes = options?.maxBytes;
    this.globalContext = {
      hostname: hostname(),
    };
    try {
      this.currentBytes = existsSync(this.path) ? statSync(this.path).size : 0;
    } catch {
      this.currentBytes = 0;
    }
    this.stream = createWriteStream(this.path, { flags: 'a+' });
  }

  handler(jsonedLog: string) {
    console.log(jsonedLog);
    const line = jsonedLog + "\r\n";
    const lineBytes = Buffer.byteLength(line);
    this.rotateIfNeeded(lineBytes);
    this.stream.write(line);
    this.currentBytes += lineBytes;
  }

  private rotateIfNeeded(nextBytes: number) {
    if (!this.maxBytes || this.currentBytes + nextBytes <= this.maxBytes) {
      return;
    }
    this.stream.end();
    this.stream.close();
    let rotated = false;
    if (existsSync(this.path)) {
      const parsed = path.parse(this.path);
      const rotatedPath = path.join(parsed.dir, `${parsed.name}.${Date.now()}${parsed.ext}`);
      try {
        renameSync(this.path, rotatedPath);
        rotated = true;
      } catch {
        try {
          this.currentBytes = existsSync(this.path) ? statSync(this.path).size : this.currentBytes;
        } catch {
          this.currentBytes = 0;
        }
      }
    } else {
      this.currentBytes = 0;
    }
    this.stream = createWriteStream(this.path, { flags: "a+" });
    if (rotated) {
      this.currentBytes = 0;
    }
  }

  public close() {
    this.stream.end();
    this.stream.close();
  }

  log(level: "debug" | "info" | "warn" | "error", msg: string, error?: Error, ctx?: any) {
    const curr = new Date();
    const log: Log = {
      message: msg,
      level: level,
      datetime: curr,
      timestamp: curr.getTime(),
      ctx: { ...this.globalContext, ...ctx }
    };

    if (error) {
      log["error"] = {
        stack: error.stack || "",
        errMessage: error.message
      };
    }
    this.handler(JSON.stringify(log));
  }

  public info(msg: string, ctx?: any) {
    this.log("info", msg, undefined , ctx);
  }
  public warn(msg: string, error?: Error, ctx?: any) {
    this.log("warn", msg, error, ctx);
  }
  public error(msg: string, error?: Error, ctx?: any) {
    this.log("error", msg, error, ctx);
  }
  public debug(msg: string, ctx?: any) {
    this.log("debug", msg, ctx);
  }
}
