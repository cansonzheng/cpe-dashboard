# cpe-dashboard

一个基于 Koa 和 Vue 3 的轻量 CPE 设备管理面板。目前提供短信收件箱功能，后续可以继续扩展设备状态、网络配置等管理模块。设备账号、密码和会话均只存在于服务端，页面使用独立访问密码保护。

## 当前功能：短信收件箱

### 已提取的设备接口

设备接口统一为 `POST {CPE_BASE_URL}/cgi-bin/http.cgi`，请求体为 JSON：

| cmd | 用途 | 关键字段 |
| --- | --- | --- |
| 232 | 获取一次性登录令牌 | `method: "GET"`, `sessionId: ""` |
| 100 | 登录 | `username`, `passwd`, `token`, `sessionId` |
| 12 | 查询短信列表 | `page_num`, `subcmd: 0`, `sessionId` |
| 16 | 查询短信设置 | `sessionId` |
| 101 | 退出登录 | `sessionId`, `token` |

登录密码字段为 `SHA-256(token + password)`。短信列表的 `sms_list` 是逗号分隔的 Base64 字符串；解码后格式为：

```text
短信编号 已读标志 发件人 YYYY/MM/DD HH:mm:ss 短信正文
```

## 本地运行

需要 Node.js 20.19+。

```bash
npm install
cp .env.example .env
```

复制并填写 `.env` 后直接启动：

```bash
npm run dev
```

Koa 启动时会通过 `dotenv` 自动读取项目根目录的 `.env`。该文件已加入 `.gitignore`，不会被提交到 Git。

页面登录只需要密码。请在 `.env` 中设置：

```dotenv
APP_PASSWORD=请设置一个独立的强密码
AUTH_MAX_AGE_DAYS=365
COOKIE_SECURE=false
```

登录保存在签名的 `HttpOnly` Cookie 中，默认有效期为 365 天，并在使用期间自动续期。修改 `APP_PASSWORD` 会使已有登录自动失效。通过 HTTPS 部署时，应将 `COOKIE_SECURE` 设置为 `true`。

浏览器访问 `http://127.0.0.1:5173`。生产模式先执行 `npm run build`，再用相同环境变量执行 `npm start`，访问 `http://127.0.0.1:3100`。

本项目自身提供：

- `GET /api/health`：服务状态
- `GET /api/auth/session`：查询页面登录状态
- `POST /api/auth/login`：使用密码登录
- `POST /api/auth/logout`：退出登录
- `GET /api/sms?page=1`：分页短信列表
- `GET /api/sms/settings`：短信功能配置摘要

短信相关接口均要求登录。

## PWA

生产构建会生成 Web App Manifest 和 Service Worker，可将 cpe-dashboard 安装为独立应用。应用外壳支持离线打开，但设备 API 始终使用网络请求且不会被 Service Worker 缓存。

Service Worker 仅能在 HTTPS 或 `localhost` 安全上下文中注册。通过局域网 IP 在手机上安装时，需要为服务配置 HTTPS。
