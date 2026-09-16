export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://kuangstradamus-production.up.railway.app').replace(/\/$/, '')

const TOKEN_KEY = 'kuang_access_token'
export const ACCESS_EVENT = 'kuang:access-required'

// localStorage throws in private-mode Safari and when cookies are blocked, so
// every access is guarded — a missing token just means "ask for the code".
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (token) => {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* session-only */ }
}
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* nothing to clear */ }
}

export class AccessError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AccessError'
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))

  if (res.status === 401 && data.code === 'ACCESS_REQUIRED') {
    clearToken()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCESS_EVENT))
    throw new AccessError(data.error || 'Access code required')
  }
  if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
  return data
}

/** Is the gate switched on at all? Unreachable backend counts as "unknown". */
export async function accessStatus() {
  const res = await fetch(`${API_BASE}/api/auth/status`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

/** Exchange the shared code for a token. Returns the API's error message as-is. */
export async function redeemCode(code) {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
  if (data.token) setToken(data.token)
  return data
}

export const fmt = (n, d = 1) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d))
