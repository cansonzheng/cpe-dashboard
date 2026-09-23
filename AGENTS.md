# AGENTS.md

## Project overview

This repository contains `cpe-dashboard`, a lightweight and extensible CPE management application. SMS inbox browsing is its first feature, but the project may gain additional device-management modules:

- The backend uses Koa and talks to the CPE management API.
- The frontend uses Vue 3 and Vite.
- The browser must never connect to the CPE directly.
- Device credentials, login tokens, and session IDs belong on the server only.
- Browser access is protected by a password-only, signed HttpOnly cookie session.
- The frontend is an installable dashboard PWA; never cache `/api/*` responses.

## Repository layout

```text
server/
  index.js             Koa application and public API routes
  cpe-client.js        CPE authentication, requests, and SMS decoding
  cpe-client.test.js   Node.js unit tests for the device protocol parser
  auth.js              Browser password authentication and long-lived cookies
  auth.test.js         Authentication unit tests
src/
  App.vue              Main inbox view and client-side data loading
  main.js              Vue application entry point
  styles.css           Global and responsive styles
index.html              Vite HTML entry point
vite.config.js          Vite configuration and development proxy
scripts/build-release.mjs  Vite/Rolldown self-contained dist builder
docker-compose.yml      Runs the prebuilt release without installing packages
Dockerfile              Optional image for embedding the prebuilt release
.env.example            Environment variable template
README.md               User-facing setup and API documentation
```

Generated output and installed dependencies are in `dist/` and `node_modules/`.
Do not edit these directories by hand.

## Setup and commands

Use Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test          # Run Node.js unit tests
npm run build     # Build the self-contained dist/ directory with Rolldown
npm run build:web # Build only the Vue/PWA frontend
npm start         # Serve the built frontend and Koa API on PORT
```

During development:

- Vue is served at `http://127.0.0.1:5173`.
- Koa is served at `http://127.0.0.1:3100` by default.
- Vite proxies `/api` requests to Koa.

## Environment variables

The Koa entry point loads the repository-root `.env` using `dotenv`.

Required device settings:

```dotenv
CPE_BASE_URL=http://192.168.21.1
CPE_USERNAME=root
CPE_PASSWORD=replace-with-device-password
APP_PASSWORD=replace-with-page-password
```

Optional server settings:

```dotenv
PORT=3100
```

The Koa and Vite servers bind to the IPv6 unspecified address `::` in code.
Do not add a `HOST` environment variable; this default provides IPv6 and, on
normal dual-stack hosts, IPv4 access as well.

Rules:

- Never commit `.env` or real device credentials.
- Keep `.env.example` free of secrets.
- Never return the device password, token, or session ID from a Koa route.
- Never expose `APP_PASSWORD` or browser authentication cookies to JavaScript.
- Do not expose CPE credentials through Vite variables or frontend code.
- Avoid logging full request bodies for authentication commands.

## Architecture boundaries

Keep the device protocol inside `server/cpe-client.js`.

- `server/cpe-client.js` owns login hashing, session handling, CPE commands, and
  Base64 SMS parsing.
- `server/index.js` translates device responses into stable, browser-safe JSON.
- Vue consumes only local `/api/*` routes.
- Keep SMS routes protected by `auth.requireAuth`.
- UI components must not know CPE command numbers or raw record formats.

The public Koa API currently contains:

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/sms?page=1`
- `GET /api/sms/settings`
- `POST /api/sms/:id/read`
- `POST /api/sms/read-all`
- `POST /api/sms/delete`
- `POST /api/sms/clear`

Preserve the response shape of existing routes unless a requested change
explicitly requires a breaking API change.

## CPE protocol notes

The device accepts JSON via:

```text
POST {CPE_BASE_URL}/cgi-bin/http.cgi
Content-Type: application/json;charset=UTF-8
```

Known commands:

| Command | Purpose |
| --- | --- |
| `232` | Get the one-time login token |
| `100` | Log in |
| `12` | Read the SMS inbox |
| `14` | Delete inbox messages |
| `16` | Read SMS settings |
| `101` | Log out |

Authentication rules:

- Fetch command `232` before login.
- Send the password as `SHA-256(token + plaintextPassword)`.
- Use the session ID returned by command `100` for authenticated requests.
- Retry an authenticated request once after `NO_AUTH` or `LOGIN_TIMEOUT` by
  creating a new session.
- Do not repeatedly retry failed credentials; the device may enforce lockouts.

Inbox rules:

- Use command `12` with `subcmd: 0` and a one-based `page_num`.
- The device page size is 10.
- `sms_list` is a comma-separated collection of Base64 records.
- A decoded record has this shape:

```text
messageId readFlag sender YYYY/MM/DD HH:mm:ss messageBody
```

- `readFlag` is `1` for read and `0` for unread.
- Reading the inbox list must remain read-only unless the user explicitly asks
  for mutations. Mark-as-read, delete-selected, and clear-inbox are implemented;
  keep all mutation routes authenticated and require confirmation for deletes.
- Do not add SMS sending, replies, or forwarding unless the user asks.

## Coding conventions

- Use ECMAScript modules and the existing JavaScript style.
- Prefer `async`/`await` and native `fetch` on the server.
- Keep protocol constants in the `COMMANDS` object.
- Normalize raw CPE values at the Koa boundary. Public JSON should use booleans
  and numbers instead of device strings where practical.
- Return concise Chinese error messages suitable for the current UI.
- Keep the Vue page usable at narrow mobile widths.
- Avoid external runtime assets; the UI should work on an isolated LAN.
- Do not add a state library for the current single-page view unless complexity
  clearly requires it.

## UI library

- Use MDUI 2 for frontend controls and follow its Material Design 3 patterns.
- The MDUI AI documentation index is
  `https://www.mdui.org/zh-cn/docs/2/llms.txt`; consult it before adding or
  changing MDUI components.
- Keep MDUI installed through npm and bundled locally. Do not use CDN assets,
  because the dashboard must work on an isolated LAN.
- Use `#006874` as the theme seed color through MDUI's `setColorScheme` API.
- Keep Vite configured to treat tags beginning with `mdui-` as custom elements.
- MDUI components are Web Components. In Vue templates, synchronize values and
  events explicitly instead of relying on `v-model`.

## Testing and verification

After backend protocol or parser changes, run:

```bash
npm test
```

After frontend, dependency, or build configuration changes, run:

```bash
npm run build
```

The production artifact must remain self-contained and minimal: `dist/`
contains only `public/` and `server/index.mjs`. It must run with Node.js 22
without `node_modules` or `npm install`. Do not copy documentation, environment
templates, or package metadata into it. Docker Compose mounts it read-only and
executes the bundled server.

Before handing off a change that touches both layers, run both commands.

For live-device verification:

- Confirm the user has authorized access to the target device.
- Use only the minimum read-only request required for the task.
- Check `/api/health` before requesting `/api/sms?page=1`.
- Do not print full SMS bodies or authentication data in routine logs.
- Stop the temporary server after verification so its shutdown handler can log
  out of the CPE session.

## Change discipline

- Keep changes scoped to the requested behavior.
- Update `README.md` when setup, environment variables, or public API routes
  change.
- Update `.env.example` when introducing a new environment variable.
- Add or update tests when changing SMS parsing or authentication behavior.
- Do not overwrite the user's local `.env` unless explicitly requested.
