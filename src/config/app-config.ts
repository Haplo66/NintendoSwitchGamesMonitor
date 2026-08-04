import { CollectorSettings, FamilyProfile, NotificationSettings, Wishlist } from '../models';
import { REGION_PROFILES, resolveNintendoRegion } from '../collectors/region';
import { loadFamilyProfiles } from './family-profiles-loader';
import { parseEnvNumber } from './settings-loader';
import { resolveNotificationSettings } from './settings-loader';
import { loadWishlist } from './wishlist-loader';

export interface AppConfig {
  notification: NotificationSettings;
  collector: CollectorSettings;
  familyProfiles: FamilyProfile[];
  wishlist: Wishlist;
}

export interface LoadAppConfigOptions {
  settingsFile?: string;
  familyProfileFile?: string;
  wishlistFile?: string;
}

export const DEFAULT_COLLECTOR_SETTINGS: CollectorSettings = {
  collectorKind: 'mock',
  dealLimit: 100,
  dealsSourceUrl: REGION_PROFILES.US.sourceUrl,
  dealsCurrency: REGION_PROFILES.US.currency,
  nintendoRegion: 'US',
};

export function resolveCollectorSettings(env: NodeJS.ProcessEnv = process.env): CollectorSettings {
  const nintendoRegion = resolveNintendoRegion(env);
  const regionProfile = REGION_PROFILES[nintendoRegion];
  return {
    collectorKind:
      env.GAME_COLLECTOR?.trim().toLowerCase() || DEFAULT_COLLECTOR_SETTINGS.collectorKind,
    dealLimit:
      parseEnvNumber('DEALS_LIMIT', env.DEALS_LIMIT) ?? DEFAULT_COLLECTOR_SETTINGS.dealLimit,
    dealsSourceUrl: env.DEALS_SOURCE_URL?.trim() || regionProfile.sourceUrl,
    dealsCurrency: env.DEALS_CURRENCY?.trim() || regionProfile.currency,
    nintendoRegion,
  };
}

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const notification = resolveNotificationSettings(process.env);
  return {
    notification,
    collector: resolveCollectorSettings(process.env),
    familyProfiles: loadFamilyProfiles(options.familyProfileFile),
    wishlist: loadWishlist(options.wishlistFile, {
      defaultNotifyOnAnyDiscount: notification.defaultNotifyOnAnyDiscount,
    }),
  };
}
