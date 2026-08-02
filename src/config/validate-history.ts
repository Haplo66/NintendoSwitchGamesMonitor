import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Game, GameAnalysis, NotificationHistory, NotificationRecord } from '../models';
import { ConfigError } from './json-loader';
import {
  DEFAULT_NOTIFICATION_COOLDOWN_DAYS,
  addNotificationRecords,
  filterNotifiableGames,
  hasRecentNotification,
  isWithinCooldown,
  loadNotificationHistory,
  notificationCooldownDays,
  saveNotificationHistory,
  toNotificationRecords,
} from './notification-history-store';

interface Check {
  name: string;
  run: () => void;
}

async function runChecks(checks: Check[]): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${check.name}`);
      console.error(`    ${(error as Error).message}`);
    }
  }
  if (failed > 0) {
    throw new Error(`${failed} check(s) failed`);
  }
}

function tempHistoryFile(): string {
  return path.join(os.tmpdir(), `nsm-history-${Date.now()}-${Math.random()}.json`);
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Mario Kart 8 Deluxe',
    platform: 'Nintendo Switch',
    currentPrice: 49.99,
    originalPrice: 59.99,
    currency: 'EUR',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game): GameAnalysis {
  return {
    game,
    familyMatches: [],
    dealScore: { score: 100, reasons: ['test'] },
  };
}

function record(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    gameId: 'game-1',
    title: 'Mario Kart 8 Deluxe',
    notificationType: 'deal',
    score: 100,
    price: 49.99,
    notifiedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const now = new Date();

const checks: Check[] = [
  {
    name: 'missing history file initializes empty history',
    run: () => {
      const file = tempHistoryFile();
      assert.deepStrictEqual(loadNotificationHistory(file), { records: [] });
    },
  },
  {
    name: 'save then load round-trips valid JSON',
    run: () => {
      const file = tempHistoryFile();
      const history: NotificationHistory = { records: [record()] };
      try {
        saveNotificationHistory(history, file);
        assert.deepStrictEqual(loadNotificationHistory(file), history);
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), history);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'malformed history file fails clearly',
    run: () => {
      const file = tempHistoryFile();
      fs.writeFileSync(file, '{ this is not valid json ', 'utf8');
      try {
        assert.throws(() => loadNotificationHistory(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'invalid history structure fails clearly',
    run: () => {
      const file = tempHistoryFile();
      fs.writeFileSync(file, JSON.stringify({ records: 'not-an-array' }), 'utf8');
      try {
        assert.throws(() => loadNotificationHistory(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'duplicate detection matches same game and price within cooldown',
    run: () => {
      const history: NotificationHistory = { records: [record()] };
      assert.ok(hasRecentNotification(history, makeGame(), now, 14));
      assert.ok(hasRecentNotification(history, makeGame(), now, DEFAULT_NOTIFICATION_COOLDOWN_DAYS));
    },
  },
  {
    name: 'different price resets cooldown (new deal is notifiable)',
    run: () => {
      const history: NotificationHistory = { records: [record()] };
      assert.ok(!hasRecentNotification(history, makeGame({ currentPrice: 39.99 }), now, 14));
    },
  },
  {
    name: 'expired record outside cooldown is notifiable again',
    run: () => {
      const history: NotificationHistory = {
        records: [record({ notifiedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() })],
      };
      assert.ok(!hasRecentNotification(history, makeGame(), now, 14));
    },
  },
  {
    name: 'cooldown boundary is inclusive',
    run: () => {
      const atCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      assert.ok(isWithinCooldown(record({ notifiedAt: atCutoff }), now, 14));
    },
  },
  {
    name: 'filterNotifiableGames drops recently notified games',
    run: () => {
      const history: NotificationHistory = { records: [record()] };
      const analyses = [
        makeAnalysis(makeGame()),
        makeAnalysis(makeGame({ id: 'game-2', title: 'Fortnite', currentPrice: 0 })),
      ];
      const result = filterNotifiableGames(analyses, history, 14, now);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].game.id, 'game-2');
    },
  },
  {
    name: 'records carry the expected notification type',
    run: () => {
      const analyses = [
        makeAnalysis(makeGame({ id: 'free-1', title: 'Fortnite', currentPrice: 0 })),
        makeAnalysis(
          makeGame({ id: 'wl-1', title: 'Zelda', currentPrice: 50 }),
        ),
      ];
      analyses[1].wishlistMatch = {
        matched: true,
        wishlistItem: { gameTitle: 'Zelda', notifyOnAnyDiscount: false },
        priceTargetReached: true,
      };
      analyses.push(makeAnalysis(makeGame({ id: 'deal-1', title: 'Pokemon', currentPrice: 40 })));

      const records = toNotificationRecords(analyses);
      assert.deepStrictEqual(
        records.map((r) => r.notificationType),
        ['free', 'wishlist', 'deal'],
      );
    },
  },
  {
    name: 'addNotificationRecords appends without mutating input',
    run: () => {
      const base: NotificationHistory = { records: [] };
      const updated = addNotificationRecords(base, [record()]);
      assert.strictEqual(base.records.length, 0);
      assert.strictEqual(updated.records.length, 1);
    },
  },
  {
    name: 'cooldown days default and env parsing',
    run: () => {
      assert.strictEqual(notificationCooldownDays({}), DEFAULT_NOTIFICATION_COOLDOWN_DAYS);
      assert.strictEqual(notificationCooldownDays({ NOTIFICATION_COOLDOWN_DAYS: '7' }), 7);
      assert.throws(() => notificationCooldownDays({ NOTIFICATION_COOLDOWN_DAYS: 'abc' }), ConfigError);
    },
  },
];

async function validateHistory(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll notification history validation checks passed.');
}

if (require.main === module) {
  validateHistory().catch((error: unknown) => {
    console.error('Notification history validation failed:', error);
    process.exitCode = 1;
  });
}
