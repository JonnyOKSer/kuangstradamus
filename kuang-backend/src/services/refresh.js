// Scheduled data refresh.
//
// Start/sit advice is only as good as the data behind it: injury tags move on
// Friday, snap counts land on Tuesday, and a forecast four days out is not the
// forecast on Sunday morning. TTLs alone would let a warm cache serve stale
// context to whoever asks first, so the service also refreshes on a clock —
// every six hours, i.e. four times a day against the stated "daily at a
// minimum" requirement — and records when it last ran so the API can say so.

import { clearCacheMatching } from './sleeper/client.js';
import { invalidatePlayers, loadPlayers } from './sleeper/players.js';
import { getState, buildRosTable, DEFAULT_LAST_WEEK } from './sleeper/projections.js';
import { clearWeekContext } from './nfl/context.js';
import { clearLeagueContexts } from './analysis.js';

export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const state = {
  lastRefreshAt: null,
  lastResult: null,
  nextRefreshAt: null,
  running: false,
  timer: null,
};

export function refreshStatus() {
  return {
    lastRefreshAt: state.lastRefreshAt ? new Date(state.lastRefreshAt).toISOString() : null,
    nextRefreshAt: state.nextRefreshAt ? new Date(state.nextRefreshAt).toISOString() : null,
    intervalHours: REFRESH_INTERVAL_MS / 3_600_000,
    lastResult: state.lastResult,
    running: state.running,
  };
}

/**
 * Drop the volatile caches and re-warm the expensive ones.
 * @param {boolean} includePlayers also re-pull the 14 MB player dump
 */
export async function refreshAll({ includePlayers = true } = {}) {
  if (state.running) return state.lastResult;
  state.running = true;
  const started = Date.now();
  const dropped = {};
  try {
    for (const needle of ['/projections/nfl', '/stats/nfl', '/state/nfl', '/schedule/nfl', '/league/', '/user/', 'open-meteo']) {
      dropped[needle] = clearCacheMatching(needle);
    }
    clearWeekContext();
    dropped.leagueContexts = clearLeagueContexts();
    if (includePlayers) invalidatePlayers();

    const [{ list }, nflState] = await Promise.all([loadPlayers(), getState()]);
    let rosPlayers = 0;
    if (nflState.season_type === 'regular' && nflState.week <= DEFAULT_LAST_WEEK) {
      const ros = await buildRosTable({ season: nflState.season, fromWeek: nflState.week });
      rosPlayers = ros.table.size;
    }

    state.lastResult = {
      ok: true,
      durationMs: Date.now() - started,
      players: list.length,
      rosPlayers,
      season: nflState.season,
      week: nflState.week,
      dropped,
    };
  } catch (err) {
    state.lastResult = { ok: false, durationMs: Date.now() - started, error: err.message };
  } finally {
    state.lastRefreshAt = Date.now();
    state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
    state.running = false;
  }
  return state.lastResult;
}

/** Warm now, then keep refreshing on an interval for the life of the process. */
export function startRefreshLoop() {
  if (state.timer) return;
  refreshAll().then((r) => {
    console.log(r?.ok
      ? `🔄 Data refresh: ${r.players} players, ${r.rosPlayers} projected, ${r.season} week ${r.week} (${r.durationMs} ms)`
      : `⚠️ Data refresh failed: ${r?.error}`);
  });
  state.timer = setInterval(() => {
    refreshAll().then((r) => console.log(r?.ok ? `🔄 Scheduled refresh ok (${r.durationMs} ms)` : `⚠️ Scheduled refresh failed: ${r?.error}`));
  }, REFRESH_INTERVAL_MS);
  state.timer.unref?.();
  state.nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
}

export function stopRefreshLoop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
