import * as path from 'node:path';

import { normalizeGameTitle } from '../collectors/nintendo-price-collector';
import { Blacklist, BlacklistEntry, Game } from '../models';
import { ConfigError, loadJsonFile } from './json-loader';

/**
 * User-maintained list of game titles to hide from the digest, loaded from
 * `data/blacklist.json`. The file may use either the full object form
 * `{ "games": [{ "title": "Example Game", "reason": "Not interested" }] }` or
 * simple title-only strings `{ "games": ["Example Game"] }` (or a mix of
 * both); everything is normalized to `BlacklistEntry[]` at load time.
 */
export type BlacklistSource = Blacklist | string[] | BlacklistEntry[];

export function defaultBlacklistFile(): string {
  return path.resolve(process.cwd(), 'data', 'blacklist.json');
}

export function normalizeBlacklistTitle(title: string): string {
  return normalizeGameTitle(title);
}

/**
 * Normalizes a raw blacklist entry to the canonical `{ title, reason }` form.
 * String entries become `{ title }`; object entries pass through (unknown or
 * malformed values surface during validation, not here).
 */
export function normalizeBlacklistEntry(raw: unknown): BlacklistEntry {
  if (typeof raw === 'string') {
    return { title: raw };
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    return {
      title: typeof value.title === 'string' ? value.title : (undefined as unknown as string),
      reason: typeof value.reason === 'string' ? value.reason : undefined,
    };
  }
  return { title: undefined as unknown as string };
}

/**
 * Validates the raw `data/blacklist.json` payload. Returns a list of human
 * readable errors (empty when the payload is valid).
 */
export function validateBlacklist(data: unknown): string[] {
  const errors: string[] = [];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return ['blacklist must be a JSON object with a "games" array'];
  }
  const value = data as Record<string, unknown>;
  if (!Array.isArray(value.games)) {
    return ['blacklist must contain a "games" array'];
  }
  value.games.forEach((raw, index) => {
    if (typeof raw === 'string') {
      if (raw.trim() === '') {
        errors.push(
          `game at index ${index} must be a non-empty string or an object with a non-empty "title"`,
        );
      }
      return;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(
        `game at index ${index} must be a non-empty string or an object with a non-empty "title"`,
      );
      return;
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      errors.push(
        `game at index ${index} must be a non-empty string or an object with a non-empty "title"`,
      );
    }
    if (entry.reason !== undefined && typeof entry.reason !== 'string') {
      errors.push(`game at index ${index} must have a string "reason" when provided`);
    }
  });
  const seenTitles = new Set<string>();
  value.games.forEach((raw, index) => {
    const entry = normalizeBlacklistEntry(raw);
    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      return;
    }
    const key = normalizeBlacklistTitle(entry.title);
    if (seenTitles.has(key)) {
      errors.push(`duplicate blacklist title "${entry.title}" at index ${index}`);
    }
    seenTitles.add(key);
  });
  return errors;
}

/**
 * Loads and normalizes `data/blacklist.json` (or the file at `filePath`).
 * A malformed file or invalid entries fail with a clear error.
 */
export function loadBlacklist(filePath?: string): Blacklist {
  const resolved = filePath ?? defaultBlacklistFile();
  const data = loadJsonFile<unknown>(resolved);
  const errors = validateBlacklist(data);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid blacklist file "${resolved}": ${errors.join('; ')}`);
  }
  const games = (data as { games: unknown[] }).games;
  return { entries: games.map((raw) => normalizeBlacklistEntry(raw)) };
}

function toBlacklistEntries(source: BlacklistSource): BlacklistEntry[] {
  if (Array.isArray(source)) {
    return source.map((entry) =>
      typeof entry === 'string' ? { title: entry } : entry,
    );
  }
  return source.entries;
}

/**
 * Returns true when the given game title exactly matches one of the
 * blacklisted titles. Matching is case-insensitive and applied to the
 * normalized (trimmed + lowercased) title, so "Carrot Smash", "carrot
 * smash", and "  Carrot Smash  " all match the same blacklist entry.
 */
export function isGameBlacklisted(title: string, blacklist: BlacklistSource): boolean {
  const normalized = normalizeBlacklistTitle(title);
  return toBlacklistEntries(blacklist).some(
    (entry) => normalizeBlacklistTitle(entry.title) === normalized,
  );
}

/**
 * Filters a collected game list so blacklisted titles never reach analysis,
 * recommendations, Best Deals, or notification generation. Games checked
 * statistics keep using the unfiltered collection count. An empty blacklist
 * returns the original array unchanged.
 */
export function filterBlacklistedGames(games: Game[], blacklist: BlacklistSource): Game[] {
  const entries = toBlacklistEntries(blacklist);
  if (entries.length === 0) {
    return games;
  }
  return games.filter((game) => !isGameBlacklisted(game.title, entries));
}
