# Forge Persistence 私有化部署最终实施方案

## 目标

这份方案定义 `forge-persistence` 私有化安装包的最终交付方式。

方案围绕已经确认的两个目标设计：

1. SA 只需要执行 `init app` 和 `setup app`，服务就能用默认 bootstrap 配置正常启动，不要求先手工改配置。
2. 升级时，如果没有引入新的必填配置，系统应自动沿用现有客户配置。

这份方案明确接受一个边界：

- 安装包可以在没有客户专属 RTM 凭证的情况下完成 bootstrap 启动，但如果客户后续不提供自己的 RTM 凭证，就不能保证客户专属 RTM token 相关能力真正可用。

## 设计原则

- 先保证可启动：首次安装优先成功启动。
- 保护客户状态：升级不能覆盖客户已有配置。
- 只在真正阻塞时失败：缺文件、包损坏、已有配置损坏这类问题才阻止启动。
- 暴露面必须显式控制：nginx 模式下默认不能把 admin 接口对外暴露。
- 包内文件和客户文件分责明确。

## 最终用户流程

### 首次安装

App 模式：

```bash
./setup.sh init app
./setup.sh setup app
```

Nginx 模式：

```bash
./setup.sh init nginx
./setup.sh setup nginx
```

可选检查：

```bash
./setup.sh doctor app
./setup.sh smoke app
```

### 升级

App 模式：

```bash
./setup.sh upgrade app
```

Nginx 模式：

```bash
./setup.sh upgrade nginx
```

升级默认复用旧配置，只补新版本引入的可选默认项；只有遇到新的、无法安全推导的必填项时才中断。

## 部署方式

这套私有化安装包当前支持 3 种部署方式：

1. `App` 直连模式
   - 只启动 `forge-persistence`
   - 对外暴露 `3000`
   - 客户入口形态为 `http://<ip>:3000/path`

2. `Nginx HTTP` 模式
   - 启动 `nginx + forge-persistence`
   - 对外暴露 `80`
   - 客户入口形态为 `http://<ip>/path`
   - 不要求客户提供证书

3. `Nginx HTTPS` 模式
   - 在 `Nginx HTTP` 模式基础上额外启用 `443`
   - 客户入口形态为 `https://<ip>/path`
   - 需要客户提供自己的证书和私钥
   - `80` 仍然保留，不自动跳转到 `443`
   - 客户端必须信任该证书或其签发 CA

## 安装包目录结构

解压后的安装目录应包含：

- `setup.sh`
- `manifest.json`
- `checksums.sha256`
- `config.json.example`
- `docker-compose.base.app.yaml`
- `docker-compose.base.nginx.yaml`
- `docker-compose.override.yaml.example`
- `nginx.conf`
- `scripts/validate-config.js`
- `scripts/doctor.sh`
- `scripts/smoke-test.sh`
- `scripts/config-merge.js`
- `scripts/print-next-steps.sh`
- `forge-persistence-private-${VERSION}.tar`
- `nginx.tar`

安装后生成或由客户持有的文件：

- `config/app.json`
- `config/nginx.conf`
- `docker-compose.override.yaml`
- `docker-compose.generated.yaml`
- `data/`
- `logs/`
- `backup/`

## setup.sh 命令模型

`setup.sh` 作为唯一公开入口，支持这些命令：

- `init [app|nginx]`
- `setup [app|nginx]`
- `upgrade [app|nginx]`
- `doctor [app|nginx]`
- `smoke [app|nginx]`

兼容性要求：

- 旧的无子命令调用方式要兼容到 `setup`
- `install.sh` 和 `start.sh` 继续代理到 `setup.sh`

### init

职责：

- 创建 `config/`、`logs/`、`data/`、`backup/`
- 如果 `config/app.json` 不存在，则从模板生成
- 如果 `docker-compose.override.yaml` 不存在，则从 example 生成
- nginx 模式下，如果 `config/nginx.conf` 不存在，则从模板生成
- 首次生成配置时自动写入随机 admin token
- 把 `deployMode` 写入配置
- 不覆盖已有客户文件
- 输出下一步提示

`init` 绝不能启动容器，也不能 `docker load`。

### setup

