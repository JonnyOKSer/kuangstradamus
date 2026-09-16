// The league calendar: what is coming, when, and what it means for this roster.
//
// Most fantasy decisions are really scheduling decisions. A waiver claim in
// week 6 is worth more if three of your receivers are on bye in week 7; a
// trade target stops mattering the moment the deadline passes; a player whose
// bye falls inside the fantasy playoffs is a different asset from one whose
// bye is in week 5. This module collects those dates, cross-references them
// against who is actually available on waivers, and turns them into alerts.

import { optimizeLineup, SLOT_ELIGIBILITY } from './lineup.js';

const r2 = (x) => Number((x ?? 0).toFixed(2));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Sleeper stores the deadline as a week number; 0 or >= 18 means "none". */
function normalizeDeadline(week, playoffWeekStart) {
  const n = Number(week);
  if (!Number.isFinite(n) || n <= 0 || n >= 18) return null;
  return Math.min(n, playoffWeekStart);
}

/**
 * @param team      one imported team
 * @param ctx       league context
 * @param freeAgents ranked free agents (from season.waiverTargets) used to
 *                   answer "can I even cover that bye?"
 */
export function keyDates(team, ctx, { freeAgents = [], weeksAhead = 8 } = {}) {
  const { imported, leaguePts, playersById } = ctx;
  const currentWeek = imported.currentWeek;
  const playoffStart = imported.league.playoffWeekStart;
  const deadlineWeek = normalizeDeadline(imported.league.tradeDeadline, playoffStart);
  const positions = ctx.activePositions || [];

  const roster = (team.players || []).map((id) => {
    const p = playersById.get(String(id));
    const proj = leaguePts.get(String(id));
    return {
      id: String(id),
      name: p?.name || String(id),
      position: p?.position || proj?.position || 'UNK',
      fantasyPositions: p?.fantasyPositions?.length ? p.fantasyPositions : [p?.position || proj?.position || 'UNK'],
      team: p?.team || null,
      injuryStatus: p?.injuryStatus || null,
      byeWeeks: proj?.byeWeeks || [],
      byWeek: proj?.byWeek || {},
      ros: r2(proj?.total ?? 0),
      onIR: (team.reserve || []).map(String).includes(String(id)),
    };
  }).filter((p) => positions.includes(p.position));

  // ---------------- bye outlook, cross-referenced with waivers ----------------
  const lastWeek = Math.min(playoffStart - 1, currentWeek + weeksAhead);
  const byeOutlook = [];
  for (let w = currentWeek; w <= lastWeek; w++) {
    const out = roster.filter((p) => p.byeWeeks.includes(w));
    if (!out.length) continue;
    const byPosition = {};
    for (const p of out) (byPosition[p.position] ||= []).push(p.name);

    // Actually try to fill the lineup that week rather than counting each
    // position on its own. A TE on bye is only a hole if nothing else can take
    // the slot, and in a league with two FLEX spots an RB or WR usually can.
    // Counting positions independently reported a "1 short at TE" for a roster
    // that had a healthy starting tight end and one spare flex body.
    const weekPlayers = roster
      .filter((p) => !p.onIR)
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        fantasyPositions: p.fantasyPositions,
        points: p.byWeek?.[w] ?? 0,
        onBye: p.byeWeeks.includes(w),
        // A player's injury tag today says nothing about a week eight weeks
        // out; this view is about byes.
        injuryStatus: null,
      }));

    const filled = optimizeLineup({ rosterPositions: imported.league.rosterPositions, players: weekPlayers });

    const shortages = [];
    const bySlot = {};
    for (const slot of filled.unfilled) bySlot[slot] = (bySlot[slot] || 0) + 1;
    for (const [slot, short] of Object.entries(bySlot)) {
      const eligible = SLOT_ELIGIBILITY[slot] || [slot];
      const cover = freeAgents
        .filter((f) => eligible.includes(f.position) && !(f.byeWeeks || []).includes(w))
        .slice(0, 3)
        .map((f) => ({ id: f.id, name: f.name, position: f.position, team: f.team, weekPoints: r2(f.byWeek?.[w] ?? f.nextWeekPoints ?? 0), ros: f.ros }));
      shortages.push({
        slot,
        position: eligible.join('/'),
        eligible,
        short,
        available: weekPlayers.filter((p) => !p.onBye && eligible.includes(p.position)).length,
        waiverCover: cover,
      });
    }

    byeOutlook.push({
      week: w,
      weeksAway: w - currentWeek,
      playersOut: out.length,
      byPosition,
      shortages,
      risk: shortages.length ? (shortages.some((s) => s.short > 1) ? 'high' : 'medium') : 'low',
    });
  }

  // ---------------- byes that land inside the fantasy playoffs ----------------
  const playoffByes = roster
    .filter((p) => p.byeWeeks.some((w) => ctx.playoffWeeks.includes(w)))
    .map((p) => ({ name: p.name, position: p.position, weeks: p.byeWeeks.filter((w) => ctx.playoffWeeks.includes(w)) }));

  // ---------------- milestones ----------------
  const milestones = [];
  if (deadlineWeek) {
    milestones.push({
      week: deadlineWeek,
      weeksAway: deadlineWeek - currentWeek,
      type: 'tradeDeadline',
      label: `Trade deadline (week ${deadlineWeek})`,
      passed: currentWeek > deadlineWeek,
      urgency: currentWeek > deadlineWeek ? 'passed' : deadlineWeek - currentWeek <= 2 ? 'high' : 'normal',
    });
  }
  milestones.push({
    week: playoffStart,
    weeksAway: playoffStart - currentWeek,
    type: 'playoffStart',
    label: `Fantasy playoffs begin (week ${playoffStart})`,
    passed: currentWeek >= playoffStart,
    urgency: playoffStart - currentWeek <= 2 && currentWeek < playoffStart ? 'high' : 'normal',
  });
  for (const b of byeOutlook.filter((b) => b.risk !== 'low')) {
    milestones.push({
      week: b.week,
      weeksAway: b.weeksAway,
      type: 'byeCrunch',
      label: `Bye crunch week ${b.week}: short at ${b.shortages.map((s) => s.position).join(', ')}`,
      passed: false,
      urgency: b.risk === 'high' ? 'high' : 'normal',
    });
  }
  milestones.sort((a, b) => a.week - b.week);

  // ---------------- alerts ----------------
  const alerts = [];
  if (deadlineWeek && currentWeek <= deadlineWeek) {
    const away = deadlineWeek - currentWeek;
    if (away <= 2) {
      alerts.push({
        level: away === 0 ? 'high' : 'high',
        type: 'tradeDeadline',
        text: away === 0
          ? 'Trade deadline is this week — any roster fix by trade has to happen now.'
          : `Trade deadline in ${plural(away, 'week')} (week ${deadlineWeek}).`,
        action: 'Review trade targets before the deadline; after it, waivers are the only route.',
      });
    }
  } else if (deadlineWeek) {
    alerts.push({
      level: 'info',
      type: 'tradeDeadline',
      text: `Trade deadline passed in week ${deadlineWeek}. Waivers and free agency only from here.`,
      action: 'Shift focus to waiver claims and streaming.',
    });
  }

  for (const b of byeOutlook.filter((b) => b.risk !== 'low')) {
    alerts.push({
      level: b.risk === 'high' ? 'high' : 'medium',
      type: 'byeCrunch',
      text: `Week ${b.week} (${plural(b.weeksAway, 'week')} away): ${b.shortages.map((s) => `${s.short} unfilled at ${s.slot}`).join(', ')} — ${b.playersOut} players on bye.`,
      action: b.shortages.flatMap((s) => s.waiverCover).length
        ? `Cover now: ${b.shortages.flatMap((s) => s.waiverCover.map((c) => `${c.name} (${c.position || ''}${c.team ? ` ${c.team}` : ''})`)).slice(0, 3).join(', ')}`
        : 'No obvious waiver cover — consider a trade or an early stash.',
    });
  }

  const hurt = roster.filter((p) => ['Out', 'IR', 'PUP', 'Doubtful', 'Sus'].includes(p.injuryStatus) && !p.onIR);
  if (hurt.length) {
    alerts.push({
      level: 'medium',
      type: 'injury',
      text: `${plural(hurt.length, 'player')} unavailable but not on IR: ${hurt.map((p) => `${p.name} (${p.injuryStatus})`).join(', ')}.`,
      action: 'Move them to IR if your league allows it, to free an active roster spot.',
    });
  }

  if (playoffByes.length) {
    alerts.push({
      level: 'medium',
      type: 'playoffBye',
      text: `Bye during the fantasy playoffs: ${playoffByes.map((p) => `${p.name} (week ${p.weeks.join(', ')})`).join(', ')}.`,
      action: 'Plan the playoff weeks now — these slots need a backup on the roster.',
    });
  }

  if (imported.league.waiverBudget) {
    const used = team.record?.waiverBudgetUsed ?? 0;
    const left = imported.league.waiverBudget - used;
    const weeksLeft = Math.max(0, playoffStart - currentWeek);
    alerts.push({
      level: left <= imported.league.waiverBudget * 0.15 ? 'medium' : 'info',
      type: 'faab',
      text: `FAAB remaining: $${left} of $${imported.league.waiverBudget}${weeksLeft ? ` with ${plural(weeksLeft, 'week')} to the playoffs` : ''}.`,
      action: left <= 0 ? 'Budget is gone — claims are waiver-priority only.' : `About $${Math.max(1, Math.floor(left / Math.max(1, weeksLeft)))} per remaining week at an even spend.`,
    });
  }

  return {
    currentWeek,
    tradeDeadline: deadlineWeek
      ? { week: deadlineWeek, weeksAway: deadlineWeek - currentWeek, passed: currentWeek > deadlineWeek }
      : { week: null, weeksAway: null, passed: false, note: 'This league has no trade deadline set.' },
    playoffs: {
      startWeek: playoffStart,
      weeks: ctx.playoffWeeks,
      weeksAway: Math.max(0, playoffStart - currentWeek),
      teams: imported.league.playoffTeams,
    },
    waivers: {
      type: imported.league.waiverType,
      budget: imported.league.waiverBudget,
      used: team.record?.waiverBudgetUsed ?? 0,
      remaining: imported.league.waiverBudget ? imported.league.waiverBudget - (team.record?.waiverBudgetUsed ?? 0) : null,
      position: team.record?.waiverPosition ?? null,
    },
    byeOutlook,
    playoffByes,
    milestones,
    alerts,
  };
}
