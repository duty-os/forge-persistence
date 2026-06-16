### 5.5 互动白板服务部署

#### 5.5.1 端口开放要求

端口开放给局域网内相关服务访问即可；如需外网访问，请按实际部署方式开放对应端口。

| 部署方式 | 容器/进程内部 | 主机对外入口（无证书 / IP 直连） | 主机对外入口（有证书 / 信任证书） |
| --- | --- | --- | --- |
| App 直连模式 | `forge-persistence` 监听 `3000` | TCP `3000` | 不适用 |
| Nginx HTTP 模式 | app 容器内部 `3000`，Nginx 监听 `80` | TCP `80` | 不适用 |
| Nginx HTTPS 模式 | app 容器内部 `3000`，Nginx 监听 `80` / `443` | TCP `80` | TLS `443` |

> 说明：
> 1. App 直连模式只启动 `forge-persistence`，对外暴露 `3000:3000`。
> 2. Nginx 模式下，app 仅在 compose 内部暴露 `3000`，对外入口是 Nginx。
> 3. 当前安装包中的 Nginx compose 会同时映射 `80:80` 和 `443:443`；只有在 `tls.enabled=true` 且证书已就位时，`443` 才会真正提供 HTTPS 服务。
> 4. 启用 HTTPS 后，`80` 仍然保留，不强制跳转到 `443`。

#### 5.5.2 上传部署包并解压

```bash
# 建议将安装包上传到 /root 目录
cd /root

# 解压安装包（需根据实际部署包名称替换）
tar -xzvf forge-persistence-private-<VERSION>-install.tar

# 进入部署目录
cd forge-persistence
```

#### 5.5.3 初始化部署目录

推荐先显式执行一次 `init`，便于提前生成配置和目录；如果直接执行 `setup`，当前版本也会自动补做 `init`。

```bash
cd /root/forge-persistence

# App 直连模式
./setup.sh init app

# 如使用 Nginx 代理模式，则执行：
# ./setup.sh init nginx
```

执行完成后，脚本会自动：

- 创建 `config/`、`logs/`、`data/`、`backup/` 目录
- 首次生成 `config/app.json`
- 首次生成 `docker-compose.override.yaml`
- Nginx 模式下额外创建 `config/tls/`，并生成默认 `config/nginx.conf`
- 自动写入一个随机生成的 `admin.token`

#### 5.5.4 更新互动白板服务配置

当前版本允许使用默认 bootstrap 配置先把服务启动起来，但正式交付前，仍建议检查并补齐 `config/app.json` 中的关键字段。

```bash
cd /root/forge-persistence
vim config/app.json
```

建议关注的配置示例：

```json
{
  "publicBaseUrl": "http://白板服务IP:3000 或 http://白板服务IP 或 https://白板服务IP/域名",
  "bootstrapPublicUrl": true,
  "admin": {
    "token": "初始化自动生成的随机 token",
    "allowRemoteAccess": false
  },
  "rtm": {
    "appId": "客户自己的 App ID",
    "appCertificate": "客户自己的 App Certificate",
    "bootstrapMode": false
  }
}
```

说明：

- `publicBaseUrl` 建议填写客户端最终访问的稳定地址。
- 当 `publicBaseUrl` 为空且 `bootstrapPublicUrl=true` 时，服务会回退到请求头里的 `host/protocol` 生成 snapshot URL；这适合 bootstrap 启动，不建议作为正式生产配置长期使用。
- `admin.token` 在首次 `init` 时自动生成，建议妥善保管；如需轮换，可自行修改。
- App 直连模式下，可通过 `X-Admin-Token` 访问本机 `3000` 端口上的 admin 接口。
- Nginx 模式下，远程 `/admin/*` 默认由 Nginx 直接返回 `403`；`admin.token` 主要用于容器内或本机直连 app 容器的运维操作。
- 如 `rtm.appId` / `rtm.appCertificate` 仍为默认占位值，服务仍可启动，但 RTM token 相关接口不会正式可用。
- 若客户已填入真实 RTM 凭证，请将 `rtm.bootstrapMode` 设为 `false`，或删除该字段让服务自动按实际凭证推断；如果继续保留 `true`，RTM token 相关接口仍会按 bootstrap 模式处理。