职责：

- 校验安装包完整性
- 用“允许 bootstrap”的规则校验配置
- 加载镜像 tar
- 生成 `docker-compose.generated.yaml`
- 执行 `docker compose -f generated -f override up -d`

`setup` 必须允许默认 bootstrap 配置启动。

### upgrade

职责：

- 备份现有配置和 override
- 用“保留旧值”的方式合并新默认配置
- 沿用客户已有配置
- 只有在新必填字段无法安全推导时才中断
- 再执行完整的校验和启动流程

### doctor

职责：

- 检查 Docker / Compose
- 检查安装包完整性
- 检查配置合法性
- 检查路径可写
- 检查磁盘剩余空间
- 检查端口占用
- 输出当前模式、URL 模式、admin 暴露策略

### smoke

职责：

- 检查容器是否正常运行
- 检查 snapshot URL 生成结果
- 检查本地 admin 可访问性
- 检查 nginx 模式下远程 admin 默认被拒绝
- 输出 PASS / WARN / FAIL 摘要

## 配置模型

建议把示例配置升级成下面这个结构：

```json
{
  "configVersion": 2,
  "serviceType": "localFile",
  "deployMode": "app",
  "publicBaseUrl": "",
  "bootstrapPublicUrl": true,
  "admin": {
    "token": "",
    "allowRemoteAccess": false
  },
  "tls": {
    "enabled": false,
    "certPath": "./config/tls/tls.crt",
    "keyPath": "./config/tls/tls.key"
  },
  "rtm": {
    "appId": "project-appid",
    "appCertificate": "project-appcertificate",
    "bootstrapMode": true
  },
  "localFile": {
    "snapshotDataPath": "./data",
    "logFilePath": "./logs/server.log",
    "clientlogPath": "./logs/clientlogs"
  },
  "diskRetention": {
    "enabled": true,
    "intervalHours": 1,
    "minRunIntervalMinutes": 5,
    "maxSnapshotHistoryAgeDays": 7,
    "maxSnapshotGB": 10,
    "maxLogAgeDays": 14,
    "maxLogGB": 2,
    "minFreeGB": 2,
    "allowDeleteLatestSnapshot": false,
    "deleteLatestAfterDays": 30,
    "serverLogMaxMB": 100
  }
}
```

## Bootstrap 行为

安装包必须在客户不改配置的情况下也能先启动起来。

Bootstrap 规则：

- 如果 `config/app.json` 是首次自动生成，`init` 自动生成随机 admin token
- `publicBaseUrl` 允许为空
- 当 `publicBaseUrl` 为空且 `bootstrapPublicUrl=true` 时，snapshot URL 可以回退到请求头里的 host/protocol
- `deployMode` 由 `init` 写入
- `rtm.bootstrapMode=true` 表示 RTM token 相关能力不保证已切到客户真实凭证

Bootstrap 警告必须体现在：

- `doctor`
- 启动日志
- `smoke`

但这些警告不能阻止启动。

## RTM Token 的边界

必须把“服务能启动”和“客户专属 RTM token 真正可用”区分开。

规则：

- placeholder RTM 配置不能阻止服务启动
- 如果 RTM 还是 placeholder，而外部调用 token 接口，服务应该返回明确的运维错误，而不是伪造一个看起来成功的结果
- 报错信息必须明确提示：需要配置客户自己的 RTM 凭证

这样既能满足 bootstrap 安装，又不会把不安全的共享凭证打进安装包。

## 配置校验规则

配置校验分两档：

- `setup` 使用“允许 bootstrap”的校验
- `doctor --strict` 或后续更严格的生产就绪检查使用严格校验

### 永远必须满足

- `serviceType === "localFile"`
- `deployMode` 为 `app` 或 `nginx`
- `localFile.snapshotDataPath` 存在或可创建
- `localFile.logFilePath` 必须以 `server.log` 结尾
- `localFile.clientlogPath` 存在或可创建
- `init` 完成后 admin token 必须存在且长度至少 32
- 当 `tls.enabled=true` 时，`tls.certPath` 和 `tls.keyPath` 必须非空

### bootstrap 模式允许

