import { PriceObservation } from '../models';
import { getAveragePrice, getLowestPrice } from './price-intelligence';

/**
 * Everything the deal-quality evaluation needs. `originalPrice` and
 * `discountPercent` are carried through for completeness so the rules could use
 * them in the future; the current deterministic rules are driven by the current
 * price relative to the recorded sale-price history.
 */
export interface DealQualityInput {
  currentPrice: number;
  originalPrice: number;
  discountPercent: number;
  priceHistory: PriceObservation[];
}

export type DealQualityRating = 'excellent' | 'great' | 'good' | 'weak';

export interface DealQuality {
  rating: DealQualityRating;
  reason: string;
}

/** A price within this fraction of the historical low counts as "near lowest". */
export const GREAT_THRESHOLD = 1.1;

/**
 * Evaluates how good a deal is relative to the game's recorded sale-price
 * history. Purely informational and deterministic:
 *
 * - `excellent` — the current price is the lowest (or tied lowest) recorded.
 * - `great` — the current price is within ~10% of the historical low.
 * - `good` — the current price is below the average historical sale price.
 * - `weak` — the current price is at or above the average historical sale price.
 *
 * Returns `undefined` when there is not enough history to judge (empty history),
 * so callers can avoid showing any quality badge.
 */
export function evaluateDealQuality(input: DealQualityInput): DealQuality | undefined {
  if (!Array.isArray(input.priceHistory) || input.priceHistory.length === 0) {
    return undefined;
  }

  const lowest = getLowestPrice(input.priceHistory);
  if (lowest === undefined) {
    return undefined;
  }

  if (input.currentPrice <= lowest) {
    return { rating: 'excellent', reason: 'At its historical low' };
  }
  if (input.currentPrice <= lowest * GREAT_THRESHOLD) {
    return { rating: 'great', reason: 'Near its historical low' };
  }

  const average = getAveragePrice(input.priceHistory);
  if (average === undefined) {
    return undefined;
  }
  if (input.currentPrice < average) {
    return { rating: 'good', reason: 'Below average sale price' };
  }
  return { rating: 'weak', reason: 'Usually cheaper' };
}