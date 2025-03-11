import express from "express";
import getRawBody from "raw-body";
import cors from "cors";

import {config} from "./config";
import {RawDecoder} from "./RawDecoder";

export const expressObject = express();

expressObject.use(cors());
expressObject.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log("persistence api", req.method, req.originalUrl, res.statusCode, duration);
    });
    next();
});

// 返回房间快照地址
expressObject.get("/snapshot/:roomId", async (req, res) => {
    const url = new URL(`${config.snapshotHost}/${req.params.roomId}/snapshots/latest.snapshot`);
    res.send({ url: url.toString().replace(/^http(s?)/, "https") });
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
        }
    });

    // todo logs 日志处理
    console.log(logs);
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
            console.log("房间 uuid: ", roomId);
            console.log("快照: ", uploadBuffer);
        }
        res.status(200).send({ status: "ok" });
    } catch (e) {
        res.status(500).send({ status: "fail" });
    }
});

// 保存客户端上传的历史记录
expressObject.put("/history", async (req, res) => {
    try {
        const raw = await getRawBody(req);
        const body = new Uint8Array(raw);
        const decoder = new RawDecoder();
        let updates = decoder.decodeHistory(body);

        if (updates.length > 0) {
            const now = Date.now();
            updates = decoder.checkTimestamp(updates, now);
            const uint8Buffer = decoder.encodeHistory(updates);

            // todo 自行决定保存位置
            console.log("房间 uuid: ", decoder.roomId);
            console.log("用户 uuid: ", decoder.userId);
            console.log("历史记录: ", uint8Buffer);
        }
        res.status(200).send({ status: "ok" });
    } catch(e) {
        res.status(500).send({ status: "fail" });
    }
});

expressObject.listen(80, () => {
    console.log(`app listening at http://localhost:80`)
});

process.on("uncaughtException", (error: Error): any => {
    console.log("[uncaughtException]", error);
});
process.on("unhandledRejection", (error: Error): any => {
    console.log("[unhandledRejection]", error);
});
