import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOverview, parseMemory } from './overview.js'

test('parseMemory converts the CPE memory tuple to byte values', () => {
  assert.deepEqual(parseMemory('200016 kB, 38636 kB, 53776 kB, 96288 kB'), {
    totalBytes: 204816384,
    usedBytes: 110186496,
    availableBytes: 39563264,
    cacheBytes: 55066624,
    usedPercent: 53.8,
  })
})

test('normalizeOverview exposes only normalized dashboard fields', () => {
  const overview = normalizeOverview({
    device: { uptime: '1736272', memory: '200016 kB, 38636 kB, 53776 kB, 96288 kB', module_imei: 'private' },
    network: { network_operator: 'China Telecom', network_type_str: 'NR5G', signal_lvl: '4', sim_status: '1' },
    traffic: { limitSwitch: '1', limitSize: '155', startDate: '1', mon_download_flow: '15011.33' },
  })

  assert.deepEqual(overview, {
    uptimeSeconds: 1736272,
    operator: 'China Telecom',
    networkType: 'NR5G',
    signal: { level: 4, connected: true, rsrp: null, rsrq: null, rssi: null, sinr: null },
    memory: {
      totalBytes: 204816384,
      usedBytes: 110186496,
      availableBytes: 39563264,
      cacheBytes: 55066624,
      usedPercent: 53.8,
    },
    traffic: {
      enabled: true,
      usedGigabytes: 14.66,
      limitGigabytes: 155,
      remainingGigabytes: 140.34,
      usedPercent: 9.5,
      billingStartDay: 1,
    },
  })
  assert.equal('moduleImei' in overview, false)
})

test('normalizeOverview handles disabled or missing traffic limits', () => {
  const overview = normalizeOverview({ traffic: { limitSwitch: '0', mon_download_flow: '' } })
  assert.deepEqual(overview.traffic, {
    enabled: false,
    usedGigabytes: null,
    limitGigabytes: null,
    remainingGigabytes: null,
    usedPercent: null,
    billingStartDay: null,
  })
})
