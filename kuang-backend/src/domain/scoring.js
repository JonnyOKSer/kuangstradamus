// League-specific scoring. Sleeper's projection stat lines use the same keys
// as league.scoring_settings (pass_yd, pass_td, rec, rec_yd, bonus_rec_te, ...),
// so a league's projected points are simply Σ stat × weight over its rules.
// This is exactly how Sleeper scores real games, which means TE-premium,
// 6-point-pass-TD, yardage-bonus and any other custom league is handled.

export function scoreStats(stats = {}, scoringSettings = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(scoringSettings)) {
    if (!weight) continue;
    const v = stats[key];
    if (typeof v === 'number' && Number.isFinite(v)) total += v * weight;
  }
  return total;
}

export function scoringFormatOf(scoringSettings = {}) {
  const rec = Number(scoringSettings.rec ?? 1);
  if (rec >= 0.75) return 'ppr';
  if (rec >= 0.25) return 'half_ppr';
  return 'std';
}

/** Rest-of-season league points from a ROS table entry (see projections.buildRosTable). */
export function rosLeaguePoints(entry, scoringSettings) {
  const byWeek = {};
  let total = 0;
  for (const [week, stats] of Object.entries(entry.byWeekStats || {})) {
    const pts = scoreStats(stats, scoringSettings);
    byWeek[week] = Number(pts.toFixed(2));
    total += pts;
  }
  return { total: Number(total.toFixed(2)), byWeek };
}

/** Short human summary of what makes a league's scoring distinctive. */
const w = (v) => Number(Number(v).toFixed(3));

export function describeScoring(raw = {}) {
  const s = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'number' ? w(v) : v]));
  const parts = [];
  const rec = Number(s.rec ?? 0);
  parts.push(rec >= 0.75 ? `${rec} PPR` : rec >= 0.25 ? `${rec} PPR (half)` : 'Standard (no PPR)');
  if (s.bonus_rec_te) parts.push(`TE premium +${s.bonus_rec_te}/rec`);
  if (s.bonus_rec_rb) parts.push(`RB rec bonus +${s.bonus_rec_rb}`);
  if (s.bonus_rec_wr) parts.push(`WR rec bonus +${s.bonus_rec_wr}`);
  if (s.pass_td != null) parts.push(`${s.pass_td}pt pass TD`);
  if (s.pass_yd) parts.push(`${s.pass_yd}/pass yd`);
  if (s.rush_yd && s.rush_yd !== 0.1) parts.push(`${s.rush_yd}/rush yd`);
  if (s.rec_yd && s.rec_yd !== 0.1) parts.push(`${s.rec_yd}/rec yd`);
  if (s.pass_int) parts.push(`${s.pass_int} INT`);
  if (s.fum_lost) parts.push(`${s.fum_lost} fumble lost`);
  const bonuses = Object.entries(s)
    .filter(([k, v]) => k.startsWith('bonus_') && v && !['bonus_rec_te', 'bonus_rec_rb', 'bonus_rec_wr'].includes(k))
    .map(([k, v]) => `${k.replace('bonus_', '').replace(/_/g, ' ')} +${v}`);
  if (bonuses.length) parts.push(`bonuses: ${bonuses.join(', ')}`);
  return parts.join(' · ');
}
