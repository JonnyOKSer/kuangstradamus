// Live smoke test against Sleeper's real API. Boots the Express app on a random
// port, hits the main endpoints, prints condensed results.  Usage: node scripts/smoke-live.mjs
process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/app.js');

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, body) {
  const t0 = Date.now();
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - t0, json };
}
const show = (label, r, pick) => console.log(`\n### ${label} → ${r.status} (${r.ms} ms)\n` + JSON.stringify(pick ? pick(r.json) : r.json, null, 1).slice(0, 1800));

try {
  show('health', await call('GET', '/api/health'));
  show('state', await call('GET', '/api/state'));
  show('players/search?q=mccaf', await call('GET', '/api/players/search?q=mccaf'));

  show('chat: CMC for Bijan + Ferguson', await call('POST', '/api/chat', { message: 'Christian McCaffrey for Bijan Robinson and Jake Ferguson' }),
    (j) => ({ reply: j.reply, proverb: j.proverb, A: j.players?.teamA?.map((p) => [p.name, p.position, p.points, p.value, p.rank, p.byeWeek, p.flags?.map((f) => f.text)]), B: j.players?.teamB?.map((p) => [p.name, p.position, p.points, p.value, p.rank, p.byeWeek, p.flags?.map((f) => f.text)]), ctx: j.analysis?.context }));

  show('chat zh: 49ers D/ST + Justin Tucker for Puka Nacua', await call('POST', '/api/chat', { message: '49ers D/ST and Justin Tucker for Puka Nacua', lang: 'zh', scoring: 'half_ppr' }),
    (j) => ({ reply: j.reply, category: j.proverb?.category, A: j.players?.teamA?.map((p) => [p.name, p.position, p.points, p.value]), B: j.players?.teamB?.map((p) => [p.name, p.position, p.points, p.value]) }));

  show('chat: unmatched name', await call('POST', '/api/chat', { message: 'Fakey McFakerson for Christian McCaffrey' }), (j) => ({ reply: j.reply, incomplete: j.analysis?.incomplete, unmatched: j.analysis?.unmatched }));

  show('chat: bad format → 400', await call('POST', '/api/chat', { message: 'just some words' }));

  show('trade arrays + pick', await call('POST', '/api/trade', { teamA: ['Josh Allen'], teamB: ['Jayden Daniels', '2027 1st'] }),
    (j) => ({ verdict: j.verdict, marginPct: j.marginPct, A: j.players.teamA.map((p) => [p.name, p.value]), B: j.players.teamB.map((p) => [p.name, p.type, p.value]), repl: j.context.replacementLevels }));

  // Sleeper docs sample league (2018, complete) exercises the past-season path
  const L = '289646328504385536';
  show(`league ${L} summary (2018)`, await call('GET', `/api/league/${L}`), (j) => ({ league: { name: j.league?.name, season: j.league?.season, scoring: j.league?.scoringDescription, isCurrent: j.league?.isCurrentSeason, weeks: [j.league?.currentWeek, j.league?.lastScoredWeek] }, standings: j.standings?.slice(0, 4).map((s) => [s.rank, s.teamName, `${s.wins}-${s.losses}`, s.pointsFor, s.allPlay, s.luck, s.playoffPct]) }));
  show(`league ${L} season`, await call('GET', `/api/league/${L}/season`), (j) => ({ eff: j.lineupEfficiency?.slice(0, 3).map((e) => [e.teamName, e.actual, e.optimal, e.pointsLeftOnBench, e.efficiencyPct, e.worstWeek]), luck: j.allPlay?.slice(0, 3).map((a) => [a.teamName, `${a.allPlayWins}-${a.allPlayLosses}`, a.expectedWins, a.luck]) }));
  show(`league ${L} team 1`, await call('GET', `/api/league/${L}/team/1`), (j) => ({ team: j.team, rosterTop: j.roster?.slice(0, 3).map((p) => [p.name, p.position, p.ros, p.vorp, p.projected]), lineup: j.lineup, autoSet: j.autoSet }));

  // Find a live current-season league via the sample league's owners (public data)
  const users = await (await fetch(`https://api.sleeper.app/v1/league/${L}/users`)).json();
  const state = (await call('GET', '/api/state')).json;
  let live = null;
  for (const u of users || []) {
    const ls = await (await fetch(`https://api.sleeper.app/v1/user/${u.user_id}/leagues/nfl/${state.season}`)).json();
    const cand = (ls || []).find((l) => l.status === 'in_season' && l.total_rosters >= 8);
    if (cand) { live = cand; break; }
  }
  if (live) {
    console.log(`\n>>> live ${state.season} league found: ${live.name} (${live.league_id}), ${live.total_rosters} teams`);
    show('live league summary', await call('GET', `/api/league/${live.league_id}`), (j) => ({ scoring: j.league?.scoringDescription, week: j.league?.currentWeek, window: j.league?.projectionWindow, repl: j.league?.replacementLevels, standings: j.standings?.slice(0, 4).map((s) => [s.rank, s.teamName, `${s.wins}-${s.losses}`, s.pointsFor, s.allPlay, s.luck, `${s.playoffPct}%`, s.starterValue]) }));
    show('live league season', await call('GET', `/api/league/${live.league_id}/season`), (j) => ({ eff: j.lineupEfficiency?.slice(0, 2).map((e) => [e.teamName, e.pointsLeftOnBench, e.efficiencyPct]), odds: j.playoffOdds?.slice(0, 4).map((o) => [o.teamName, o.playoffPct, o.projectedWins, o.gamesLeft, o.weeklySd]), sos: j.strengthOfSchedule?.slice(0, 2).map((x) => [x.teamName, x.gamesLeft, x.avgOpponentProjection, x.avgOwnProjection]) }));
    const team = await call('GET', `/api/league/${live.league_id}/team/1`);
    show('live league team 1', team, (j) => ({ team: j.team?.teamName, rosterTop: j.roster?.slice(0, 4).map((p) => [p.name, p.position, p.ros, p.vorp, p.nextWeek, p.isStarter, p.flags?.map((f) => f.text)]), lineup: j.lineup && { week: j.lineup.week, current: j.lineup.currentTotal, optimal: j.lineup.optimalTotal, gain: j.lineup.gain, moves: j.lineup.moves, unfilled: j.lineup.unfilled }, trade: j.tradeTargets?.slice(0, 2).map((t) => [t.position, t.target.name, t.target.vorp, t.partner.teamName, t.gain, t.offerIdeas.map((o) => o.name)]), waivers: j.waivers?.targets?.slice(0, 4).map((x) => [x.name, x.position, x.vorp, x.trendingAdds, x.upgradeOver?.name]), drops: j.waivers?.dropCandidates?.map((d) => d.name) }));
    show('live league trade with league scoring', await call('POST', '/api/trade', { message: 'Christian McCaffrey for Bijan Robinson and Jake Ferguson', leagueId: live.league_id }), (j) => ({ verdict: j.verdict, marginPct: j.marginPct, scoring: j.context.scoring, repl: j.context.replacementLevels, A: j.players.teamA.map((p) => [p.name, p.points, p.value]), B: j.players.teamB.map((p) => [p.name, p.points, p.value]) }));
  } else {
    console.log('\n>>> no live league found via sample owners');
  }

  show('user sleeperbot leagues', await call('GET', '/api/league/user/sleeperbot'), (j) => ({ user: j.user, season: j.season, count: j.leagues?.length, error: j.error }));
  show('user does-not-exist → 404', await call('GET', '/api/league/user/this-user-should-not-exist-xyz'));
  show('apply lineup → 501', await call('POST', `/api/league/${L}/team/1/lineup/apply`));
} catch (err) {
  console.error('SMOKE FAILED', err);
} finally {
  server.close();
}
