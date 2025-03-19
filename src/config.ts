import path from "path";

export function resolveConfig() {
    const config = {
        snapshotHost: "http://localhost:8800",
        persistenceRoot: path.resolve(__dirname, "../persistence"),
        logsRoot: path.resolve(__dirname, "../logs"),
    };

    return config;
}