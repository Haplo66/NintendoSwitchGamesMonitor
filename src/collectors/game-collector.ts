import { Game } from '../models';

export interface CollectGamesOptions {
  limit?: number;
  currency?: string;
}

export interface GameCollector {
  collectGames(options?: CollectGamesOptions): Promise<Game[]>;
}
