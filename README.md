## forge 白板服务端私有化部署

forge 白板房间可以脱落服务端只依赖消息通道工作, 如果有如下需求必须使用服务端, 此工程包含了服务端基本代码, 接口内容尚未实现, 需自行根据业务实现.

* 加速中途进房间恢复状态的速度.
* 保存历史房间状态
* 回放需求

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
    endpoint: "http://10.0.0.12:3000"
});
```

默认安装模式会暴露 `http://host:3000`。如果通过 `./setup.sh nginx` 启用包内 nginx，则入口改为 `http://host`。当前安装包只提供 HTTP；域名和 HTTPS 建议由客户侧网关、负载均衡、VPN 或 SA 维护的外部反代处理。

### 私有化部署

解压安装包后进入目录：

```bash
tar -xzvf forge-persistence-private-${VERSION}-install.tar
cd forge-persistence
```

默认独立 app 模式：

```bash
./setup.sh
```

该模式只启动 `forge-persistence`，暴露 `3000:3000`，兼容旧的 `http://host:3000` endpoint。

可选 nginx 反代模式：

```bash
./setup.sh nginx
```

该模式启动 `nginx + forge-persistence`，nginx 暴露 `80:80`，app 只在 compose 内部暴露 `3000`。如需公网访问 admin 清理接口，必须配置强随机 `adminToken` 并通过 `X-Admin-Token` header 调用；公网 HTTP 会明文传输 token，生产环境建议叠加 HTTPS、VPN 或安全组白名单。

首次安装后修改 `config/app.json`：

- `rtm.appId`
- `rtm.appCertificate`
- `snapshotHost`：客户端可访问的 persistence 地址；默认 app 模式通常是 `http://host:3000`，nginx 模式通常是 `http://host`
- `adminToken`：用于 `/admin/disk/cleanup*` 的管理 token，必须替换默认占位符；默认占位符不会通过鉴权。建议使用 32 bytes 以上随机值

### 本地落盘内容

服务会持续写入这些本地文件：

```text
./data/<roomId>/latest.snapshot
./data/<roomId>/<timestamp>.snapshot
./logs/server.log
./logs/server.<timestamp>.log
./logs/clientlogs/<roomId>.log
Docker json-file logs
```

`latest.snapshot` 是房间恢复入口，默认不会自动删除。历史 snapshot、已滚动 server log、client log 会按配置滚动清理。Docker stdout 日志不由 Node 进程删除，而由 compose 的 `logging.max-size/max-file` 限制。

### 磁盘清理策略

`config/app.json` 中的 `diskRetention` 使用面向运维的单位：

- `intervalHours`: 每隔多少小时定时检查一次
- `minRunIntervalMinutes`: 写入触发清理时的最小实际运行间隔
- `maxSnapshotHistoryAgeDays`: 历史 snapshot 保留天数
- `maxSnapshotGB`: snapshot 总量上限，单位 GB
- `maxLogAgeDays`: 已滚动 server log 和 client log 保留天数
- `maxLogGB`: 日志总量上限，单位 GB
- `minFreeGB`: 磁盘剩余空间保护水位，单位 GB
- `serverLogMaxMB`: 当前 `server.log` 滚动大小，单位 MB
- `allowDeleteLatestSnapshot`: 是否允许自动删除过旧 `latest.snapshot`，默认 `false`
- `deleteLatestAfterDays`: 只有 `allowDeleteLatestSnapshot` 为 `true` 时才生效

删除优先级：

1. 超过保留天数的历史 snapshot
2. 超过保留天数的已滚动 server log 和 client log
3. snapshot 总量超限时，继续删除最旧历史 snapshot
4. 日志总量超限时，继续删除最旧可删日志
5. 低磁盘空间时，按历史 snapshot、可删日志、显式允许删除的过旧 latest 顺序处理

当前 `server.log` 和默认配置下的 `latest.snapshot` 会被保护。如果清理后仍然超限，服务会记录 `overLimit: true`，需要 SA 介入扩容或调整策略。

### SA 运维命令

手动查看清理状态：

```bash
sudo docker compose exec forge-persistence curl -s \
  -H "X-Admin-Token: <adminToken>" \
  http://127.0.0.1:3000/admin/disk/cleanup/status
```

手动触发清理：

```bash
sudo docker compose exec forge-persistence curl -s -X POST \
  -H "X-Admin-Token: <adminToken>" \
  http://127.0.0.1:3000/admin/disk/cleanup
```

获取日志：

```bash
sudo docker compose logs --tail=200 forge-persistence
sudo docker compose logs --tail=200 nginx
tar -czvf forge-persistence-logs-$(date +%Y%m%d%H%M%S).tar.gz logs
```

滚动更新：

```bash
tar -xzvf forge-persistence-private-${NEW_VERSION}-install.tar
cd forge-persistence
./setup.sh

# 如果需要 nginx 反代模式：
./setup.sh nginx
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
