import express from 'express';
import { getUser, getUserLeagues, scoringFormatOf } from '../services/sleeper/league.js';
import { getState } from '../services/sleeper/projections.js';
import { leagueSummary, seasonReport, teamReport, lineupForTeam } from '../services/analysis.js';
import { sendError } from './errors.js';

const router = express.Router();

// GET /api/league/user/:username?season=2026  → the user's Sleeper leagues
router.get('/user/:username', async (req, res) => {
  try {
    const season = req.query.season || (await getState()).season;
    const user = await getUser(req.params.username);
    const leagues = await getUserLeagues(user.user_id, season);
    res.json({
      user: { userId: user.user_id, username: user.username, displayName: user.display_name, avatar: user.avatar },
      season,
      leagues: leagues.map((l) => ({
        id: l.league_id,
        name: l.name,
        season: l.season,
        status: l.status,
        totalRosters: l.total_rosters,
        scoringFormat: scoringFormatOf(l),
        rosterPositions: l.roster_positions,
        avatar: l.avatar,
      })),
    });
  } catch (err) {
    sendError(res, err, 'league/user');
  }
});

// GET /api/league/:leagueId  → settings, standings, playoff odds, positional strength
router.get('/:leagueId', async (req, res) => {
  try {
    res.json(await leagueSummary(req.params.leagueId));
  } catch (err) {
    sendError(res, err, 'league');
  }
});

// GET /api/league/:leagueId/season  → lineup efficiency, all-play luck, SOS, playoff odds
router.get('/:leagueId/season', async (req, res) => {
  try {
    res.json(await seasonReport(req.params.leagueId));
  } catch (err) {
    sendError(res, err, 'league/season');
  }
});

// GET /api/league/:leagueId/team/:rosterId?week=  → valued roster, lineup suggestion, trade + waiver targets
router.get('/:leagueId/team/:rosterId', async (req, res) => {
  try {
    res.json(await teamReport(req.params.leagueId, req.params.rosterId, { week: req.query.week }));
  } catch (err) {
    sendError(res, err, 'league/team');
  }
});

// GET /api/league/:leagueId/team/:rosterId/lineup?week=
router.get('/:leagueId/team/:rosterId/lineup', async (req, res) => {
  try {
    res.json(await lineupForTeam(req.params.leagueId, req.params.rosterId, req.query.week));
  } catch (err) {
    sendError(res, err, 'league/lineup');
  }
});

// POST /api/league/:leagueId/team/:rosterId/lineup/apply  → not supported on Sleeper (no official write API)
router.post('/:leagueId/team/:rosterId/lineup/apply', (_req, res) => {
  res.status(501).json({
    error: 'Automatic lineup changes are not supported for Sleeper. Its public API is read-only; apply the suggested moves in the Sleeper app.',
    plannedPlatforms: ['yahoo'],
  });
});

export default router;
