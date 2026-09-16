// Parse free-text trades like
//   "CMC and Tyreek Hill for Bijan Robinson, a 2027 1st and Jake Ferguson"
// into two sides of items. Items are players or draft picks.

const SIDE_SPLIT = /\s+(?:in\s+exchange\s+for|for|→|->|<->|⇄)\s+/i;
const ITEM_SPLIT = /\s*(?:,|;|\s+and\s+|\s+&\s+|\s+\+\s+|\s+plus\s+)\s*/i;

const ROUND_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
const PICK_RE = /^(?:(?:a|an|the)\s+)?(?:(\d{4})\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)(?:\s+round)?(?:\s+(?:pick|rounder))?(?:\s+(?:in\s+)?(\d{4}))?$/i;

export function parseItem(raw, { defaultPickYear } = {}) {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const pick = text.match(PICK_RE);
  if (pick) {
    const year = Number(pick[1] || pick[3] || defaultPickYear || new Date().getFullYear() + 1);
    const round = ROUND_WORDS[pick[2].toLowerCase()];
    return { type: 'pick', year, round, name: `${year} ${ordinal(round)} round pick` };
  }
  return { type: 'player', name: text.replace(/^(?:a|an|the|my|his|her|their|our)\s+/i, '') };
}

export function parseTradeInput(input, opts = {}) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Describe the trade like "Player A and Player B for Player C".');
  }
  const cleaned = input.replace(/[“”"]/g, '').replace(/\?+$/, '').trim();
  const parts = cleaned.split(SIDE_SPLIT);
  if (parts.length !== 2) {
    throw new Error('Trade format must be "A for B" (use "and" or commas to list several players per side).');
  }
  const sideA = parts[0].split(ITEM_SPLIT).map((s) => parseItem(s, opts)).filter(Boolean);
  const sideB = parts[1].split(ITEM_SPLIT).map((s) => parseItem(s, opts)).filter(Boolean);
  if (!sideA.length || !sideB.length) throw new Error('Each side of the trade needs at least one player or pick.');
  return { teamA: sideA, teamB: sideB };
}

/** Accept either a message string or explicit arrays of names. */
export function normalizeTradeRequest(body = {}, opts = {}) {
  if (typeof body === 'string') return parseTradeInput(body, opts);
  if (body.message) return parseTradeInput(body.message, opts);
  if (Array.isArray(body.teamA) && Array.isArray(body.teamB)) {
    const toItems = (arr) => arr.map((x) => (typeof x === 'string' ? parseItem(x, opts) : x)).filter(Boolean);
    const teamA = toItems(body.teamA);
    const teamB = toItems(body.teamB);
    if (!teamA.length || !teamB.length) throw new Error('teamA and teamB must each contain at least one name.');
    return { teamA, teamB };
  }
  throw new Error('Provide { message } or { teamA: [...], teamB: [...] }.');
}

function ordinal(n) {
  return ({ 1: '1st', 2: '2nd', 3: '3rd' })[n] || `${n}th`;
}
