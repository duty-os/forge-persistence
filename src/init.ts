import { readFileSync } from "fs";
import { rm } from "fs/promises";
import path from "path";
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
    configVersion?: number;
    serviceType: "localFile",
    deployMode?: "app" | "nginx";
    rtm: {
        appId: string;
        appCertificate: string;
        bootstrapMode?: boolean;
    };
    localFile: {
        // historyDataPath: string
        snapshotDataPath: string;
        logFilePath: string;
        clientlogPath: string;
    };
    publicBaseUrl?: string;
    bootstrapPublicUrl?: boolean;
    snapshotHost?: string;
    adminToken?: string;
    admin?: {
        token: string;
        allowRemoteAccess?: boolean;
    };
    diskRetention?: Partial<DiskRetentionPolicy> & {
        serverLogMaxMB?: number;
    };
};

const DEFAULT_SERVER_LOG_MAX_MB = 100;
const configFile = readFileSync("./config/app.json", 'utf8');
const rawConfig: Config = JSON.parse(configFile);
export const config: Config = {
    ...rawConfig,
    configVersion: rawConfig.configVersion ?? 2,
    deployMode: rawConfig.deployMode ?? "app",
    publicBaseUrl: rawConfig.publicBaseUrl ?? rawConfig.snapshotHost ?? "",
    bootstrapPublicUrl: rawConfig.bootstrapPublicUrl ?? !(rawConfig.publicBaseUrl ?? rawConfig.snapshotHost),
    admin: {
        token: rawConfig.admin?.token ?? rawConfig.adminToken ?? "",
        allowRemoteAccess: rawConfig.admin?.allowRemoteAccess ?? false,
    },
    rtm: {
        ...(rawConfig.rtm ?? {}),
        bootstrapMode: rawConfig.rtm?.bootstrapMode ?? (
            !rawConfig.rtm?.appId ||
            !rawConfig.rtm?.appCertificate ||
            rawConfig.rtm?.appId === "project-appid" ||
            rawConfig.rtm?.appCertificate === "project-appcertificate"
        ),
    },
};
if (config.serviceType !== "localFile") {
    throw new Error("only localFile serviceType is supported");
}
if (!config.localFile?.snapshotDataPath || !config.localFile?.logFilePath || !config.localFile?.clientlogPath) {
    throw new Error("localFile.snapshotDataPath, localFile.logFilePath and localFile.clientlogPath are required");
}
if (path.basename(config.localFile.logFilePath) !== "server.log") {
    throw new Error("localFile.logFilePath must end with server.log");
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
