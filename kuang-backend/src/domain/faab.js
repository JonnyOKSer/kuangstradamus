// What would this claim actually cost?
//
// Sleeper records every waiver bid a league has made, winning and losing, in
// its transactions feed. That is the only honest basis for an estimate: what
// this particular group of people has been willing to pay this season, not
// what a generic FAAB guide says.
//
// The method is deliberately unambitious, because a season's history is small
// — a couple of dozen bids by midseason. Rather than fit a curve through
// twenty points, it finds the closest comparable claims by player value and
// reports the spread of what they went for. With too few comparables it says
// so instead of inventing precision.
//
// Only FAAB leagues get an estimate. A rolling-priority league has no bids to
// learn from and none to place.

const r0 = (x) => Math.max(0, Math.round(x));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Sleeper waiver_type: 2 is FAAB; 0 and 1 are priority orders. */
export const isFaabLeague = (league) => Number(league?.waiverType) === 2 && Number(league?.waiverBudget) > 0;

/**
 * Winning and losing bids from a season of transactions.
 *
 * @param transactionsByWeek Map|object of week -> transaction[]
 * @param valueOf (playerId) => number|null   the player's value today
 */
export function collectBidHistory(transactionsByWeek, valueOf) {
  const bids = [];
  for (const [week, list] of Object.entries(transactionsByWeek || {})) {
    for (const t of list || []) {
      if (t?.type !== 'waiver') continue;
      const bid = t.settings?.waiver_bid;
      if (typeof bid !== 'number') continue;          // priority league, not FAAB
      for (const playerId of Object.keys(t.adds || {})) {
        const value = valueOf(playerId);
        if (value == null) continue;
        bids.push({ playerId, bid, value, week: Number(week), won: t.status === 'complete' });
      }
    }
  }
  return bids.sort((a, b) => a.value - b.value);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Estimate what a target would cost.
 *
 * The estimate maps the target's rank among the free agents available now onto
 * the distribution of bids this league has actually made. The best thing left
 * on waivers is priced like the best claims of the season; the tenth-best like
 * the middling ones.
 *
 * It deliberately does not try to match the target against specific past
 * players. Those players are now rostered and their worth has moved — a back
 * claimed for $18 in week 1 may be hurt by week 9 — so ranking them by today's
 * value scrambles the order. The distribution of what was paid survives that
 * problem; the pairing of who it was paid for does not.
 *
 * @param valuePct  the target's percentile (0-1) among the free agents available now
 * @param history   output of collectBidHistory
 * @param budget    the league's full FAAB budget
 * @param remaining this team's remaining budget, to cap the advice
 */
export function estimateFaab({ valuePct, history = [], budget = 100, remaining = null, band = 0.2 }) {
  const won = history.filter((h) => h.won);
  if (won.length < 3) {
    return { low: null, high: null, basis: 'insufficient-history', sampleSize: won.length, confidence: 'none' };
  }

  const bids = won.map((h) => h.bid).sort((a, b) => a - b);
  const pct = clamp(valuePct ?? 0.5, 0, 1);

  let low = percentile(bids, clamp(pct - band, 0, 1));
  let median = percentile(bids, pct);
  let high = percentile(bids, clamp(pct + band, 0, 1));

  // Bids that lost tell us what was not enough for a player of that standing.
  const lost = history.filter((h) => !h.won).map((h) => h.bid).sort((a, b) => a - b);
  if (lost.length) {
    const floor = percentile(lost, pct);
    if (floor != null && floor + 1 > low) {
      low = floor + 1;
      high = Math.max(high, low);
    }
  }

  const cap = remaining == null ? budget : Math.min(budget, remaining);
  low = clamp(Math.max(1, low), 0, cap);
  high = clamp(Math.max(high, low), 0, cap);
  median = clamp(median, low, high);

  const confidence = won.length >= 15 ? 'high' : won.length >= 6 ? 'medium' : 'low';
  return {
    low: r0(low),
    high: r0(high),
    median: r0(median),
    pctOfBudget: budget ? Number(((median / budget) * 100).toFixed(1)) : null,
    basis: 'league-history',
    sampleSize: won.length,
    observedRange: [bids[0], bids[bids.length - 1]],
    confidence,
    cappedByBudget: remaining != null && high >= cap && cap < budget,
  };
}
