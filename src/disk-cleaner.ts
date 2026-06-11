import { existsSync } from "fs";
import { readdir, rm, stat, statfs } from "fs/promises";
import path from "path";
import type { Logger } from "./log";

export type ManagedFileKind =
    | "history-snapshot"
    | "latest-snapshot"
    | "active-server-log"
    | "rotated-server-log"
    | "client-log"
    | "ignored";

export interface DiskRetentionPolicy {
    enabled: boolean;
    intervalHours: number;
    minRunIntervalMinutes: number;
    maxSnapshotHistoryAgeDays: number;
    maxSnapshotGB: number;
    maxLogAgeDays: number;
    maxLogGB: number;
    minFreeGB: number;
    allowDeleteLatestSnapshot: boolean;
    deleteLatestAfterDays: number;
}

export interface ManagedPaths {
    snapshotDataPath: string;
    serverLogFilePath: string;
    clientLogPath: string;
}

export interface ManagedFileInfo {
    relativePath: string;
    path: string;
    size: number;
    mtimeMs: number;
    kind: ManagedFileKind;
    protected: boolean;
}

export interface CleanupResult {
    deleteFiles: ManagedFileInfo[];
    deletedCount: number;
    deletedBytes: number;
    overLimit: boolean;
    errors: Array<{ path: string; message: string }>;
}

export interface DiskCleanerStatus {
    running: boolean;
    lastRunAt?: number;
    lastReason?: string;
    lastResult?: CleanupResult;
    lastError?: string;
}

export const DEFAULT_DISK_RETENTION_POLICY: DiskRetentionPolicy = {
    enabled: true,
    intervalHours: 1,
    minRunIntervalMinutes: 5,
    maxSnapshotHistoryAgeDays: 7,
    maxSnapshotGB: 10,
    maxLogAgeDays: 14,
    maxLogGB: 2,
    minFreeGB: 2,
    allowDeleteLatestSnapshot: false,
    deleteLatestAfterDays: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

export function gbToBytes(value: number): number {
    return value * GB;
}

export function mbToBytes(value: number): number {
    return value * 1024 * 1024;
}

export function classifyManagedFile(relativePath: string): {
    managed: boolean;
    kind: ManagedFileKind;
    protected: boolean;
} {
    if (/^data\/[^/]+\/latest\.snapshot$/.test(relativePath)) {
        return { managed: true, kind: "latest-snapshot", protected: true };
    }
    if (/^data\/[^/]+\/[^/]+\.snapshot$/.test(relativePath)) {
        return { managed: true, kind: "history-snapshot", protected: false };
    }
    if (relativePath === "logs/server.log") {
        return { managed: true, kind: "active-server-log", protected: true };
    }
    if (/^logs\/server\.[^/]+\.log$/.test(relativePath)) {
        return { managed: true, kind: "rotated-server-log", protected: false };
    }
    if (/^logs\/clientlogs\/[^/]+\.log$/.test(relativePath)) {
        return { managed: true, kind: "client-log", protected: false };
    }
    return { managed: false, kind: "ignored", protected: true };
}

async function fileInfo(filePath: string, relativePath: string): Promise<ManagedFileInfo | null> {
    let fileStat;
    try {
        fileStat = await stat(filePath);
    } catch (e: any) {
        if (e?.code === "ENOENT") {
            return null;
        }
        throw e;
    }
    if (!fileStat.isFile()) {
        return null;
    }
    const classification = classifyManagedFile(relativePath);
    if (!classification.managed) {
        return null;
    }
    return {
        relativePath,
        path: filePath,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        kind: classification.kind,
        protected: classification.protected,
    };
}

async function scanSnapshotFiles(snapshotDataPath: string): Promise<ManagedFileInfo[]> {
    if (!existsSync(snapshotDataPath)) {
        return [];
    }
    const roomEntries = await readdir(snapshotDataPath, { withFileTypes: true });
    const files: ManagedFileInfo[] = [];
    for (const roomEntry of roomEntries) {
        if (!roomEntry.isDirectory()) {
            continue;
        }
        const roomPath = path.join(snapshotDataPath, roomEntry.name);
        const snapshotEntries = await readdir(roomPath, { withFileTypes: true });
        for (const snapshotEntry of snapshotEntries) {
            if (!snapshotEntry.isFile()) {
                continue;
            }
            const relativePath = `data/${roomEntry.name}/${snapshotEntry.name}`;
            const info = await fileInfo(path.join(roomPath, snapshotEntry.name), relativePath);
            if (info) {
                files.push(info);
            }
        }
    }
    return files;
}

async function scanLogFiles(serverLogFilePath: string, clientLogPath: string): Promise<ManagedFileInfo[]> {
    const files: ManagedFileInfo[] = [];
    const serverDir = path.dirname(serverLogFilePath);
    if (existsSync(serverLogFilePath)) {
        const info = await fileInfo(serverLogFilePath, "logs/server.log");
        if (info) {
            files.push(info);
        }
    }
    if (existsSync(serverDir)) {
        const entries = await readdir(serverDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !/^server\.[^/]+\.log$/.test(entry.name)) {
                continue;
            }
            const info = await fileInfo(path.join(serverDir, entry.name), `logs/${entry.name}`);
            if (info) {
                files.push(info);
            }
        }
    }
    if (existsSync(clientLogPath)) {
        const entries = await readdir(clientLogPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".log")) {
                continue;
            }
            const info = await fileInfo(path.join(clientLogPath, entry.name), `logs/clientlogs/${entry.name}`);
            if (info) {
                files.push(info);
            }
        }
    }
    return files;
}

