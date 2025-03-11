## forge 白板房间私有化部署

### 客户端配置

* 指定 sdkConfig.region 为 private
* 设置 endpoint 为自定部署的白板后端地址
* 房间 id 可以自行生成, 注意字符串长度不要超过 32

```typescript
import { Room } from "@netless/forge-room";

const room = new Room(
    // 房间 id, 私有化部署情况下可以自行生成
    "f6eeec407a4511ef993c1915959e3b73",
    rtmProvider
);

await wbRoom.joinRoom({
    userId: "userId",
    nickName: "nickName",
    roomToken: "roomToken", // 白板房间 token
    sdkConfig: {
        // region 指定为 private
        region: "private",
        appIdentifier: "appIdentifier"
    },
    // 私有化部署情况下需要指定私有化部署的端点
    endpoint: "https://your-private-endpoint.com"
});
```

### 服务端接口

服务端需要实现如下几个接口

* 返回房间快照地址 /snapshot/:roomId
  - 该接口返回房间状态快照的下载 URL, 客户端通过下载的快照快速恢复房间状态。
* 记录客户端日志 /client/logs
* 保存客户端上传的房间快照 /snapshot
  - 实际保存位置可以自行决定, 本地或者云存储
* 保存客户端上传的历史记录 /history
  - 历史记录用于房间回放
  - 每个用户有独立的 history, 用于从不同用户视角来回放
  - 实际保存位置可以自行决定, 本地或者云存储
