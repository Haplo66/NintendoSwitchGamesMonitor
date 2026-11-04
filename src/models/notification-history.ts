export interface PriceObservation {
  date: string;
  price: number;
}

export interface DealHistoryEntry {
  gameTitle: string;
  firstSeenOnSale: string;
  lastSeenOnSale: string;
  firstNotified?: string;
  lastNotified?: string;
  lastNotifiedPrice?: number;
  notificationCount: number;
  currentlyOnSale: boolean;
  /**
   * Ordered observations of the game's sale price over time. Only meaningful
   * changes are recorded: the first time a game is seen on sale, a sale price
   * change, or a sale starting again at a different price. Identical unchanged
   * prices are never appended. `date` is the ISO day (YYYY-MM-DD).
   */
  priceHistory?: PriceObservation[];
  /** Dates/sections in which this game was present in a delivered digest. */
  exposureHistory?: Array<{ date: string; sections: string[] }>;
}

export interface DealHistory {
  entries: DealHistoryEntry[];
}
