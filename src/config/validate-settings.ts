import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConfigError } from './json-loader';
import { loadAppConfig, resolveCollectorSettings } from './app-config';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  resolveNotificationSettings,
} from './settings-loader';

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

function tempSettingsFile(): string {
  return path.join(os.tmpdir(), `nsm-settings-${Date.now()}-${Math.random()}.json`);
}

function writeSettings(data: unknown, file: string): void {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

const checks: Check[] = [
  {
    name: 'missing settings file uses defaults',
    run: () => {
      const file = tempSettingsFile();
      assert.deepStrictEqual(loadNotificationSettings(file), DEFAULT_NOTIFICATION_SETTINGS);
    },
  },
  {
    name: 'full settings file loads and preserves values',
    run: () => {
      const file = tempSettingsFile();
      const settings = {
        minimumDealScore: 70,
        notificationCooldownDays: 7,
        maxGamesPerEmail: 5,
        notifyFreeGames: false,
        notifyWishlistMatches: false,
        defaultWishlistDiscountPercent: 30,
        defaultNotifyOnAnyDiscount: true,
      };
      try {
        writeSettings(settings, file);
        assert.deepStrictEqual(loadNotificationSettings(file), settings);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'partial settings file merges with defaults',
    run: () => {
      const file = tempSettingsFile();
      try {
        writeSettings({ maxGamesPerEmail: 5 }, file);
        const loaded = loadNotificationSettings(file);
        assert.strictEqual(loaded.maxGamesPerEmail, 5);
        assert.strictEqual(loaded.minimumDealScore, DEFAULT_NOTIFICATION_SETTINGS.minimumDealScore);
        assert.strictEqual(
          loaded.notificationCooldownDays,
          DEFAULT_NOTIFICATION_SETTINGS.notificationCooldownDays,
        );
        assert.strictEqual(loaded.notifyFreeGames, DEFAULT_NOTIFICATION_SETTINGS.notifyFreeGames);
        assert.strictEqual(
          loaded.defaultWishlistDiscountPercent,
          DEFAULT_NOTIFICATION_SETTINGS.defaultWishlistDiscountPercent,
        );
        assert.strictEqual(
          loaded.defaultNotifyOnAnyDiscount,
          DEFAULT_NOTIFICATION_SETTINGS.defaultNotifyOnAnyDiscount,
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'malformed settings file fails clearly',
    run: () => {
      const file = tempSettingsFile();
      fs.writeFileSync(file, '{ this is not valid json ', 'utf8');
      try {
        assert.throws(() => loadNotificationSettings(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'non-object settings file fails clearly',
    run: () => {
      const file = tempSettingsFile();
      try {
        writeSettings([1, 2, 3], file);
        assert.throws(() => loadNotificationSettings(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'invalid settings values are rejected',
    run: () => {
      const cases: unknown[] = [
        { minimumDealScore: 'high' },
        { minimumDealScore: -1 },
        { notificationCooldownDays: -2 },
        { maxGamesPerEmail: 0 },
        { maxGamesPerEmail: 2.5 },
        { notifyFreeGames: 'yes' },
        { notifyWishlistMatches: 1 },
        { defaultWishlistDiscountPercent: 0 },
        { defaultWishlistDiscountPercent: 100 },
        { defaultWishlistDiscountPercent: 2.5 },
        { defaultNotifyOnAnyDiscount: 'yes' },
      ];
      for (const bad of cases) {
        const file = tempSettingsFile();
        try {
          writeSettings(bad, file);
          assert.throws(() => loadNotificationSettings(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      }
    },
  },
  {
    name: 'environment variables override settings file',
    run: () => {
      const resolved = resolveNotificationSettings({
        MIN_DEAL_SCORE: '90',
        NOTIFICATION_COOLDOWN_DAYS: '3',
        MAX_GAMES_PER_EMAIL: '4',
        NOTIFY_FREE_GAMES: 'false',
        NOTIFY_WISHLIST_MATCHES: '0',
        DEFAULT_WISHLIST_DISCOUNT_PERCENT: '25',
        DEFAULT_NOTIFY_ON_ANY_DISCOUNT: 'true',
      });
      assert.strictEqual(resolved.minimumDealScore, 90);
      assert.strictEqual(resolved.notificationCooldownDays, 3);
      assert.strictEqual(resolved.maxGamesPerEmail, 4);
      assert.strictEqual(resolved.notifyFreeGames, false);
      assert.strictEqual(resolved.notifyWishlistMatches, false);
      assert.strictEqual(resolved.defaultWishlistDiscountPercent, 25);
      assert.strictEqual(resolved.defaultNotifyOnAnyDiscount, true);
    },
  },
  {
    name: 'invalid environment values are rejected',
    run: () => {
      assert.throws(() => resolveNotificationSettings({ MAX_GAMES_PER_EMAIL: 'abc' }), ConfigError);
      assert.throws(() => resolveNotificationSettings({ NOTIFY_FREE_GAMES: 'maybe' }), ConfigError);
      assert.throws(() => resolveNotificationSettings({ MIN_DEAL_SCORE: '-5' }), ConfigError);
      assert.throws(
        () => resolveNotificationSettings({ DEFAULT_WISHLIST_DISCOUNT_PERCENT: '150' }),
        ConfigError,
      );
      assert.throws(
        () => resolveNotificationSettings({ DEFAULT_NOTIFY_ON_ANY_DISCOUNT: 'maybe' }),
        ConfigError,
      );
    },
  },
  {
    name: 'collector settings resolve from environment',
    run: () => {
      assert.strictEqual(resolveCollectorSettings({}).collectorKind, 'mock');
      assert.strictEqual(resolveCollectorSettings({}).dealLimit, 100);
      const deku = resolveCollectorSettings({
        GAME_COLLECTOR: 'deku',
        DEALS_LIMIT: '50',
        DEALS_CURRENCY: 'USD',
      });
      assert.strictEqual(deku.collectorKind, 'deku');
      assert.strictEqual(deku.dealLimit, 50);
      assert.strictEqual(deku.dealsCurrency, 'USD');
      assert.ok(deku.dealsSourceUrl.length > 0, 'dealsSourceUrl is empty');
    },
  },
  {
    name: 'app config combines all sources',
    run: () => {
      const config = loadAppConfig();
      assert.deepStrictEqual(config.notification, resolveNotificationSettings());
      assert.deepStrictEqual(config.collector, resolveCollectorSettings());
      assert.ok(Array.isArray(config.familyProfiles) && config.familyProfiles.length > 0);
      assert.ok(Array.isArray(config.wishlist.items) && config.wishlist.items.length > 0);
    },
  },
];

export async function validateSettings(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll settings validation checks passed.');
}

if (require.main === module) {
  validateSettings().catch((error: unknown) => {
    console.error('Settings validation failed:', error);
    process.exitCode = 1;
  });
}
