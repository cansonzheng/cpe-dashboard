import crypto from 'node:crypto'

const COMMANDS = Object.freeze({
  SMS_INFO: 12,
  SMS_SETTING: 16,
  LOGIN: 100,
  LOGOUT: 101,
  GET_NEXT_LOGIN_TIME: 232,
})

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function makeSessionId() {
  return md5(Math.random().toString()) + md5(Math.random().toString())
}

function parseSms(encoded) {
  const raw = Buffer.from(encoded, 'base64').toString('utf8')
  const match = raw.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*)$/)

  if (!match) {
    return { raw, malformed: true }
  }

  return {
    id: match[1],
    read: match[2] === '1',
    sender: match[3],
    receivedAt: `${match[4]} ${match[5]}`,
    content: match[6],
  }
}

function sortSmsNewestFirst(messages) {
  return messages.sort((left, right) => {
    if (!left.receivedAt) return 1
    if (!right.receivedAt) return -1
    return right.receivedAt.localeCompare(left.receivedAt)
  })
}

export class CpeClient {
  constructor({ baseUrl, username, password, timeout = 15_000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.timeout = timeout
    this.sessionId = ''
    this.token = ''
  }

  async request(payload) {
    const response = await fetch(`${this.baseUrl}/cgi-bin/http.cgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      throw new Error(`设备接口返回 HTTP ${response.status}`)
    }

    const data = await response.json()
    if (!data.success) {
      const reason = data.message || data.login_fail || data.login_fail2 || '未知错误'
      const error = new Error(`设备请求失败：${reason}`)
      error.code = data.message
      throw error
    }
    return data
  }

  async login() {
    const preflight = await this.request({
      cmd: COMMANDS.GET_NEXT_LOGIN_TIME,
      method: 'GET',
      sessionId: '',
    })

    if (!preflight.token) {
      throw new Error('设备未返回登录令牌')
    }

    this.token = preflight.token
    const login = await this.request({
      cmd: COMMANDS.LOGIN,
      username: this.username,
      passwd: sha256(this.token + this.password),
      isAutoUpgrade: '0',
      token: this.token,
      sessionId: makeSessionId(),
      method: 'POST',
    })

    if (!login.sessionId || login.AUTH !== 'AUTH') {
      throw new Error('设备登录失败，请检查账号或密码')
    }
    this.sessionId = login.sessionId
  }

  async ensureLogin() {
    if (!this.sessionId) await this.login()
  }

  async authenticatedRequest(payload) {
    await this.ensureLogin()
    try {
      return await this.request({ ...payload, sessionId: this.sessionId })
    } catch (error) {
      if (error.code !== 'NO_AUTH') throw error
      this.sessionId = ''
      await this.login()
      return this.request({ ...payload, sessionId: this.sessionId })
    }
  }

  async getSmsSettings() {
    return this.authenticatedRequest({
      cmd: COMMANDS.SMS_SETTING,
      method: 'GET',
    })
  }

  async getInbox(page = 1) {
    const data = await this.authenticatedRequest({
      cmd: COMMANDS.SMS_INFO,
      page_num: page,
      subcmd: 0,
      method: 'GET',
    })

    const messages = data.sms_list
      ? sortSmsNewestFirst(data.sms_list.split(',').filter(Boolean).map(parseSms))
      : []

    return {
      page,
      pageSize: 10,
      total: Number(data.sms_total || 0),
      unread: Number(data.sms_unread || 0),
      inboxFull: data.receive_full === '1',
      messages,
    }
  }

  async logout() {
    if (!this.sessionId) return
    try {
      await this.request({
        cmd: COMMANDS.LOGOUT,
        method: 'POST',
        sessionId: this.sessionId,
        token: this.token,
      })
    } finally {
      this.sessionId = ''
      this.token = ''
    }
  }
}

export { COMMANDS, parseSms, sortSmsNewestFirst }
