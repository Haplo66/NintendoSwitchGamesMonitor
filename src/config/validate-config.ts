import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { computeWishlistTargetPrice } from '../analyzer/wishlist-matcher';
import { FamilyProfile, Game, WishlistItem } from '../models';
import { loadBlacklist } from './blacklist';
import { loadFamilyProfiles } from './family-profiles-loader';
import { ConfigError, loadJsonFile } from './json-loader';
import { validateFamilyProfile, validateWishlistItem } from './validators';
import { loadWishlist } from './wishlist-loader';

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

export async function validateConfig(): Promise<void> {
  const profiles = loadFamilyProfiles();
  const wishlist = loadWishlist();
  const blacklist = loadBlacklist();

  console.log(`Loaded ${profiles.length} family profile(s):`);
  for (const profile of profiles) {
    console.log(
      `  - ${profile.name}${profile.maxAge ? ` (max age ${profile.maxAge})` : ''}` +
        ` · prefers: ${profile.preferredGenres.join(', ') || 'none'}` +
        ` · excludes: ${profile.excludedGenres.join(', ') || 'none'}`,
    );
  }
  console.log(`Loaded wishlist with ${wishlist.items.length} item(s):`);
  for (const item of wishlist.items) {
    console.log(
      `  - ${item.gameTitle}${item.targetPrice !== undefined ? ` (target $${item.targetPrice.toFixed(2)})` : ''}` +
        ` · notify on any discount: ${item.notifyOnAnyDiscount}`,
    );
  }
  console.log('');

  const checks: Check[] = [
    {
      name: 'family-profile.json exists and is valid',
      run: () => {
        assert.ok(profiles.length > 0, 'No family profiles loaded');
        for (const profile of profiles) {
          assert.deepStrictEqual(validateFamilyProfile(profile), []);
        }
      },
    },
    {
      name: 'wishlist.json exists and is valid',
      run: () => {
        assert.ok(wishlist.items.length > 0, 'Wishlist is empty');
        for (const item of wishlist.items) {
          assert.deepStrictEqual(validateWishlistItem(item), []);
        }
      },
    },
    {
      name: 'blacklist.json exists and is valid',
      run: () => {
        assert.ok(Array.isArray(blacklist.entries), 'Blacklist entries missing');
        for (const entry of blacklist.entries) {
          assert.ok(
            typeof entry.title === 'string' && entry.title.trim() !== '',
            `Blacklist entry has an empty title: ${JSON.stringify(entry)}`,
          );
        }
      },
    },
    {
      name: 'missing config file fails clearly',
      run: () => {
        assert.throws(
          () => loadJsonFile(path.resolve(os.tmpdir(), 'does-not-exist-nsm.json')),
          ConfigError,
        );
      },
    },
    {
      name: 'malformed JSON fails clearly',
      run: () => {
        const file = path.join(os.tmpdir(), `nsm-malformed-${Date.now()}.json`);
        fs.writeFileSync(file, '{ this is not valid json ', 'utf8');
        try {
          assert.throws(() => loadJsonFile(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'malformed family profile fails clearly',
      run: () => {
        const bad = { name: 123, preferredGenres: 'not-array' } as unknown as FamilyProfile;
        assert.notDeepStrictEqual(validateFamilyProfile(bad), []);
        assert.throws(() => loadFamilyProfilesWith(bad), ConfigError);
      },
    },
    {
      name: 'malformed wishlist item fails clearly',
      run: () => {
        const bad = { gameTitle: '', notifyOnAnyDiscount: 'yes' } as unknown as WishlistItem;
        assert.notDeepStrictEqual(validateWishlistItem(bad), []);
      },
    },
    {
      name: 'duplicate family profile names are rejected',
      run: () => {
        const file = tempConfigFile(JSON.stringify([
          { name: 'Alex' },
          { name: 'alex' },
        ]));
        try {
          assert.throws(() => loadFamilyProfiles(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'duplicate wishlist titles are rejected (case-insensitive)',
      run: () => {
        const file = tempConfigFile(JSON.stringify({
          items: [{ gameTitle: 'Zelda' }, { gameTitle: 'zelda' }],
        }));
        try {
          assert.throws(() => loadWishlist(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'runtime defaults populate optional fields',
      run: () => {
        const profileFile = tempConfigFile(JSON.stringify([{ name: 'Kid' }]));
        try {
          const loaded = loadFamilyProfiles(profileFile);
          assert.strictEqual(loaded[0].name, 'Kid');
          assert.strictEqual(loaded[0].maxAge, undefined);
          assert.deepStrictEqual(loaded[0].preferredGenres, []);
          assert.deepStrictEqual(loaded[0].excludedGenres, []);
          assert.strictEqual(loaded[0].notes, undefined);
        } finally {
          fs.rmSync(profileFile, { force: true });
        }

        const wishlistFile = tempConfigFile(JSON.stringify({ items: [{ gameTitle: 'Stardew Valley' }] }));
        try {
          const loaded = loadWishlist(wishlistFile);
          assert.strictEqual(loaded.items[0].notifyOnAnyDiscount, false);
          assert.strictEqual(loaded.items[0].targetPrice, undefined);
          const withDefault = loadWishlist(wishlistFile, { defaultNotifyOnAnyDiscount: true });
          assert.strictEqual(withDefault.items[0].notifyOnAnyDiscount, true);
        } finally {
          fs.rmSync(wishlistFile, { force: true });
        }
      },
    },
    {
      name: 'automatic target price is calculated from discount percent',
      run: () => {
        const game = makeGame({ originalPrice: 59.99, currentPrice: 35.99 });
        const item: WishlistItem = { gameTitle: 'Game', notifyOnAnyDiscount: false };
        assert.strictEqual(computeWishlistTargetPrice(game, item, 40), 35.99);
        assert.strictEqual(computeWishlistTargetPrice(game, item, 25), 44.99);
        const noOriginal = makeGame({ originalPrice: undefined });
        assert.strictEqual(computeWishlistTargetPrice(noOriginal, item, 40), undefined);
      },
    },
    {
      name: 'explicit target price overrides automatic value',
      run: () => {
        const game = makeGame({ originalPrice: 59.99, currentPrice: 35.99 });
        const item: WishlistItem = { gameTitle: 'Game', targetPrice: 30, notifyOnAnyDiscount: false };
        assert.strictEqual(computeWishlistTargetPrice(game, item, 40), 30);
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll config validation checks passed.');
}

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: 'game-1',
    title: 'Game',
    platform: 'Nintendo Switch',
    currentPrice: 39.99,
    originalPrice: 59.99,
    currency: 'EUR',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function tempConfigFile(content: string): string {
  const file = path.join(os.tmpdir(), `nsm-config-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function loadFamilyProfilesWith(profile: FamilyProfile): FamilyProfile[] {
  return loadFamilyProfiles(tempConfigFile(JSON.stringify([profile])));
}

if (require.main === module) {
  validateConfig().catch((error: unknown) => {
    console.error('Config validation failed:', error);
    process.exitCode = 1;
  });
}
