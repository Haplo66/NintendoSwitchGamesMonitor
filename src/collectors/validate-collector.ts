import 'dotenv/config';

import * as assert from 'node:assert';

import { Game } from '../models';
import { resolveCollectorSettings } from '../config/app-config';
import { createGameCollector } from './collector-factory';
import { GameCollector } from './game-collector';
import {
  CatalogGame,
  NintendoPriceCollector,
  PriceEntry,
  buildStoreUrl,
  loadGameCatalog,
  mapPriceToGame,
  normalizeCatalog,
} from './nintendo-price-collector';
import { normalizeNintendoPlatform, resolveNintendoPlatform } from './platform';
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

const CATALOG_ENTRY: CatalogGame = {
  nsuid: '70010000000025',
  title: 'The Legend of Zelda: Breath of the Wild',
  slug: 'the-legend-of-zelda-breath-of-the-wild-switch',
  platforms: ['switch1'],
  genres: ['Adventure', 'Action'],
  esrbRating: 'Everyone 10+',
};

function priceFixture(overrides: Partial<PriceEntry> = {}): PriceEntry {
  return {
    title_id: 70010000000025,
    sales_status: 'onsale',
    regular_price: { amount: '$59.99', currency: 'USD', raw_value: '59.99' },
    discount_price: { amount: '$41.99', currency: 'USD', raw_value: '41.99' },
    ...overrides,
  };
}

