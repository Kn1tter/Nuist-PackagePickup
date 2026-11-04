/** 全站时间展示统一按北京时间，避免浏览器/服务器时区不一致 */

const SHANGHAI = 'Asia/Shanghai'

export function parseTime(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  // Postgres 无时区字符串（如 2026-10-20 11:30:00）按北京时间理解
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const iso = s.includes('T') ? s : s.replace(' ', 'T')
    const d = new Date(`${iso}+08:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(v, opts = {}) {
  const d = parseTime(v)
  if (!d) return v ? String(v).slice(0, 16) : ''
  return d.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: SHANGHAI,
    ...opts,
  })
}

/** 订单卡片用：MM-DD HH:mm */
export function formatTimeShort(v) {
  const d = parseTime(v)
  if (!d) return v ? String(v).slice(0, 16) : ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || '00'
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
