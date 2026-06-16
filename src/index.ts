import express from "express";
import getRawBody from "raw-body";
import cors from "cors";

import { clientLogger, config, diskCleaner, logger, snapshotHandler } from "./init";
import { requireAdminAccess } from "./admin-auth";
import {RawDecoder} from "./RawDecoder";
import { RawDecoderV2 } from "./RawDecoderV2";
import { v4 } from 'uuid'
import { RtmTokenBuilder } from "./rtm-token/RtmTokenBuilder2"
import { createBootstrapTokenError, isBootstrapRtmConfig } from "./bootstrap";
import { snapshotPublicUrl } from "./url";
import { validateClientLogsPayload, validateRoomId } from "./file";

function isClientLogRequestError(error: unknown): boolean {
    return error instanceof SyntaxError || (error instanceof Error && (
        error.message === "invalid roomId" ||
        error.message === "client logs payload must include non-empty logs" ||
        error.message === "invalid log timestamp"
    ));
}

export const expressObject = express();

expressObject.use(cors());
expressObject.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info("persistence api", {
            method: req.method,
            origin: req.originalUrl,
            status: res.statusCode,
            duration: duration
        });
    });
    next();
});

// 返回房间快照地址
expressObject.get("/snapshot/:roomId", (req, res) => {
    try {
        validateRoomId(req.params.roomId);
        res.send({ url: snapshotPublicUrl(req, config, req.params.roomId) });
    } catch (e: any) {
        res.status(400).send({ status: "fail", message: e.message });
    }
});

expressObject.get("/v2/snapshot/:roomId", (req, res) => {
    try {
        validateRoomId(req.params.roomId);
        res.send({
            url: snapshotPublicUrl(req, config, req.params.roomId),
            now: Date.now(),
        });
    } catch (e: any) {
        res.status(400).send({ status: "fail", message: e.message });
    }
});

expressObject.get("/:roomId/snapshots/latest.snapshot", async (req, res) => {
    try {
        const buffer = await snapshotHandler.getLatestSnapshot(req.params.roomId);
        if (buffer === null) {
            res.status(404);
            res.end();
            return;
        }
        res.set('Content-Type', 'application/octet-stream');

        res.end(buffer, 'binary');
    } catch (ex: any) {
        logger.error(`fetch snapshot error, roomId: ${req.params.roomId}`, ex as Error);
        res.status(500);
        res.send({
            error: ex.message,
        });
        res.end();
    }
});

// 记录客户端日志
expressObject.put("/client/logs", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = JSON.parse(raw.toString());
        const { logs: inputLogs, roomId, userId } = validateClientLogsPayload(body);

        const last = inputLogs[inputLogs.length - 1];
        const offset = Date.now() - last.timestamp;
        const logs = inputLogs.map((log: any) => {
            const completeLog = { ...log, roomId, userId };
            return {
                time: Math.floor((log.timestamp + offset) / 1000),
                contents: Object.keys(completeLog).map(key => {
                    return { key, value: `${completeLog[key]}` };
                })
            };
        });
        clientLogger.putLogs(roomId, logs);
        diskCleaner.requestRun("client-log-write");
        res.status(201).end();
    } catch (e: any) {
        if (isClientLogRequestError(e)) {
            res.status(400).send({ status: "fail", message: e.message });
            return;
        }
        logger.error("client log upload failed", e as Error);
        res.status(500).send({ status: "fail", message: e.message });
    }
});

// 保存客户端上传的房间快照
expressObject.put("/snapshot", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = new Uint8Array(raw);
        const decoder = new RawDecoder();
        const buf = decoder.decodeSnapshot(body);
        const { roomId } = decoder;
        validateRoomId(roomId);

        if (buf.length > 0) {
            const now = Date.now();
            const uploadBuffer = Buffer.from(buf);

            // todo 自行决定保存位置
            logger.info("房间 uuid: " + roomId);
            // console.log("快照: ", uploadBuffer);
            await snapshotHandler.putSnapshot(roomId, uploadBuffer);
            diskCleaner.requestRun("snapshot-write");
        }
        res.status(200).send({ status: "ok" });
    } catch (e: any) {
        if (e instanceof Error && e.message === "invalid roomId") {
            res.status(400).send({ status: "fail", message: e.message });
            return;
        }
        logger.error("snapshot upload failed", e as Error);
        res.status(500).send({ status: "fail", message: e.message });
    }
});

