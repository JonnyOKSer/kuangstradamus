// Deep waiver discovery: find the league's genuine workhorses, then find the
// player standing directly behind each one.
//
// The ordinary waiver list ranks free agents by what they are projected to do.
// That surfaces streamers, never the back who would become a top-12 RB the
// moment the starter in front of him tweaks a hamstring. This module works the
// other way round: it identifies high-volume, high-production starters from
// real usage (snap share, touches, targets), walks down the depth chart to the
// next man on that NFL team, and values him on what he would inherit.
//
// It also flags the second kind of sleeper — a backup whose own usage is
// already climbing week over week, which is what a breakout looks like before
// it is obvious.

const r2 = (x) => Number((x ?? 0).toFixed(2));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// What counts as a workhorse, per position.
const WORKHORSE = {
  RB: { touches: 12, ppg: 9 },
  WR: { targets: 6, ppg: 8 },
  TE: { targets: 4.5, ppg: 6 },
  QB: { snapShare: 0.8, ppg: 13 },
};

// How much of the starter's production the next man up realistically absorbs.
// Backfields concentrate; receiver targets scatter across the room.
const INHERITANCE = { RB: 0.7, WR: 0.45, TE: 0.55, QB: 0.6 };

const HANDCUFF_POSITIONS = ['RB', 'WR', 'TE', 'QB'];

/** Is this player carrying a starter's workload? */
export function isWorkhorse(form, position) {
  const bar = WORKHORSE[position];
  // One game is enough to see a workhorse's workload; the sample size travels
  // with the result so callers can caveat it.
  if (!bar || !form || form.gamesPlayed < 1) return false;
  if (form.recentPPG < bar.ppg) return false;
  if (bar.touches != null && form.touchesPerGame >= bar.touches) return true;
  if (bar.targets != null && form.targetsPerGame >= bar.targets) return true;
  if (bar.snapShare != null && (form.snapShareLast ?? form.snapShare ?? 0) >= bar.snapShare) return true;
  return false;
}

/** Usage climbing on its own, independent of anyone getting hurt. */
export function isRising(form) {
  if (!form || form.gamesPlayed < 2) return false;
  return (form.snapShareTrend ?? 0) > 0.05 || (form.touchesTrend ?? 0) > 1.5 || (form.trend ?? 0) > 2;
}

/**
 * @param players   Map<id, slim player>  (needs team, position, depthChartOrder, active)
 * @param form      Map<id, form>         (from services/nfl/usage.js)
 * @param leaguePts Map<id, { total, byWeek }>
 * @param rostered  Set<string> of player ids already owned in this league
 * @param activePositions positions this league actually starts
 */
