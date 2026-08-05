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
}

export type NintendoRegion = 'US';

export type NintendoPlatform = 'switch1' | 'switch2' | 'both';

export type EmailProviderKind = 'gmail' | 'mock';

export type GameCollectorKind = 'mock' | 'nintendo';

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
 *
 * `dryRun` and `forceEmail` are deliberately NOT here: they are one-time
 * execution modes supplied per run via the command line (`npm run monitor -- --dry-run`)
 * or GitHub Actions inputs, never persistent configuration.
 */
export interface AppPreferences {
  platform: NintendoPlatform;
  emailProvider: EmailProviderKind;
  gameCollector: GameCollectorKind;
  logLevel: LogLevel;
  emailTo?: string;
}
