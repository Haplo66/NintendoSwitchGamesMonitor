import 'dotenv/config';

import { calculateDiscountPercent, applyHistoricalLowScore } from './deal-score';
import { displayScore } from './deal-score';
import { getPriceContext } from '../history/price-intelligence';
import { GameAnalysis, MonitorResult } from '../models';
import { runMonitor } from '../pipeline/monitor-run';
import { buildDailyDigest } from '../notifications/daily-digest-builder';

// Keep these in sync with the scoring constants in deal-score.ts. This script is
// purely diagnostic: it reconstructs the per-bonus contribution so we can see
// where a game's score comes from and why so many Best Deals hit 100.
const MAX_DISCOUNT_CONTRIBUTION = 50;
const FREE_GAME_BONUS = 60;
const WISHLIST_MATCH_BONUS = 40;
const PRICE_TARGET_REACHED_BONUS = 20;
const FAMILY_MATCH_BONUS = 2;
const HISTORICAL_LOW_BONUS = 15;

interface Breakdown {
  discountPercent: number;
  discountPoints: number;
  freeGamePoints: number;
  wishlistPoints: number;
  targetReachedPoints: number;
  historicalLowPoints: number;
  familyPoints: number;
  baseScore: number;
  rawScore: number;
}

function isAtHistoricalLow(result: MonitorResult, game: GameAnalysis['game']): boolean {
  const key = game.title.trim().toLowerCase();
  const entry = result.dealHistory.entries.find(
    (candidate) => candidate.gameTitle.trim().toLowerCase() === key,
  );
  if (!entry || !entry.priceHistory || entry.priceHistory.length === 0) {
    return false;
  }
  return getPriceContext(entry.priceHistory, game.currentPrice).isLowestRecorded ?? false;
}

function breakdownFor(analysis: GameAnalysis, result: MonitorResult): Breakdown {
  const game = analysis.game;
  const discountPercent = calculateDiscountPercent(game);
  const discountPoints = Math.min(discountPercent, MAX_DISCOUNT_CONTRIBUTION);
  const freeGamePoints = game.currentPrice === 0 ? FREE_GAME_BONUS : 0;
  const wishlistPoints = analysis.wishlistMatch?.matched ? WISHLIST_MATCH_BONUS : 0;
  const targetReachedPoints = analysis.wishlistMatch?.priceTargetReached
    ? PRICE_TARGET_REACHED_BONUS
    : 0;
  const historicalLowPoints = isAtHistoricalLow(result, game) ? HISTORICAL_LOW_BONUS : 0;
  const familyPoints =
    analysis.familyMatches.filter((match) => match.matched).length * FAMILY_MATCH_BONUS;

  const baseScore =
    discountPoints + freeGamePoints + wishlistPoints + targetReachedPoints + familyPoints;
  const rawScore = baseScore + historicalLowPoints;

  return {
    discountPercent,
    discountPoints,
    freeGamePoints,
    wishlistPoints,
    targetReachedPoints,
    historicalLowPoints,
    familyPoints,
    baseScore,
    rawScore,
  };
}

async function main(): Promise<void> {
  // Force history off so every reported game lands in the digest, and lift the
  // per-email cap so we inspect the full reporting set.
  const { result } = await runMonitor({
    collectorKind: 'mock',
    emailProviderKind: 'mock',
    ignoreNotificationHistory: true,
    maxTotalDigestGames: 100,
  });

  const digest = buildDailyDigest(result, {
    maxBestDeals: 100,
    maxHistoricalLows: 100,
    maxWishlistAlerts: 100,
  });

  const bestDealByTitle = new Map(digest.bestDeals.map((deal) => [deal.title, deal]));
  const rows = result.reportedAnalyses.map((analysis) => {
    const b = breakdownFor(analysis, result);
    const bestDeal = bestDealByTitle.get(analysis.game.title);
    const digestScore = bestDeal ? bestDeal.score : undefined;
    const sanity = applyHistoricalLowScore(analysis.dealScore, isAtHistoricalLow(result, analysis.game));
    return { analysis, b, bestDeal, digestScore, sanity };
  });

  rows.sort((x, y) => y.b.rawScore - x.b.rawScore);

  console.log('\n=== Raw deal score distribution (reported games, before displayScore) ===\n');
  console.log(
    'Title'.padEnd(38) +
      'disc%'.padEnd(6) +
      'disc'.padEnd(5) +
      'free'.padEnd(5) +
      'wish'.padEnd(5) +
      'tgt'.padEnd(5) +
      'hilo'.padEnd(5) +
      'fam'.padEnd(5) +
      'raw'.padEnd(6) +
      'disp'.padEnd(5) +
      'inBest',
  );
  for (const { analysis, b, bestDeal, digestScore } of rows) {
    const inBest = bestDeal ? 'yes' : 'no';
    const scoreToShow = digestScore ?? b.rawScore;
    const title = analysis.game.title.slice(0, 37);
    console.log(
      title.padEnd(38) +
        String(b.discountPercent).padEnd(6) +
        String(b.discountPoints).padEnd(5) +
        String(b.freeGamePoints).padEnd(5) +
        String(b.wishlistPoints).padEnd(5) +
        String(b.targetReachedPoints).padEnd(5) +
        String(b.historicalLowPoints).padEnd(5) +
        String(b.familyPoints).padEnd(5) +
        String(scoreToShow).padEnd(6) +
        String(displayScore(scoreToShow)).padEnd(5) +
        inBest,
    );
  }

  const rawScores = rows.map((r) => r.digestScore ?? r.b.rawScore);
  const over100 = rawScores.filter((s) => s > 100).length;
  const at100 = rawScores.filter((s) => s === 100).length;
  const capped = rawScores.map(displayScore).filter((s) => s === 100).length;
  const avg = rawScores.length ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length : 0;

  console.log('\n=== Summary ===');
  console.log(`Reported games: ${rows.length}`);
  console.log(`Raw scores > 100: ${over100} (${rawScores.length ? Math.round((over100 / rawScores.length) * 100) : 0}%)`);
  console.log(`Raw scores == 100: ${at100}`);
  console.log(`Displayed as 100 after cap: ${capped} (${rawScores.length ? Math.round((capped / rawScores.length) * 100) : 0}%)`);
  console.log(`Mean raw score: ${avg.toFixed(1)}`);

  console.log('\n=== Where the points come from (sums across reported games) ===');
  const sum = (fn: (r: typeof rows[number]) => number) =>
    rows.reduce((acc, r) => acc + fn(r), 0);
  console.log(`Discount points total:     ${sum((r) => r.b.discountPoints)}`);
  console.log(`Free-game points total:    ${sum((r) => r.b.freeGamePoints)}`);
  console.log(`Wishlist points total:     ${sum((r) => r.b.wishlistPoints)}`);
  console.log(`Target-reached total:      ${sum((r) => r.b.targetReachedPoints)}`);
  console.log(`Historical-low total:      ${sum((r) => r.b.historicalLowPoints)}`);
  console.log(`Family-match points total: ${sum((r) => r.b.familyPoints)}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Scoring analysis failed:', error);
    process.exitCode = 1;
  });
}