export function findHandcuffSleepers({
  players,
  form,
  leaguePts,
  rostered = new Set(),
  activePositions = HANDCUFF_POSITIONS,
  needByPosition = {},
  currentWeek = null,
  limit = 10,
}) {
  const positions = HANDCUFF_POSITIONS.filter((p) => activePositions.includes(p));
  if (!players || !form) return [];

  // Index the league's players by NFL team + position so we can walk a depth chart.
  const byTeamPos = new Map();
  for (const p of players.values()) {
    if (!p.team || !p.active || !positions.includes(p.position)) continue;
    const key = `${p.team}|${p.position}`;
    if (!byTeamPos.has(key)) byTeamPos.set(key, []);
    byTeamPos.get(key).push(p);
  }

  const out = [];
  const seen = new Set();

  for (const [key, group] of byTeamPos) {
    const [team, position] = key.split('|');

    // Rank the room by what they have actually been doing, not by name.
    const ranked = [...group].sort((a, b) => {
      const fa = form.get(a.id);
      const fb = form.get(b.id);
      const ua = (fa?.snapShareLast ?? fa?.snapShare ?? 0) * 100 + (fa?.touchesPerGame ?? 0);
      const ub = (fb?.snapShareLast ?? fb?.snapShare ?? 0) * 100 + (fb?.touchesPerGame ?? 0);
      if (ub !== ua) return ub - ua;
      const da = a.depthChartOrder ?? 99;
      const db = b.depthChartOrder ?? 99;
      if (da !== db) return da - db;
      return a.searchRank - b.searchRank;
    });

    const starter = ranked[0];
    const starterForm = form.get(starter?.id);
    if (!starter || !isWorkhorse(starterForm, position)) continue;

    // The next one or two names behind him that are still free agents.
    const backups = ranked.slice(1, 4).filter((b) => !rostered.has(String(b.id)));
    for (const backup of backups.slice(0, 2)) {
      if (seen.has(backup.id)) continue;
      seen.add(backup.id);

      const bForm = form.get(backup.id);
      const inherit = INHERITANCE[position] ?? 0.5;
      const contingentPPG = r2(starterForm.recentPPG * inherit);
      const ownPPG = r2(bForm?.recentPPG ?? 0);
      const rising = isRising(bForm);
      const proj = leaguePts.get(String(backup.id));
      const rosPoints = r2(proj?.total ?? 0);
      const nextWeek = currentWeek != null ? r2(proj?.byWeek?.[currentWeek] ?? 0) : null;

      // Weight what he would inherit most heavily, reward a back-up already
      // carving out work of his own, then tilt toward the positions this team
      // is actually short at and toward real rest-of-season volume.
      const deficit = Math.max(0, -(needByPosition[position]?.vsAverage ?? 0));
      const needBoost = Math.min(1, deficit / 25);
      const score = r2(
        (0.6 * contingentPPG
          + 0.3 * ownPPG
          + (rising ? 4 : 0)
          + clamp((bForm?.snapShareLast ?? 0) * 6, 0, 6)
          + 0.04 * rosPoints)
        * (1 + 0.5 * needBoost),
      );

      const why = [];
      why.push(`behind ${starter.name} (${starterForm.touchesPerGame ? `${starterForm.touchesPerGame} touches/gm` : `${starterForm.targetsPerGame} targets/gm`}, ${starterForm.recentPPG} pts/gm)`);
      if (rising) {
        const bits = [];
        if ((bForm?.snapShareTrend ?? 0) > 0.05) bits.push(`snap share up ${Math.round(bForm.snapShareTrend * 100)}pts`);
        if ((bForm?.touchesTrend ?? 0) > 1.5) bits.push(`+${bForm.touchesTrend} touches vs earlier`);
        if ((bForm?.trend ?? 0) > 2) bits.push(`scoring up ${bForm.trend}/gm`);
        why.push(`own usage climbing: ${bits.join(', ')}`);
      }
      if (bForm?.snapShareLast) why.push(`already on ${Math.round(bForm.snapShareLast * 100)}% of snaps`);

      out.push({
        id: String(backup.id),
        name: backup.name,
        position,
        team,
        depthChartOrder: backup.depthChartOrder ?? null,
        sampleGames: starterForm.gamesPlayed,
        score,
        type: rising ? 'rising' : 'handcuff',
        blocks: {
          id: String(starter.id),
          name: starter.name,
          pointsPerGame: starterForm.recentPPG,
          touchesPerGame: starterForm.touchesPerGame,
          targetsPerGame: starterForm.targetsPerGame,
          snapShare: starterForm.snapShareLast ?? starterForm.snapShare,
        },
        contingentPointsPerGame: contingentPPG,
        positionNeed: r2(needByPosition[position]?.vsAverage ?? 0),
        priority: needBoost >= 0.6 ? 'high' : needBoost > 0.2 ? 'medium' : 'low',
        ownPointsPerGame: ownPPG,
        snapShare: bForm?.snapShareLast ?? bForm?.snapShare ?? null,
        rising,
        rosPoints,
        nextWeekPoints: nextWeek,
        injuryStatus: backup.injuryStatus || null,
        why: why.join(' · '),
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
