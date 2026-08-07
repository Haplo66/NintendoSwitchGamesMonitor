import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DealHistory, Game, PriceObservation } from '../models';
import {
  loadDealHistory,
  recordPriceObservation,
  reconcileDealHistory,
  saveDealHistory,
} from '../config/notification-history-store';
import {
  getAveragePrice,
  getHighestPrice,
  getLowestPrice,
  getPriceContext,
  isLowestRecordedPrice,
} from './price-intelligence';
import { renderBestDealsSection } from '../notifications/email-template';

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

const NOW = new Date('2026-08-05T12:00:00.000Z');
const NOW_DATE = NOW.toISOString().slice(0, 10);

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Mario Kart 8 Deluxe',
    platform: 'Nintendo Switch',
    currentPrice: 34.99,
    originalPrice: 59.99,
    currency: 'USD',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function makeEntry(priceHistory?: PriceObservation[]): DealHistory['entries'][number] {
  return {
    gameTitle: 'Mario Kart 8 Deluxe',
    firstSeenOnSale: '2026-07-01T00:00:00.000Z',
    lastSeenOnSale: '2026-07-30T00:00:00.000Z',
    notificationCount: 1,
    currentlyOnSale: true,
    priceHistory,
  };
}

function tempHistoryFile(): string {
  return path.join(os.tmpdir(), `nsm-price-${Date.now()}-${Math.random()}.json`);
}

