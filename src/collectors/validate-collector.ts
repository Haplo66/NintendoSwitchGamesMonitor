import 'dotenv/config';

import * as assert from 'node:assert';

import { Game } from '../models';
import { resolveCollectorSettings } from '../config/app-config';
import { createGameCollector } from './collector-factory';
import { DealDoc, DekuDealsCollector, mapDealDoc } from './deku-deals-collector';
import { GameCollector } from './game-collector';
import { resolveNintendoRegion } from './region';

interface Check {
  name: string;
  run: () => void | Promise<void>;
}

async function runChecks(checks: Check[]): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
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

function assertRequiredGameFields(game: Game): void {
  assert.ok(typeof game.id === 'string' && game.id.length > 0, 'id is missing');
  assert.ok(typeof game.title === 'string' && game.title.length > 0, 'title is missing');
  assert.ok(typeof game.platform === 'string' && game.platform.length > 0, 'platform is missing');
  assert.ok(typeof game.currentPrice === 'number' && game.currentPrice >= 0, 'currentPrice is invalid');
  assert.ok(typeof game.currency === 'string' && game.currency.length > 0, 'currency is missing');
  assert.ok(typeof game.source === 'string' && game.source.length > 0, 'source is missing');
}

export async function validateCollector(): Promise<void> {
  const checks: Check[] = [
    {
      name: 'NINTENDO_REGION defaults to US and supports US/EU',
      run: () => {
        assert.strictEqual(resolveNintendoRegion({}), 'US');
        assert.strictEqual(resolveNintendoRegion({ NINTENDO_REGION: 'US' }), 'US');
        assert.strictEqual(resolveNintendoRegion({ NINTENDO_REGION: 'eu' }), 'EU');
        assert.throws(() => resolveNintendoRegion({ NINTENDO_REGION: 'JP' }), /NINTENDO_REGION/);
      },
    },
    {
      name: 'collector uses the configured region/currency',
      run: () => {
        assert.strictEqual(resolveCollectorSettings({ NINTENDO_REGION: 'US' }).nintendoRegion, 'US');
        assert.strictEqual(resolveCollectorSettings({ NINTENDO_REGION: 'US' }).dealsCurrency, 'USD');
        assert.ok(
          resolveCollectorSettings({ NINTENDO_REGION: 'US' }).dealsSourceUrl.includes('searching.nintendo.com'),
          'US region should use the US eShop source',
        );
      },
    },
    {
      name: 'US region maps USD prices, ESRB ratings, and US deal URLs',
      run: () => {
        const game = mapDealDoc(
          {
            fs_id: 70010000026992,
            title: '  Legend of Zelda  ',
            price_regular_f: 59.99,
            price_discounted_f: 41.99,
            price_has_discount_b: true,
            pretty_agerating_s: 'Everyone',
          },
          'USD',
          'US',
        );
        assert.ok(game !== null);
        assert.strictEqual(game.currency, 'USD');
        assert.strictEqual(game.ageRating, 'Everyone');
        assert.strictEqual(
          game.storeUrl,
          'https://www.nintendo.com/us/store/products/legend-of-zelda/',
        );
      },
    },
    {
      name: 'EU region keeps EUR and Europe store URLs',
      run: () => {
        const game = mapDealDoc(
          {
            fs_id: 2814376,
            title: 'Pixel Game',
            url: '/en-gb/Games/Pixel-Game.html',
            price_discounted_f: 4.04,
            price_regular_f: 4.49,
            price_has_discount_b: true,
            pretty_agerating_s: 'PEGI 7',
          },
          'EUR',
          'EU',
        );
        assert.ok(game !== null);
        assert.strictEqual(game.currency, 'EUR');
        assert.strictEqual(game.ageRating, 'PEGI 7');
        assert.strictEqual(game.storeUrl, 'https://www.nintendo-europe.com/en-gb/Games/Pixel-Game.html');
      },
    },
    {
      name: 'collector returns games',
      run: async () => {
        const collector: GameCollector = new DekuDealsCollector({ region: 'EU' });
        const games = await collector.collectGames({ limit: 10 });
        assert.ok(games.length > 0, 'Collector returned no games');
      },
    },
    {
      name: 'required Game fields exist on every game',
      run: async () => {
        const collector: GameCollector = new DekuDealsCollector({ region: 'EU' });
        const games = await collector.collectGames({ limit: 10 });
        for (const game of games) {
          assertRequiredGameFields(game);
        }
      },
    },
    {
      name: 'source URL is configurable',
      run: () => {
        const collector = new DekuDealsCollector({ sourceUrl: 'https://example.com/select' });
        assert.ok(collector instanceof DekuDealsCollector);
      },
    },
    {
      name: 'invalid data is rejected',
      run: () => {
        const bad = (doc: Record<string, unknown>): DealDoc => doc as unknown as DealDoc;
        assert.strictEqual(mapDealDoc(bad({ title: 'No id' }), 'EUR'), null);
        assert.strictEqual(mapDealDoc(bad({ fs_id: '1' }), 'EUR'), null);
        assert.strictEqual(mapDealDoc(bad({ fs_id: '1', title: '' }), 'EUR'), null);
        assert.strictEqual(mapDealDoc(bad({ fs_id: '1', title: 'Bad', price_regular_f: -5 }), 'EUR'), null);
        assert.strictEqual(mapDealDoc(bad({ fs_id: '1', title: 'Bad', price_discounted_f: 'x' }), 'EUR'), null);
      },
    },
    {
      name: 'valid data is normalized',
      run: () => {
        const game = mapDealDoc(
          {
            fs_id: 123,
            title: '  Test Game  ',
            url: '/en-gb/Games/Test-Game.html',
            price_regular_f: 59.99,
            price_discounted_f: 29.99,
            price_has_discount_b: true,
            pretty_agerating_s: 'PEGI 7',
            game_categories_txt: ['action', 'adventure'],
            image_url_h16x9_s: 'https://img.example.com/x.png',
          },
          'EUR',
        );
        assert.ok(game !== null);
        assert.strictEqual(game.title, 'Test Game');
        assert.strictEqual(game.currentPrice, 29.99);
        assert.strictEqual(game.originalPrice, 59.99);
        assert.strictEqual(game.currency, 'EUR');
        assert.strictEqual(game.source, 'dekudeals');
        assert.deepStrictEqual(game.genres, ['action', 'adventure']);
      },
    },
    {
      name: 'mock collector still returns games (offline)',
      run: async () => {
        const collector: GameCollector = createGameCollector('mock');
        const games = await collector.collectGames();
        assert.ok(games.length > 0, 'Mock collector returned no games');
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll collector validation checks passed.');
}

if (require.main === module) {
  validateCollector().catch((error: unknown) => {
    console.error('Collector validation failed:', error);
    process.exitCode = 1;
  });
}
