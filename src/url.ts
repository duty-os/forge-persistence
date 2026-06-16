import type { Request } from "express";

export function snapshotDownloadPath(roomId: string): string {
    return `/${encodeURIComponent(roomId)}/snapshots/latest.snapshot`;
}

export function resolvePublicBaseUrl(
    req: Pick<Request, "protocol" | "get">,
    config: { publicBaseUrl?: string; bootstrapPublicUrl?: boolean; snapshotHost?: string }
): string {
    if (config.publicBaseUrl) {
        return config.publicBaseUrl.replace(/\/+$/, "");
    }
    if (config.snapshotHost) {
        return config.snapshotHost.replace(/\/+$/, "");
    }
    if (!config.bootstrapPublicUrl) {
        throw new Error("public base url is required");
    }
    const host = req.get("host");
    if (!host) {
        throw new Error("missing Host header");
    }
    return `${req.protocol}://${host}`;
}

export function snapshotPublicUrl(
    req: Pick<Request, "protocol" | "get">,
    config: { publicBaseUrl?: string; bootstrapPublicUrl?: boolean; snapshotHost?: string },
    roomId: string
): string {
    return `${resolvePublicBaseUrl(req, config)}${snapshotDownloadPath(roomId)}`;
}
