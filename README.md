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

默认安装模式会暴露 `http://host:3000`。如果通过 `./setup.sh init nginx` + `./setup.sh setup nginx` 启用包内 nginx，则默认入口为 `http://host`。nginx 模式保留 `80` 兼容入口，同时支持客户自带证书启用 `443`；如果客户没有证书，也不强制要求使用 HTTPS。

### 部署方式

当前安装包支持这 3 种部署方式：

1. `App` 直连模式
   - 只启动 `forge-persistence`
   - 对外暴露 `3000`
   - 入口示例：`http://<ip>:3000/path`
   - 适合最简单的内网或调试环境

2. `Nginx HTTP` 模式
   - 启动 `nginx + forge-persistence`
   - 对外暴露 `80`
   - 入口示例：`http://<ip>/path`
   - 不要求客户提供证书

3. `Nginx HTTPS` 模式
   - 在 `Nginx HTTP` 模式基础上额外启用 `443`
   - 入口示例：`https://<ip>/path`
   - 需要客户提供并信任自己的证书
   - 启用后 `80` 仍然保留，不强制跳转到 `443`

### 私有化部署

解压安装包后进入目录：

```bash
tar -xzvf forge-persistence-private-${VERSION}-install.tar
cd forge-persistence
```

默认独立 app 模式：

```bash
./setup.sh init app
./setup.sh setup app
```

该模式只启动 `forge-persistence`，暴露 `3000:3000`，兼容旧的 `http://host:3000` endpoint。首次 `init` 会自动生成 admin token，并写入 `config/app.json`。

可选 nginx 反代模式：

```bash
./setup.sh init nginx
./setup.sh setup nginx
```

该模式启动 `nginx + forge-persistence`，nginx 暴露 `80:80`，并预留可选 `443:443`，app 只在 compose 内部暴露 `3000`。nginx 默认拒绝远程 `/admin/*`，admin 运维入口保留给容器内本地访问。

如果客户提供证书，可以启用包内 HTTPS：

- 证书路径默认为 `config/tls/tls.crt`
- 私钥路径默认为 `config/tls/tls.key`
- 在 `config/app.json` 中把 `tls.enabled` 设为 `true`
- 然后重新执行 `./setup.sh setup nginx` 或 `./setup.sh upgrade nginx`

启用后可通过 `https://<ip>/path` 访问，但前提是客户端信任这张证书或对应的 CA。若客户使用自签名证书或私有 CA，浏览器、SDK、curl 侧通常也需要额外导入信任。

如果客户没有证书，则保持 `80` 模式即可，`http://<ip>/path` 仍然可用。

首次安装后的 `config/app.json` 会包含 bootstrap 默认值；客户如果需要正式切换，再修改这些字段：

- `rtm.appId`
- `rtm.appCertificate`
- `publicBaseUrl`：客户端可访问的 persistence 地址；默认 bootstrap 模式允许为空，此时服务会回退到请求头生成 snapshot URL。正式部署建议填写稳定外部地址
- `admin.token`：`init` 会自动生成；如需轮换可自行修改
- `tls.enabled`：是否启用包内 HTTPS
- `tls.certPath` / `tls.keyPath`：当前包内 nginx 模板固定读取 `./config/tls/tls.crt` 和 `./config/tls/tls.key`，不要改成其他路径

当前 bootstrap 边界：

- 服务可以在不改配置的情况下启动
- `publicBaseUrl` 为空时，snapshot URL 会走 bootstrap fallback
- 如果 `rtm` 仍是默认占位配置，服务仍可启动，但 RTM token 接口会明确报错，提示补充客户自己的凭证
- nginx 模式下，HTTPS 只有在客户提供证书并启用 `tls.enabled=true` 时才生效

推荐的部署检查：

```bash
./setup.sh doctor app
./setup.sh smoke app
```

客户侧自定义 compose 配置只应写在 `docker-compose.override.yaml` 中，不要修改 `docker-compose.generated.yaml`。

打包脚本说明：

- `buildpack.sh`：Linux / CI 交付打包脚本，用于生成最终给客户的安装包
- `buildpack-local.sh`：本机 macOS 预演 / 自测打包脚本，用于本地先验证安装包和部署流程

如果客户希望直接使用 `https://<ip>/path`，需要确保：

1. 已放置 `config/tls/tls.crt` 和 `config/tls/tls.key`
2. `config/app.json` 中 `tls.enabled=true`
3. 客户端已经信任该证书或其签发 CA

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
  -H "X-Admin-Token: <admin.token>" \
  http://127.0.0.1:3000/admin/disk/cleanup/status
```

手动触发清理：

```bash
sudo docker compose exec forge-persistence curl -s -X POST \
  -H "X-Admin-Token: <admin.token>" \
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
./setup.sh upgrade app

# 如果需要 nginx 反代模式：
./setup.sh upgrade nginx
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
