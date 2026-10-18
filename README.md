# cpe-dashboard

一个基于 Koa 和 Vue 3 的轻量 CPE 设备管理面板。目前提供设备概览和短信收件箱，后续可以继续扩展网络配置等管理模块。设备账号、密码和会话均只存在于服务端，页面使用独立访问密码保护。

## 当前功能

- 概览：展示运行时间、运营商、信号、频段、频点、PCI、内存和月度流量状态
- 短信：分页浏览收件箱、标记已读、批量删除和清空

### 已提取的设备接口

设备接口统一为 `POST {CPE_BASE_URL}/cgi-bin/http.cgi`，请求体为 JSON：

| cmd | 用途 | 关键字段 |
| --- | --- | --- |
| 232 | 获取一次性登录令牌 | `method: "GET"`, `sessionId: ""` |
| 100 | 登录 | `username`, `passwd`, `token`, `sessionId` |
| 12 | 查询短信列表、标记已读 | `page_num`, `subcmd: 0` 或 `index` |
| 14 | 删除短信、清空收件箱 | `index`, `subcmd: 0` |
| 16 | 查询短信设置 | `sessionId` |
| 101 | 退出登录 | `sessionId`, `token` |
| 337 | 查询流量设置及月度用量 | `sessionId` |
| 1001 | 查询设备运行时间和内存 | `sessionId` |
| 1002 | 查询运营商和信号状态 | `sessionId` |

登录密码字段为 `SHA-256(token + password)`。短信列表的 `sms_list` 是逗号分隔的 Base64 字符串；解码后格式为：

```text
短信编号 已读标志 发件人 YYYY/MM/DD HH:mm:ss 短信正文
```

设备会话返回 `NO_AUTH` 或 `LOGIN_TIMEOUT` 时，服务端会重新登录设备并将原请求自动重试一次，不会要求浏览器重新登录。

## 本地运行

需要 Node.js 20.19+。

```bash
pnpm install
cp .env.example .env
```

复制并填写 `.env` 后直接启动：

```bash
pnpm dev
```

Koa 启动时会通过 `dotenv` 自动读取项目根目录的 `.env`。该文件已加入 `.gitignore`，不会被提交到 Git。

页面登录只需要密码。请在 `.env` 中设置：

```dotenv
APP_PASSWORD=请设置一个独立的强密码
AUTH_MAX_AGE_DAYS=365
COOKIE_SECURE=false
```

登录保存在签名的 `HttpOnly` Cookie 中，默认有效期为 365 天，并在使用期间自动续期。修改 `APP_PASSWORD` 会使已有登录自动失效。通过 HTTPS 部署时，应将 `COOKIE_SECURE` 设置为 `true`。

开发模式可以通过 `http://localhost:5173` 访问。Vite 和 Koa 均固定监听 IPv6 通配地址 `::`，在常见双栈系统上可同时通过 IPv4 和 IPv6 访问，不需要配置 `HOST` 环境变量。`pnpm start` 可直接运行源码版 Koa 服务；正式部署建议使用下面的自包含 `dist/` 产物。

## 生产构建

项目使用 Vite 8 + Rolldown 构建 Vue PWA，并使用 Rolldown 将 Koa 服务及其运行依赖打包成单个文件：

```bash
pnpm build
```

命令会重新生成 `dist/`：

```text
dist/
  public/            Vue/PWA 静态资源
  server/index.mjs   自包含的 Koa 服务
```

`dist/` 只包含实际运行文件，不包含文档、环境变量模板、`package.json` 或 `node_modules`，运行时也不需要执行 `pnpm install`。可以将整个目录复制到装有 Node.js 22 的环境中直接启动：

```bash
cd dist
node server/index.mjs
```

运行前需要通过环境变量或 `.env` 提供设备及页面登录配置。

## 远程部署

本机需要安装 `sshpass`、`rsync` 和 `ssh`，服务器需安装 `docker-compose`。在 `scripts/deploy.sh` 开头设置服务器主机、用户名、密码和部署目录，然后运行：

```bash
pnpm build
pnpm run deploy
```

脚本使用 `sshpass` 提供密码，将 `dist` 通过 rsync 上传到服务器的 `DEPLOY_DIRECTORY/dist`，成功后进入 `DEPLOY_DIRECTORY`，依次执行 `docker-compose down` 和 `docker-compose up -d`。该目录需包含 Compose 配置。上传、切换目录或停止服务失败时会停止后续操作；部署脚本本身不会自动构建。脚本中的密码初始为占位值，填写真实密码后不要提交到仓库。

## Docker Compose

先在宿主机生成一次自包含产物：

```bash
pnpm build
docker compose up -d
```

Compose 使用官方 `node:22-alpine` 镜像，将本地 `dist/` 只读映射到 `/app`，直接运行 `server/index.mjs`，容器启动过程不会执行 `pnpm install`。

默认映射 `3100:3100`。如需修改宿主机端口，在 `.env` 中设置：

```dotenv
DASHBOARD_PORT=8080
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f dashboard
```

源码更新后重新执行 `pnpm build`，再重启容器：

```bash
docker compose restart dashboard
```

也可以将 `dist/` 固化进镜像：

```bash
pnpm build
docker build -t cpe-dashboard .
docker run --env-file .env -p 3100:3100 cpe-dashboard
```

本项目自身提供：

- `GET /api/health`：服务状态
- `GET /api/auth/session`：查询页面登录状态
- `POST /api/auth/login`：使用密码登录
- `POST /api/auth/logout`：退出登录
- `GET /api/overview`：设备状态与流量概览；`signal.band`、`signal.channel`、`signal.pci` 分别为当前网络的频段、频点编号和 PCI，缺失时为 `null`。5G 使用设备的 5G 字段，其余网络使用普通网络字段。
- `GET /api/sms?page=1`：分页短信列表
- `GET /api/sms/settings`：短信功能配置摘要
- `POST /api/sms/:id/read`：将单条短信标为已读
- `POST /api/sms/read-all`：将全部短信标为已读
- `POST /api/sms/delete`：删除所选短信，JSON 请求体为 `{ "ids": ["1", "2"] }`
- `POST /api/sms/clear`：清空收件箱

概览和短信相关接口均要求登录。

## PWA

生产构建会生成 Web App Manifest 和 Service Worker，可将 cpe-dashboard 安装为独立应用。应用外壳支持离线打开，但设备 API 始终使用网络请求且不会被 Service Worker 缓存。

页面会在当前浏览器的 localStorage 中保留最近成功加载的概览和一页短信（包含正文）。已有登录凭据时，重新打开页面先显示这些数据，再联网更新；请求失败时保留已有数据。标记已读、删除或清空后会更新缓存，退出登录或确认登录失效时会清除缓存。缓存不包含访问密码、设备凭据或会话信息。

首次加载、切换页面、从后台回到应用或恢复浏览器历史页面时，都会重新请求当前页面的数据。数据请求使用 `cache: 'no-store'` 绕过 HTTP 缓存，成功后替换页面内容及本地快照；后台刷新期间已有内容继续显示。

进入短信、返回应用或点击刷新时，始终请求第一页以获取最新短信，不沿用缓存的旧页码；翻页按钮仍可浏览历史短信。短信请求带独立时间参数，服务端所有 API 响应设置 `Cache-Control: no-store`，避免浏览器和代理复用旧响应。并发请求只应用最后发起请求的结果。

Service Worker 仅能在 HTTPS 或 `localhost` 安全上下文中注册。通过局域网 IP 在手机上安装时，需要为服务配置 HTTPS。
