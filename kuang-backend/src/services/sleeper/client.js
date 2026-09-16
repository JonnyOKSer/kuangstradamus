// Minimal fetch wrapper for Sleeper's public APIs: TTL cache + in-flight
// de-duplication + retry on transient errors. Sleeper needs no auth; the only
// documented limit is "stay under 1000 calls per minute".

const cache = new Map();    // url -> { value, expires }
const inflight = new Map(); // url -> Promise

export const TTL = {
  players: 24 * 60 * 60 * 1000,   // the 14 MB player dump changes rarely
  projections: 60 * 60 * 1000,    // projections update a few times a day
  stats: 60 * 60 * 1000,
  state: 10 * 60 * 1000,
  league: 10 * 60 * 1000,
  trending: 60 * 60 * 1000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, init, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
      if (res.status === 429 || res.status >= 500) {
        const err = new Error(`HTTP ${res.status} from ${url}`);
        err.status = res.status;
        err.retryable = true;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${url}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const retryable = err.retryable || err.name === 'TimeoutError' || err.code === 'ECONNRESET';
      if (!retryable || i === attempts - 1) throw err;
      await sleep(300 * 2 ** i);
    }
  }
  throw lastErr;
}

/**
 * GET a JSON document. `ttl` (ms) > 0 caches the parsed body; concurrent
 * callers for the same URL share one request.
 */
export async function fetchJson(url, { ttl = 0, init } = {}) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (inflight.has(url)) return inflight.get(url);

  const p = (async () => {
    try {
      const res = await fetchWithRetry(url, init);
      const value = await res.json();
      if (ttl > 0) cache.set(url, { value, expires: Date.now() + ttl });
      return value;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

export function clearCache() {
  cache.clear();
}

export function cacheStats() {
  let live = 0;
  const now = Date.now();
  for (const { expires } of cache.values()) if (expires > now) live++;
  return { entries: cache.size, live, inflight: inflight.size };
}
