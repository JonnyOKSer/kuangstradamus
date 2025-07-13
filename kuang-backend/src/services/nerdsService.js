// nerdsService.js
import axios from 'axios';
import Fuse from 'fuse.js';

const BASE = 'https://api.fantasynerds.com/v1/nfl';
const APIKEY = process.env.NERDS_APIKEY || 'TEST';

export async function getROSProjection(playerName) {
  try {
    const res = await axios.get(`${BASE}/ros`, {
      params: { apikey: APIKEY }
    });

    const data = res.data;
    console.log('📡 Raw response keys:', Object.keys(data));

    if (!data.projections || typeof data.projections !== 'object') {
      throw new Error('Missing or invalid projections object in response');
    }

    const allPlayers = Object.values(data.projections).flat();
    console.log(`📡 Received ${allPlayers.length} players from Nerds API`);

    const normalize = str => str.toLowerCase().replace(/[^a-z]/g, '');

    // First try exact name match (case-insensitive, normalized)
    const normalizedTarget = normalize(playerName);
    let playerMatch = allPlayers.find(p => normalize(p.name) === normalizedTarget);

    // Fallback to contains match
    if (!playerMatch) {
      playerMatch = allPlayers.find(p => normalize(p.name).includes(normalizedTarget));
    }

    // Fallback to fuzzy match if still no match
    if (!playerMatch) {
      const fuse = new Fuse(allPlayers, {
        keys: ['name'],
        includeScore: true,
        threshold: 0.2 // Tighten to reduce false positives
      });

      const [fuzzyResult] = fuse.search(playerName);
      if (fuzzyResult && fuzzyResult.score < 0.15) {
        playerMatch = fuzzyResult.item;
        console.log(`🔍 Fuzzy match found - "${playerName}" ≈ "${playerMatch.name}" (score ${fuzzyResult.score.toFixed(2)})`);
      } else {
        console.warn(`❌ No good fuzzy match found for "${playerName}"`);
      }
    }

    if (!playerMatch) {
      console.warn(`❌ No match found for "${playerName}"`);
      return null;
    }

    console.log(`📊 Match found - ${playerMatch.name}`);

    return {
      name: playerMatch.name,
      team: playerMatch.team,
      position: playerMatch.position,
      rosPoints: parseFloat(playerMatch.proj_pts || 0),
      rank: null,
      byeWeek: null,
      stats: {
        passing_yards: playerMatch.passing_yards,
        rushing_yards: playerMatch.rushing_yards,
        passing_touchdowns: playerMatch.passing_touchdowns,
        rushing_touchdowns: playerMatch.rushing_touchdowns
      }
    };
  } catch (err) {
    console.error('💥 Nerds API error:', err.message);
    return null;
  }
}