- `rtm.appId` 是占位值
- `rtm.appCertificate` 是占位值
- `publicBaseUrl` 为空，但 `bootstrapPublicUrl=true`

### 严格模式要求

- RTM 配置不是占位值
- `publicBaseUrl` 非空
- `publicBaseUrl` 与部署模式一致

## Snapshot URL 策略

当前 `src/url.ts` 在没有配置地址时会回退到请求头，这个行为可以保留，但必须变成“显式 bootstrap 行为”。

目标行为：

- 如果配置了 `publicBaseUrl`，始终优先使用它
- 如果 `publicBaseUrl` 为空且 `bootstrapPublicUrl=true`，才允许回退到请求头
- `doctor` 和 `smoke` 必须明确提示当前处于 fallback 状态

这样既能满足零配置首次启动，也能把边界讲清楚。

## Admin 暴露策略

应用层 token 鉴权继续保留，但 nginx 模式下默认要阻断远程访问。

默认 nginx 策略：

```nginx
location /admin/ {
  return 403;
}
```

适用条件：

- `deployMode=nginx`
- `admin.allowRemoteAccess=false`

本地运维仍然通过下面方式访问：

- `docker compose exec forge-persistence curl http://127.0.0.1:3000/admin/...`

如果以后确实要支持远程 admin，也只能作为显式的运维选择，不能默认打开。

## Compose 所有权划分

安装包拥有：

- `docker-compose.base.app.yaml`
- `docker-compose.base.nginx.yaml`
- `docker-compose.generated.yaml`

客户拥有：

- `docker-compose.override.yaml`

规则：

- `setup` 每次都重新生成 `docker-compose.generated.yaml`
- `setup` 永远不覆盖 `docker-compose.override.yaml`
- 客户所有自定义都必须写到 override

最终启动命令：

```bash
docker compose \
  -f docker-compose.generated.yaml \
  -f docker-compose.override.yaml \
  up -d
```

## 安装包完整性机制

`manifest.json` 至少要包含：

- `packageVersion`
- `configSchemaVersion`
- `defaultMode`
- `supportedModes`
- 工件文件名
- 期望镜像名

`checksums.sha256` 至少覆盖：

- app 镜像 tar
- nginx tar
- manifest
- setup 脚本
- config 模板
- compose base
- override example
- nginx 配置
- validate / doctor / smoke / merge 等辅助脚本

`setup` 和 `upgrade` 在校验失败时必须直接拒绝继续。

## 升级行为

升级的默认行为必须是“复用已有配置”。

详细规则：

1. 备份当前 `config/app.json`、`config/nginx.conf`、`docker-compose.override.yaml`
2. 读取当前配置
3. 只给缺失字段补新默认值
4. 所有已有值都保留
5. 保留原有 admin token
6. 保留原有 public URL
7. 保留原有 RTM 配置
8. 只有在新的必填字段无法安全推导时才中断

示例：

- 新增可选 diskRetention 字段：自动补默认值
- 新增可选 admin 开关：自动补默认值
- 字段重命名：若旧字段有值则自动迁移
- 新增一个没有安全默认值的外部依赖字段：中断并要求人工确认

## 配置合并策略

新增 `scripts/config-merge.js`，规则如下：

- 对对象做深度 merge
- 绝不覆盖已有标量值
- 支持把旧字段迁移到新结构
- 回写规范化后的新配置
- 更新 `configVersion`

迁移示例：

- `snapshotHost` -> `publicBaseUrl`
- `adminToken` -> `admin.token`

这个 merge 逻辑必须是确定性的，并且可单测。

## doctor 输出要求

`doctor` 至少要输出：

- 安装包版本
- 配置版本
- 当前模式
- Docker 是否可用
- Compose 是否可用
- 安装包完整性结果
- 磁盘剩余空间
- 目录可写性
- 端口占用情况
- 是否处于 bootstrap 模式
- admin 是否默认阻断远程访问
- 最终摘要：`PASS`、`WARN`、`FAIL`

只要服务能跑但仍处于 bootstrap 或非生产默认值状态，就应该给 `WARN`。

## smoke 验收要求

### App 模式

