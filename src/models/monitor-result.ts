import { GameAnalysis } from './game-analysis';

export interface MonitorResult {
  generatedAt: string;
  collector: string;
  minDealScore: number;
  analyzedCount: number;
  reportedCount: number;
  skippedByCooldownCount: number;
  analyses: GameAnalysis[];
}
