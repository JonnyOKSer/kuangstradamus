import { getROSProjection } from '../services/nerdsService.js'

function parseTradeInput(input) {
  const parts = input.split(/\s+for\s+/i);
  if (parts.length !== 2) throw new Error('Trade format must be like "A for B"');

  const teamA = parts[0].split(/\s+and\s+/i).map(p => p.trim());
  const teamB = parts[1].split(/\s+and\s+/i).map(p => p.trim());

  return { teamA, teamB };
}

export async function analyzeTrade(input) {
  const { teamA, teamB } = parseTradeInput(input);

  console.log('🔍 Parsed Trade Input:');
  console.log('Team A:', teamA);
  console.log('Team B:', teamB);

  const fetchTeamData = async (players, teamLabel) => {
    const results = await Promise.all(players.map(async (player) => {
      try {
        const data = await getROSProjection(player);
        console.log(`📊 ${teamLabel} - ${player}:`, data);
        return data;
      } catch (err) {
        console.warn(`⚠️ Failed to fetch projection for ${player}:`, err.message);
        return null;
      }
    }));
    return results.filter(Boolean);
  };

  const teamAResults = await fetchTeamData(teamA, 'Team A');
  const teamBResults = await fetchTeamData(teamB, 'Team B');

  const sumPoints = arr =>
    arr.reduce((total, p) => total + parseFloat(p.rosPoints || 0), 0);

  const totalA = sumPoints(teamAResults);
  const totalB = sumPoints(teamBResults);

  const formatPlayer = p => ({
    name: p.name,
    team: p.team,
    pos: p.position,
    points: p.rosPoints,
    rank: p.rank,
    byeWeek: p.byeWeek,
    stats: p.stats
  });

  const verdict =
    totalA > totalB
      ? 'Team A wins 💪'
      : totalB > totalA
      ? 'Team B wins 🏆'
      : 'Pretty even trade 🤝';

  const result = {
    teamA: teamAResults.map(formatPlayer),
    teamB: teamBResults.map(formatPlayer),
    teamAPoints: totalA.toFixed(1),
    teamBPoints: totalB.toFixed(1),
    verdict,
    summary: `Team A total: ${totalA.toFixed(1)} pts vs Team B total: ${totalB.toFixed(1)} pts. Verdict: ${verdict}`
  };

  console.log('✅ Final Trade Verdict:', result.summary);
  return result.summary;
}
