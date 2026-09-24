<script setup>
import { computed, onMounted, ref } from 'vue'
import { confirm as confirmDialog } from 'mdui/functions/confirm.js'
import { snackbar } from 'mdui/functions/snackbar.js'
import IconTooltipButton from './components/IconTooltipButton.vue'

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
const selectionMode = ref(false)
const actionLoading = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const allPageSelected = computed(() => (
  messages.value.length > 0 && messages.value.every((message) => selectedIds.value.includes(message.id))
))
const verificationCode = computed(() => {
  const content = selected.value?.content
  if (!content?.includes('验证码')) return ''
  return content.match(/(?:^|\D)(\d{4,6})(?!\d)/)?.[1] ?? ''
})

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
  selectionMode.value = false
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

function enterSelectionMode() {
  selectionMode.value = true
  selectedIds.value = []
}

function leaveSelectionMode() {
  selectionMode.value = false
  selectedIds.value = []
}

function handleMessageClick(message) {
  if (selectionMode.value) {
    toggleSelection(message.id)
    return
  }
  openMessage(message)
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

function copyTextFallback(value) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

async function copyVerificationCode() {
  if (!verificationCode.value) return

  try {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(verificationCode.value)
      } catch {
        if (!copyTextFallback(verificationCode.value)) throw new Error('Clipboard is unavailable')
      }
    } else if (!copyTextFallback(verificationCode.value)) {
      throw new Error('Clipboard is unavailable')
    }
    showFeedback('验证码已复制')
    closeMessageDialog()
  } catch {
    showFeedback('复制失败，请手动复制验证码')
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
        <IconTooltipButton content="退出登录" placement="bottom-end" aria-label="退出登录" @click="logout">
          <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z"/></svg></mdui-icon>
        </IconTooltipButton>
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
      <IconTooltipButton content="重试" placement="left" class="danger-action" aria-label="重试" @click="loadMessages(page)">
        <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></mdui-icon>
      </IconTooltipButton>
    </mdui-card>

    <section class="inbox-toolbar" aria-label="短信工具区">
      <div class="toolbar-primary-actions">
        <IconTooltipButton
          :content="selectionMode ? '退出选择' : '选择短信'"
          variant="tonal"
          :aria-label="selectionMode ? '退出选择' : '选择短信'"
          :disabled="!selectionMode && messages.length === 0"
          @click="selectionMode ? leaveSelectionMode() : enterSelectionMode()"
        >
          <mdui-icon v-if="selectionMode"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.7 4.29 4.29 10.59 10.59 16.89 4.29z"/></svg></mdui-icon>
          <mdui-icon v-else><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11 2 7.46l1.41-1.41 2.13 2.13 4.25-4.25 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.13 2.13 4.25-4.25 1.41 1.41L5.54 19z"/></svg></mdui-icon>
        </IconTooltipButton>
        <IconTooltipButton content="刷新" variant="outlined" aria-label="刷新" :loading="loading" :disabled="loading" @click="loadMessages(page)">
          <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></mdui-icon>
        </IconTooltipButton>
      </div>

      <div class="toolbar-actions">
        <template v-if="selectionMode">
          <span class="selection-count">已选 {{ selectedIds.length }} 条</span>
          <IconTooltipButton content="删除所选" placement="top-end" class="danger-action" variant="outlined" aria-label="删除所选" :disabled="actionLoading || selectedIds.length === 0" @click="deleteMessages(selectedIds)">
            <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg></mdui-icon>
          </IconTooltipButton>
        </template>

        <template v-else>
          <IconTooltipButton content="全部标记为已读" variant="tonal" aria-label="全部标记为已读" :disabled="actionLoading || unread === 0" @click="markAllRead">
            <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 7-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41 5.59 5.59L23.66 7l-1.42-1.41zM.41 13.41 6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg></mdui-icon>
          </IconTooltipButton>
          <IconTooltipButton content="清空收件箱" placement="top-end" class="danger-action" variant="outlined" aria-label="清空收件箱" :disabled="actionLoading || total === 0" @click="clearInbox">
            <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3-8h6v2H9v-2zm0 4h6v2H9v-2zm6.5-11-1-1h-5l-1 1H5v2h14V4z"/></svg></mdui-icon>
          </IconTooltipButton>
        </template>
      </div>
    </section>

    <mdui-card variant="outlined" class="inbox" :class="{ muted: loading || actionLoading, 'selection-mode': selectionMode }">
      <mdui-linear-progress v-if="loading || actionLoading"></mdui-linear-progress>
      <div class="inbox-head">
        <label v-if="selectionMode" class="check-cell" title="选择本页全部短信">
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
        <label v-if="selectionMode" class="check-cell">
          <mdui-checkbox
            :checked="selectedIds.includes(message.id)"
            :aria-label="`选择短信 ${message.id}`"
            @change="toggleSelection(message.id)"
          ></mdui-checkbox>
        </label>
        <mdui-card variant="filled" class="message-open" @click="handleMessageClick(message)">
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
        <IconTooltipButton content="上一页" variant="outlined" aria-label="上一页" :disabled="loading || page <= 1" @click="changePage(-1)">
          <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></mdui-icon>
        </IconTooltipButton>
        <IconTooltipButton content="下一页" placement="top-end" variant="filled" aria-label="下一页" :disabled="loading || page >= totalPages" @click="changePage(1)">
          <mdui-icon><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg></mdui-icon>
        </IconTooltipButton>
      </div>
    </footer>

    <mdui-dialog
      class="message-dialog"
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
        <mdui-button v-if="verificationCode" slot="action" variant="text" @click="copyVerificationCode">
          复制验证码
        </mdui-button>
        <mdui-button slot="action" variant="text" @click="closeMessageDialog">关闭</mdui-button>
      </template>
    </mdui-dialog>
  </main>
</template>