// 保存客户端上传的历史记录
expressObject.put("/v2/history/:roomId/:userId", async (req, res) => {
    try {
        // TODO 按需保存
        // const raw = await getRawBody(req);
        // const body = new Uint8Array(raw);
        // const decoder = new RawDecoderV2();
        // let updates = decoder.decodeHistory(body);
        //
        // const now = Date.now();
        // if (updates.length > 0) {
        //     const now = Date.now();
        //     updates = decoder.checkTimestamp(updates, now);
        //     const uint8Buffer = decoder.encodeHistory(updates);
        //
        //     // await storage.putFile(`${roomId}/${userId}/${now}.history`, Buffer.from(uint8Buffer));
        // }
        res.status(200).send({ status: "ok" });
    } catch (e) {
        res.status(500).send({ status: "fail" });
    }
});

expressObject.post("/v5/rooms", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = JSON.parse(raw.toString());

        const uuid = v4().replaceAll("-", "");
        res.status(200).send({ uuid, status: "ok", isRecord: false, limit: 0 });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})

const requireAdminToken = requireAdminAccess(config.admin?.token);

expressObject.get("/admin/disk/cleanup/status", requireAdminToken, async (req, res) => {
    res.status(200).send({
        status: "ok",
        cleanup: diskCleaner.getStatus(),
    });
});

expressObject.post("/admin/disk/cleanup", requireAdminToken, async (req, res) => {
    try {
        const result = await diskCleaner.run("manual");
        res.status(200).send({ status: "ok", result });
    } catch (e: any) {
        logger.error("manual disk cleanup failed", e as Error);
        res.status(500).send({ status: "fail", message: e.message });
    }
});

expressObject.get("/v5/rooms/:roomId", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = JSON.parse(raw.toString());
        res.status(200).send({ uuid: req.params.roomId, status: "ok", isRecord: false, limit: 0 });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})

expressObject.patch("/v5/rooms/:roomId", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = JSON.parse(raw.toString());
        res.status(200).send({ uuid: req.params.roomId, status: "ok", isRecord: false, limit: 0 });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})

expressObject.get("/v5/rooms", async (req, res) => {
    try {
        res.status(200).send({ rooms: [], status: "ok" });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})

expressObject.post("/:roomId/:userId/rtm/token", async (req, res) => {
    try {
        if (isBootstrapRtmConfig(config)) {
            const err = createBootstrapTokenError("configure customer RTM credentials first");
            res.status(err.status).send({ status: "fail", message: err.message });
            return;
        }
        const { roomId, userId } = req.params;
        const token = RtmTokenBuilder.buildToken(config.rtm.appId, config.rtm.appCertificate, userId, 24 * 3600);
        res.status(200).send({ status: "ok", token });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})


expressObject.post("/v5/tokens/rooms/:roomId", async (req, res) => {
    try {
        // nonce和sig写死,没有实际校验,后续有需要再处理
        const { roomId } = req.params;
        const authString = `ak=private&expireAt=${new Date().getTime() + 365 * 3600 * 1000}&nonce=78f216c0-1ff7-11f0-96a9-ab38861898af&role=1&sig=394dc33829e6502cb84b88396a6690b350b6c2c39de9366798fe2231361ab79e&uuid=${roomId}`
        res.status(200).send(`"NETLESSROOM_${Buffer.from(authString).toString("base64")}"`);
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})


expressObject.listen(3000, () => {
    if (config.bootstrapPublicUrl) {
        logger.warn("bootstrap public url fallback is active");
    }
    if (isBootstrapRtmConfig(config)) {
        logger.warn("RTM bootstrap mode is active; token endpoints require customer credentials");
    }
    diskCleaner.start();
    logger.info(`app listening at http://0.0.0.0:3000`);
});

process.on("uncaughtException", (error: Error): any => {
    logger.error("[uncaughtException]", error);
});
process.on("unhandledRejection", (error: Error): any => {
    logger.error("[unhandledRejection]", error);
});
