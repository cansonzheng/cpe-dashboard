function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value, digits = 1) {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function parseMemory(value) {
  const values = String(value || '')
    .split(',')
    .map((part) => toNumber(part.replace(/\s*kB\s*/i, '').trim()))

  if (values.length < 3 || values.slice(0, 3).some((item) => item === null)) {
    return { totalBytes: null, usedBytes: null, availableBytes: null, cacheBytes: null, usedPercent: null }
  }

  const [totalKb, availableKb, cacheKb] = values
  const usedKb = Math.max(0, totalKb - availableKb - cacheKb)
  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    availableBytes: availableKb * 1024,
    cacheBytes: cacheKb * 1024,
    usedPercent: totalKb > 0 ? round((usedKb / totalKb) * 100) : null,
  }
}

function normalizeOverview({ device = {}, network = {}, traffic = {} }) {
  const uptimeSeconds = toNumber(device.uptime)
  const signalLevel = toNumber(network.signal_lvl)
  const is5g = /5G|NR/i.test(network.network_type_str || '')
  const rawBand = is5g ? network.currentband_5g : network.currentband
  const band = typeof rawBand === 'string' || typeof rawBand === 'number' ? String(rawBand).trim() : ''
  const usedMegabytes = toNumber(traffic.mon_download_flow)
  const limitGigabytes = toNumber(traffic.limitSize)
  const usedGigabytes = usedMegabytes === null ? null : usedMegabytes / 1024
  const enabled = traffic.limitSwitch === '1'
  const remainingGigabytes = enabled && usedGigabytes !== null && limitGigabytes !== null
    ? Math.max(0, limitGigabytes - usedGigabytes)
    : null
  const usedPercent = enabled && usedGigabytes !== null && limitGigabytes > 0
    ? Math.min(100, round((usedGigabytes / limitGigabytes) * 100))
    : null

  return {
    uptimeSeconds,
    operator: network.network_operator || network.spn_network_operator || '',
    networkType: network.network_type_str || '',
    signal: {
      level: signalLevel === null ? null : Math.max(0, Math.min(5, signalLevel)),
      connected: network.sim_status === '1' && signalLevel > 0,
      band: band ? (/^\d+$/.test(band) ? `${is5g ? 'n' : 'B'}${band}` : band) : null,
      channel: toNumber(is5g ? network.FREQ_5G : network.FREQ),
      pci: toNumber(is5g ? network.PCI_5G : network.PCI),
      rsrp: toNumber(network.RSRP),
      rsrq: toNumber(network.RSRQ),
      rssi: toNumber(network.RSSI),
      sinr: toNumber(network.SINR),
    },
    memory: parseMemory(device.memory),
    traffic: {
      enabled,
      usedGigabytes: round(usedGigabytes, 2),
      limitGigabytes,
      remainingGigabytes: round(remainingGigabytes, 2),
      usedPercent,
      billingStartDay: toNumber(traffic.startDate),
    },
  }
}

export { normalizeOverview, parseMemory }
