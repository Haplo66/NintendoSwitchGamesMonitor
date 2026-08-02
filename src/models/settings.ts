export interface NotificationSettings {
  minimumDealScore: number;
  notificationCooldownDays: number;
  maxGamesPerEmail: number;
  notifyFreeGames: boolean;
  notifyWishlistMatches: boolean;
  defaultWishlistDiscountPercent: number;
  defaultNotifyOnAnyDiscount: boolean;
}

export interface CollectorSettings {
  collectorKind: string;
  dealLimit: number;
  dealsSourceUrl: string;
  dealsCurrency: string;
}
