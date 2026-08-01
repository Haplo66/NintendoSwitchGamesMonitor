import { FreeGame } from './free-game';
import { GameDeal } from './game-deal';

export interface NotificationReport {
  generatedAt: string;
  deals: GameDeal[];
  freeGames: FreeGame[];
}
