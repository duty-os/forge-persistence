import { readFileSync } from "fs";
import { LocalClientLoggerHandler, LocalSnapshotHandler } from "./file";
import { FileLogger } from "./log";

type Config = {
    serviceType: "localFile" | "aliyun",
    localFile?: {
        // historyDataPath: string
        snapshotDataPath: string;
        logFilePath: string;
        clientlogPath: string;
    };
    aliyun?: {

    };
    snapshotHost: string;
};
const configFile = readFileSync("./config/app.json", 'utf8');
export const config: Config = JSON.parse(configFile);

export const logger = new FileLogger(config.localFile!.logFilePath);
export const clientLogger = new LocalClientLoggerHandler(config.localFile!.clientlogPath, logger);
export const snapshotHandler = new LocalSnapshotHandler(config.localFile!.snapshotDataPath, logger)

