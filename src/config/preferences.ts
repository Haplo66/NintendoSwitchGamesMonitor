import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type AppPreferences,
  type EmailProviderKind,
  type GameCollectorKind,
  type LogLevel,
  type NintendoPlatform,
} from '../models/settings';
import { normalizeNintendoPlatform } from '../collectors/platform';
import { ConfigError } from './json-loader';

export const SUPPORTED_EMAIL_PROVIDERS: readonly EmailProviderKind[] = ['gmail', 'mock'];
export const SUPPORTED_GAME_COLLECTORS: readonly GameCollectorKind[] = ['mock', 'nintendo'];
export const SUPPORTED_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  platform: 'switch1',
  emailProvider: 'gmail',
  gameCollector: 'mock',
  logLevel: 'info',
  emailTo: undefined,
};

export function defaultSettingsFile(): string {
  return path.resolve(process.cwd(), 'data', 'settings.json');
}

export function normalizeEmailProvider(raw: string): EmailProviderKind {
  const provider = raw.trim().toLowerCase() as EmailProviderKind;
  if (!SUPPORTED_EMAIL_PROVIDERS.includes(provider)) {
    throw new Error(
      `Illegal email provider "${raw}". Expected one of: ${SUPPORTED_EMAIL_PROVIDERS.join(', ')}.`,
    );
  }
  return provider;
}

export function normalizeGameCollector(raw: string): GameCollectorKind {
  const collector = raw.trim().toLowerCase() as GameCollectorKind;
  if (!SUPPORTED_GAME_COLLECTORS.includes(collector)) {
    throw new Error(
      `Illegal game collector "${raw}". Expected one of: ${SUPPORTED_GAME_COLLECTORS.join(', ')}.`,
    );
  }
  return collector;
}

export function normalizeLogLevel(raw: string): LogLevel {
  const level = raw.trim().toLowerCase() as LogLevel;
  if (!SUPPORTED_LOG_LEVELS.includes(level)) {
    throw new Error(`Illegal log level "${raw}". Expected one of: ${SUPPORTED_LOG_LEVELS.join(', ')}.`);
  }
  return level;
}

/** Validates the user-preference keys read from `data/settings.json`. */
export function validateAppPreferences(settings: unknown): string[] {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return ['settings must be a JSON object'];
  }
  const value = settings as Record<string, unknown>;
  const errors: string[] = [];
  if (value.platform !== undefined && typeof value.platform !== 'string') {
    errors.push('platform must be a string');
  }
  if (value.emailProvider !== undefined && typeof value.emailProvider !== 'string') {
    errors.push('emailProvider must be a string');
  }
  if (value.gameCollector !== undefined && typeof value.gameCollector !== 'string') {
    errors.push('gameCollector must be a string');
  }
  if (value.logLevel !== undefined && typeof value.logLevel !== 'string') {
    errors.push('logLevel must be a string');
  }
  if (value.emailTo !== undefined && typeof value.emailTo !== 'string') {
    errors.push('emailTo must be a string');
  }
  return errors;
}

/**
 * Loads the user-preferences portion of `data/settings.json` (platform,
 * emailProvider, gameCollector, logLevel, emailTo) without disturbing the
 * notification settings that share the same file. Precedence is:
 * environment variable > settings.json > built-in default.
 *
 * `dryRun` / `forceDigestEmail` are execution modes, not preferences: they are
 * supplied per run via the command line or GitHub Actions inputs and never
 * read from `settings.json`.
 */
export function loadAppPreferences(
  env: NodeJS.ProcessEnv = process.env,
  filePath?: string,
): AppPreferences {
  const resolvedPath = filePath ?? defaultSettingsFile();
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(resolvedPath)) {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch (error) {
      throw new ConfigError(
        `Malformed JSON in settings file "${resolvedPath}": ${(error as Error).message}`,
      );
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new ConfigError(`Settings file must contain a JSON object: "${resolvedPath}"`);
    }
    raw = data as Record<string, unknown>;
    const errors = validateAppPreferences(raw);
    if (errors.length > 0) {
      throw new ConfigError(`Invalid preferences in "${resolvedPath}": ${errors.join('; ')}`);
    }
  }

  const resolvePlatform = (): NintendoPlatform => {
    const envRaw = env.NINTENDO_PLATFORM?.trim();
    if (envRaw) {
      return normalizeNintendoPlatform(envRaw);
    }
    if (typeof raw.platform === 'string' && raw.platform.trim()) {
      try {
        return normalizeNintendoPlatform(raw.platform);
      } catch (error) {
        throw new ConfigError(`Invalid preferences in "${resolvedPath}": ${(error as Error).message}`);
      }
    }
    return DEFAULT_APP_PREFERENCES.platform;
  };

  const resolveEmailProvider = (): EmailProviderKind => {
    const envRaw = env.EMAIL_PROVIDER?.trim();
    if (envRaw) {
      return normalizeEmailProvider(envRaw);
    }
    if (typeof raw.emailProvider === 'string' && raw.emailProvider.trim()) {
      try {
        return normalizeEmailProvider(raw.emailProvider);
      } catch (error) {
        throw new ConfigError(`Invalid preferences in "${resolvedPath}": ${(error as Error).message}`);
      }
    }
    return DEFAULT_APP_PREFERENCES.emailProvider;
  };

  const resolveGameCollector = (): GameCollectorKind => {
    const envRaw = env.GAME_COLLECTOR?.trim();
    if (envRaw) {
      return normalizeGameCollector(envRaw);
    }
    if (typeof raw.gameCollector === 'string' && raw.gameCollector.trim()) {
      try {
        return normalizeGameCollector(raw.gameCollector);
      } catch (error) {
        throw new ConfigError(`Invalid preferences in "${resolvedPath}": ${(error as Error).message}`);
      }
    }
    return DEFAULT_APP_PREFERENCES.gameCollector;
  };

  const resolveLogLevel = (): LogLevel => {
    const envRaw = env.LOG_LEVEL?.trim();
    if (envRaw) {
      return normalizeLogLevel(envRaw);
    }
    if (typeof raw.logLevel === 'string' && raw.logLevel.trim()) {
      try {
        return normalizeLogLevel(raw.logLevel);
      } catch (error) {
        throw new ConfigError(`Invalid preferences in "${resolvedPath}": ${(error as Error).message}`);
      }
    }
    return DEFAULT_APP_PREFERENCES.logLevel;
  };

  // The digest recipient comes only from `data/settings.json` (`emailTo`) and
  // falls back to the sender (`SMTP_USER`) inside the provider. There is no
  // recipient environment variable anywhere in the pipeline.
  const resolveEmailTo = (): string | undefined => {
    if (typeof raw.emailTo === 'string' && raw.emailTo.trim()) {
      return raw.emailTo.trim();
    }
    return undefined;
  };

  return {
    platform: resolvePlatform(),
    emailProvider: resolveEmailProvider(),
    gameCollector: resolveGameCollector(),
    logLevel: resolveLogLevel(),
    emailTo: resolveEmailTo(),
  };
}
