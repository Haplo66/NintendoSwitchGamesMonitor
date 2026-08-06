import * as fs from 'node:fs';
import * as path from 'node:path';

import { DealHistory, DealHistoryEntry, Game, GameAnalysis, PriceObservation } from '../models';
import { ConfigError } from './json-loader';
import { validateDealHistory } from './validators';

export const DEFAULT_NOTIFICATION_COOLDOWN_DAYS = 14;

export const EMPTY_DEAL_HISTORY: DealHistory = { entries: [] };

export function defaultNotificationHistoryFile(): string {
  return path.resolve(process.cwd(), 'data', 'notification-history.json');
}

export const defaultDealHistoryFile = defaultNotificationHistoryFile;

export function notificationCooldownDays(env?: NodeJS.ProcessEnv): number {
  const raw = (env ?? process.env).NOTIFICATION_COOLDOWN_DAYS;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_NOTIFICATION_COOLDOWN_DAYS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ConfigError(`NOTIFICATION_COOLDOWN_DAYS must be a non-negative number, got "${raw}"`);
  }
  return parsed;
}

interface LegacyRecord {
  gameId?: string;
  title?: string;
  notificationType?: string;
  score?: number;
  price?: number;
  notifiedAt?: string;
}

function isLegacyHistory(data: unknown): data is { records: LegacyRecord[] } {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  const value = data as Record<string, unknown>;
  return Array.isArray(value.records);
}

function migrateLegacyHistory(data: { records: LegacyRecord[] }, now: Date): DealHistory {
  const byTitle = new Map<string, LegacyRecord[]>();
  for (const record of data.records) {
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) {
      continue;
    }
    const key = title.toLowerCase();
    const existing = byTitle.get(key);
    if (existing) {
      existing.push(record);
    } else {
      byTitle.set(key, [record]);
    }
  }

  const entries: DealHistoryEntry[] = [];
  const nowIso = now.toISOString().slice(0, 10);
  for (const group of byTitle.values()) {
    const gameTitle = group[0].title as string;
    const notifiedAt = group
      .map((record) => (typeof record.notifiedAt === 'string' ? Date.parse(record.notifiedAt) : Number.NaN))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const first = notifiedAt[0];
    const last = notifiedAt[notifiedAt.length - 1];
    const ref: number = Number.isFinite(first) ? (first as number) : now.getTime();
    const priceHistory = buildLegacyPriceHistory(group);
    const entry: DealHistoryEntry = {
      gameTitle,
      firstSeenOnSale: new Date(ref).toISOString(),
      lastSeenOnSale: new Date(Number.isFinite(last) ? (last as number) : ref).toISOString(),
      firstNotified: Number.isFinite(first) ? new Date(first)?.toISOString() : undefined,
      lastNotified: Number.isFinite(last) ? new Date(last)?.toISOString() : undefined,
      lastNotifiedPrice: typeof group[0].price === 'number' ? group[0].price : undefined,
      notificationCount: group.length,
      currentlyOnSale: false,
    };
    if (priceHistory.length > 0) {
      entry.priceHistory = priceHistory;
    }
    entries.push(entry);
  }
  return { entries };
}

/**
 * Derives a price history from legacy notification records, ordered by
 * notification date and de-duplicated so unchanged consecutive prices collapse
 * into a single observation. Only used during legacy migration.
 */
function buildLegacyPriceHistory(records: LegacyRecord[]): PriceObservation[] {
  const dated = records
    .filter(
      (record) =>
        typeof record.notifiedAt === 'string' &&
        Number.isFinite(Date.parse(record.notifiedAt)) &&
        typeof record.price === 'number' &&
        Number.isFinite(record.price),
    )
    .sort((a, b) => Date.parse(a.notifiedAt as string) - Date.parse(b.notifiedAt as string));
  const observations: PriceObservation[] = [];
  for (const record of dated) {
    const price = record.price as number;
    const last = observations[observations.length - 1];
    if (last && last.price === price) {
      continue;
    }
    observations.push({ date: (record.notifiedAt as string).slice(0, 10), price });
  }
  return observations;
}

function obsDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Records a price observation for a game, only when it is a meaningful change.
 * The first observation seeds the history; subsequent observations are appended
 * only when the price differs from the last recorded one, so unchanged prices
 * (e.g. a game still on sale at the same price the next day) are never
 * duplicated.
 */
export function recordPriceObservation(
  history: PriceObservation[] | undefined,
  price: number,
  now: Date,
): PriceObservation[] {
  const current = history ?? [];
  const last = current[current.length - 1];
  if (last && last.price === price) {
    return current;
  }
  return [...current, { date: obsDate(now), price }];
}

