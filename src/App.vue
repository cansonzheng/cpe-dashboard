<script setup>
import { computed, onMounted, ref } from 'vue'
import { confirm as confirmDialog } from 'mdui/functions/confirm.js'
import { snackbar } from 'mdui/functions/snackbar.js'

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
const messageDialogOpen = ref(false)
const authChecking = ref(hasAuthHint)
const authenticated = ref(hasAuthHint)
const password = ref('')
const authError = ref('')
const authLoading = ref(false)
const selectedIds = ref([])
const actionLoading = ref(false)

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
  messageDialogOpen.value = false
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
  snackbar({ message, placement: 'bottom' })
}

async function askForConfirmation(headline, description) {
  try {
    await confirmDialog({
      headline,
      description,
      confirmText: '确认',
      cancelText: '取消',
      closeOnEsc: true,
      queue: 'sms-actions',
    })
    return true
  } catch {
    return false
  }
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
  messageDialogOpen.value = true
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

function closeMessageDialog() {
  messageDialogOpen.value = false
}

function finishClosingMessageDialog() {
  selected.value = null
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
  const description = ids.length === 1
    ? '删除后将无法恢复。'
    : `将删除选中的 ${ids.length} 条短信，删除后无法恢复。`
  if (!await askForConfirmation('删除短信？', description)) return

  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/delete', { ids })
    if (selected.value && ids.includes(selected.value.id)) closeMessageDialog()
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
  if (!await askForConfirmation('清空收件箱？', `将删除收件箱中的 ${total.value} 条短信，此操作无法撤销。`)) return

  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/clear')
    closeMessageDialog()
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
    <mdui-card variant="elevated" class="auth-card auth-loading-card">
      <span class="brand-mark" aria-hidden="true">C</span>
      <mdui-circular-progress></mdui-circular-progress>
      <p>正在检查登录状态…</p>
    </mdui-card>
  </main>

  <main v-else-if="!authenticated" class="auth-screen">
    <mdui-card variant="elevated" class="auth-card">
      <form @submit.prevent="login">
        <span class="brand-mark auth-logo" aria-hidden="true">C</span>
        <p class="eyebrow">CPE DASHBOARD</p>
        <h1>欢迎回来</h1>
        <p class="auth-description">输入访问密码以进入设备管理面板。</p>

        <mdui-text-field
          id="password"
          variant="outlined"
          label="访问密码"
          type="password"
          autocomplete="current-password"
          :value="password"
          :disabled="authLoading"
          required
          autofocus
          @input="password = $event.target.value"
        ></mdui-text-field>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <mdui-button class="login-button" type="submit" variant="filled" full-width :loading="authLoading" :disabled="!password">
          {{ authLoading ? '正在登录…' : '进入控制台' }}
        </mdui-button>
        <small>登录状态将在此设备上长期保持</small>
      </form>
    </mdui-card>
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
        <mdui-button variant="text" @click="logout">退出</mdui-button>
        <mdui-button variant="tonal" :loading="loading" :disabled="loading" @click="loadMessages(page)">
          {{ loading ? '读取中' : '刷新' }}
        </mdui-button>
      </div>
    </header>

    <section class="summary" aria-label="收件箱概览">
      <mdui-card variant="filled" class="summary-card">
        <span class="summary-value">{{ total }}</span>
        <span class="summary-label">全部短信</span>
      </mdui-card>
      <mdui-card variant="filled" class="summary-card">
        <span class="summary-value accent">{{ unread }}</span>
        <span class="summary-label">未读</span>
      </mdui-card>
      <mdui-card variant="filled" class="sync-card">
        <p class="sync-time">
          <span class="status-dot"></span>
          {{ refreshedAt ? `最后同步 ${refreshedAt}` : '正在连接设备' }}
        </p>
      </mdui-card>
    </section>

    <mdui-card v-if="error" variant="filled" class="notice error-notice">
      <div>
        <strong>操作遇到问题</strong>
        <span>{{ error }}</span>
      </div>
      <mdui-button variant="text" @click="loadMessages(page)">重试</mdui-button>
    </mdui-card>

    <section class="inbox-toolbar" aria-label="短信操作">
      <div>
        <mdui-button
          variant="tonal"
          :disabled="actionLoading || unread === 0"
          @click="markAllRead"
        >
          全部已读
        </mdui-button>
        <mdui-badge v-if="selectedIds.length" variant="large">已选 {{ selectedIds.length }} 条</mdui-badge>
      </div>
      <div>
        <mdui-button
          class="danger-action"
          variant="outlined"
          :disabled="actionLoading || selectedIds.length === 0"
          @click="deleteMessages(selectedIds)"
        >
          删除所选
        </mdui-button>
        <mdui-button
          class="danger-action"
          variant="text"
          :disabled="actionLoading || total === 0"
          @click="clearInbox"
        >
          清空收件箱
        </mdui-button>
      </div>
    </section>

    <mdui-card variant="outlined" class="inbox" :class="{ muted: loading || actionLoading }">
      <mdui-linear-progress v-if="loading || actionLoading"></mdui-linear-progress>
      <div class="inbox-head">
        <label class="check-cell" title="选择本页全部短信">
          <mdui-checkbox
            :checked="allPageSelected"
            :disabled="messages.length === 0"
            aria-label="选择本页全部短信"
            @change="togglePageSelection"
          ></mdui-checkbox>
        </label>
        <span>发件人</span>
        <span>短信内容</span>
        <span>接收时间</span>
      </div>

      <div v-for="message in messages" :key="message.id" class="message-row" :class="{ unread: !message.read }">
        <label class="check-cell">
          <mdui-checkbox
            :checked="selectedIds.includes(message.id)"
            :aria-label="`选择短信 ${message.id}`"
            @change="toggleSelection(message.id)"
          ></mdui-checkbox>
        </label>
        <mdui-card variant="filled" class="message-open" @click="openMessage(message)">
          <span class="sender-cell">
            <mdui-avatar>{{ senderLabel(message.sender).slice(0, 1) }}</mdui-avatar>
            <span>
              <strong>{{ senderLabel(message.sender) }}</strong>
              <small>{{ message.sender }}</small>
            </span>
          </span>
          <span class="content-cell">
            <mdui-badge v-if="!message.read" variant="large">未读</mdui-badge>
            {{ message.content }}
          </span>
          <time>{{ formatDate(message.receivedAt) }}</time>
        </mdui-card>
      </div>

      <div v-if="!loading && !messages.length && !error" class="empty">
        <span>□</span>
        <p>收件箱暂无短信</p>
      </div>
    </mdui-card>

    <footer class="pagination">
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <div>
        <mdui-button variant="outlined" :disabled="loading || page <= 1" @click="changePage(-1)">上一页</mdui-button>
        <mdui-button variant="filled" :disabled="loading || page >= totalPages" @click="changePage(1)">下一页</mdui-button>
      </div>
    </footer>

    <mdui-dialog
      :open="messageDialogOpen"
      close-on-esc
      close-on-overlay-click
      @close="messageDialogOpen = false"
      @closed="finishClosingMessageDialog"
    >
      <template v-if="selected">
        <span slot="headline">{{ senderLabel(selected.sender) }}</span>
        <div class="message-meta">MESSAGE {{ selected.id }} · {{ formatDate(selected.receivedAt) }}</div>
        <p class="message-full">{{ selected.content }}</p>
        <mdui-button slot="action" class="danger-action" variant="text" :disabled="actionLoading" @click="deleteMessages([selected.id])">
          删除此短信
        </mdui-button>
        <mdui-button slot="action" variant="text" @click="closeMessageDialog">关闭</mdui-button>
      </template>
    </mdui-dialog>
  </main>
</template>
