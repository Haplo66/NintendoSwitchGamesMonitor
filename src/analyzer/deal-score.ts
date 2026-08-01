import { DealScoreResult, Game } from '../models';

const MAX_DISCOUNT_CONTRIBUTION = 50;
const FREE_GAME_BONUS = 60;
const WISHLIST_MATCH_BONUS = 40;
const FAMILY_MATCH_BONUS = 10;

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
}

export function scoreDeal(input: DealScoreInput): DealScoreResult {
  const { game, familyMatchCount, wishlistMatched, priceTargetReached } = input;
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
    reasons.push(
      priceTargetReached ? 'On wishlist and price target reached' : 'On wishlist',
    );
  }

  if (familyMatchCount > 0) {
    score += FAMILY_MATCH_BONUS * familyMatchCount;
    reasons.push(`Matches ${familyMatchCount} family profile(s)`);
  }

  return { score, reasons };
}
