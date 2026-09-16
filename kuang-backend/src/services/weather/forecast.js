// Game-day weather from Open-Meteo (free, no API key, no rate limit for this
// volume). https://open-meteo.com/en/docs
//
// Sleeper's schedule feed has no kickoff time, so we sample the hours an NFL
// game can plausibly be played in local time and summarise that window:
// temperature at the middle of the window, the worst wind, and total
// precipitation. That is the honest resolution available from free data.

import { fetchJson, TTL } from '../sleeper/client.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const KICKOFF_HOURS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22]; // local
const FORECAST_HORIZON_DAYS = 16; // Open-Meteo's free forecast range

// https://open-meteo.com/en/docs — WMO weather interpretation codes
const CODE_TEXT = [
  [[0], 'clear'], [[1, 2, 3], 'cloudy'], [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'], [[61, 63, 65, 66, 67], 'rain'],
  [[71, 73, 75, 77], 'snow'], [[80, 81, 82], 'rain showers'],
  [[85, 86], 'snow showers'], [[95, 96, 99], 'thunderstorms'],
];
const codeText = (c) => CODE_TEXT.find(([codes]) => codes.includes(c))?.[1] || 'unsettled';

const daysFromNow = (dateStr) => Math.floor((new Date(`${dateStr}T12:00:00Z`) - Date.now()) / 86_400_000);

/**
 * @returns null when the venue is sheltered, the date is outside the forecast
 *   horizon, or the lookup fails — callers treat null as "no weather signal".
 */
export async function gameWeather({ stadium, date, sheltered }) {
  if (!stadium || !date || sheltered) return null;
  const ahead = daysFromNow(date);
  if (ahead < -1 || ahead > FORECAST_HORIZON_DAYS) return null;

  const url = `${API}?latitude=${stadium.lat}&longitude=${stadium.lon}`
    + '&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,weather_code'
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
    + `&start_date=${date}&end_date=${date}&timezone=${encodeURIComponent(stadium.tz)}`;

  const data = await fetchJson(url, { ttl: TTL.weather }).catch(() => null);
  const h = data?.hourly;
  if (!h?.time?.length) return null;

  const idx = h.time
    .map((t, i) => [Number(t.slice(11, 13)), i])
    .filter(([hour]) => KICKOFF_HOURS.includes(hour))
    .map(([, i]) => i);
  if (!idx.length) return null;

  const at = (arr, i) => (typeof arr?.[i] === 'number' ? arr[i] : 0);
  const mid = idx[Math.floor(idx.length / 2)];
  const tempF = Math.round(at(h.temperature_2m, mid));
  const windMph = Math.round(Math.max(...idx.map((i) => at(h.wind_speed_10m, i))));
  const gustMph = Math.round(Math.max(...idx.map((i) => at(h.wind_gusts_10m, i))));
  const precipIn = Number(idx.reduce((s, i) => s + at(h.precipitation, i), 0).toFixed(2));
  const snowIn = Number(idx.reduce((s, i) => s + at(h.snowfall, i), 0).toFixed(2));
  const code = h.weather_code?.[mid] ?? 0;

  return {
    tempF,
    windMph,
    gustMph,
    precipIn,
    snowIn,
    conditions: codeText(code),
    venue: stadium.name,
    date,
    summary: `${tempF}°F, ${codeText(code)}, wind ${windMph} mph${gustMph > windMph + 5 ? ` (gusts ${gustMph})` : ''}${snowIn > 0 ? `, ${snowIn}" snow` : precipIn > 0 ? `, ${precipIn}" precip` : ''}`,
  };
}
