<script setup>
import { computed, onMounted, ref } from 'vue'

const messages = ref([])
const page = ref(1)
const total = ref(0)
const unread = ref(0)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
const refreshedAt = ref('')
const selected = ref(null)
const authChecking = ref(true)
const authenticated = ref(false)
const password = ref('')
const authError = ref('')
const authLoading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function formatDate(value) {
  if (!value) return '—'
  return value.replaceAll('/', '-')
}

function senderLabel(sender) {
  if (sender === '10000') return '中国电信'
  return sender
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) {
    authenticated.value = false
    messages.value = []
  }
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

async function loadMessages(targetPage = page.value) {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/sms?page=${targetPage}`)
    const data = await readJson(response)

    messages.value = data.messages
    page.value = data.page
    total.value = data.total
    unread.value = data.unread
    if (data.pageSize) pageSize.value = data.pageSize
    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch (cause) {
    if (authenticated.value) error.value = cause.message
  } finally {
    loading.value = false
  }
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/session')
    const data = await readJson(response)
    authenticated.value = data.authenticated
    if (authenticated.value) await loadMessages(1)
  } catch (cause) {
    authError.value = cause.message
  } finally {
    authChecking.value = false
  }
}

async function login() {
  authLoading.value = true
  authError.value = ''
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    })
    await readJson(response)
    authenticated.value = true
    password.value = ''
    await loadMessages(1)
  } catch (cause) {
    authError.value = cause.message
  } finally {
    authLoading.value = false
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  authenticated.value = false
  messages.value = []
  selected.value = null
  error.value = ''
}

function changePage(direction) {
  const next = page.value + direction
  if (next >= 1 && next <= totalPages.value) loadMessages(next)
}

onMounted(checkSession)
</script>

<template>
  <main v-if="authChecking" class="auth-screen">
    <div class="auth-card auth-loading-card">
      <span class="brand-mark" aria-hidden="true">C</span>
      <p>正在检查登录状态…</p>
    </div>
  </main>

  <main v-else-if="!authenticated" class="auth-screen">
    <form class="auth-card" @submit.prevent="login">
      <span class="brand-mark auth-logo" aria-hidden="true">C</span>
      <p class="eyebrow">CPE DASHBOARD</p>
      <h1>欢迎回来</h1>
      <p class="auth-description">输入访问密码以进入设备管理面板。</p>

      <label for="password">访问密码</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" autofocus placeholder="请输入密码" required />
      <p v-if="authError" class="auth-error">{{ authError }}</p>
      <button class="login-button" type="submit" :disabled="authLoading || !password">
        {{ authLoading ? '正在登录…' : '进入控制台' }}
      </button>
      <small>登录状态将在此设备上长期保持</small>
    </form>
  </main>

  <main v-else class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">C</span>
        <div>
          <p class="eyebrow">CPE DASHBOARD</p>
          <h1>短信收件箱</h1>
        </div>
      </div>
      <div class="top-actions">
        <button class="quiet-button" @click="logout">退出</button>
        <button class="refresh" :disabled="loading" @click="loadMessages(page)">
          <span :class="{ spinning: loading }">↻</span>
          {{ loading ? '读取中' : '刷新' }}
        </button>
      </div>
    </header>

    <section class="summary" aria-label="收件箱概览">
      <div>
        <span class="summary-value">{{ total }}</span>
        <span class="summary-label">全部短信</span>
      </div>
      <div>
        <span class="summary-value accent">{{ unread }}</span>
        <span class="summary-label">未读</span>
      </div>
      <p class="sync-time">
        <span class="status-dot"></span>
        {{ refreshedAt ? `最后同步 ${refreshedAt}` : '正在连接设备' }}
      </p>
    </section>

    <div v-if="error" class="notice error-notice">
      <strong>无法读取收件箱</strong>
      <span>{{ error }}</span>
      <button @click="loadMessages(page)">重试</button>
    </div>

    <section class="inbox" :class="{ muted: loading }">
      <div class="inbox-head">
        <span>发件人</span>
        <span>短信内容</span>
        <span>接收时间</span>
      </div>

      <button v-for="message in messages" :key="message.id" class="message-row" :class="{ unread: !message.read }" @click="selected = message">
        <span class="sender-cell">
          <span class="avatar">{{ senderLabel(message.sender).slice(0, 1) }}</span>
          <span>
            <strong>{{ senderLabel(message.sender) }}</strong>
            <small>{{ message.sender }}</small>
          </span>
        </span>
        <span class="content-cell">
          <i v-if="!message.read">未读</i>
          {{ message.content }}
        </span>
        <time>{{ formatDate(message.receivedAt) }}</time>
      </button>

      <div v-if="!loading && !messages.length && !error" class="empty">
        <span>□</span>
        <p>收件箱暂无短信</p>
      </div>
    </section>

    <footer class="pagination">
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <div>
        <button :disabled="loading || page <= 1" @click="changePage(-1)">上一页</button>
        <button :disabled="loading || page >= totalPages" @click="changePage(1)">下一页</button>
      </div>
    </footer>

    <div v-if="selected" class="modal-backdrop" @click.self="selected = null">
      <article class="message-modal" role="dialog" aria-modal="true">
        <button class="modal-close" aria-label="关闭" @click="selected = null">×</button>
        <p class="eyebrow">MESSAGE {{ selected.id }}</p>
        <h2>{{ senderLabel(selected.sender) }}</h2>
        <time>{{ formatDate(selected.receivedAt) }}</time>
        <p class="message-full">{{ selected.content }}</p>
      </article>
    </div>
  </main>
</template>
