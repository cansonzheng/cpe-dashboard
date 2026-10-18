<script setup>
import '@mdui/icons/arrow-back.js'
import '@mdui/icons/arrow-forward.js'
import '@mdui/icons/checklist.js'
import '@mdui/icons/close.js'
import '@mdui/icons/content-copy.js'
import '@mdui/icons/dashboard.js'
import '@mdui/icons/dashboard--outlined.js'
import '@mdui/icons/delete.js'
import '@mdui/icons/delete-sweep.js'
import '@mdui/icons/done-all.js'
import '@mdui/icons/inbox.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/sms.js'
import '@mdui/icons/sms--outlined.js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { confirm as confirmDialog } from 'mdui/functions/confirm.js'
import { snackbar } from 'mdui/functions/snackbar.js'
import IconTooltipButton from './components/IconTooltipButton.vue'
import OverviewPage from './components/OverviewPage.vue'
import { extractVerificationCode, getVerificationMessages } from './verification-code.js'

const AUTH_HINT_KEY = 'cpe-dashboard-authenticated'
const DATA_CACHE_KEY = 'cpe-dashboard-data-v1'

function readDataCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(DATA_CACHE_KEY) || '{}')
    return cached && typeof cached === 'object' ? cached : {}
  } catch {
    return {}
  }
}

function writeDataCache() {
  if (!authenticated.value) return
  try {
    window.localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      overview: overview.value,
      inbox: {
        messages: messages.value,
        page: page.value,
        total: total.value,
        unread: unread.value,
        pageSize: pageSize.value,
      },
    }))
  } catch {
    // Data still works in memory when storage is unavailable or full.
  }
}

function readAuthHint() {
  try {
    return window.localStorage.getItem(AUTH_HINT_KEY) === '1'
  } catch {
    return false
  }
}

const hasAuthHint = readAuthHint()
const cachedData = hasAuthHint ? readDataCache() : {}
const cachedInbox = Array.isArray(cachedData.inbox?.messages) ? cachedData.inbox : null
const initialPage = window.location.hash === '#sms' ? 'sms' : 'overview'
const navigationMedia = window.matchMedia('(max-width: 760px)')

const activePage = ref(initialPage)
const compactNavigation = ref(navigationMedia.matches)
const overview = ref(cachedData.overview && typeof cachedData.overview === 'object' ? cachedData.overview : null)
const overviewLoading = ref(false)
const messages = ref(cachedInbox?.messages || [])
const firstPageMessages = ref(cachedInbox?.page === 1 ? cachedInbox.messages : [])
const page = ref(Number.isInteger(cachedInbox?.page) && cachedInbox.page > 0 ? cachedInbox.page : 1)
const total = ref(Number.isFinite(cachedInbox?.total) ? cachedInbox.total : 0)
const unread = ref(Number.isFinite(cachedInbox?.unread) ? cachedInbox.unread : 0)
const pageSize = ref(Number.isFinite(cachedInbox?.pageSize) && cachedInbox.pageSize > 0 ? cachedInbox.pageSize : 10)
const loading = ref(false)
let inboxRequestId = 0
const error = ref('')
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
const copyingVerificationId = ref(null)
const globalLoading = computed(() => (
  authChecking.value || authLoading.value || overviewLoading.value || loading.value || actionLoading.value
))

const pageTitle = computed(() => activePage.value === 'overview' ? '概览' : '短信')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const allPageSelected = computed(() => (
  messages.value.length > 0 && messages.value.every((message) => selectedIds.value.includes(message.id))
))
const verificationCode = computed(() => extractVerificationCode(selected.value?.content))
const verificationMessages = computed(() => getVerificationMessages(firstPageMessages.value))

function setAuthenticated(value) {
  authenticated.value = value
  if (!value) {
    overview.value = null
    messages.value = []
    firstPageMessages.value = []
    page.value = 1
    total.value = 0
    unread.value = 0
    selected.value = null
    messageDialogOpen.value = false
  }
  try {
    if (value) window.localStorage.setItem(AUTH_HINT_KEY, '1')
    else {
      window.localStorage.removeItem(AUTH_HINT_KEY)
      window.localStorage.removeItem(DATA_CACHE_KEY)
    }
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
    overview.value = null
  }
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

async function loadOverview() {
  overviewLoading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/overview', { cache: 'no-store' })
    const data = await readJson(response)
    if (!authenticated.value) return
    overview.value = data
    writeDataCache()
  } catch (cause) {
    if (authenticated.value) error.value = cause.message
  } finally {
    overviewLoading.value = false
  }
}

