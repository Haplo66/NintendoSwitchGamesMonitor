import { DealHistory } from './notification-history';
import { Wishlist } from './wishlist';
import { GameAnalysis } from './game-analysis';
import { Game } from './game';

export interface MonitorResult {
  generatedAt: string;
  collector: string;
  currency: string;
  minDealScore: number;
  defaultWishlistDiscountPercent: number;
  executionTimeMs: number;
  analyzedCount: number;
  potentialMatchCount: number;
  reportedCount: number;
  skippedByCooldownCount: number;
  analyses: GameAnalysis[];
  reportedAnalyses: GameAnalysis[];
  skippedByCooldownAnalyses: GameAnalysis[];
  skippedByScoreAnalyses: GameAnalysis[];
  dealHistory: DealHistory;
  wishlist: Wishlist;
  monitoredTitles: string[];
  /** Current price info for monitored wishlist games not already price-checked
   * as part of deal discovery (i.e. full-price ones), so Wishlist Watch can
   * always show today's price even when a game is not discounted. */
  wishlistGames: Game[];
}
