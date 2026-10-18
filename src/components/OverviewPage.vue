<script setup>
import '@mdui/icons/cell-tower.js'
import '@mdui/icons/dns--outlined.js'
import '@mdui/icons/expand-more.js'
import { computed, ref } from 'vue'

const props = defineProps({
  data: { type: Object, default: null },
})

const operatorNames = new Map([
  ['china telecom', '中国电信'],
  ['china mobile', '中国移动'],
  ['china unicom', '中国联通'],
  ['china broadnet', '中国广电'],
  ['china broadcasting network', '中国广电'],
])

const networkDescription = computed(() => {
  const operator = props.data?.operator?.trim() || ''
  const name = operatorNames.get(operator.toLowerCase()) || operator
  return [name, props.data?.networkType].filter(Boolean).join(' ') || '网络状态'
})

const signalLevel = computed(() => props.data?.signal?.level ?? 0)
const networkExpanded = ref(false)

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分钟`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

function formatGigabytes(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB`
}
</script>

<template>
  <section class="overview" aria-label="设备概览">

      <mdui-card variant="outlined" class="category-card network-card">
        <mdui-collapse>
        <mdui-collapse-item @open="networkExpanded = true" @close="networkExpanded = false">
        <button slot="header" type="button" class="category-heading network-header" :aria-expanded="networkExpanded" aria-controls="network-details">
          <div class="category-icon" aria-hidden="true">
            <mdui-icon-cell-tower class="action-icon" aria-hidden="true"></mdui-icon-cell-tower>
          </div>
          <div>
            <h2>移动网络</h2>
            <p>{{ networkDescription }}</p>
          </div>
          <div class="signal-bars" role="img" :aria-label="`信号强度 ${signalLevel} 格`">
            <span v-for="bar in 5" :key="bar" :class="{ active: bar <= signalLevel }"></span>
          </div>
          <mdui-icon-expand-more class="action-icon network-chevron" :class="{ expanded: networkExpanded }" aria-hidden="true"></mdui-icon-expand-more>
        </button>

        <div id="network-details" class="category-content network-content" role="region" aria-label="移动网络详情">
          <div class="info-item">
            <span class="metric-label">频段</span>
            <strong>{{ data?.signal?.band || '—' }}</strong>
          </div>
          <div class="info-item">
            <span class="metric-label">频点</span>
            <strong>{{ data?.signal?.channel ?? '—' }}</strong>
          </div>
          <div class="info-item">
            <span class="metric-label">PCI</span>
            <strong>{{ data?.signal?.pci ?? '—' }}</strong>
          </div>
        </div>
        </mdui-collapse-item>
        </mdui-collapse>
      </mdui-card>

      <slot name="after-network"></slot>

    <mdui-card variant="outlined" class="traffic-card">
      <div class="traffic-heading">
        <div>
          <span class="metric-label">剩余流量</span>
          <strong class="traffic-primary-value">
            {{ data?.traffic?.enabled ? formatGigabytes(data.traffic.remainingGigabytes) : '未设置限额' }}
          </strong>
          <small v-if="data?.traffic?.enabled">每月 {{ data.traffic.billingStartDay || 1 }} 日重新统计</small>
          <small v-else>本月已使用 {{ formatGigabytes(data?.traffic?.usedGigabytes) }}</small>
        </div>
        <span class="traffic-status" :class="{ enabled: data?.traffic?.enabled }">
          {{ data?.traffic?.enabled ? '限额已启用' : '仅统计' }}
        </span>
      </div>

      <mdui-linear-progress
        v-if="data?.traffic?.enabled && data.traffic.usedPercent != null"
        class="traffic-progress"
        :value="data.traffic.usedPercent"
        max="100"
        aria-label="本月流量使用率"
      ></mdui-linear-progress>

      <div class="traffic-details">
        <div>
          <span>已使用 / 月度限额</span>
          <strong>{{ formatGigabytes(data?.traffic?.usedGigabytes) }} / {{ data?.traffic?.enabled ? formatGigabytes(data.traffic.limitGigabytes) : '未设置' }}</strong>
        </div>
      </div>
    </mdui-card>

      <mdui-card variant="outlined" class="category-card device-card">
        <div class="category-heading">
          <div class="category-icon secondary" aria-hidden="true">
            <mdui-icon-dns--outlined class="action-icon" aria-hidden="true"></mdui-icon-dns--outlined>
          </div>
          <div>
            <h2>设备状态</h2>
            <p>运行与资源使用情况</p>
          </div>
        </div>

        <div class="category-content device-content">
          <div class="info-item">
            <span class="metric-label">运行时间</span>
            <strong>{{ formatDuration(data?.uptimeSeconds) }}</strong>
            <small>自设备上次启动</small>
          </div>
          <div class="info-item memory-info">
            <span class="metric-label">内存状态</span>
            <strong>{{ data?.memory?.usedPercent ?? '—' }}<template v-if="data?.memory?.usedPercent != null">%</template></strong>
            <small>已用 {{ formatBytes(data?.memory?.usedBytes) }} / 共 {{ formatBytes(data?.memory?.totalBytes) }}</small>
            <mdui-linear-progress
              v-if="data?.memory?.usedPercent != null"
              :value="data.memory.usedPercent"
              max="100"
              aria-label="内存使用率"
            ></mdui-linear-progress>
          </div>
        </div>
      </mdui-card>
  </section>
</template>
