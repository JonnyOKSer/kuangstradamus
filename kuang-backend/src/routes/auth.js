import express from 'express';
import { checkCode, issueToken, gateEnabled, DEFAULT_TTL_DAYS } from '../services/auth.js';

const router = express.Router();

// Brute force is the only real attack on a short shared code, so attempts are
// throttled per client. In-memory is enough: a restart costs an attacker
// nothing they could not get by waiting out the window anyway.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map(); // ip -> { count, resetAt }

function tooMany(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count++;
  return rec.count > MAX_ATTEMPTS;
}

function clear(ip) {
  attempts.delete(ip);
}

// Let the frontend know whether it needs to ask for a code at all.
router.get('/status', (_req, res) => {
  res.json({ required: gateEnabled(), ttlDays: DEFAULT_TTL_DAYS });
});

router.post('/', (req, res) => {
  if (!gateEnabled()) return res.json({ required: false, ...issueToken() });

  const ip = req.ip || req.get('x-forwarded-for') || 'unknown';
  if (tooMany(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.', code: 'RATE_LIMITED' });
  }
  if (!checkCode(req.body?.code)) {
    return res.status(401).json({ error: 'That code is not right.', code: 'BAD_CODE' });
  }
  clear(ip);
  res.json({ required: true, ...issueToken() });
});

export default router;