#### 5.5.5 配置域名和证书（可选）

如客户计划使用 HTTPS，应在启动服务前先完成本步骤。

```bash
cd /root/forge-persistence

# 如尚未创建，可手工补创建证书目录
mkdir -p config/tls

# 将证书和私钥放入默认目录
# 证书文件命名为 tls.crt
# 私钥文件命名为 tls.key
# 示例：
# cp /path/to/server.crt config/tls/tls.crt
# cp /path/to/server.key config/tls/tls.key

# 编辑配置
vim config/app.json
```

在 `config/app.json` 中确认或更新如下字段：

```json
"publicBaseUrl": "https://白板服务IP或域名",
"tls": {
  "enabled": true,
  "certPath": "./config/tls/tls.crt",
  "keyPath": "./config/tls/tls.key"
}
```

说明：

- 当前版本只支持 `./config/tls/tls.crt` 和 `./config/tls/tls.key` 这两个固定路径；不要改成其他路径，否则 `setup` / `doctor` 会失败。
- 若使用自签名证书或私有 CA，客户端需预先信任该证书或其签发 CA。

#### 5.5.6 启动互动白板服务

1. App 直连模式

```bash
cd /root/forge-persistence
./setup.sh setup app
```

启动后入口为：`http://白板服务IP:3000`

2. Nginx HTTP 模式

```bash
cd /root/forge-persistence
./setup.sh setup nginx
```

启动后入口为：`http://白板服务IP`

3. Nginx HTTPS 模式

若已提前完成证书配置并启用 `tls.enabled=true`，执行同一条命令：

```bash
cd /root/forge-persistence
./setup.sh setup nginx
```

启动后入口为：`https://白板服务IP` 或 `https://白板域名`

说明：

- `./setup.sh setup <mode>` 会先校验安装包中的 `manifest.json` 和 `checksums.sha256`，再生成 `docker-compose.generated.yaml` 并启动服务。
- 如果此前未执行过 `init`，`setup` 会自动补做初始化。

#### 5.5.7 部署验证

App 模式验证：

```bash
cd /root/forge-persistence
./setup.sh doctor app
./setup.sh smoke app
docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml ps
```

Nginx 模式验证：

```bash
cd /root/forge-persistence
./setup.sh doctor nginx
./setup.sh smoke nginx
docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml ps
```

如当前环境中的 Docker 需要 `sudo`，则将最后一条命令改为：

```bash
sudo docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml ps
```

预期结果：

- `doctor` 输出 `PASS`
- `smoke` 输出 `PASS`
- App 模式下，`smoke` 会验证 `http://127.0.0.1:3000/snapshot/test-room` 和带 `X-Admin-Token` 的本地 admin 接口可访问
- Nginx 模式下，`smoke` 会验证 `http://127.0.0.1/snapshot/test-room` 可访问、`http://127.0.0.1/admin/...` 返回 `403`、容器内本地 admin 接口可访问
- 若已启用 TLS，Nginx 模式下 `smoke` 还会额外验证 `https://127.0.0.1/snapshot/test-room`
- `docker compose -f docker-compose.generated.yaml -f docker-compose.override.yaml ps` 中相关容器为 `Up` 状态，且无持续重启

#### 5.5.8 客户端接入配置

1. App 直连模式

```text
白板客户端配置：
  sdkConfig.region: private
  endpoint: http://白板服务IP:3000
  roomId: 可自行生成，长度不超过 32
```

2. Nginx HTTP 模式

```text
白板客户端配置：
  sdkConfig.region: private
  endpoint: http://白板服务IP
  roomId: 可自行生成，长度不超过 32
```

3. Nginx HTTPS 模式

```text
白板客户端配置：
  sdkConfig.region: private
  endpoint: https://白板服务IP 或 https://白板域名
  roomId: 可自行生成，长度不超过 32
```

说明：

- 建议客户端 `endpoint` 与 `publicBaseUrl` 保持一致。
- 如果仍处于 bootstrap 配置且 `publicBaseUrl` 为空，服务会按请求头动态生成 snapshot URL；正式生产建议改为稳定、可预期的外部地址。
