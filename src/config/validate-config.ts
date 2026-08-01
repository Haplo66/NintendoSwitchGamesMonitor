import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FamilyProfile, WishlistItem } from '../models';
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
      `  - ${item.gameTitle}${item.targetPrice ? ` (target $${item.targetPrice.toFixed(2)})` : ''}`,
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
        const bad = { id: 'x', name: 123, preferredGenres: 'not-array' } as unknown as FamilyProfile;
        assert.notDeepStrictEqual(validateFamilyProfile(bad), []);
        assert.throws(() => loadFamilyProfilesWith(bad), ConfigError);
      },
    },
    {
      name: 'malformed wishlist item fails clearly',
      run: () => {
        const bad = { id: 'x', gameTitle: '', notifyOnAnyDiscount: 'yes' } as unknown as WishlistItem;
        assert.notDeepStrictEqual(validateWishlistItem(bad), []);
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll config validation checks passed.');
}

function loadFamilyProfilesWith(profile: FamilyProfile): FamilyProfile[] {
  const file = path.join(os.tmpdir(), `nsm-profile-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify([profile]), 'utf8');
  try {
    return loadFamilyProfiles(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

if (require.main === module) {
  validateConfig().catch((error: unknown) => {
    console.error('Config validation failed:', error);
    process.exitCode = 1;
  });
}