async function loadMessages(targetPage = page.value) {
  const requestId = ++inboxRequestId
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/sms?page=${targetPage}&_=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    })
    const data = await readJson(response)
    if (!authenticated.value || requestId !== inboxRequestId) return

    messages.value = data.messages
    if (data.page === 1) firstPageMessages.value = data.messages
    page.value = data.page
    total.value = data.total
    unread.value = data.unread
    if (data.pageSize) pageSize.value = data.pageSize
    selectedIds.value = []
    writeDataCache()
  } catch (cause) {
    if (authenticated.value && requestId === inboxRequestId) error.value = cause.message
  } finally {
    if (requestId === inboxRequestId) loading.value = false
  }
}

async function loadActivePage() {
  if (activePage.value === 'overview') {
    await Promise.allSettled([
      loadOverview(),
      loadMessages(1),
    ])
    return
  }
  if (!actionLoading.value) await loadMessages(1)
}

function navigate(pageName) {
  if (!['overview', 'sms'].includes(pageName) || pageName === activePage.value) return
  activePage.value = pageName
  error.value = ''
  leaveSelectionMode()
  window.history.replaceState(null, '', `#${pageName}`)
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  loadActivePage()
}

function handleNavigationChange(event) {
  navigate(event.target.value)
}

function updateNavigationMode(event) {
  compactNavigation.value = event.matches
}

function retryActivePage() {
  loadActivePage()
}

function refreshOnReturn() {
  if (document.visibilityState !== 'visible' || !authenticated.value || authChecking.value || authLoading.value) return
  loadActivePage()
}

function handlePageShow(event) {
  if (event.persisted) refreshOnReturn()
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' })
    const data = await readJson(response)
    setAuthenticated(data.authenticated)
    if (authenticated.value) await loadActivePage()
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
    await loadActivePage()
  } catch (cause) {
    authError.value = cause.message
  } finally {
    authLoading.value = false
  }
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
    writeDataCache()
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

async function copyVerificationCode(code = verificationCode.value) {
  if (!code) return

  try {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(code)
      } catch {
        if (!copyTextFallback(code)) throw new Error('Clipboard is unavailable')
      }
    } else if (!copyTextFallback(code)) {
      throw new Error('Clipboard is unavailable')
    }
    showFeedback('验证码已复制')
    closeMessageDialog()
    return true
  } catch {
    showFeedback('复制失败，请手动复制验证码')
    return false
  }
}

async function copyUnreadVerification(message) {
  if (globalLoading.value) return
  actionLoading.value = true
  copyingVerificationId.value = message.id
  error.value = ''
  try {
    if (!await copyVerificationCode(message.code)) return
    await postAction(`/api/sms/${message.id}/read`)
    if (!authenticated.value) return
    const matchingMessages = new Set([
      ...firstPageMessages.value,
      ...messages.value,
      ...(selected.value ? [selected.value] : []),
    ].filter((item) => item.id === message.id))
    const wasUnread = [...matchingMessages].some((item) => !item.read)
    matchingMessages.forEach((item) => { item.read = true })
    if (wasUnread) unread.value = Math.max(0, unread.value - 1)
    writeDataCache()
  } catch (cause) {
    if (authenticated.value) error.value = `验证码已复制，标记已读失败：${cause.message}`
  } finally {
    copyingVerificationId.value = null
    actionLoading.value = false
  }
}

