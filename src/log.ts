import { hostname } from "os";
import { createWriteStream, writeFileSync } from "fs";

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

  constructor(path: string) {
    this.path = path;
    this.globalContext = {
      hostname: hostname(),
    };
    this.stream = createWriteStream(this.path, { flags: 'a+' });
  }

  handler(jsonedLog: string) {
    console.log(jsonedLog);
    this.stream.write(jsonedLog + "\r\n");
    this.stream.end();
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
    this.log("info", msg, ctx);
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
