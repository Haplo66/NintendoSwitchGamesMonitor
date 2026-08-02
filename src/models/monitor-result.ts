import { GameAnalysis } from './game-analysis';

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
}
