// Per-week, league-independent context: who each NFL team plays, where, and
// what the weather is expected to do there. Cached on its own because it is
// the same for every fantasy league asking about the same week.

import { gamesByTeam } from './schedule.js';
import { gameWeather } from '../weather/forecast.js';

const TTL = 30 * 60 * 1000;
const cache = new Map(); // `${season}:${week}` -> { expires, promise }

async function build(season, week) {
  const games = await gamesByTeam(season, week);

  // One forecast per venue, shared by both teams in the game.
  const venues = new Map();
  for (const g of games.values()) {
    if (!g.stadium || g.sheltered) continue;
    const key = `${g.venueTeam}:${g.date}`;
    if (!venues.has(key)) venues.set(key, g);
  }
  const forecasts = await Promise.all(
    [...venues.entries()].map(async ([key, g]) => [key, await gameWeather(g).catch(() => null)]),
  );
  const byVenue = new Map(forecasts);

  const weather = new Map();
  for (const [team, g] of games) {
    weather.set(team, g.sheltered ? null : byVenue.get(`${g.venueTeam}:${g.date}`) || null);
  }
  return { season, week, games, weather, builtAt: Date.now() };
}

export async function weekContext(season, week) {
  const key = `${season}:${week}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = build(season, week).catch((err) => { cache.delete(key); throw err; });
  cache.set(key, { expires: Date.now() + TTL, promise });
  return promise;
}

export function clearWeekContext() {
  cache.clear();
}
