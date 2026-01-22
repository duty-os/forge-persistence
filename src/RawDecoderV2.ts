export class RawDecoderV2 {

    private buffer = new Uint8Array(0);
    public roomId = "";
    public userId = "";
    private meteBuffer = new Uint8Array(0);

    public decodeMeta(buffer: Uint8Array, metaLength: number): number{
        let index = 0;
        this.meteBuffer = buffer.slice(index, index + metaLength);
        const roomMeta = new DataView(buffer.slice(index, index + metaLength).buffer);
        const roomIdBufLength = roomMeta.getUint32(0, false);
        // roomId
        index += metaLength;
        const roomIdBuf = buffer.slice(index, index + roomIdBufLength);
        this.roomId = new TextDecoder().decode(roomIdBuf);
        // userId
        if (metaLength === 8) {
            const userIdLength = roomMeta.getUint32(4, false);
            index += roomIdBufLength;
            const userIdBuf = buffer.slice(index, index + userIdLength);
            this.userId = new TextDecoder().decode(userIdBuf);
            index += userIdLength;
        }
        return index;
    }

    public decodeHistory(buffer: Uint8Array): { timestamp: number, originBuf: Uint8Array, yUpdate: Uint8Array, appId: string }[] {
        const results: { timestamp: number, originBuf: Uint8Array, yUpdate: Uint8Array, appId: string }[] = [];
        let index = this.decodeMeta(buffer, 8);
        while (index < buffer.length) {
            let itemLength = 0;
            // message
            const messageHeaderView = new DataView(buffer.slice(index, index + 16).buffer);
            // console.log(`messageHeaderView messageHeaderView ${index} ${messageHeaderView.buffer.byteLength}`)
            index += 16;
            itemLength += 16;
            // timestamp
            const timestampLength = messageHeaderView.getUint32(0, false);
            const timestampBuf = buffer.slice(index, index + timestampLength);
            const timestamp = parseInt((new TextDecoder()).decode(timestampBuf));
            index += timestampLength;
            itemLength += timestampLength;
            // originBuf
            const originBufLength = messageHeaderView.getUint32(4, false);
            const originBuf = buffer.slice(index, index + originBufLength);
            index += originBufLength;
            itemLength += originBufLength;
            // yUpdate
            const yUpdateLength = messageHeaderView.getUint32(8, false);
            const yUpdate = buffer.slice(index, index + yUpdateLength);
            index += yUpdateLength;
            itemLength += yUpdateLength;

            const appIdLength = messageHeaderView.getUint32(12, false);
            const appIdBuf = buffer.slice(index, index + appIdLength);
            const appId = new TextDecoder().decode(appIdBuf);
            index += appIdLength;
            itemLength += appIdLength;

            results.push({
                timestamp, originBuf, yUpdate, appId
            });

            index += (itemLength % 4 === 0 ? 0 : 4 - (itemLength % 4));
        }
        return results;
    }

    public encodeHistory(updates: { timestamp: number, originBuf: Uint8Array, yUpdate: Uint8Array, appId: string }[]): Uint8Array {
        let newBuffer = new Uint8Array(0);
        for (const { timestamp, originBuf, yUpdate, appId } of updates) {
            const headerBuf = new ArrayBuffer(16);
            const headerView = new DataView(headerBuf);
            const timestampBuf = new TextEncoder().encode(`${timestamp}`);
            const appIdBuf = new TextEncoder().encode(appId);
            headerView.setUint32(0, timestampBuf.length, false);
            headerView.setUint32(4, originBuf.length, false);
            headerView.setUint32(8, yUpdate.length, false);
            headerView.setUint32(12, appIdBuf.length, false);

            var totalLength = headerView.buffer.byteLength + timestampBuf.length + originBuf.length + yUpdate.length + appIdBuf.length;
            totalLength += (totalLength % 4 === 0 ? 0 : 4 - (totalLength % 4));

            const itemBuf = new Uint8Array(totalLength);
            let i = 0;
            itemBuf.set(new Uint8Array(headerBuf), i);
            i += headerBuf.byteLength;
            itemBuf.set(timestampBuf, i);
            i += timestampBuf.length;
            itemBuf.set(originBuf, i);
            i += originBuf.length;
            itemBuf.set(yUpdate, i);
            i += yUpdate.length;
            itemBuf.set(appIdBuf, i);

            const nextBuffer = new Uint8Array(newBuffer.length + itemBuf.length);
            nextBuffer.set(newBuffer, 0);
            nextBuffer.set(itemBuf, newBuffer.length);

            newBuffer = nextBuffer;
        }
        return newBuffer;
    }

    public checkTimestamp(updates: UpdatesBuffer[], now: number): UpdatesBuffer[] {
        let timeDifference = now - updates[updates.length - 1].timestamp;
        for (let i = updates.length - 1; i >=0; i--) {
            updates[i].timestamp = updates[i].timestamp + timeDifference;
        }
        return updates;
    }
}

export interface UpdatesBuffer  {
    timestamp: number;
    originBuf: Uint8Array;
    yUpdate: Uint8Array;
    appId: string;
}
