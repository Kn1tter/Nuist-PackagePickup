const TOKEN_KEY = 'nuist_pickup_token'
const USER_KEY = 'nuist_pickup_user'

/** 生产环境填后端地址，如 https://xxx.vercel.app；本地留空走 Vite 代理 */
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export const apiBase = API_BASE

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

/** 操作前确认登录；未登录则跳转登录页并带上回跳地址 */
export function requireLogin(router, redirect) {
  if (isLoggedIn()) return true
  const path =
    redirect ||
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/')
  router.push({ name: 'login', query: { redirect: path } })
  return false
}

export async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body != null
          ? JSON.stringify(options.body)
          : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  return data
}
