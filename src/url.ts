import type { Request } from "express";

export function snapshotDownloadPath(roomId: string): string {
    return `/${encodeURIComponent(roomId)}/snapshots/latest.snapshot`;
}

export function resolvePublicBaseUrl(req: Pick<Request, "protocol" | "get">, config: { snapshotHost?: string }): string {
    if (config.snapshotHost) {
        return config.snapshotHost.replace(/\/+$/, "");
    }
    const host = req.get("host");
    if (!host) {
        throw new Error("missing Host header");
    }
    return `${req.protocol}://${host}`;
}

export function snapshotPublicUrl(
    req: Pick<Request, "protocol" | "get">,
    config: { snapshotHost?: string },
    roomId: string
): string {
    return `${resolvePublicBaseUrl(req, config)}${snapshotDownloadPath(roomId)}`;
}
