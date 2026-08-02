import { FreeGame } from './free-game';
import { GameDeal } from './game-deal';

export interface NotificationReportSummary {
  gamesChecked: number;
  gamesMatched: number;
  gamesSkippedByCooldown: number;
  gamesReported: number;
}

export interface NotificationReport {
  generatedAt: string;
  summary: NotificationReportSummary;
  deals: GameDeal[];
  freeGames: FreeGame[];
}
