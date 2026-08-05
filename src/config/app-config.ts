import { AppPreferences, Blacklist, CollectorSettings, FamilyProfile, NintendoPlatform, NotificationSettings, Wishlist } from '../models';
import { REGION_PROFILES, resolveNintendoRegion } from '../collectors/region';
import { DEFAULT_GAME_CATALOG_PATH } from '../collectors/nintendo-price-collector';
import { DEFAULT_NINTENDO_PLATFORM, resolveNintendoPlatform } from '../collectors/platform';
import { loadBlacklist } from './blacklist';
import { loadFamilyProfiles } from './family-profiles-loader';
import { parseEnvNumber } from './settings-loader';
import { resolveNotificationSettings } from './settings-loader';
import { loadAppPreferences } from './preferences';
import { loadWishlist } from './wishlist-loader';

export interface AppConfig {
  notification: NotificationSettings;
  collector: CollectorSettings;
  familyProfiles: FamilyProfile[];
  wishlist: Wishlist;
  blacklist: Blacklist;
  preferences: AppPreferences;
}

export interface LoadAppConfigOptions {
  settingsFile?: string;
  familyProfileFile?: string;
  wishlistFile?: string;
  blacklistFile?: string;
}

export const DEFAULT_COLLECTOR_SETTINGS: CollectorSettings = {
  collectorKind: 'mock',
  dealLimit: 100,
  gameCatalogPath: DEFAULT_GAME_CATALOG_PATH,
  dealsCurrency: REGION_PROFILES.US.currency,
  nintendoRegion: 'US',
  platform: DEFAULT_NINTENDO_PLATFORM,
};

export function resolveCollectorSettings(
  env: NodeJS.ProcessEnv = process.env,
  platform?: NintendoPlatform,
): CollectorSettings {
  const nintendoRegion = resolveNintendoRegion(env);
  const regionProfile = REGION_PROFILES[nintendoRegion];
  return {
    collectorKind:
      env.GAME_COLLECTOR?.trim().toLowerCase() || DEFAULT_COLLECTOR_SETTINGS.collectorKind,
    dealLimit:
      parseEnvNumber('DEALS_LIMIT', env.DEALS_LIMIT) ?? DEFAULT_COLLECTOR_SETTINGS.dealLimit,
    gameCatalogPath: env.GAME_CATALOG?.trim() || DEFAULT_GAME_CATALOG_PATH,
    dealsCurrency: env.DEALS_CURRENCY?.trim() || regionProfile.currency,
    nintendoRegion,
    platform: platform ?? resolveNintendoPlatform(env),
  };
}

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const preferences = loadAppPreferences(process.env, options.settingsFile);
  const notification = resolveNotificationSettings(process.env);
  return {
    notification,
    collector: resolveCollectorSettings(process.env, preferences.platform),
    familyProfiles: loadFamilyProfiles(options.familyProfileFile),
    wishlist: loadWishlist(options.wishlistFile, {
      defaultNotifyOnAnyDiscount: notification.defaultNotifyOnAnyDiscount,
    }),
    blacklist: loadBlacklist(options.blacklistFile),
    preferences,
  };
}