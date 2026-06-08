import { readFileSync } from "fs";
import { rm } from "fs/promises";
import { LocalClientLoggerHandler, LocalSnapshotHandler } from "./file";
import { FileLogger } from "./log";
import {
    DEFAULT_DISK_RETENTION_POLICY,
    DiskCleaner,
    DiskRetentionPolicy,
    ManagedFileInfo,
    mbToBytes,
} from "./disk-cleaner";

type Config = {
    serviceType: "localFile",
    rtm: {
        appId: string;
        appCertificate: string;
    }
    localFile: {
        // historyDataPath: string
        snapshotDataPath: string;
        logFilePath: string;
        clientlogPath: string;
    };
    snapshotHost?: string;
    adminToken?: string;
    diskRetention?: Partial<DiskRetentionPolicy> & {
        serverLogMaxMB?: number;
    };
};

const DEFAULT_SERVER_LOG_MAX_MB = 100;
const configFile = readFileSync("./config/app.json", 'utf8');
export const config: Config = JSON.parse(configFile);
if (config.serviceType !== "localFile") {
    throw new Error("only localFile serviceType is supported");
}
if (!config.localFile?.snapshotDataPath || !config.localFile?.logFilePath || !config.localFile?.clientlogPath) {
    throw new Error("localFile.snapshotDataPath, localFile.logFilePath and localFile.clientlogPath are required");
}

export const diskRetentionPolicy = {
    ...DEFAULT_DISK_RETENTION_POLICY,
    ...(config.diskRetention ?? {}),
    serverLogMaxMB: config.diskRetention?.serverLogMaxMB ?? DEFAULT_SERVER_LOG_MAX_MB,
};

export const logger = new FileLogger(config.localFile.logFilePath, {
    maxBytes: mbToBytes(diskRetentionPolicy.serverLogMaxMB),
});
export const clientLogger = new LocalClientLoggerHandler(config.localFile.clientlogPath, logger);
export const snapshotHandler = new LocalSnapshotHandler(config.localFile.snapshotDataPath, logger);
export const diskCleaner = new DiskCleaner({
    paths: {
        snapshotDataPath: config.localFile.snapshotDataPath,
        serverLogFilePath: config.localFile.logFilePath,
        clientLogPath: config.localFile.clientlogPath,
    },
    policy: diskRetentionPolicy,
    logger,
    activeRelativePaths: () => clientLogger.getActiveLogRelativePaths(),
    deleteFile: async (file: ManagedFileInfo) => {
        if (file.kind === "client-log") {
            await clientLogger.deleteClientLogSafely(file.path);
            return;
        }
        await rm(file.path, { force: true });
    },
});
