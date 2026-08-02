import * as fs from 'node:fs';
import * as path from 'node:path';

import { NotificationSettings, DailyDigestSettings } from '../models/settings';
import { ConfigError } from './json-loader';

export const DEFAULT_DAILY_DIGEST_SETTINGS: DailyDigestSettings = {
  maxBestDeals: 5,
  maxWishlistAlerts: 10,
  showStatistics: true,
  showPriceWatch: true,
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  minimumDealScore: 80,
  notificationCooldownDays: 14,
  maxGamesPerEmail: 10,
  notifyFreeGames: true,
  notifyWishlistMatches: true,
  defaultWishlistDiscountPercent: 40,
  defaultNotifyOnAnyDiscount: false,
  dailyDigest: { ...DEFAULT_DAILY_DIGEST_SETTINGS },
};

export function defaultSettingsFile(): string {
  return path.resolve(process.cwd(), 'data', 'settings.json');
}

export function validateNotificationSettings(settings: unknown): string[] {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return ['settings must be a JSON object'];
  }
  const value = settings as Record<string, unknown>;
  const errors: string[] = [];

  const checkNumber = (key: string, minimum: number, integer: boolean): void => {
    const v = value[key];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < minimum ||
      (integer && !Number.isInteger(v))
    ) {
      errors.push(`${key} must be a ${integer ? 'whole ' : ''}number >= ${minimum}`);
    }
  };
  const checkBoolean = (key: string): void => {
    if (typeof value[key] !== 'boolean') {
      errors.push(`${key} must be a boolean`);
    }
  };
  const checkRange = (key: string, minimum: number, maximum: number, integer: boolean): void => {
    const v = value[key];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < minimum ||
      v > maximum ||
      (integer && !Number.isInteger(v))
    ) {
      errors.push(`${key} must be a ${integer ? 'whole ' : ''}number between ${minimum} and ${maximum}`);
    }
  };

  checkNumber('minimumDealScore', 0, false);
  checkNumber('notificationCooldownDays', 0, false);
  checkNumber('maxGamesPerEmail', 1, true);
  checkBoolean('notifyFreeGames');
  checkBoolean('notifyWishlistMatches');
  checkRange('defaultWishlistDiscountPercent', 1, 99, true);
  checkBoolean('defaultNotifyOnAnyDiscount');

  const digest = value.dailyDigest;
  if (digest !== undefined) {
    if (digest === null || typeof digest !== 'object' || Array.isArray(digest)) {
      errors.push('dailyDigest must be a JSON object');
    } else {
      const checkDigestNumber = (key: string, minimum: number, integer: boolean): void => {
        const v = (digest as Record<string, unknown>)[key];
        if (
          typeof v !== 'number' ||
          !Number.isFinite(v) ||
          v < minimum ||
          (integer && !Number.isInteger(v))
        ) {
          errors.push(`dailyDigest.${key} must be a ${integer ? 'whole ' : ''}number >= ${minimum}`);
        }
      };
      const checkDigestBoolean = (key: string): void => {
        if (typeof (digest as Record<string, unknown>)[key] !== 'boolean') {
          errors.push(`dailyDigest.${key} must be a boolean`);
        }
      };
      checkDigestNumber('maxBestDeals', 1, true);
      checkDigestNumber('maxWishlistAlerts', 1, true);
      checkDigestBoolean('showStatistics');
      checkDigestBoolean('showPriceWatch');
    }
  }

  return errors;
}

export function loadNotificationSettings(filePath?: string): NotificationSettings {
  const resolved = filePath ?? defaultSettingsFile();
  if (!fs.existsSync(resolved)) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new ConfigError(
      `Malformed JSON in settings file "${resolved}": ${(error as Error).message}`,
    );
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`Settings file must contain a JSON object: "${resolved}"`);
  }

  const raw = data as Record<string, unknown>;
  const rawDigest = raw.dailyDigest;
  let mergedDailyDigest: DailyDigestSettings;
  if (rawDigest === undefined || rawDigest === null) {
    mergedDailyDigest = { ...DEFAULT_DAILY_DIGEST_SETTINGS };
  } else if (typeof rawDigest === 'object' && !Array.isArray(rawDigest)) {
    mergedDailyDigest = {
      ...DEFAULT_DAILY_DIGEST_SETTINGS,
      ...(rawDigest as Partial<DailyDigestSettings>),
    };
  } else {
    mergedDailyDigest = rawDigest as unknown as DailyDigestSettings;
  }

  const merged: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(raw as Partial<NotificationSettings>),
    dailyDigest: mergedDailyDigest,
  };

  const errors = validateNotificationSettings(merged);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid settings in "${resolved}": ${errors.join('; ')}`);
  }
  return merged;
}

export function parseEnvNumber(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new ConfigError(`${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

export function parseEnvBoolean(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new ConfigError(`${name} must be "true" or "false", got "${raw}"`);
}

export function resolveNotificationSettings(
  env: NodeJS.ProcessEnv = process.env,
): NotificationSettings {
  const base = loadNotificationSettings();
  const settings: NotificationSettings = {
    minimumDealScore: parseEnvNumber('MIN_DEAL_SCORE', env.MIN_DEAL_SCORE) ?? base.minimumDealScore,
    notificationCooldownDays:
      parseEnvNumber('NOTIFICATION_COOLDOWN_DAYS', env.NOTIFICATION_COOLDOWN_DAYS) ??
      base.notificationCooldownDays,
    maxGamesPerEmail:
      parseEnvNumber('MAX_GAMES_PER_EMAIL', env.MAX_GAMES_PER_EMAIL) ?? base.maxGamesPerEmail,
    notifyFreeGames: parseEnvBoolean('NOTIFY_FREE_GAMES', env.NOTIFY_FREE_GAMES) ?? base.notifyFreeGames,
    notifyWishlistMatches:
      parseEnvBoolean('NOTIFY_WISHLIST_MATCHES', env.NOTIFY_WISHLIST_MATCHES) ??
      base.notifyWishlistMatches,
    defaultWishlistDiscountPercent:
      parseEnvNumber('DEFAULT_WISHLIST_DISCOUNT_PERCENT', env.DEFAULT_WISHLIST_DISCOUNT_PERCENT) ??
      base.defaultWishlistDiscountPercent,
    defaultNotifyOnAnyDiscount:
      parseEnvBoolean('DEFAULT_NOTIFY_ON_ANY_DISCOUNT', env.DEFAULT_NOTIFY_ON_ANY_DISCOUNT) ??
      base.defaultNotifyOnAnyDiscount,
    dailyDigest: { ...base.dailyDigest },
  };

  const errors = validateNotificationSettings(settings);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid resolved notification settings: ${errors.join('; ')}`);
  }
  return settings;
}
