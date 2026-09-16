export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://kuangstradamus-production.up.railway.app').replace(/\/$/, '')

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
  return data
}

export const fmt = (n, d = 1) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d))
