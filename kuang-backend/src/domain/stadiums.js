// Stadium locations and roof types, keyed by Sleeper's team abbreviations.
// Used to decide whether a game is weather-exposed and, when it is, where to
// ask for a forecast. Roof values:
//   'dome'        — always closed, weather never matters
//   'retractable' — usually closed in bad weather, so treat as sheltered
//   'open'        — fully exposed
//
// Coordinates are the stadium itself (not the city) so the forecast grid cell
// is right for lake-effect and coastal venues.

export const STADIUMS = {
  ARI: { name: 'State Farm Stadium', lat: 33.5277, lon: -112.2626, roof: 'retractable', tz: 'America/Phoenix' },
  ATL: { name: 'Mercedes-Benz Stadium', lat: 33.7554, lon: -84.4008, roof: 'retractable', tz: 'America/New_York' },
  BAL: { name: 'M&T Bank Stadium', lat: 39.2780, lon: -76.6227, roof: 'open', tz: 'America/New_York' },
  BUF: { name: 'Highmark Stadium', lat: 42.7738, lon: -78.7870, roof: 'open', tz: 'America/New_York' },
  CAR: { name: 'Bank of America Stadium', lat: 35.2258, lon: -80.8528, roof: 'open', tz: 'America/New_York' },
  CHI: { name: 'Soldier Field', lat: 41.8623, lon: -87.6167, roof: 'open', tz: 'America/Chicago' },
  CIN: { name: 'Paycor Stadium', lat: 39.0955, lon: -84.5161, roof: 'open', tz: 'America/New_York' },
  CLE: { name: 'Huntington Bank Field', lat: 41.5061, lon: -81.6995, roof: 'open', tz: 'America/New_York' },
  DAL: { name: 'AT&T Stadium', lat: 32.7473, lon: -97.0945, roof: 'retractable', tz: 'America/Chicago' },
  DEN: { name: 'Empower Field at Mile High', lat: 39.7439, lon: -105.0201, roof: 'open', tz: 'America/Denver' },
  DET: { name: 'Ford Field', lat: 42.3400, lon: -83.0456, roof: 'dome', tz: 'America/New_York' },
  GB:  { name: 'Lambeau Field', lat: 44.5013, lon: -88.0622, roof: 'open', tz: 'America/Chicago' },
  HOU: { name: 'NRG Stadium', lat: 29.6847, lon: -95.4107, roof: 'retractable', tz: 'America/Chicago' },
  IND: { name: 'Lucas Oil Stadium', lat: 39.7601, lon: -86.1639, roof: 'retractable', tz: 'America/Indiana/Indianapolis' },
  JAX: { name: 'EverBank Stadium', lat: 30.3239, lon: -81.6373, roof: 'open', tz: 'America/New_York' },
  KC:  { name: 'GEHA Field at Arrowhead', lat: 39.0489, lon: -94.4839, roof: 'open', tz: 'America/Chicago' },
  LV:  { name: 'Allegiant Stadium', lat: 36.0909, lon: -115.1833, roof: 'dome', tz: 'America/Los_Angeles' },
  LAC: { name: 'SoFi Stadium', lat: 33.9535, lon: -118.3392, roof: 'dome', tz: 'America/Los_Angeles' },
  LAR: { name: 'SoFi Stadium', lat: 33.9535, lon: -118.3392, roof: 'dome', tz: 'America/Los_Angeles' },
  MIA: { name: 'Hard Rock Stadium', lat: 25.9580, lon: -80.2389, roof: 'open', tz: 'America/New_York' },
  MIN: { name: 'U.S. Bank Stadium', lat: 44.9738, lon: -93.2578, roof: 'dome', tz: 'America/Chicago' },
  NE:  { name: 'Gillette Stadium', lat: 42.0909, lon: -71.2643, roof: 'open', tz: 'America/New_York' },
  NO:  { name: 'Caesars Superdome', lat: 29.9511, lon: -90.0812, roof: 'dome', tz: 'America/Chicago' },
  NYG: { name: 'MetLife Stadium', lat: 40.8135, lon: -74.0745, roof: 'open', tz: 'America/New_York' },
  NYJ: { name: 'MetLife Stadium', lat: 40.8135, lon: -74.0745, roof: 'open', tz: 'America/New_York' },
  PHI: { name: 'Lincoln Financial Field', lat: 39.9008, lon: -75.1675, roof: 'open', tz: 'America/New_York' },
  PIT: { name: 'Acrisure Stadium', lat: 40.4468, lon: -80.0158, roof: 'open', tz: 'America/New_York' },
  SEA: { name: 'Lumen Field', lat: 47.5952, lon: -122.3316, roof: 'open', tz: 'America/Los_Angeles' },
  SF:  { name: "Levi's Stadium", lat: 37.4033, lon: -121.9694, roof: 'open', tz: 'America/Los_Angeles' },
  TB:  { name: 'Raymond James Stadium', lat: 27.9759, lon: -82.5033, roof: 'open', tz: 'America/New_York' },
  TEN: { name: 'Nissan Stadium', lat: 36.1665, lon: -86.7713, roof: 'open', tz: 'America/Chicago' },
  WAS: { name: 'Northwest Stadium', lat: 38.9077, lon: -76.8645, roof: 'open', tz: 'America/New_York' },
};

/** True when the roof means the forecast is irrelevant. */
export const isSheltered = (team) => {
  const s = STADIUMS[team];
  return !s || s.roof === 'dome' || s.roof === 'retractable';
};

export const stadiumFor = (team) => STADIUMS[team] || null;
