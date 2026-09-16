import express from 'express';
import { analyzeTrade } from '../utils/tradeLogic.js';
import { searchPlayers } from '../services/sleeper/players.js';
import { getState } from '../services/sleeper/projections.js';
import { cacheStats } from '../services/sleeper/client.js';
import { sendError } from './errors.js';

const router = express.Router();

// POST /api/trade  { message } | { teamA: [...], teamB: [...] }  + optional scoring / leagueId / season
router.post('/trade', async (req, res) => {
  try {
    const { scoring, leagueId, season } = req.body || {};
    const result = await analyzeTrade(req.body, { scoring, leagueId, season });
    res.json(result);
  } catch (err) {
    sendError(res, err, 'trade');
  }
});

// GET /api/players/search?q=mccaf
router.get('/players/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    if (q.length < 2) return res.json([]);
    const players = await searchPlayers(q, Number(req.query.limit) || 8);
    res.json(players.map((p) => ({ id: p.id, name: p.name, position: p.position, team: p.team, injuryStatus: p.injuryStatus })));
  } catch (err) {
    sendError(res, err, 'players/search');
  }
});

router.get('/state', async (_req, res) => {
  try {
    res.json(await getState());
  } catch (err) {
    sendError(res, err, 'state');
  }
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()), cache: cacheStats() });
});

export default router;
