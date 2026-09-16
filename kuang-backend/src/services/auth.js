// Shared-code access gate.
//
// One code, held in the ACCESS_CODE environment variable, is exchanged once
// for an HMAC-signed bearer token that the browser keeps. Every API request
// then carries the token, and the backend — which is where the data actually
// lives — refuses anything without a valid one. That is the part a
// frontend-only gate cannot do: the Sleeper analysis is served by this
// process, so protecting it here is what actually limits access.
//
// The gate is off whenever ACCESS_CODE is unset, so the service keeps working
// until the variable is deliberately set in the environment.
//
// Tokens are signed with AUTH_SECRET when present, otherwise with the code
// itself — which means rotating the code also invalidates every token already
// issued. That is usually what you want from a shared code.

import crypto from 'node:crypto';

export const DEFAULT_TTL_DAYS = 30;

export const gateEnabled = () => !!process.env.ACCESS_CODE;

const signingKey = () => process.env.AUTH_SECRET || process.env.ACCESS_CODE || '';

const sha256 = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();

/** Constant-time compare that does not leak length. */
function sameSecret(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

const sign = (body) => crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');

export function checkCode(code) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  if (typeof code !== 'string' || !code) return false;
  return sameSecret(code.trim(), expected);
}

export function issueToken({ ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const now = Date.now();
  const payload = { iat: now, exp: now + ttlDays * 86_400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(payload.exp).toISOString() };
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, reason: 'malformed' };

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload?.exp || payload.exp < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

// Paths that stay reachable without a token: the API index, liveness, the
// gate itself, and the refresh hook (which carries its own token).
const OPEN_PATHS = new Set(['/', '/health', '/refresh']);

export function requireAccess(req, res, next) {
  if (!gateEnabled()) return next();
  if (req.method === 'OPTIONS') return next();
  if (OPEN_PATHS.has(req.path) || req.path.startsWith('/auth')) return next();

  const header = req.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim() || req.query.token;
  const result = verifyToken(token);
  if (!result.ok) {
    return res.status(401).json({
      error: result.reason === 'expired'
        ? 'Your access has expired. Enter the code again.'
        : 'This site is private. Enter the access code to continue.',
      code: 'ACCESS_REQUIRED',
      reason: result.reason,
    });
  }
  return next();
}
