import express from "express";
import getRawBody from "raw-body";
import cors from "cors";

import { clientLogger, config, logger, snapshotHandler } from "./init";
import { RawDecoder } from "./RawDecoder";
import { v4 } from 'uuid'
import { RtmTokenBuilder } from "./rtm-token/RtmTokenBuilder2"

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
expressObject.get("/snapshot/:roomId", async (req, res) => {
    const url = new URL(`${config.snapshotHost}/${req.params.roomId}/snapshots/latest.snapshot`);
    res.send({ url: url.toString() });
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
    const raw = await getRawBody(req);
    const body = JSON.parse(raw.toString());
    const { logs: inputLogs, roomId, userId } = body;

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
    res.status(201).end();
});

// 保存客户端上传的房间快照
expressObject.put("/snapshot", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = new Uint8Array(raw);
        const decoder = new RawDecoder();
        const buf = decoder.decodeSnapshot(body);
        const { roomId } = decoder;

        if (buf.length > 0) {
            const now = Date.now();
            const uploadBuffer = Buffer.from(buf);

            // todo 自行决定保存位置
            logger.info("房间 uuid: " + roomId);
            // console.log("快照: ", uploadBuffer);
            snapshotHandler.putSnapshot(roomId, uploadBuffer);
        }
        res.status(200).send({ status: "ok" });
    } catch (e) {
        res.status(500).send({ status: "fail" });
    }
});

// 保存客户端上传的历史记录
expressObject.put("/history", async (req, res) => {
    try {
        // TODO
        // const raw = await getRawBody(req);
        // const body = new Uint8Array(raw);
        // const decoder = new RawDecoder();
        // let updates = decoder.decodeHistory(body);

        // if (updates.length > 0) {
        //     const now = Date.now();
        //     updates = decoder.checkTimestamp(updates, now);
        //     const uint8Buffer = decoder.encodeHistory(updates);

            // todo 自行决定保存位置
            // console.log("房间 uuid: ", decoder.roomId);
            // console.log("用户 uuid: ", decoder.userId);
            // console.log("历史记录: ", uint8Buffer);
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

expressObject.get("/:roomId/:userId/rtm/token", async (req, res) => {
    try {
        const { roomId, userId } = req.params;
        const token = RtmTokenBuilder.buildToken(config.rtm.appId, config.rtm.appCertificate, userId, 24 * 3600);
        res.status(200).send({ status: "ok", token });
    } catch (e) {
        res.status(500).send({ status: "fail", message: e.message });
    }
})



expressObject.listen(3000, () => {
    logger.info(`app listening at http://0.0.0.0:3000`);
});

process.on("uncaughtException", (error: Error): any => {
    logger.error("[uncaughtException]", error);
});
process.on("unhandledRejection", (error: Error): any => {
    logger.error("[unhandledRejection]", error);
});