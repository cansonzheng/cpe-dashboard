<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, default: null },
  loading: Boolean,
})

const signalLevel = computed(() => props.data?.signal?.level ?? 0)
const signalLabel = computed(() => ['无信号', '较弱', '一般', '良好', '强', '极强'][signalLevel.value] || '未知')

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
    <mdui-linear-progress v-if="loading" class="overview-loading"></mdui-linear-progress>

    <div class="overview-grid">
      <mdui-card variant="outlined" class="category-card">
        <div class="category-heading">
          <div class="category-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 11c1.66 0 2.99-1.34 2.99-3S13.66 5 12 5 9 6.34 9 8s1.34 3 3 3zm0-8C6.48 3 2 7.48 2 13c0 2.76 1.12 5.26 2.93 7.07l1.42-1.42A7.95 7.95 0 0 1 4 13a8 8 0 0 1 16 0c0 2.21-.9 4.21-2.35 5.65l1.42 1.42A9.97 9.97 0 0 0 22 13c0-5.52-4.48-10-10-10zm0 10c-2.76 0-5 2.24-5 5 0 1.38.56 2.63 1.46 3.54l1.42-1.42A2.99 2.99 0 0 1 9 18a3 3 0 0 1 6 0c0 .83-.34 1.58-.88 2.12l1.42 1.42A4.98 4.98 0 0 0 17 18c0-2.76-2.24-5-5-5z"/></svg>
          </div>
          <div>
            <h2>移动网络</h2>
            <p>{{ data?.networkType || '网络状态' }}</p>
          </div>
        </div>

        <div class="category-content network-content">
          <div class="info-item">
            <span class="metric-label">运营商</span>
            <strong>{{ data?.operator || '—' }}</strong>
          </div>
          <div class="info-item signal-info">
            <div>
              <span class="metric-label">信号强度</span>
              <strong>{{ signalLabel }}</strong>
              <small>{{ data?.signal?.connected ? `${signalLevel} / 5 格` : '移动网络未连接' }}</small>
            </div>
            <div class="signal-bars" :aria-label="`信号强度 ${signalLevel} 格`">
              <span v-for="bar in 5" :key="bar" :class="{ active: bar <= signalLevel }"></span>
            </div>
          </div>
        </div>
      </mdui-card>

      <mdui-card variant="outlined" class="category-card">
        <div class="category-heading">
          <div class="category-icon secondary" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-1 13h-4v-4h4v4zm3.03-4.03 1.42-1.42A8.96 8.96 0 0 0 13 5.07V3h-2v2.07A9 9 0 1 0 20.93 15H23v-2h-2.07a8.97 8.97 0 0 0-3.9-3.03zM12 21a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>
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
    </div>

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
          <span>已使用</span>
          <strong>{{ formatGigabytes(data?.traffic?.usedGigabytes) }}</strong>
        </div>
        <div>
          <span>月度限额</span>
          <strong>{{ data?.traffic?.enabled ? formatGigabytes(data.traffic.limitGigabytes) : '未设置' }}</strong>
        </div>
      </div>
    </mdui-card>
  </section>
</template>