export async function scanManagedFiles(paths: ManagedPaths): Promise<ManagedFileInfo[]> {
    const [snapshotFiles, logFiles] = await Promise.all([
        scanSnapshotFiles(paths.snapshotDataPath),
        scanLogFiles(paths.serverLogFilePath, paths.clientLogPath),
    ]);
    return [...snapshotFiles, ...logFiles];
}

function ageDays(file: ManagedFileInfo, nowMs: number): number {
    return (nowMs - file.mtimeMs) / DAY_MS;
}

function oldestFirst(a: ManagedFileInfo, b: ManagedFileInfo): number {
    return a.mtimeMs - b.mtimeMs;
}

function totalSize(files: ManagedFileInfo[], kinds: ManagedFileKind[]): number {
    return files
        .filter((file) => kinds.includes(file.kind))
        .reduce((sum, file) => sum + file.size, 0);
}

function addDeleteCandidate(
    deleteFiles: ManagedFileInfo[],
    deleted: Set<string>,
    file: ManagedFileInfo
): boolean {
    if (deleted.has(file.path)) {
        return false;
    }
    deleted.add(file.path);
    deleteFiles.push(file);
    return true;
}

export function planDiskCleanup(input: {
    files: ManagedFileInfo[];
    policy: DiskRetentionPolicy;
    nowMs?: number;
    freeBytes?: number;
    activeRelativePaths?: Set<string>;
}): CleanupResult {
    const nowMs = input.nowMs ?? Date.now();
    const activeRelativePaths = input.activeRelativePaths ?? new Set<string>();
    const allFiles = input.files;
    const deletionCandidates = input.files.filter((file) => !activeRelativePaths.has(file.relativePath));
    const deleteFiles: ManagedFileInfo[] = [];
    const deleted = new Set<string>();

    if (!input.policy.enabled) {
        return { deleteFiles, deletedCount: 0, deletedBytes: 0, overLimit: false, errors: [] };
    }

    let snapshotSize = totalSize(allFiles, ["history-snapshot", "latest-snapshot"]);
    let logSize = totalSize(allFiles, ["active-server-log", "rotated-server-log", "client-log"]);
    let projectedFreeBytes = input.freeBytes ?? gbToBytes(input.policy.minFreeGB);

    const markDelete = (file: ManagedFileInfo): void => {
        if (!addDeleteCandidate(deleteFiles, deleted, file)) {
            return;
        }
        projectedFreeBytes += file.size;
        if (file.kind === "history-snapshot" || file.kind === "latest-snapshot") {
            snapshotSize -= file.size;
        }
        if (file.kind === "rotated-server-log" || file.kind === "client-log" || file.kind === "active-server-log") {
            logSize -= file.size;
        }
    };

    deletionCandidates
        .filter((file) => file.kind === "history-snapshot")
        .filter((file) => ageDays(file, nowMs) > input.policy.maxSnapshotHistoryAgeDays)
        .sort(oldestFirst)
        .forEach(markDelete);

    deletionCandidates
        .filter((file) => file.kind === "rotated-server-log" || file.kind === "client-log")
        .filter((file) => ageDays(file, nowMs) > input.policy.maxLogAgeDays)
        .sort(oldestFirst)
        .forEach(markDelete);

    const maxSnapshotBytes = gbToBytes(input.policy.maxSnapshotGB);
    deletionCandidates
        .filter((file) => file.kind === "history-snapshot")
        .sort(oldestFirst)
        .forEach((file) => {
            if (snapshotSize <= maxSnapshotBytes) {
                return;
            }
            markDelete(file);
        });

    const maxLogBytes = gbToBytes(input.policy.maxLogGB);
    deletionCandidates
        .filter((file) => file.kind === "rotated-server-log" || file.kind === "client-log")
        .sort(oldestFirst)
        .forEach((file) => {
            if (logSize <= maxLogBytes) {
                return;
            }
            markDelete(file);
        });

    const minFreeBytes = gbToBytes(input.policy.minFreeGB);
    const emergencyCandidates = [
        ...deletionCandidates.filter((file) => file.kind === "history-snapshot").sort(oldestFirst),
        ...deletionCandidates.filter((file) => file.kind === "rotated-server-log" || file.kind === "client-log").sort(oldestFirst),
        ...deletionCandidates
            .filter((file) => file.kind === "latest-snapshot")
            .filter((file) => input.policy.allowDeleteLatestSnapshot)
            .filter((file) => ageDays(file, nowMs) > input.policy.deleteLatestAfterDays)
            .sort(oldestFirst),
    ];
    for (const file of emergencyCandidates) {
        if (projectedFreeBytes >= minFreeBytes) {
            break;
        }
        markDelete(file);
    }

    const deletedBytes = deleteFiles.reduce((sum, file) => sum + file.size, 0);
    const remainingSnapshotSize = totalSize(
        allFiles.filter((file) => !deleted.has(file.path)),
        ["history-snapshot", "latest-snapshot"]
    );
    const remainingLogSize = totalSize(
        allFiles.filter((file) => !deleted.has(file.path)),
        ["active-server-log", "rotated-server-log", "client-log"]
    );
    const overLimit =
        remainingSnapshotSize > maxSnapshotBytes ||
        remainingLogSize > maxLogBytes ||
        projectedFreeBytes < minFreeBytes;

    return {
        deleteFiles,
        deletedCount: 0,
        deletedBytes,
        overLimit,
        errors: [],
    };
}