const checks: Check[] = [
  {
    name: 'a new price observation seeds the history',
    run: () => {
      const seeded = recordPriceObservation(undefined, 39.99, NOW);
      assert.strictEqual(seeded.length, 1);
      assert.deepStrictEqual(seeded[0], { date: NOW_DATE, price: 39.99 });
    },
  },
  {
    name: 'the same price does not create a duplicate observation',
    run: () => {
      const seeded = recordPriceObservation(undefined, 39.99, NOW);
      const again = recordPriceObservation(seeded, 39.99, NOW);
      assert.strictEqual(again.length, 1, 'unchanged price must not be appended');
    },
  },
  {
    name: 'a price change creates a new observation',
    run: () => {
      const existing: PriceObservation[] = [{ date: '2026-07-01', price: 39.99 }];
      const changed = recordPriceObservation(existing, 34.99, NOW);
      assert.strictEqual(changed.length, 2);
      assert.deepStrictEqual(changed[1], { date: NOW_DATE, price: 34.99 });
    },
  },
  {
    name: 'a new on-sale game records an initial price observation',
    run: () => {
      const result = reconcileDealHistory({ entries: [] }, [makeGame()], [], NOW);
      assert.strictEqual(result.entries.length, 1);
      assert.deepStrictEqual(result.entries[0].priceHistory, [
        { date: NOW_DATE, price: 34.99 },
      ]);
    },
  },
  {
    name: 'reconciliation does not append an unchanged price on the next run',
    run: () => {
      const first = reconcileDealHistory({ entries: [] }, [makeGame()], [], NOW);
      const second = reconcileDealHistory(first, [makeGame()], [], NOW);
      assert.strictEqual(second.entries[0].priceHistory?.length, 1, 'unchanged price duplicated history');
    },
  },
  {
    name: 'a price change during reconciliation appends an observation',
    run: () => {
      const existing: DealHistory = {
        entries: [
          makeEntry([{ date: '2026-07-01', price: 39.99 }]),
        ],
      };
      const result = reconcileDealHistory(existing, [makeGame({ currentPrice: 34.99 })], [], NOW);
      assert.strictEqual(result.entries[0].priceHistory?.length, 2);
      assert.deepStrictEqual(result.entries[0].priceHistory?.[1], { date: NOW_DATE, price: 34.99 });
    },
  },
  {
    name: 'empty price history yields no lowest price',
    run: () => {
      assert.strictEqual(getLowestPrice([]), undefined);
      assert.strictEqual(getHighestPrice([]), undefined);
      assert.strictEqual(getAveragePrice([]), undefined);
      assert.strictEqual(isLowestRecordedPrice([], 10), false);
    },
  },
  {
    name: 'a single price entry is the lowest, highest, and average',
    run: () => {
      const history: PriceObservation[] = [{ date: '2026-07-01', price: 39.99 }];
      assert.strictEqual(getLowestPrice(history), 39.99);
      assert.strictEqual(getHighestPrice(history), 39.99);
      assert.strictEqual(getAveragePrice(history), 39.99);
    },
  },
  {
    name: 'lowest and highest prices are detected across history',
    run: () => {
      const history: PriceObservation[] = [
        { date: '2026-06-01', price: 59.99 },
        { date: '2026-07-10', price: 39.99 },
        { date: '2026-08-05', price: 34.99 },
      ];
      assert.strictEqual(getLowestPrice(history), 34.99);
      assert.strictEqual(getHighestPrice(history), 59.99);
    },
  },
  {
    name: 'average price is calculated correctly',
    run: () => {
      const history: PriceObservation[] = [
        { date: '2026-06-01', price: 60 },
        { date: '2026-07-01', price: 40 },
      ];
      assert.strictEqual(getAveragePrice(history), 50);
    },
  },
  {
    name: 'isLowestRecordedPrice handles empty, tied, and above scenarios',
    run: () => {
      const history: PriceObservation[] = [{ date: '2026-07-01', price: 39.99 }];
      assert.strictEqual(isLowestRecordedPrice([], 10), false);
      assert.ok(isLowestRecordedPrice(history, 39.99), 'tied price counts as lowest');
      assert.ok(isLowestRecordedPrice(history, 30), 'lower price is a new low');
      assert.ok(!isLowestRecordedPrice(history, 45.0), 'higher price is not a low');
    },
  },
  {
    name: 'getPriceContext marks a new low and reports the previous low',
    run: () => {
      const history: PriceObservation[] = [
        { date: '2026-07-01', price: 39.99 },
        { date: '2026-07-10', price: 42.99 },
      ];
      const context = getPriceContext(history, 34.99);
      assert.strictEqual(context.isLowestRecorded, true);
      assert.strictEqual(context.previousLowest, 39.99);
      assert.strictEqual(context.lowestPrice, undefined);
    },
  },
  {
    name: 'getPriceContext reports the historical low for a non-low current price',
    run: () => {
      const history: PriceObservation[] = [
        { date: '2026-07-01', price: 39.99 },
        { date: '2026-07-10', price: 34.99 },
      ];
      const context = getPriceContext(history, 44.99);
      assert.strictEqual(context.isLowestRecorded, false);
      assert.strictEqual(context.lowestPrice, 34.99);
    },
  },
  {
    name: 'empty history yields no price context',
    run: () => {
      const context = getPriceContext([], 30);
      assert.strictEqual(context.isLowestRecorded, false);
      assert.strictEqual(context.lowestPrice, undefined);
      assert.strictEqual(context.previousLowest, undefined);
    },
  },
  {
    name: 'existing history without priceHistory loads and reconciles safely',
    run: () => {
      const file = tempHistoryFile();
      const legacy = { entries: [makeEntry()] };
      try {
        saveDealHistory(legacy, file);
        const loaded = loadDealHistory(file);
        assert.strictEqual(loaded.entries.length, 1);
        assert.strictEqual(loaded.entries[0].priceHistory, undefined, 'missing priceHistory stays undefined');
        const result = reconcileDealHistory(loaded, [makeGame()], [], NOW);
        assert.deepStrictEqual(result.entries[0].priceHistory?.[0], { date: NOW_DATE, price: 34.99 });
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'legacy notification records migrate with a price history and no data loss',
    run: () => {
      const file = tempHistoryFile();
      fs.writeFileSync(
        file,
        JSON.stringify({
          records: [
            { title: 'Mario Kart 8 Deluxe', price: 49.99, notifiedAt: '2026-07-01T00:00:00.000Z' },
            { title: 'Mario Kart 8 Deluxe', price: 49.99, notifiedAt: '2026-07-02T00:00:00.000Z' },
            { title: 'Mario Kart 8 Deluxe', price: 39.99, notifiedAt: '2026-07-10T00:00:00.000Z' },
          ],
        }),
        'utf8',
      );
      try {
        const history = loadDealHistory(file);
        assert.strictEqual(history.entries.length, 1);
        const entry = history.entries[0];
        assert.strictEqual(entry.notificationCount, 3, 'notification count must be preserved');
        assert.strictEqual(entry.firstNotified, '2026-07-01T00:00:00.000Z');
        assert.deepStrictEqual(entry.priceHistory, [
          { date: '2026-07-01', price: 49.99 },
          { date: '2026-07-10', price: 39.99 },
        ]);
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  },
  {
    name: 'a new-lowest deal renders price context in the digest',
    run: () => {
      const html = renderBestDealsSection(
        [
          {
            title: 'Mario Kart 8 Deluxe',
            currentPrice: 34.99,
            originalPrice: 59.99,
            discountPercent: 42,
            score: 100,
            reasons: [],
            ageRating: 'E',
            storeUrl: 'https://www.nintendo.com/us/store/products/mario-kart-8-deluxe-switch/',
            priceContext: { isLowestRecorded: true, previousLowest: 39.99 },
          },
        ],
        'USD',
      );
      assert.ok(html.includes('At its historical low'), 'new-low badge not rendered');
      assert.ok(html.includes('Previous low'), 'previous low not rendered');
    },
  },
  {
    name: 'a non-low deal renders the historical lowest price',
    run: () => {
      const html = renderBestDealsSection(
        [
          {
          title: 'Mario Kart 8 Deluxe',
          currentPrice: 44.99,
          originalPrice: 59.99,
          discountPercent: 25,
          score: 90,
          reasons: [],
          ageRating: 'E',
          storeUrl: 'https://store/',
          priceContext: { isLowestRecorded: false, lowestPrice: 34.99 },
        },
        ],
        'USD',
      );
      assert.ok(html.includes('Historical low'), 'historical-low line not rendered');
    },
  },
  {
    name: 'deals without price history render no price context',
    run: () => {
      const html = renderBestDealsSection(
        [
          {
            title: 'Mario Kart 8 Deluxe',
            currentPrice: 44.99,
            originalPrice: 59.99,
            discountPercent: 25,
            score: 90,
            reasons: [],
            ageRating: 'E',
            storeUrl: 'https://store/',
          },
        ],
        'USD',
      );
      assert.ok(!html.includes('priceHistory') && !html.includes('Lowest price'), 'no context expected');
    },
  },
];

async function validatePriceIntelligence(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll price intelligence validation checks passed.');
}

if (require.main === module) {
  validatePriceIntelligence().catch((error: unknown) => {
    console.error('Price intelligence validation failed:', error);
    process.exitCode = 1;
  });
}