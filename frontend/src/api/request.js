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

export function isGuest() {
  return !!getUser()?.is_guest
}

/** 已登录且非访客（可发帖、发单等） */
export function isMember() {
  return isLoggedIn() && !isGuest()
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

/** 写操作：需正式账号；访客跳转登录页提示注册 */
export function requireMember(router, redirect) {
  if (isMember()) return true
  const path =
    redirect ||
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/')
  if (isGuest()) {
    router.push({ name: 'login', query: { redirect: path, reason: 'guest' } })
    return false
  }
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

  let res
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body != null
            ? JSON.stringify(options.body)
            : undefined,
    })
  } catch {
    throw new Error('网络异常，请检查连接后重试')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error || `请求失败 (${res.status})`
    // 本地还留着失效 token 时会一直报「登录已过期」——清掉让用户重新登
    if (res.status === 401 && /登录|未登录/.test(msg)) {
      clearSession()
    }
    throw new Error(msg)
  }
  return data
}
