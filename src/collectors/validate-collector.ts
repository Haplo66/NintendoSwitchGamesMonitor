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
  buildDealUrl,
  loadGameCatalog,
  mapPriceToGame,
  normalizeCatalog,
} from './nintendo-price-collector';
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
      name: 'collector settings resolve to the US region and USD',
      run: () => {
        const settings = resolveCollectorSettings({ NINTENDO_REGION: 'US' });
        assert.strictEqual(settings.nintendoRegion, 'US');
        assert.strictEqual(settings.dealsCurrency, 'USD');
        assert.ok(settings.gameCatalogPath.length > 0, 'gameCatalogPath is empty');
      },
    },
    {
      name: 'the default game catalog loads valid entries',
      run: () => {
        const catalog = loadGameCatalog();
        assert.ok(catalog.length > 0, 'Default catalog loaded no games');
        for (const entry of catalog) {
          assert.ok(typeof entry.nsuid === 'string' && entry.nsuid.length > 0, 'entry nsuid is missing');
          assert.ok(typeof entry.title === 'string' && entry.title.length > 0, 'entry title is missing');
        }
      },
    },
    {
      name: 'catalog normalization trims values and drops invalid entries',
      run: () => {
        const normalized = normalizeCatalog([
          { nsuid: ' 70010000000153 ', title: ' Mario Kart ', genres: ['Racing', 42], esrbRating: 'E' },
          { nsuid: '', title: 'No nsuid' },
          { title: 'No nsuid either' },
          'not-an-object',
        ]);
        assert.strictEqual(normalized.length, 1);
        assert.strictEqual(normalized[0].nsuid, '70010000000153');
        assert.strictEqual(normalized[0].title, 'Mario Kart');
        assert.deepStrictEqual(normalized[0].genres, ['Racing']);
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
          'https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild/',
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
      name: 'deal URLs are unique per title and point to the US store',
      run: () => {
        const url = buildDealUrl({ nsuid: 'x', title: 'Stardew Valley' }, 'https://www.nintendo.com');
        assert.strictEqual(url, 'https://www.nintendo.com/us/store/products/stardew-valley/');
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