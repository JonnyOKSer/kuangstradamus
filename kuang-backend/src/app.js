import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import tradeRoutes from './routes/trade.js';
import chatRoutes from './routes/chat.js';
import leagueRoutes from './routes/league.js';
import { startRefreshLoop } from './services/refresh.js';

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_ORIGINS = [
  'https://kuangstradamus.xyz',
  'https://www.kuangstradamus.xyz',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const corsOptions = {
  origin(origin, cb) {
    // no Origin header (curl, server-to-server) or an allowed browser origin
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

app.use('/api', tradeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/league', leagueRoutes);

app.get('/', (_req, res) => {
  res.send('👋 Kuangstradamus API is live. See /api for endpoints.');
});

app.get('/api', (_req, res) => {
  res.json({
    endpoints: {
      'POST /api/chat': '{ message, lang?, scoring?, leagueId? } → verdict + proverb',
      'POST /api/trade': '{ message } | { teamA, teamB } (+ scoring?, leagueId?) → full analysis',
      'GET /api/players/search?q=': 'player autocomplete',
      'GET /api/state': 'current NFL season/week',
      'GET /api/league/user/:username?season=': "a Sleeper user's leagues",
      'GET /api/league/:leagueId': 'standings, playoff odds, positional strength',
      'GET /api/league/:leagueId/season': 'lineup efficiency, all-play luck, strength of schedule, playoff odds',
      'GET /api/league/:leagueId/team/:rosterId?week=': 'valued roster, lineup suggestion, trade + waiver targets',
      'GET /api/league/:leagueId/team/:rosterId/lineup?week=': 'optimal lineup vs current',
      'GET /api/health': 'liveness + cache stats + last data refresh',
      'POST /api/refresh': 'force a data refresh (x-refresh-token when REFRESH_TOKEN is set)',
    },
    data: 'Sleeper public API + Open-Meteo forecasts (both free). No paid data providers.',
  });
});

// JSON parse errors and CORS rejections
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (/not allowed by CORS/.test(err?.message || '')) return res.status(403).json({ error: err.message });
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Kuangstradamus API live on port ${PORT}`);
    // Warms every cache now and keeps them fresh on a 6-hour clock.
    startRefreshLoop();
  });
}

export default app;
