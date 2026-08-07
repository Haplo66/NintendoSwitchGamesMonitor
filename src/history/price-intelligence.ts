import { PriceObservation } from '../models';

export type PriceHistory = PriceObservation[];

/**
 * Lowest recorded price across a game's price history. Returns undefined when
 * the history is empty.
 */
export function getLowestPrice(history: PriceHistory): number | undefined {
  if (history.length === 0) {
    return undefined;
  }
  return history.reduce((lowest, observation) => Math.min(lowest, observation.price), history[0].price);
}

/**
 * Highest recorded price across a game's price history. Returns undefined when
 * the history is empty.
 */
export function getHighestPrice(history: PriceHistory): number | undefined {
  if (history.length === 0) {
    return undefined;
  }
  return history.reduce((highest, observation) => Math.max(highest, observation.price), history[0].price);
}

/**
 * Average recorded price across a game's price history. Returns undefined when
 * the history is empty; a single-price history averages to that price.
 */
export function getAveragePrice(history: PriceHistory): number | undefined {
  if (history.length === 0) {
    return undefined;
  }
  const sum = history.reduce((total, observation) => total + observation.price, 0);
  return sum / history.length;
}

/**
 * Whether the given current price is at or below the lowest price ever recorded.
 * Returns false when there is no history at all. A price tied with the previous
 * low still counts as the lowest recorded price.
 */
export function isLowestRecordedPrice(history: PriceHistory, currentPrice: number): boolean {
  if (history.length === 0) {
    return false;
  }
  const lowest = getLowestPrice(history) as number;
  return currentPrice <= lowest;
}

/**
 * Compact, renderer-friendly price context derived from a game's price history
 * and its current price. Used by the digest to answer "is this a good price?"
 * without duplicating history logic in the templates:
 *
 * - `isLowestRecorded`: the current price is the lowest ever seen (or tied).
 * - `previousLowest`: the lowest price strictly below the current one, useful
 *   as the "previous low" message when the current price is a new low.
 * - `lowestPrice`: the lowest price ever recorded (set only when the current
 *   price is NOT a new low, so the digest can say "Historical low: $X").
 */
export interface PriceContext {
  lowestPrice?: number;
  isLowestRecorded: boolean;
  previousLowest?: number;
}

export function getPriceContext(
  history: PriceHistory,
  currentPrice: number,
): PriceContext {
  if (history.length === 0) {
    return { isLowestRecorded: false };
  }
  const lowest = getLowestPrice(history) as number;
  if (currentPrice <= lowest) {
    // A strict new low carries the previous best price; a tie with the prior
    // low is not "new", so there is no previous low to report.
    const previousLowest = currentPrice < lowest ? lowest : undefined;
    return { isLowestRecorded: true, previousLowest };
  }
  return { lowestPrice: lowest, isLowestRecorded: false };
}