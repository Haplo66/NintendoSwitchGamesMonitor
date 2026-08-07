import { DealScoreResult, Game } from '../models';

const MAX_DISCOUNT_CONTRIBUTION = 50;
const FREE_GAME_BONUS = 60;
const WISHLIST_MATCH_BONUS = 40;
const PRICE_TARGET_REACHED_BONUS = 20;
const FAMILY_MATCH_BONUS = 10;
const HISTORICAL_LOW_BONUS = 15;

/**
 * The highest user-facing score shown to readers. Internal scoring may exceed
 * this so that high-value deals (wishlist, target reached, historical low)
 * keep their ranking advantage; the display is clamped to this value so scores
 * read like a percentage and stay intuitive.
 */
export const MAX_DISPLAY_SCORE = 100;

/**
 * Clamps an internal deal score to the user-facing display maximum. The raw
 * score is unchanged and still used for ranking.
 */
export function displayScore(score: number): number {
  return Math.min(score, MAX_DISPLAY_SCORE);
}

export function calculateDiscountPercent(game: Game): number {
  if (game.originalPrice === undefined || game.originalPrice <= 0) {
    return 0;
  }
  return Math.round(((game.originalPrice - game.currentPrice) / game.originalPrice) * 100);
}

export interface DealScoreInput {
  game: Game;
  familyMatchCount: number;
  wishlistMatched: boolean;
  priceTargetReached: boolean;
  /** Current price is at or below the lowest price ever recorded for the game.
   * Analysis does not know the price history, so this is set at digest build
   * time when the historical data is available. */
  historicalLowReached: boolean;
}

export function scoreDeal(input: DealScoreInput): DealScoreResult {
  const { game, familyMatchCount, wishlistMatched, priceTargetReached, historicalLowReached } = input;
  const reasons: string[] = [];
  let score = 0;

  const discount = calculateDiscountPercent(game);
  if (discount > 0) {
    score += Math.min(discount, MAX_DISCOUNT_CONTRIBUTION);
    reasons.push(`${discount}% discount`);
  }

  if (game.currentPrice === 0) {
    score += FREE_GAME_BONUS;
    reasons.push('Free game');
  }

  if (wishlistMatched) {
    score += WISHLIST_MATCH_BONUS;
    reasons.push('On wishlist');
  }

  if (priceTargetReached) {
    score += PRICE_TARGET_REACHED_BONUS;
    reasons.push('Price target reached');
  }

  if (historicalLowReached) {
    score += HISTORICAL_LOW_BONUS;
    reasons.push('At its historical low');
  }

  if (familyMatchCount > 0) {
    score += FAMILY_MATCH_BONUS * familyMatchCount;
    reasons.push(`Matches ${familyMatchCount} family profile(s)`);
  }

  return { score, reasons };
}

/**
 * Adds the historical-low bonus to a deal score that was computed before the
 * historical data was known (e.g. by the analyzer). Used by the digest builder
 * to reflect historical-low status in Best Deals ranking without double-
 * counting when the analyzer already knew about it. Returns the base result
 * unchanged when the bonus does not apply.
 */
export function applyHistoricalLowScore(
  base: DealScoreResult,
  historicalLowReached: boolean,
): DealScoreResult {
  if (!historicalLowReached) {
    return base;
  }
  if (base.reasons.some((reason) => reason.includes('historical low'))) {
    return base;
  }
  return {
    score: base.score + HISTORICAL_LOW_BONUS,
    reasons: [...base.reasons, 'At its historical low'],
  };
}