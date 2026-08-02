import * as fs from 'node:fs';
import * as path from 'node:path';

import { NotificationSettings } from '../models/settings';
import { ConfigError } from './json-loader';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  minimumDealScore: 80,
  notificationCooldownDays: 14,
  maxGamesPerEmail: 10,
  notifyFreeGames: true,
  notifyWishlistMatches: true,
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

  checkNumber('minimumDealScore', 0, false);
  checkNumber('notificationCooldownDays', 0, false);
  checkNumber('maxGamesPerEmail', 1, true);
  checkBoolean('notifyFreeGames');
  checkBoolean('notifyWishlistMatches');
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

  const merged: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(data as Partial<NotificationSettings>),
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
  };

  const errors = validateNotificationSettings(settings);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid resolved notification settings: ${errors.join('; ')}`);
  }
  return settings;
}
