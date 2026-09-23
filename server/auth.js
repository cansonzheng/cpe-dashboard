import crypto from 'node:crypto'

const COOKIE_NAME = 'cpe_dashboard_auth'

function digest(value) {
  return crypto.createHash('sha256').update(value).digest()
}

function safeEqual(left, right) {
  return crypto.timingSafeEqual(digest(left), digest(right))
}

export function createPasswordAuth({
  password,
  maxAgeDays = 365,
  secure = false,
  sessionSecret = '',
}) {
  const configured = Boolean(password)
  const validMaxAgeDays = Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays : 365
  const sessionValue = configured
    ? digest(`cpe-dashboard-session:${password}`).toString('hex')
    : ''
  const signingKey = sessionSecret || digest(`cpe-dashboard-cookie:${password || 'unconfigured'}`).toString('hex')
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    signed: true,
    overwrite: true,
    maxAge: validMaxAgeDays * 24 * 60 * 60 * 1000,
  }

  function isAuthenticated(ctx) {
    const cookie = ctx.cookies.get(COOKIE_NAME, { signed: true }) || ''
    return configured && safeEqual(cookie, sessionValue)
  }

  function setSession(ctx) {
    ctx.cookies.set(COOKIE_NAME, sessionValue, cookieOptions)
  }

  function clearSession(ctx) {
    ctx.cookies.set(COOKIE_NAME, null, { ...cookieOptions, maxAge: 0 })
  }

  async function requireAuth(ctx, next) {
    if (!configured) ctx.throw(503, '服务端未配置 APP_PASSWORD')
    if (!isAuthenticated(ctx)) ctx.throw(401, '请先登录')

    // Sliding expiration keeps actively used installations signed in.
    setSession(ctx)
    await next()
  }

  return {
    configured,
    signingKey,
    isAuthenticated,
    verify(candidate) {
      return configured && safeEqual(String(candidate || ''), password)
    },
    setSession,
    clearSession,
    requireAuth,
  }
}