export async function validateCollector(): Promise<void> {
  const checks: Check[] = [
    {
      name: 'NINTENDO_REGION defaults to US and rejects EU',
      run: () => {
        assert.strictEqual(resolveNintendoRegion({}), 'US');
        assert.strictEqual(resolveNintendoRegion({ NINTENDO_REGION: 'US' }), 'US');
        assert.strictEqual(resolveNintendoRegion({ NINTENDO_REGION: 'us' }), 'US');
        assert.throws(() => resolveNintendoRegion({ NINTENDO_REGION: 'EU' }), /NINTENDO_REGION/);
        assert.throws(() => resolveNintendoRegion({ NINTENDO_REGION: 'JP' }), /NINTENDO_REGION/);
      },
    },
    {
      name: 'NINTENDO_PLATFORM defaults to switch1 and accepts switch1/switch2/both',
      run: () => {
        assert.strictEqual(resolveNintendoPlatform({}), 'switch1');
        assert.strictEqual(resolveNintendoPlatform({ NINTENDO_PLATFORM: 'switch2' }), 'switch2');
        assert.strictEqual(resolveNintendoPlatform({ NINTENDO_PLATFORM: 'Switch 2' }), 'switch2');
        assert.strictEqual(resolveNintendoPlatform({ NINTENDO_PLATFORM: 'bOtH' }), 'both');
        assert.throws(() => resolveNintendoPlatform({ NINTENDO_PLATFORM: 'ps5' }), /NINTENDO_PLATFORM/);
        assert.throws(() => normalizeNintendoPlatform('ps5'), /NINTENDO_PLATFORM/);
      },
    },
    {
      name: 'collector settings resolve to the US region, USD, and default platform',
      run: () => {
        const settings = resolveCollectorSettings({ NINTENDO_REGION: 'US' });
        assert.strictEqual(settings.nintendoRegion, 'US');
        assert.strictEqual(settings.dealsCurrency, 'USD');
        assert.strictEqual(settings.platform, 'switch1');
        assert.ok(settings.gameCatalogPath.length > 0, 'gameCatalogPath is empty');
      },
    },
    {
      name: 'the default game catalog loads valid entries with slugs and platforms',
      run: () => {
        const catalog = loadGameCatalog();
        assert.ok(catalog.length > 0, 'Default catalog loaded no games');
        for (const entry of catalog) {
          assert.ok(typeof entry.nsuid === 'string' && entry.nsuid.length > 0, 'entry nsuid is missing');
          assert.ok(typeof entry.title === 'string' && entry.title.length > 0, 'entry title is missing');
          assert.ok(typeof entry.slug === 'string' && entry.slug.length > 0, 'entry slug is missing');
          assert.ok(Array.isArray(entry.platforms) && entry.platforms.length > 0, 'entry platforms are missing');
          const url = buildStoreUrl(entry);
          assert.ok(
            url && url.startsWith('https://www.nintendo.com/us/store/products/') && url.endsWith('/'),
            `entry store URL is malformed for ${entry.title}`,
          );
        }
      },
    },
    {
      name: 'catalog normalization requires a slug, trims values, and defaults platforms',
      run: () => {
        const normalized = normalizeCatalog([
          {
            nsuid: ' 70010000000153 ',
            title: ' Mario Kart ',
            slug: ' mario-kart-8-deluxe-switch ',
            genres: ['Racing', 42],
            esrbRating: 'E',
          },
          { nsuid: '70010000000002', title: 'No platforms', slug: 'no-platforms-switch' },
          { nsuid: '70010000000003', title: 'Switch 2 only', slug: 'y-switch', platforms: ['switch2'] },
          { nsuid: '70010000000001', title: 'No slug', slug: '', platforms: ['switch2'] },
          { nsuid: '', title: 'No nsuid', slug: 'x' },
          'not-an-object',
        ]);
        assert.strictEqual(normalized.length, 3);
        assert.strictEqual(normalized[0].nsuid, '70010000000153');
        assert.strictEqual(normalized[0].title, 'Mario Kart');
        assert.strictEqual(normalized[0].slug, 'mario-kart-8-deluxe-switch');
        assert.deepStrictEqual(normalized[0].genres, ['Racing']);
        assert.deepStrictEqual(normalized[0].platforms, ['switch1']);
        assert.deepStrictEqual(normalized[1].platforms, ['switch1']);
        assert.deepStrictEqual(normalized[2].platforms, ['switch2']);
      },
    },
    {
      name: 'a game on sale maps to a USD Game with original + current price',
      run: () => {
        const game = mapPriceToGame(CATALOG_ENTRY, priceFixture(), 'USD', 'USD');
        assert.ok(game !== null);
        assert.strictEqual(game.currency, 'USD');
        assert.strictEqual(game.currentPrice, 41.99);
        assert.strictEqual(game.originalPrice, 59.99);
        assert.strictEqual(game.ageRating, 'Everyone 10+');
        assert.deepStrictEqual(game.genres, ['Adventure', 'Action']);
        assert.strictEqual(game.source, 'nintendo-price');
        assert.strictEqual(
          game.storeUrl,
          'https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild-switch/',
        );
      },
    },
    {
      name: 'a game that is not on sale is ignored',
      run: () => {
        const game = mapPriceToGame(
          CATALOG_ENTRY,
          priceFixture({ discount_price: undefined }),
          'USD',
          'USD',
        );
        assert.strictEqual(game, null);
      },
    },
    {
      name: 'a non-discounted price (equal to regular) is ignored',
      run: () => {
        const game = mapPriceToGame(
          CATALOG_ENTRY,
          priceFixture({ discount_price: { amount: '$59.99', currency: 'USD', raw_value: '59.99' } }),
          'USD',
          'USD',
        );
        assert.strictEqual(game, null);
      },
    },
    {
      name: 'a non-USD price is rejected',
      run: () => {
        const eur = priceFixture({
          regular_price: { amount: '€59.99', currency: 'EUR', raw_value: '59.99' },
          discount_price: { amount: '€41.99', currency: 'EUR', raw_value: '41.99' },
        });
        assert.strictEqual(mapPriceToGame(CATALOG_ENTRY, eur, 'USD', 'USD'), null);
      },
    },
    {
      name: 'invalid/missing price numbers are rejected',
      run: () => {
        assert.strictEqual(
          mapPriceToGame(
            CATALOG_ENTRY,
            priceFixture({ regular_price: { currency: 'USD', raw_value: '' } }),
            'USD',
            'USD',
          ),
          null,
        );
        assert.strictEqual(
          mapPriceToGame(
            CATALOG_ENTRY,
            priceFixture({ discount_price: { currency: 'USD', raw_value: 'not-a-number' } }),
            'USD',
            'USD',
          ),
          null,
        );
      },
    },
    {
      name: 'required Game fields exist on every mapped game',
      run: () => {
        const game = mapPriceToGame(CATALOG_ENTRY, priceFixture(), 'USD', 'USD');
        assert.ok(game !== null);
        assertRequiredGameFields(game);
      },
    },
    {
      name: 'store URLs are built from the canonical catalog slug',
      run: () => {
        const celeste = buildStoreUrl({ nsuid: 'x', title: 'Celeste', slug: 'celeste-switch' });
        assert.strictEqual(
          celeste,
          'https://www.nintendo.com/us/store/products/celeste-switch/',
        );
        const hollow = buildStoreUrl({
          nsuid: 'x',
          title: 'Hollow Knight',
          slug: 'hollow-knight-switch',
        });
        assert.strictEqual(
          hollow,
          'https://www.nintendo.com/us/store/products/hollow-knight-switch/',
        );
        assert.strictEqual(buildStoreUrl({ nsuid: 'x', title: 'No slug', slug: '' }), undefined);
        assert.strictEqual(buildStoreUrl({ nsuid: 'x', title: 'No slug', slug: '  ' }), undefined);
      },
    },
    {
      name: 'platform filtering excludes games of the other platform and both includes all',
      run: () => {
        const switch1Only = new NintendoPriceCollector({ platform: 'switch1' });
        const switch2Only = new NintendoPriceCollector({ platform: 'switch2' });
        const both = new NintendoPriceCollector({ platform: 'both' });
        const catalog: CatalogGame[] = [
          { nsuid: 'a', title: 'Switch 1 only', slug: 'a-switch', platforms: ['switch1'] },
          { nsuid: 'b', title: 'Switch 2 only', slug: 'b-switch', platforms: ['switch2'] },
          { nsuid: 'c', title: 'Both consoles', slug: 'c-switch', platforms: ['switch1', 'switch2'] },
        ];
        assert.deepStrictEqual(
          switch1Only.filterCatalogByPlatform(catalog).map((e) => e.title),
          ['Switch 1 only', 'Both consoles'],
        );
        assert.deepStrictEqual(
          switch2Only.filterCatalogByPlatform(catalog).map((e) => e.title),
          ['Switch 2 only', 'Both consoles'],
        );
        assert.strictEqual(both.filterCatalogByPlatform(catalog).length, 3);
      },
    },
    {
      name: 'factory creates a NintendoPriceCollector for the "nintendo" kind',
      run: () => {
        assert.ok(createGameCollector('nintendo') instanceof NintendoPriceCollector);
        assert.throws(() => createGameCollector('deku'), /Unknown game collector/);
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