- 校验 `http://127.0.0.1:3000/snapshot/test-room` 返回 JSON
- 校验返回 URL 形态正确
- 带 token 调 admin status 返回 `200`
- 不带 token 调 admin status 返回 `401`

### Nginx 模式

- 校验 `http://127.0.0.1/snapshot/test-room` 返回 JSON
- 校验返回 URL 形态正确
- 校验 `http://127.0.0.1/admin/disk/cleanup/status` 返回 `403`
- 校验容器内本地 admin status 带 token 返回 `200`
- 如果 `tls.enabled=true`，额外校验 `https://127.0.0.1/snapshot/test-room`

### 通用

- 校验 `docker compose ps`
- 失败时可选输出最近日志

## 代码层改动要求

### `src/url.ts`

- 保持“配置优先”的行为
- 只有在显式 bootstrap 开关开启时才允许回退到请求头

### `src/init.ts`

- 支持新配置结构
- 兼容并规范化旧字段
- 暴露当前 bootstrap 状态

### `src/index.ts`

- RTM 仍处于 bootstrap placeholder 时，token 接口要返回明确运维错误
- 启动日志要带出 bootstrap 警告

### `src/admin-auth.ts`

- 语义上不需要大改，只需适配 `admin.token` 结构

## 构建链路改动

`buildpack.sh` 需要负责 Linux / CI 交付打包：

- 生成 base compose
- 生成 override example
- 写出 `manifest.json`
- 生成 `checksums.sha256`
- 更新打包脚本中的版本引用
- 把辅助脚本一起打进安装包

`buildpack-local.sh` 负责本机 macOS 预演 / 自测：

- 复用与交付包一致的产物结构
- 处理本机 `sed` / `tar` 兼容性
- 允许把安装包落到本机临时目录做端到端自检

## 测试方案

建议新增或扩展这些测试：

- `test/deploy-config.test.js`
  - nginx 默认必须拒绝 `/admin/`
  - base compose 和 override 文件存在
  - setup 命令模型存在

- `test/validate-config.test.js`
  - bootstrap 配置能通过 bootstrap 校验
  - 严格校验下 placeholder RTM 配置应失败
  - 严格校验下缺失 `publicBaseUrl` 应失败
  - bootstrap 模式允许缺失 `publicBaseUrl`

- `test/config-merge.test.js`
  - 保留已有值
  - 合并新默认值
  - 迁移旧字段

- `test/url.test.js`
  - 配置的 public URL 优先
  - fallback 只在 bootstrap 模式启用

- `test/index-bootstrap-token.test.js`
  - bootstrap RTM 模式下 token 接口返回明确运维错误

- `test/setup-script.test.js`
  - 验证 `init`、`setup`、`upgrade`、`doctor`、`smoke`

并更新 `test:private-deploy`，把新的部署相关测试都纳入。

## README 改写要求

README 私有化部署部分需要改成这几段：

- 首次安装：`init` + `setup`
- 可选检查：`doctor` + `smoke`
- 升级：默认复用旧配置
- bootstrap 警告和 RTM token 边界
- 客户自定义只能写 override
- nginx 默认拒绝远程 admin

## 非目标

- 不在本次改造里把共享生产 RTM 凭证打进安装包
- 不在本次改造里提供自动签发或自动续期证书能力；包内只支持客户自带证书的可选 HTTPS
- 不在本次改造里把本地文件存储改成别的持久化方案

## 验收标准

当以下条件全部满足时，方案才算完成：

1. `./setup.sh init app` + `./setup.sh setup app` 无需手改配置即可启动服务。
2. 首次 `init` 会自动生成随机 admin token。
3. bootstrap 模式下 snapshot URL 能工作，并且会清晰提示当前使用的是 fallback。
4. nginx 模式下默认拒绝远程 `/admin/*`。
5. 升级时如果没有新的必填配置，旧配置会被自动沿用。
6. 升级会安全地补充新的可选默认项。
7. 安装包完整性校验失败会阻止 setup 和 upgrade。
8. RTM placeholder 不阻止启动，但也不能让 token 接口伪装成真正可用。
9. 客户自定义通过 override 机制在 setup 和 upgrade 后都能保留。
10. `doctor` 和 `smoke` 能给 SA 提供可用的运维反馈。
