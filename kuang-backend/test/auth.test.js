import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkCode, issueToken, verifyToken, gateEnabled, requireAccess } from '../src/services/auth.js';

beforeEach(() => {
  delete process.env.ACCESS_CODE;
  delete process.env.AUTH_SECRET;
});

test('the gate is off until ACCESS_CODE is set', () => {
  assert.equal(gateEnabled(), false);
  assert.equal(checkCode('anything'), true, 'no code configured means nothing is rejected');
  process.env.ACCESS_CODE = 'letmein';
  assert.equal(gateEnabled(), true);
});

test('only the configured code is accepted', () => {
  process.env.ACCESS_CODE = 'letmein';
  assert.equal(checkCode('letmein'), true);
  assert.equal(checkCode('  letmein  '), true, 'surrounding whitespace is forgiven');
  assert.equal(checkCode('letmeIn'), false);
  assert.equal(checkCode('letmein2'), false);
  assert.equal(checkCode(''), false);
  assert.equal(checkCode(null), false);
});

test('a freshly issued token verifies', () => {
  process.env.ACCESS_CODE = 'letmein';
  const { token, expiresAt } = issueToken();
  assert.equal(verifyToken(token).ok, true);
  assert.ok(new Date(expiresAt) > new Date());
});

test('tampered and malformed tokens are rejected', () => {
  process.env.ACCESS_CODE = 'letmein';
  const { token } = issueToken();
  const [body, sig] = token.split('.');
  assert.equal(verifyToken(`${body}.${sig.slice(0, -2)}xx`).reason, 'invalid');
  assert.equal(verifyToken(`${Buffer.from('{"exp":99999999999999}').toString('base64url')}.${sig}`).reason, 'invalid');
  assert.equal(verifyToken('nonsense').reason, 'malformed');
  assert.equal(verifyToken('').reason, 'missing');
});

test('an expired token is rejected', () => {
  process.env.ACCESS_CODE = 'letmein';
  const { token } = issueToken({ ttlDays: -1 });
  assert.equal(verifyToken(token).reason, 'expired');
});

test('rotating the code invalidates tokens signed with the old one', () => {
  process.env.ACCESS_CODE = 'letmein';
  const { token } = issueToken();
  process.env.ACCESS_CODE = 'newcode';
  assert.equal(verifyToken(token).ok, false);
});

test('middleware lets health and the gate through but stops the data routes', () => {
  process.env.ACCESS_CODE = 'letmein';
  const run = (path, headers = {}, method = 'GET') => {
    const req = { path, method, get: (h) => headers[h.toLowerCase()], query: {} };
    let status = null; let body = null; let passed = false;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    requireAccess(req, res, () => { passed = true; });
    return { passed, status, body };
  };
  assert.equal(run('/health').passed, true);
  assert.equal(run('/').passed, true);
  assert.equal(run('/auth/status').passed, true);
  assert.equal(run('/league/123').passed, false);
  assert.equal(run('/league/123').status, 401);
  assert.equal(run('/league/123').body.code, 'ACCESS_REQUIRED');
  assert.equal(run('/chat', {}, 'OPTIONS').passed, true, 'CORS preflight must not be blocked');

  const { token } = issueToken();
  assert.equal(run('/league/123', { authorization: `Bearer ${token}` }).passed, true);
});

test('with the gate off every route is open', () => {
  const req = { path: '/league/123', method: 'GET', get: () => undefined, query: {} };
  let passed = false;
  requireAccess(req, {}, () => { passed = true; });
  assert.equal(passed, true);
});
