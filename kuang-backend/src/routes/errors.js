const USER_ERROR = /(format|Provide|Describe|needs at least|must each contain)/i;

export function sendError(res, err, scope = '') {
  const status = err.status || (USER_ERROR.test(err.message || '') ? 400 : 500);
  if (status >= 500) console.error(`💥 ${scope} error:`, err);
  else console.warn(`⚠️ ${scope} ${status}:`, err.message);
  res.status(status).json({ error: err.message || 'Internal server error' });
}
