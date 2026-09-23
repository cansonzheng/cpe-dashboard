<script setup>
import { computed, onMounted, ref } from 'vue'

const AUTH_HINT_KEY = 'cpe-dashboard-authenticated'

function readAuthHint() {
  try {
    return window.localStorage.getItem(AUTH_HINT_KEY) === '1'
  } catch {
    return false
  }
}

const hasAuthHint = readAuthHint()

const messages = ref([])
const page = ref(1)
const total = ref(0)
const unread = ref(0)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
const refreshedAt = ref('')
const selected = ref(null)
const authChecking = ref(hasAuthHint)
const authenticated = ref(hasAuthHint)
const password = ref('')
const authError = ref('')
const authLoading = ref(false)
const selectedIds = ref([])
const actionLoading = ref(false)
const feedback = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const allPageSelected = computed(() => (
  messages.value.length > 0 && messages.value.every((message) => selectedIds.value.includes(message.id))
))

function setAuthenticated(value) {
  authenticated.value = value
  try {
    if (value) window.localStorage.setItem(AUTH_HINT_KEY, '1')
    else window.localStorage.removeItem(AUTH_HINT_KEY)
  } catch {
    // Storage may be disabled. The HttpOnly cookie remains the source of truth.
  }
}

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
    setAuthenticated(false)
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
    selectedIds.value = []
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
    setAuthenticated(data.authenticated)
    if (authenticated.value) await loadMessages(1)
  } catch (cause) {
    if (authenticated.value) error.value = `登录状态验证失败：${cause.message}`
    else authError.value = cause.message
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
    setAuthenticated(true)
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
  setAuthenticated(false)
  messages.value = []
  selected.value = null
  error.value = ''
  selectedIds.value = []
}

async function postAction(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return readJson(response)
}

function showFeedback(message) {
  feedback.value = message
  window.setTimeout(() => {
    if (feedback.value === message) feedback.value = ''
  }, 3000)
}

function toggleSelection(id) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((selectedId) => selectedId !== id)
    : [...selectedIds.value, id]
}

function togglePageSelection() {
  selectedIds.value = allPageSelected.value
    ? []
    : messages.value.map((message) => message.id)
}

async function openMessage(message) {
  selected.value = message
  if (message.read) return

  message.read = true
  unread.value = Math.max(0, unread.value - 1)
  try {
    await postAction(`/api/sms/${message.id}/read`)
  } catch (cause) {
    message.read = false
    unread.value += 1
    error.value = `标记已读失败：${cause.message}`
  }
}

async function markAllRead() {
  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/read-all')
    messages.value.forEach((message) => { message.read = true })
    unread.value = 0
    showFeedback('所有短信已标记为已读')
  } catch (cause) {
    error.value = `全部已读失败：${cause.message}`
  } finally {
    actionLoading.value = false
  }
}

async function deleteMessages(ids) {
  if (!ids.length) return
  const prompt = ids.length === 1 ? '确定删除这条短信吗？' : `确定删除选中的 ${ids.length} 条短信吗？`
  if (!window.confirm(prompt)) return

  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/delete', { ids })
    if (selected.value && ids.includes(selected.value.id)) selected.value = null
    const remainingTotal = Math.max(0, total.value - ids.length)
    const targetPage = Math.min(page.value, Math.max(1, Math.ceil(remainingTotal / pageSize.value)))
    await loadMessages(targetPage)
    showFeedback(ids.length === 1 ? '短信已删除' : `已删除 ${ids.length} 条短信`)
  } catch (cause) {
    error.value = `删除失败：${cause.message}`
  } finally {
    actionLoading.value = false
  }
}

async function clearInbox() {
  if (!window.confirm(`确定清空收件箱中的 ${total.value} 条短信吗？此操作无法撤销。`)) return

  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/clear')
    selected.value = null
    await loadMessages(1)
    showFeedback('收件箱已清空')
  } catch (cause) {
    error.value = `清空失败：${cause.message}`
  } finally {
    actionLoading.value = false
  }
}

function changePage(direction) {
  const next = page.value + direction
  if (next >= 1 && next <= totalPages.value) loadMessages(next)
}

onMounted(checkSession)
</script>

<template>
  <main v-if="authChecking && !authenticated" class="auth-screen">
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

    <div v-if="feedback" class="notice success-notice">
      <strong>操作成功</strong>
      <span>{{ feedback }}</span>
    </div>

    <section class="inbox-toolbar" aria-label="短信操作">
      <div>
        <button
          class="toolbar-button"
          :disabled="actionLoading || unread === 0"
          @click="markAllRead"
        >
          全部已读
        </button>
        <span v-if="selectedIds.length" class="selection-count">已选 {{ selectedIds.length }} 条</span>
      </div>
      <div>
        <button
          class="toolbar-button danger-button"
          :disabled="actionLoading || selectedIds.length === 0"
          @click="deleteMessages(selectedIds)"
        >
          删除所选
        </button>
        <button
          class="toolbar-button danger-button subtle-danger"
          :disabled="actionLoading || total === 0"
          @click="clearInbox"
        >
          清空收件箱
        </button>
      </div>
    </section>

    <section class="inbox" :class="{ muted: loading || actionLoading }">
      <div class="inbox-head">
        <label class="check-cell" title="选择本页全部短信">
          <input
            type="checkbox"
            :checked="allPageSelected"
            :disabled="messages.length === 0"
            aria-label="选择本页全部短信"
            @change="togglePageSelection"
          />
        </label>
        <span>发件人</span>
        <span>短信内容</span>
        <span>接收时间</span>
      </div>

      <div v-for="message in messages" :key="message.id" class="message-row" :class="{ unread: !message.read }">
        <label class="check-cell">
          <input
            type="checkbox"
            :checked="selectedIds.includes(message.id)"
            :aria-label="`选择短信 ${message.id}`"
            @change="toggleSelection(message.id)"
          />
        </label>
        <button class="message-open" @click="openMessage(message)">
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
      </div>

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
        <div class="modal-actions">
          <button class="danger-button" :disabled="actionLoading" @click="deleteMessages([selected.id])">
            删除此短信
          </button>
          <button class="toolbar-button" @click="selected = null">关闭</button>
        </div>
      </article>
    </div>
  </main>
</template>
