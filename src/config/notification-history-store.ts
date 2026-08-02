import * as fs from 'node:fs';
import * as path from 'node:path';

import { Game, GameAnalysis, NotificationHistory, NotificationRecord } from '../models';
import { ConfigError } from './json-loader';
import { validateNotificationHistory } from './validators';

export const DEFAULT_NOTIFICATION_COOLDOWN_DAYS = 14;

export function defaultNotificationHistoryFile(): string {
  return path.resolve(process.cwd(), 'data', 'notification-history.json');
}

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

export function loadNotificationHistory(filePath?: string): NotificationHistory {
  const resolved = filePath ?? defaultNotificationHistoryFile();
  if (!fs.existsSync(resolved)) {
    return { records: [] };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new ConfigError(
      `Failed to read notification history file "${resolved}": ${(error as Error).message}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(
      `Malformed JSON in notification history file "${resolved}": ${(error as Error).message}`,
    );
  }

  const history = data as NotificationHistory;
  const errors = validateNotificationHistory(history);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid notification history in "${resolved}": ${errors.join('; ')}`);
  }
  return history;
}

export function saveNotificationHistory(history: NotificationHistory, filePath?: string): void {
  const resolved = filePath ?? defaultNotificationHistoryFile();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

export function isSameGame(record: NotificationRecord, game: Game): boolean {
  if (record.gameId && game.id) {
    return record.gameId === game.id;
  }
  return record.title.toLowerCase() === game.title.toLowerCase();
}

export function isWithinCooldown(record: NotificationRecord, now: Date, cooldownDays: number): boolean {
  const cutoff = now.getTime() - cooldownDays * 24 * 60 * 60 * 1000;
  return Date.parse(record.notifiedAt) >= cutoff;
}

export function hasRecentNotification(
  history: NotificationHistory,
  game: Game,
  now: Date,
  cooldownDays: number,
): boolean {
  return history.records.some((record) => {
    if (!isSameGame(record, game)) {
      return false;
    }
    if (record.price !== game.currentPrice) {
      return false;
    }
    return isWithinCooldown(record, now, cooldownDays);
  });
}

export function filterNotifiableGames(
  analyses: GameAnalysis[],
  history: NotificationHistory,
  cooldownDays: number,
  now?: Date,
): GameAnalysis[] {
  const reference = now ?? new Date();
  return analyses.filter(
    (analysis) => !hasRecentNotification(history, analysis.game, reference, cooldownDays),
  );
}

export function toNotificationRecords(analyses: GameAnalysis[], now?: Date): NotificationRecord[] {
  const notifiedAt = (now ?? new Date()).toISOString();
  return analyses.map((analysis) => {
    const game = analysis.game;
    const notificationType =
      game.currentPrice === 0
        ? 'free'
        : (analysis.wishlistMatch?.matched ?? false)
          ? 'wishlist'
          : 'deal';
    return {
      gameId: game.id,
      title: game.title,
      notificationType,
      score: analysis.dealScore.score,
      price: game.currentPrice,
      notifiedAt,
    };
  });
}

export function addNotificationRecords(
  history: NotificationHistory,
  records: NotificationRecord[],
): NotificationHistory {
  return { records: [...history.records, ...records] };
}