export async function cleanupDisk(input: {
    paths: ManagedPaths;
    policy: DiskRetentionPolicy;
    nowMs?: number;
    freeBytes?: number;
    activeRelativePaths?: Set<string>;
    deleteFile?: (file: ManagedFileInfo) => Promise<void>;
}): Promise<CleanupResult> {
    const files = await scanManagedFiles(input.paths);
    const planned = planDiskCleanup({
        files,
        policy: input.policy,
        nowMs: input.nowMs,
        freeBytes: input.freeBytes,
        activeRelativePaths: input.activeRelativePaths,
    });
    let deletedCount = 0;
    let deletedBytes = 0;
    const errors: Array<{ path: string; message: string }> = [];
    const deleteFile = input.deleteFile ?? ((file: ManagedFileInfo) => rm(file.path, { force: true }));

    for (const file of planned.deleteFiles) {
        try {
            await deleteFile(file);
            deletedCount += 1;
            deletedBytes += file.size;
            if (file.kind === "history-snapshot" || file.kind === "latest-snapshot") {
                await rm(path.dirname(file.path), { recursive: false, force: true }).catch(() => undefined);
            }
        } catch (e: any) {
            errors.push({ path: file.path, message: e.message });
        }
    }

    return {
        ...planned,
        deletedCount,
        deletedBytes,
        errors,
    };
}

export class DiskCleaner {
    private paths: ManagedPaths;
    private policy: DiskRetentionPolicy;
    private logger: Logger;
    private activeRelativePaths?: () => Set<string>;
    private deleteFile?: (file: ManagedFileInfo) => Promise<void>;
    private timer?: NodeJS.Timeout;
    private running = false;
    private lastRunAt?: number;
    private lastReason?: string;
    private lastResult?: CleanupResult;
    private lastError?: string;

    constructor(input: {
        paths: ManagedPaths;
        policy: DiskRetentionPolicy;
        logger: Logger;
        activeRelativePaths?: () => Set<string>;
        deleteFile?: (file: ManagedFileInfo) => Promise<void>;
    }) {
        this.paths = input.paths;
        this.policy = input.policy;
        this.logger = input.logger;
        this.activeRelativePaths = input.activeRelativePaths;
        this.deleteFile = input.deleteFile;
    }

    getStatus(): DiskCleanerStatus {
        return {
            running: this.running,
            lastRunAt: this.lastRunAt,
            lastReason: this.lastReason,
            lastResult: this.lastResult,
            lastError: this.lastError,
        };
    }

    start(): void {
        if (!this.policy.enabled || this.timer) {
            return;
        }
        this.timer = setInterval(() => {
            this.requestRun("interval");
        }, this.policy.intervalHours * 60 * 60 * 1000);
        this.timer.unref?.();
    }

    requestRun(reason: string): void {
        if (!this.policy.enabled || this.running) {
            return;
        }
        const now = Date.now();
        const minIntervalMs = this.policy.minRunIntervalMinutes * 60 * 1000;
        if (this.lastRunAt && now - this.lastRunAt < minIntervalMs) {
            return;
        }
        void this.run(reason).catch(() => undefined);
    }

    async run(reason: string): Promise<CleanupResult> {
        if (this.running) {
            const previous = this.lastResult ?? {
                deleteFiles: [],
                deletedCount: 0,
                deletedBytes: 0,
                overLimit: false,
                errors: [],
            };
            return previous;
        }
        this.running = true;
        this.lastReason = reason;
        try {
            const fsStat = await statfs(this.paths.snapshotDataPath);
            const freeBytes = fsStat.bavail * fsStat.bsize;
            const result = await cleanupDisk({
                paths: this.paths,
                policy: this.policy,
                freeBytes,
                activeRelativePaths: this.activeRelativePaths?.(),
                deleteFile: this.deleteFile,
            });
            this.lastRunAt = Date.now();
            this.lastResult = result;
            this.lastError = undefined;
            this.logger.info("disk cleanup finished", {
                reason,
                deletedCount: result.deletedCount,
                deletedBytes: result.deletedBytes,
                freeBytes,
                overLimit: result.overLimit,
                errorCount: result.errors.length,
            });
            return result;
        } catch (e: any) {
            this.lastError = e.message;
            this.logger.error("disk cleanup failed", e as Error, { reason });
            throw e;
        } finally {
            this.running = false;
        }
    }
}
