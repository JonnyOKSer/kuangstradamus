// Parse free-text trades like
//   "CMC and Tyreek Hill for Bijan Robinson, a 2027 1st and Jake Ferguson"
// into two sides of items. Items are players or draft picks.

const SIDE_SPLIT = /\s+(?:in\s+exchange\s+for|for|→|->|<->|⇄)\s+/i;
const ITEM_SPLIT = /\s*(?:,|;|\s+and\s+|\s+&\s+|\s+\+\s+|\s+plus\s+)\s*/i;

// Rounds run as deep as a draft does, not just the first five — "a 2027 8th"
// was previously parsed as a player name and sent to the name resolver.
const ROUND_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16,
};
const MAX_ROUND = 20;
const ORDINAL = '(?:\\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth)';
const PICK_RE = new RegExp(
  `^(?:(?:a|an|the)\\s+)?(?:(\\d{4})\\s+)?(?:round\\s+(\\d{1,2})|${ORDINAL})(?:\\s+round)?(?:\\s+(?:pick|rounder|selection))?(?:\\s+(?:in\\s+)?(\\d{4}))?$`,
  'i',
);

function roundFrom(match) {
  if (match[2]) return Number(match[2]);              // "round 8"
  const token = match[0].match(new RegExp(ORDINAL, 'i'))?.[0]?.toLowerCase();
  if (!token) return null;
  const digits = token.match(/^\d{1,2}/);
  return digits ? Number(digits[0]) : (ROUND_WORDS[token] ?? null);
}

export function parseItem(raw, { defaultPickYear } = {}) {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const pick = text.match(PICK_RE);
  if (pick) {
    const round = roundFrom(pick);
    if (round && round >= 1 && round <= MAX_ROUND) {
      const year = Number(pick[1] || pick[3] || defaultPickYear || new Date().getFullYear() + 1);
      return { type: 'pick', year, round, name: `${year} ${ordinal(round)} round pick` };
    }
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
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}