async function markAllRead() {
  actionLoading.value = true
  error.value = ''
  try {
    await postAction('/api/sms/read-all')
    messages.value.forEach((message) => { message.read = true })
    unread.value = 0
    writeDataCache()
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
    unread.value = Math.max(0, unread.value - messages.value.filter((message) => ids.includes(message.id) && !message.read).length)
    messages.value = messages.value.filter((message) => !ids.includes(message.id))
    total.value = remainingTotal
    selectedIds.value = []
    writeDataCache()
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
    messages.value = []
    total.value = 0
    unread.value = 0
    page.value = 1
    selectedIds.value = []
    writeDataCache()
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

onMounted(() => {
  navigationMedia.addEventListener('change', updateNavigationMode)
  document.addEventListener('visibilitychange', refreshOnReturn)
  window.addEventListener('pageshow', handlePageShow)
  checkSession()
})

onBeforeUnmount(() => {
  navigationMedia.removeEventListener('change', updateNavigationMode)
  document.removeEventListener('visibilitychange', refreshOnReturn)
  window.removeEventListener('pageshow', handlePageShow)
})
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

  <template v-else>
    <mdui-top-app-bar variant="center-aligned" class="app-header" role="banner">
      <span class="app-header-spacer" aria-hidden="true"></span>
      <mdui-top-app-bar-title><h1 class="app-header-title">{{ pageTitle }}</h1></mdui-top-app-bar-title>
      <IconTooltipButton content="刷新" placement="bottom-end" aria-label="刷新" :loading="overviewLoading || loading" :disabled="globalLoading" @click="retryActivePage">
        <mdui-icon-refresh class="action-icon" aria-hidden="true"></mdui-icon-refresh>
      </IconTooltipButton>
    </mdui-top-app-bar>

    <mdui-navigation-rail
      v-if="!compactNavigation"
      :value="activePage"
      alignment="start"
      divider
      aria-label="主导航"
      @change="handleNavigationChange"
    >
      <mdui-navigation-rail-item value="overview">
        概览
        <mdui-icon-dashboard--outlined slot="icon" class="action-icon" aria-hidden="true"></mdui-icon-dashboard--outlined>
        <mdui-icon-dashboard slot="active-icon" class="action-icon" aria-hidden="true"></mdui-icon-dashboard>
      </mdui-navigation-rail-item>
      <mdui-navigation-rail-item value="sms">
        短信
        <mdui-icon-sms--outlined slot="icon" class="action-icon" aria-hidden="true"></mdui-icon-sms--outlined>
        <mdui-icon-sms slot="active-icon" class="action-icon" aria-hidden="true"></mdui-icon-sms>
        <mdui-badge v-if="unread" slot="badge">{{ unread > 99 ? '99+' : unread }}</mdui-badge>
      </mdui-navigation-rail-item>
    </mdui-navigation-rail>

    <main class="shell" :class="`page-${activePage}`">
      <mdui-card v-if="error" variant="filled" class="notice error-notice">
      <div>
        <strong>操作遇到问题</strong>
        <span>{{ error }}</span>
      </div>
      <IconTooltipButton content="重试" placement="left" class="danger-action" aria-label="重试" @click="retryActivePage">
        <mdui-icon-refresh class="action-icon" aria-hidden="true"></mdui-icon-refresh>
      </IconTooltipButton>
      </mdui-card>

      <template v-if="activePage === 'overview'">
        <OverviewPage :data="overview">
          <template #after-network>
        <mdui-card v-if="verificationMessages.length" variant="outlined" class="category-card verification-card">
          <div class="category-heading"><h2>验证码</h2></div>
          <div v-for="message in verificationMessages" :key="message.id" class="verification-row">
            <div class="verification-details">
              <span class="verification-name">{{ message.name }}</span>
              <strong class="verification-value">{{ message.code }}</strong>
            </div>
            <IconTooltipButton content="复制验证码" variant="tonal" :aria-label="`复制${message.name}的验证码`" :disabled="globalLoading" :loading="copyingVerificationId === message.id" @click="copyUnreadVerification(message)">
              <mdui-icon-content-copy class="action-icon" aria-hidden="true"></mdui-icon-content-copy>
            </IconTooltipButton>
          </div>
        </mdui-card>
          </template>
        </OverviewPage>
      </template>

      <template v-else>
    <section class="inbox-toolbar" aria-label="短信工具区">
      <div class="toolbar-primary-actions">
        <IconTooltipButton
          :content="selectionMode ? '退出选择' : '选择短信'"
          variant="tonal"
          :aria-label="selectionMode ? '退出选择' : '选择短信'"
          :disabled="!selectionMode && messages.length === 0"
          @click="selectionMode ? leaveSelectionMode() : enterSelectionMode()"
        >
          <mdui-icon-close v-if="selectionMode" class="action-icon" aria-hidden="true"></mdui-icon-close>
          <mdui-icon-checklist v-else class="action-icon" aria-hidden="true"></mdui-icon-checklist>
        </IconTooltipButton>
        <span class="toolbar-unread">未读 {{ unread }} 条</span>
      </div>

      <div class="toolbar-actions">
        <template v-if="selectionMode">
          <span class="selection-count">已选 {{ selectedIds.length }} 条</span>
          <IconTooltipButton content="删除所选" placement="top-end" class="danger-action" variant="outlined" aria-label="删除所选" :disabled="actionLoading || selectedIds.length === 0" @click="deleteMessages(selectedIds)">
            <mdui-icon-delete class="action-icon" aria-hidden="true"></mdui-icon-delete>
          </IconTooltipButton>
        </template>

        <template v-else>
          <IconTooltipButton content="全部标记为已读" variant="tonal" aria-label="全部标记为已读" :disabled="actionLoading || unread === 0" @click="markAllRead">
            <mdui-icon-done-all class="action-icon" aria-hidden="true"></mdui-icon-done-all>
          </IconTooltipButton>
          <IconTooltipButton content="清空收件箱" placement="top-end" class="danger-action" variant="outlined" aria-label="清空收件箱" :disabled="actionLoading || total === 0" @click="clearInbox">
            <mdui-icon-delete-sweep class="action-icon" aria-hidden="true"></mdui-icon-delete-sweep>
          </IconTooltipButton>
        </template>
      </div>
    </section>

    <mdui-card variant="outlined" class="inbox" :class="{ muted: loading || actionLoading, 'selection-mode': selectionMode }">
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
        <mdui-icon-inbox class="empty-icon" aria-hidden="true"></mdui-icon-inbox>
        <p>收件箱暂无短信</p>
      </div>
    </mdui-card>

    <footer class="pagination">
      <span>共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
      <div>
        <IconTooltipButton content="上一页" variant="outlined" aria-label="上一页" :disabled="loading || page <= 1" @click="changePage(-1)">
          <mdui-icon-arrow-back class="action-icon" aria-hidden="true"></mdui-icon-arrow-back>
        </IconTooltipButton>
        <IconTooltipButton content="下一页" placement="top-end" variant="filled" aria-label="下一页" :disabled="loading || page >= totalPages" @click="changePage(1)">
          <mdui-icon-arrow-forward class="action-icon" aria-hidden="true"></mdui-icon-arrow-forward>
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
        <mdui-button v-if="verificationCode" slot="action" variant="text" @click="copyVerificationCode()">
          复制验证码
        </mdui-button>
        <mdui-button slot="action" variant="text" @click="closeMessageDialog">关闭</mdui-button>
      </template>
    </mdui-dialog>
      </template>
    </main>

    <mdui-navigation-bar
      v-if="compactNavigation"
      :value="activePage"
      label-visibility="labeled"
      aria-label="主导航"
      @change="handleNavigationChange"
    >
      <mdui-navigation-bar-item value="overview">
        概览
        <mdui-icon-dashboard--outlined slot="icon" class="action-icon" aria-hidden="true"></mdui-icon-dashboard--outlined>
        <mdui-icon-dashboard slot="active-icon" class="action-icon" aria-hidden="true"></mdui-icon-dashboard>
      </mdui-navigation-bar-item>
      <mdui-navigation-bar-item value="sms">
        短信
        <mdui-icon-sms--outlined slot="icon" class="action-icon" aria-hidden="true"></mdui-icon-sms--outlined>
        <mdui-icon-sms slot="active-icon" class="action-icon" aria-hidden="true"></mdui-icon-sms>
        <mdui-badge v-if="unread" slot="badge">{{ unread > 99 ? '99+' : unread }}</mdui-badge>
      </mdui-navigation-bar-item>
    </mdui-navigation-bar>
  </template>
</template>
