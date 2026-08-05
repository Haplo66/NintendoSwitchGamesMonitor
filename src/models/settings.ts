export interface DailyDigestSettings {
  maxBestDeals: number;
  maxWishlistAlerts: number;
  showStatistics: boolean;
  showPriceWatch: boolean;
}

export interface NotificationSettings {
  minimumDealScore: number;
  notificationCooldownDays: number;
  maxGamesPerEmail: number;
  notifyFreeGames: boolean;
  notifyWishlistMatches: boolean;
  defaultWishlistDiscountPercent: number;
  defaultNotifyOnAnyDiscount: boolean;
  sendEmptyDigest: boolean;
  dailyDigest: DailyDigestSettings;
  /** Titles of games that should never be analyzed, recommended, or notified
   * about. Matching is exact and case-insensitive on the normalized title. A
   * blacklisted game stays visible in Wishlist Watch only when explicitly on
   * the wishlist. */
  blacklistedGames: string[];
}

export type NintendoRegion = 'US';

export type NintendoPlatform = 'switch1' | 'switch2' | 'both';

export type EmailProviderKind = 'gmail' | 'mock';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface CollectorSettings {
  collectorKind: string;
  dealLimit: number;
  gameCatalogPath: string;
  dealsCurrency: string;
  nintendoRegion: NintendoRegion;
  platform: NintendoPlatform;
}

/**
 * Application/user preferences. These are user configuration, resolved from
 * `data/settings.json` and overridable by environment variables for CI or
 * temporary runs (precedence: environment > settings.json > defaults).
 */
export interface AppPreferences {
  platform: NintendoPlatform;
  emailProvider: EmailProviderKind;
  dryRun: boolean;
  forceEmail: boolean;
  logLevel: LogLevel;
}