export function loadDealHistory(filePath?: string): DealHistory {
  const resolved = filePath ?? defaultNotificationHistoryFile();
  if (!fs.existsSync(resolved)) {
    return { entries: [] };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new ConfigError(
      `Failed to read deal history file "${resolved}": ${(error as Error).message}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(
      `Malformed JSON in deal history file "${resolved}": ${(error as Error).message}`,
    );
  }

  if (isLegacyHistory(data)) {
    return migrateLegacyHistory(data, new Date());
  }

  const history = data as DealHistory;
  const errors = validateDealHistory(history);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid deal history in "${resolved}": ${errors.join('; ')}`);
  }
  return history;
}

export const loadNotificationHistory = loadDealHistory;

export function saveDealHistory(history: DealHistory, filePath?: string): void {
  const resolved = filePath ?? defaultNotificationHistoryFile();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

export const saveNotificationHistory = saveDealHistory;

export function isGameOnSale(game: Game): boolean {
  if (game.currentPrice === 0) {
    return true;
  }
  return game.originalPrice !== undefined && game.originalPrice > game.currentPrice;
}

function entryKey(title: string): string {
  return title.trim().toLowerCase();
}

export function findDealEntry(history: DealHistory, title: string): DealHistoryEntry | undefined {
  const key = entryKey(title);
  return history.entries.find((entry) => entryKey(entry.gameTitle) === key);
}

export function reconcileDealHistory(
  history: DealHistory,
  collectedGames: Game[],
  notifiedGames: Game[],
  now: Date = new Date(),
): DealHistory {
  const nowIso = now.toISOString();
  const notifiedByKey = new Map<string, Game>();
  for (const game of notifiedGames) {
    notifiedByKey.set(entryKey(game.title), game);
  }

  const presentByKey = new Map<string, { entry: DealHistoryEntry | undefined; game: Game }>();
  for (const game of collectedGames) {
    if (!isGameOnSale(game)) {
      continue;
    }
    presentByKey.set(entryKey(game.title), {
      entry: findDealEntry(history, game.title),
      game,
    });
  }

  const entries: DealHistoryEntry[] = history.entries.map((entry) => {
    const key = entryKey(entry.gameTitle);
    const present = presentByKey.has(key);
    const updated: DealHistoryEntry = { ...entry, currentlyOnSale: present };
    if (present) {
      updated.lastSeenOnSale = nowIso;
      const presentValue = presentByKey.get(key) as { game: Game };
      updated.priceHistory = recordPriceObservation(updated.priceHistory, presentValue.game.currentPrice, now);
    }
    const notified = notifiedByKey.get(key);
    if (notified) {
      updated.firstNotified = updated.firstNotified ?? nowIso;
      updated.lastNotified = nowIso;
      updated.lastNotifiedPrice = notified.currentPrice;
      updated.notificationCount = updated.notificationCount + 1;
    }
    return updated;
  });

  for (const [key, value] of presentByKey) {
    if (value.entry !== undefined) {
      continue;
    }
    const notified = notifiedByKey.get(key);
    const entry: DealHistoryEntry = {
      gameTitle: value.game.title,
      firstSeenOnSale: nowIso,
      lastSeenOnSale: nowIso,
      currentlyOnSale: true,
      notificationCount: notified ? 1 : 0,
      priceHistory: [{ date: obsDate(now), price: value.game.currentPrice }],
    };
    if (notified) {
      entry.firstNotified = nowIso;
      entry.lastNotified = nowIso;
      entry.lastNotifiedPrice = notified.currentPrice;
    }
    entries.push(entry);
  }

  return { entries };
}

function dateWithinCooldown(dateIso: string | undefined, now: Date, cooldownDays: number): boolean {
  if (dateIso === undefined) {
    return false;
  }
  const timestamp = Date.parse(dateIso);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  const cutoff = now.getTime() - cooldownDays * 24 * 60 * 60 * 1000;
  return timestamp >= cutoff;
}

export function isWithinCooldown(dateIso: string, now: Date, cooldownDays: number): boolean {
  return dateWithinCooldown(dateIso, now, cooldownDays);
}

export function hasRecentNotification(
  history: DealHistory,
  game: Game,
  now: Date,
  cooldownDays: number,
): boolean {
  const entry = findDealEntry(history, game.title);
  if (!entry) {
    return false;
  }
  if (!dateWithinCooldown(entry.lastNotified, now, cooldownDays)) {
    return false;
  }
  if (entry.lastNotifiedPrice !== undefined && entry.lastNotifiedPrice !== game.currentPrice) {
    return false;
  }
  return true;
}

export function filterNotifiableGames(
  analyses: GameAnalysis[],
  history: DealHistory,
  cooldownDays: number,
  now?: Date,
): GameAnalysis[] {
  const reference = now ?? new Date();
  return analyses.filter(
    (analysis) => !hasRecentNotification(history, analysis.game, reference, cooldownDays),
  );
}