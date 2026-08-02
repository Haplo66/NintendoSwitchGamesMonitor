import { GameAnalysis } from './game-analysis';

export interface MonitorResult {
  generatedAt: string;
  collector: string;
  minDealScore: number;
  defaultWishlistDiscountPercent: number;
  analyzedCount: number;
  reportedCount: number;
  skippedByCooldownCount: number;
  analyses: GameAnalysis[];
  reportedAnalyses: GameAnalysis[];
  skippedByCooldownAnalyses: GameAnalysis[];
  skippedByScoreAnalyses: GameAnalysis[];
}
