import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Game } from '../models';
import {
  filterBlacklistedGames,
  isGameBlacklisted,
  loadBlacklist,
  validateBlacklist,
} from './blacklist';
import { ConfigError } from './json-loader';

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

function tempBlacklistFile(content: string): string {
  const file = path.join(os.tmpdir(), `nsm-blacklist-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Carrot Smash',
    platform: 'Nintendo Switch',
    currentPrice: 9.99,
    originalPrice: 19.99,
    currency: 'USD',
    genres: ['Action'],
    source: 'test',
    ...overrides,
  };
}

const checks: Check[] = [
  {
    name: 'blacklist.json loads with the object format',
    run: () => {
      const file = tempBlacklistFile(
        JSON.stringify({ games: [{ title: 'Carrot Smash', reason: 'Not interested' }] }),
      );
      try {
        const blacklist = loadBlacklist(file);
        assert.deepStrictEqual(blacklist.entries, [
          { title: 'Carrot Smash', reason: 'Not interested' },
        ]);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'simple title-only entries are supported (backward compatible)',
    run: () => {
      const file = tempBlacklistFile(JSON.stringify({ games: ['Carrot Smash', 'Example Game'] }));
      try {
        const blacklist = loadBlacklist(file);
        assert.deepStrictEqual(blacklist.entries, [
          { title: 'Carrot Smash' },
          { title: 'Example Game' },
        ]);
      } finally {
        fs.rmSync(file, { force: true });
      }

      const mixed = tempBlacklistFile(
        JSON.stringify({
          games: ['Carrot Smash', { title: 'Example Game', reason: 'Too childish' }],
        }),
      );
      try {
        const blacklist = loadBlacklist(mixed);
        assert.deepStrictEqual(blacklist.entries, [
          { title: 'Carrot Smash' },
          { title: 'Example Game', reason: 'Too childish' },
        ]);
      } finally {
        fs.rmSync(mixed, { force: true });
      }
    },
  },
  {
    name: 'missing "games" array fails clearly',
    run: () => {
      const cases = [JSON.stringify({}), JSON.stringify([]), JSON.stringify({ games: 'nope' })];
      for (const content of cases) {
        const file = tempBlacklistFile(content);
        try {
          assert.throws(() => loadBlacklist(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      }
    },
  },
  {
    name: 'invalid blacklist entries are rejected',
    run: () => {
      const cases = [
        JSON.stringify({ games: [1, 2] }),
        JSON.stringify({ games: [''] }),
        JSON.stringify({ games: [{ title: '' }] }),
        JSON.stringify({ games: [{ title: 'Game', reason: 42 }] }),
      ];
      for (const content of cases) {
        const file = tempBlacklistFile(content);
        try {
          assert.throws(() => loadBlacklist(file), ConfigError);
        } finally {
          fs.rmSync(file, { force: true });
        }
      }
      assert.ok(validateBlacklist({ games: [] }).length === 0, 'empty blacklist must be valid');
      assert.ok(validateBlacklist({ games: [1] }).length > 0, 'numeric entry must be invalid');
    },
  },
  {
    name: 'duplicate blacklist titles are rejected (case-insensitive)',
    run: () => {
      const file = tempBlacklistFile(
        JSON.stringify({ games: ['Carrot Smash', 'carrot smash'] }),
      );
      try {
        assert.throws(() => loadBlacklist(file), ConfigError);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'title normalization is case-insensitive and whitespace-tolerant',
    run: () => {
      const file = tempBlacklistFile(JSON.stringify({ games: ['Carrot Smash'] }));
      try {
        const blacklist = loadBlacklist(file);
        assert.ok(isGameBlacklisted('carrot smash', blacklist), 'lowercase must match');
        assert.ok(isGameBlacklisted('  Carrot Smash  ', blacklist), 'whitespace must match');
        assert.ok(isGameBlacklisted('CARROT SMASH', blacklist), 'uppercase must match');
        assert.ok(!isGameBlacklisted('Stardew Valley', blacklist), 'unrelated title must not match');
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'blacklisted games are still filtered correctly',
    run: () => {
      const blacklist = loadBlacklist();
      const games = [
        makeGame({ id: 'game-1', title: 'Fortnite' }),
        makeGame({ id: 'game-2', title: 'Mario Kart 8 Deluxe' }),
      ];
      const filtered = filterBlacklistedGames(games, blacklist);
      assert.deepStrictEqual(
        filtered.map((game) => game.title),
        ['Mario Kart 8 Deluxe'],
      );
      assert.ok(isGameBlacklisted('FORTNITE', blacklist), 'blacklisted title must still match');
      assert.strictEqual(filterBlacklistedGames(games, { entries: [] }), games, 'empty blacklist returns the same array');
    },
  },
];

export async function validateBlacklistLoader(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll blacklist loader validation checks passed.');
}

if (require.main === module) {
  validateBlacklistLoader().catch((error: unknown) => {
    console.error('Blacklist loader validation failed:', error);
    process.exitCode = 1;
  });
}
