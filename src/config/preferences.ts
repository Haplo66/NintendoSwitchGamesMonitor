import * as fs from 'node:fs';
import * as path from 'node:path';

import { type AppPreferences, type EmailProviderKind, type LogLevel, type NintendoPlatform } from '../models/settings';
import { normalizeNintendoPlatform } from '../collectors/platform';
import { ConfigError } from './json-loader';
import { parseEnvBoolean } from './settings-loader';

export const SUPPORTED_EMAIL_PROVIDERS: readonly EmailProviderKind[] = ['gmail', 'mock'];
export const SUPPORTED_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  platform: 'switch1',
  emailProvider: 'gmail',
  dryRun: false,
  forceEmail: false,
  logLevel: 'info',
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

export function normalizeLogLevel(raw: string): LogLevel {
  const level = raw.trim().toLowerCase() as LogLevel;
  if (!SUPPORTED_LOG_LEVELS.includes(level)) {
    throw new Error(`Illegal log level "${raw}". Expected one of: ${SUPPORTED_LOG_LEVELS.join(', ')}.`);
  }
  return level;
}

/** Validates the five user-preference keys read from `data/settings.json`. */
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
  if (value.dryRun !== undefined && typeof value.dryRun !== 'boolean') {
    errors.push('dryRun must be a boolean');
  }
  if (value.forceEmail !== undefined && typeof value.forceEmail !== 'boolean') {
    errors.push('forceEmail must be a boolean');
  }
  if (value.logLevel !== undefined && typeof value.logLevel !== 'string') {
    errors.push('logLevel must be a string');
  }
  return errors;
}

function resolveBoolean(
  env: NodeJS.ProcessEnv,
  envName: string,
  fileValue: unknown,
  fallback: boolean,
): boolean {
  const fromEnv = parseEnvBoolean(envName, env[envName]);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return typeof fileValue === 'boolean' ? fileValue : fallback;
}

/**
 * Loads the user-preferences portion of `data/settings.json` (platform,
 * emailProvider, dryRun, forceEmail, logLevel) without disturbing the
 * notification settings that share the same file. Precedence is:
 * environment variable > settings.json > built-in default.
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

  return {
    platform: resolvePlatform(),
    emailProvider: resolveEmailProvider(),
    dryRun: resolveBoolean(env, 'DRY_RUN', raw.dryRun, DEFAULT_APP_PREFERENCES.dryRun),
    forceEmail: resolveBoolean(env, 'FORCE_EMAIL', raw.forceEmail, DEFAULT_APP_PREFERENCES.forceEmail),
    logLevel: resolveLogLevel(),
  };
}