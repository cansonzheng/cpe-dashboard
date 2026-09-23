import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Koa from 'koa'
import Router from '@koa/router'
import { bodyParser } from '@koa/bodyparser'
import serve from 'koa-static'
import { createPasswordAuth } from './auth.js'
import { CpeClient } from './cpe-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = new Koa()
const router = new Router({ prefix: '/api' })

const auth = createPasswordAuth({
  password: process.env.APP_PASSWORD || '',
  maxAgeDays: Number(process.env.AUTH_MAX_AGE_DAYS || 365),
  secure: process.env.COOKIE_SECURE === 'true',
  sessionSecret: process.env.SESSION_SECRET || '',
})
app.keys = [auth.signingKey]

const config = {
  baseUrl: process.env.CPE_BASE_URL || 'http://192.168.21.1',
  username: process.env.CPE_USERNAME || 'root',
  password: process.env.CPE_PASSWORD || '',
}

let client
function getClient() {
  if (!config.password) {
    const error = new Error('服务端未配置 CPE_PASSWORD')
    error.status = 503
    throw error
  }
  if (!client) client = new CpeClient(config)
  return client
}

app.use(async (ctx, next) => {
  try {
    await next()
  } catch (error) {
    const status = error.status || 502
    ctx.status = status
    ctx.body = {
      error: status === 500 ? '服务器内部错误' : error.message,
    }
    if (status >= 500) console.error(error)
  }
})

app.use(bodyParser({ enableTypes: ['json'], jsonLimit: '16kb' }))

router.get('/health', (ctx) => {
  ctx.body = {
    ok: true,
    configured: Boolean(config.password) && auth.configured,
  }
})

router.get('/auth/session', (ctx) => {
  const authenticated = auth.isAuthenticated(ctx)
  if (authenticated) auth.setSession(ctx)
  ctx.body = { configured: auth.configured, authenticated }
})

router.post('/auth/login', (ctx) => {
  if (!auth.configured) ctx.throw(503, '服务端未配置 APP_PASSWORD')
  if (!auth.verify(ctx.request.body?.password)) ctx.throw(401, '密码错误')
  auth.setSession(ctx)
  ctx.body = { authenticated: true }
})

router.post('/auth/logout', (ctx) => {
  auth.clearSession(ctx)
  ctx.body = { authenticated: false }
})

router.get('/sms/settings', auth.requireAuth, async (ctx) => {
  const settings = await getClient().getSmsSettings()
  ctx.body = {
    enabled: settings.smsSw === '1',
    maxMessages: Number(settings.maxSize || 0),
    maxLength: Number(settings.maxLen || 0),
    inboxFull: settings.receive_full === '1',
  }
})

router.get('/sms', auth.requireAuth, async (ctx) => {
  const requestedPage = Number.parseInt(ctx.query.page, 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  ctx.body = await getClient().getInbox(page)
})

app.use(router.routes())
app.use(router.allowedMethods())

const distPath = path.resolve(__dirname, '../dist')
app.use(serve(distPath))

const port = Number(process.env.PORT || 3100)
const host = process.env.HOST || '127.0.0.1'
const server = app.listen(port, host, () => {
  console.log(`cpe-dashboard 已启动：http://${host}:${port}`)
})

async function shutdown() {
  server.close()
  if (client) await client.logout().catch(() => {})
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
