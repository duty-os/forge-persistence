### 5.5 互动白板服务部署

#### 5.5.1 端口开放要求

端口开放给局域网内相关服务访问即可；如需外网访问，请按实际部署方式开放对应端口。

| 部署方式 | 内部访问 | 外部访问（无证书 / IP 直连） | 外部访问（有证书 / 信任证书） |
| --- | --- | --- | --- |
| App 直连模式 | TCP 3000 | TCP 3000 | 不适用 |
| Nginx HTTP 模式 | TCP 80 | TCP 80 | 不适用 |
| Nginx HTTPS 模式 | TCP 80 / 443 | TCP 80 | TLS 443 |

> 说明：
> 1. 使用 App 直连模式时，直接开放 `3000`。
> 2. 使用 Nginx 代理模式时，默认开放 `80`。
> 3. 如客户提供证书，可额外启用 `443`，`80` 仍保留，不强制跳转到 `443`。

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

```bash
cd /root/forge-persistence

# App 直连模式
./setup.sh init app

# 如使用 Nginx 代理模式，则执行：
# ./setup.sh init nginx
```

执行完成后，会自动创建 `config/`、`logs/`、`data/` 等目录，并生成默认 `config/app.json`。

#### 5.5.4 更新互动白板服务配置

正式启动前，建议先编辑 `config/app.json`，至少检查并更新以下字段：

```bash
cd /root/forge-persistence
vim config/app.json
```

配置示例：

```json
{
  "rtm": {
    "appId": "客户自己的 App ID",
    "appCertificate": "客户自己的 App Certificate"
  },
  "publicBaseUrl": "http://白板服务IP:3000 或 http://白板服务IP 或 https://白板服务IP/域名",
  "admin": {
    "token": "初始化自动生成，可按需替换"
  }
}
```

说明：

- `publicBaseUrl` 建议填写实际对外访问地址。
- `admin.token` 用于运维接口鉴权，建议妥善保管。
- 如 `rtm` 仍为默认占位值，服务可启动，但 RTM token 接口不能正式投入使用。

#### 5.5.5 配置域名和证书（可选）

如客户计划使用 HTTPS，应在启动服务前先完成本步骤。

```bash
cd /root/forge-persistence

# 创建证书目录
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

> 说明：若使用自签名证书或私有 CA，客户端需预先信任该证书或其签发 CA。

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

#### 5.5.7 部署验证

App 模式验证：

```bash
cd /root/forge-persistence
./setup.sh doctor app
./setup.sh smoke app
docker compose ps
```

Nginx 模式验证：

```bash
cd /root/forge-persistence
./setup.sh doctor nginx
./setup.sh smoke nginx
docker compose ps
```

预期结果：

- `doctor` 输出 `PASS`
- `smoke` 输出 `PASS`
- `docker compose ps` 中相关容器为 `Up` 状态，无持续重启

#### 5.5.8 客户端接入配置

1. App 直连模式

```bash
白板客户端配置：
    - sdkConfig.region: private
    - endpoint: http://白板服务IP:3000
    - roomId: 可自行生成，长度不超过 32
```

2. Nginx HTTP 模式

```bash
白板客户端配置：
    - sdkConfig.region: private
    - endpoint: http://白板服务IP
    - roomId: 可自行生成，长度不超过 32
```

3. Nginx HTTPS 模式

```bash
白板客户端配置：
    - sdkConfig.region: private
    - endpoint: https://白板服务IP 或 https://白板域名
    - roomId: 可自行生成，长度不超过 32
```
