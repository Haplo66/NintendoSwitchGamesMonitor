import { Game } from '../models';

export interface CollectGamesOptions {
  limit?: number;
  currency?: string;
}

export interface GameCollector {
  collectGames(options?: CollectGamesOptions): Promise<Game[]>;
  /**
   * Titles of the games this collector is configured to monitor (i.e. the
   * ones price tracking is enabled for), regardless of whether they are
   * currently on sale. Used to distinguish wishlist games that are monitored
   * but full-price from ones that are not tracked at all.
   */
  monitoredTitles(): string[];
}
