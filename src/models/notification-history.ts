export interface DealHistoryEntry {
  gameTitle: string;
  firstSeenOnSale: string;
  lastSeenOnSale: string;
  firstNotified?: string;
  lastNotified?: string;
  lastNotifiedPrice?: number;
  notificationCount: number;
  currentlyOnSale: boolean;
}

export interface DealHistory {
  entries: DealHistoryEntry[];
}
