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
  /**
   * Returns a `Game` with the current price info for every requested title
   * this collector monitors (matching catalog entries on the active platform),
   * regardless of whether the game is currently on sale. Full-price games are
   * returned with `currentPrice` set to the regular price so the digest can
   * always show how much a wishlist game costs today. Titles the collector
   * does not monitor are omitted. Implementations should reuse price
   * information already fetched for the run rather than re-requesting it.
   */
  collectWishlistPrices(titles: string[]): Promise<Game[]>;
}
