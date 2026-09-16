// Observed historical weather, for backtesting only.
//
// The forecast endpoint reaches about sixteen days; measuring how weather
// actually moved scoring needs what the weather actually did. Open-Meteo's
// archive answers that, and takes comma-separated coordinates so one request
// covers every stadium in play on a given date.

import { fetchJson, TTL } from '../sleeper/client.js';

const API = 'https://archive-api.open-meteo.com/v1/archive';
const KICKOFF_HOURS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const at = (arr, i) => (typeof arr?.[i] === 'number' ? arr[i] : 0);

function summarise(hourly) {
  const idx = (hourly.time || [])
    .map((t, i) => [Number(t.slice(11, 13)), i])
    .filter(([h]) => KICKOFF_HOURS.includes(h))
    .map(([, i]) => i);
  if (!idx.length) return null;
  const mid = idx[Math.floor(idx.length / 2)];
  return {
    tempF: Math.round(at(hourly.temperature_2m, mid)),
    windMph: Math.round(Math.max(...idx.map((i) => at(hourly.wind_speed_10m, i)))),
    gustMph: Math.round(Math.max(...idx.map((i) => at(hourly.wind_speed_10m, i)))),
    precipIn: Number(idx.reduce((s, i) => s + at(hourly.precipitation, i), 0).toFixed(2)),
    snowIn: Number(idx.reduce((s, i) => s + at(hourly.snowfall, i), 0).toFixed(2)),
    conditions: 'observed',
    summary: 'observed conditions',
  };
}

/**
 * @param venues [{ key, lat, lon, tz, date }]
 * @returns Map<key, weather|null>
 */
export async function archiveWeather(venues) {
  const out = new Map();
  const byDate = new Map();
  for (const v of venues) {
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(v);
  }

  for (const [date, group] of byDate) {
    const url = `${API}?latitude=${group.map((g) => g.lat).join(',')}`
      + `&longitude=${group.map((g) => g.lon).join(',')}`
      + '&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch'
      + `&start_date=${date}&end_date=${date}&timezone=${encodeURIComponent(group[0].tz)}`;

    const data = await fetchJson(url, { ttl: TTL.players }).catch(() => null);
    if (!data) { for (const g of group) out.set(g.key, null); continue; }
    const list = Array.isArray(data) ? data : [data];
    group.forEach((g, i) => {
      const hourly = list[i]?.hourly;
      out.set(g.key, hourly ? summarise(hourly) : null);
    });
  }
  return out;
}
