import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DealHistory, Game, GameAnalysis } from '../models';
import { ConfigError } from './json-loader';
import {
  DEFAULT_NOTIFICATION_COOLDOWN_DAYS,
  filterNotifiableGames,
  hasRecentNotification,
  isGameOnSale,
  isWithinCooldown,
  loadDealHistory,
  notificationCooldownDays,
  reconcileDealHistory,
  saveDealHistory,
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

function makeEntry(overrides: Partial<DealHistory['entries'][number]> = {}): DealHistory['entries'][number] {
  return {
    gameTitle: 'Mario Kart 8 Deluxe',
    firstSeenOnSale: '2026-07-01T00:00:00.000Z',
    lastSeenOnSale: '2026-07-30T00:00:00.000Z',
    firstNotified: '2026-07-01T00:00:00.000Z',
    lastNotified: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastNotifiedPrice: 49.99,
    notificationCount: 1,
    currentlyOnSale: true,
    ...overrides,
  };
}

const now = new Date('2026-08-01T12:00:00.000Z');

const checks: Check[] = [
  {
    name: 'missing history file initializes empty history',
    run: () => {
      const file = tempHistoryFile();
      assert.deepStrictEqual(loadDealHistory(file), { entries: [] });
    },
  },
  {
    name: 'save then load round-trips valid JSON',
    run: () => {
      const file = tempHistoryFile();
      const history: DealHistory = { entries: [makeEntry()] };
      try {
        saveDealHistory(history, file);
        assert.deepStrictEqual(loadDealHistory(file), history);
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
        assert.throws(() => loadDealHistory(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'invalid history structure fails clearly',
    run: () => {
      const file = tempHistoryFile();
      fs.writeFileSync(file, JSON.stringify({ entries: 'not-an-array' }), 'utf8');
      try {
        assert.throws(() => loadDealHistory(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'legacy notification records migrate to deal history entries',
    run: () => {
      const file = tempHistoryFile();
      fs.writeFileSync(
        file,
        JSON.stringify({
          records: [
            {
              gameId: 'x',
              title: 'Mario Kart 8 Deluxe',
              notificationType: 'deal',
              score: 100,
              price: 49.99,
              notifiedAt: '2026-07-01T00:00:00.000Z',
            },
            {
              gameId: 'x',
              title: 'Mario Kart 8 Deluxe',
              notificationType: 'deal',
              score: 100,
              price: 39.99,
              notifiedAt: '2026-07-10T00:00:00.000Z',
            },
          ],
        }),
        'utf8',
      );
      try {
        const history = loadDealHistory(file);
        assert.strictEqual(history.entries.length, 1, 'duplicate titles must merge into one entry');
        const entry = history.entries[0];
        assert.strictEqual(entry.gameTitle, 'Mario Kart 8 Deluxe');
        assert.strictEqual(entry.notificationCount, 2);
        assert.strictEqual(entry.firstNotified, '2026-07-01T00:00:00.000Z');
        assert.strictEqual(entry.lastNotified, '2026-07-10T00:00:00.000Z');
        assert.strictEqual(entry.currentlyOnSale, false);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'a new deal creates a history entry',
    run: () => {
      const result = reconcileDealHistory({ entries: [] }, [makeGame()], [], now);
      assert.strictEqual(result.entries.length, 1);
      assert.strictEqual(result.entries[0].gameTitle, 'Mario Kart 8 Deluxe');
      assert.strictEqual(result.entries[0].currentlyOnSale, true);
      assert.strictEqual(result.entries[0].notificationCount, 0);
      assert.strictEqual(result.entries[0].firstSeenOnSale, now.toISOString());
      assert.strictEqual(result.entries[0].firstNotified, undefined);
    },
  },
  {
    name: 'a newly notified deal records the notification',
    run: () => {
      const result = reconcileDealHistory({ entries: [] }, [makeGame()], [makeGame()], now);
      const entry = result.entries[0];
      assert.strictEqual(entry.notificationCount, 1);
      assert.strictEqual(entry.firstNotified, now.toISOString());
      assert.strictEqual(entry.lastNotified, now.toISOString());
      assert.strictEqual(entry.lastNotifiedPrice, 49.99);
    },
  },
  {
    name: 'a repeated deal updates the entry without duplicating it',
    run: () => {
      const first = reconcileDealHistory({ entries: [] }, [makeGame()], [makeGame()], now);
      const second = reconcileDealHistory(first, [makeGame()], [makeGame()], now);
      assert.strictEqual(second.entries.length, 1, 'no duplicate history entries');
      assert.strictEqual(second.entries[0].notificationCount, 2);
      assert.strictEqual(second.entries[0].firstNotified, now.toISOString());
      assert.strictEqual(second.entries[0].lastSeenOnSale, now.toISOString());
    },
  },
  {
    name: 'when a sale ends the entry is kept but marked off-sale',
    run: () => {
      const existing: DealHistory = { entries: [makeEntry()] };
      const result = reconcileDealHistory(existing, [], [], now);
      assert.strictEqual(result.entries.length, 1, 'history entry must be preserved');
      assert.strictEqual(result.entries[0].currentlyOnSale, false);
      assert.strictEqual(result.entries[0].firstSeenOnSale, '2026-07-01T00:00:00.000Z');
      assert.strictEqual(result.entries[0].notificationCount, 1);
      assert.strictEqual(result.entries[0].lastNotified, makeEntry().lastNotified);
    },
  },
  {
    name: 'isGameOnSale detects discounted and free games',
    run: () => {
      assert.ok(isGameOnSale(makeGame({ currentPrice: 49.99, originalPrice: 59.99 })));
      assert.ok(!isGameOnSale(makeGame({ currentPrice: 59.99, originalPrice: 59.99 })));
      assert.ok(!isGameOnSale(makeGame({ currentPrice: 49.99, originalPrice: undefined })));
      assert.ok(isGameOnSale(makeGame({ currentPrice: 0, originalPrice: 0 })));
      assert.ok(isGameOnSale(makeGame({ currentPrice: 0, originalPrice: undefined })));
    },
  },
  {
    name: 'same game and price within cooldown is not notifiable',
    run: () => {
      const history: DealHistory = { entries: [makeEntry()] };
      assert.ok(hasRecentNotification(history, makeGame(), now, 14));
      assert.ok(hasRecentNotification(history, makeGame(), now, DEFAULT_NOTIFICATION_COOLDOWN_DAYS));
    },
  },
  {
    name: 'a different price resets the cooldown (new deal is notifiable)',
    run: () => {
      const history: DealHistory = { entries: [makeEntry()] };
      assert.ok(!hasRecentNotification(history, makeGame({ currentPrice: 39.99 }), now, 14));
    },
  },
  {
    name: 'an expired notification outside the cooldown is notifiable again',
    run: () => {
      const history: DealHistory = {
        entries: [
          makeEntry({ lastNotified: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() }),
        ],
      };
      assert.ok(!hasRecentNotification(history, makeGame(), now, 14));
    },
  },
  {
    name: 'cooldown boundary is inclusive',
    run: () => {
      const atCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      assert.ok(isWithinCooldown(atCutoff, now, 14));
    },
  },
  {
    name: 'filterNotifiableGames drops recently notified games',
    run: () => {
      const history: DealHistory = { entries: [makeEntry()] };
      const analyses = [
        makeAnalysis(makeGame()),
        makeAnalysis(makeGame({ id: 'game-2', title: 'Fortnite', currentPrice: 0, originalPrice: 0 })),
      ];
      const result = filterNotifiableGames(analyses, history, 14, now);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].game.id, 'game-2');
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
  console.log('\nAll deal history validation checks passed.');
}

if (require.main === module) {
  validateHistory().catch((error: unknown) => {
    console.error('Deal history validation failed:', error);
    process.exitCode = 1;
  });
}
