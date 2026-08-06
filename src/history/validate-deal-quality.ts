import 'dotenv/config';

import * as assert from 'node:assert';

import { PriceObservation } from '../models';
import { evaluateDealQuality } from './deal-quality';
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

function history(...prices: number[]): PriceObservation[] {
  return prices.map((price, index) => ({ date: `2026-07-${String(index + 1).padStart(2, '0')}`, price }));
}

const base = {
  currentPrice: 39.99,
  originalPrice: 59.99,
  discountPercent: 33,
};

const checks: Check[] = [
  {
    name: 'empty history produces no quality',
    run: () => {
      assert.strictEqual(evaluateDealQuality({ ...base, priceHistory: [] }), undefined);
    },
  },
  {
    name: 'the exact lowest recorded price is an excellent deal',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 39.99, priceHistory: history(59.99, 49.99, 39.99) });
      assert.strictEqual(quality?.rating, 'excellent');
      assert.strictEqual(quality?.reason, 'New lowest price');
    },
  },
  {
    name: 'a price below the historical low is an excellent deal',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 35.0, priceHistory: history(59.99, 39.99) });
      assert.strictEqual(quality?.rating, 'excellent');
    },
  },
  {
    name: 'a price just above the low but within 10% is a great deal',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 43.0, priceHistory: history(59.99, 39.99) });
      assert.strictEqual(quality?.rating, 'great');
      assert.strictEqual(quality?.reason, 'Near lowest price');
    },
  },
  {
    name: 'a price above the 10% window falls through to average comparison',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 49.99, priceHistory: history(59.99, 39.99) });
      assert.ok(quality !== undefined);
      assert.notStrictEqual(quality.rating, 'great');
    },
  },
  {
    name: 'a price below the average is a good deal',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 45.0, priceHistory: history(59.99, 39.99) });
      assert.strictEqual(quality?.rating, 'good');
      assert.strictEqual(quality?.reason, 'Below average sale price');
    },
  },
  {
    name: 'a price at or above the average is a weak deal',
    run: () => {
      const weak = evaluateDealQuality({ ...base, currentPrice: 55.0, priceHistory: history(59.99, 39.99) });
      assert.strictEqual(weak?.rating, 'weak');
      assert.strictEqual(weak?.reason, 'Usually cheaper');

      const exactlyAverage = evaluateDealQuality({ ...base, currentPrice: 49.99, priceHistory: history(59.99, 39.99) });
      assert.strictEqual(exactlyAverage?.rating, 'weak', 'a price equal to the average must not count as below');
    },
  },
  {
    name: 'average is computed across the whole history',
    run: () => {
      const quality = evaluateDealQuality({ ...base, currentPrice: 45.0, priceHistory: history(80, 39.99) });
      assert.strictEqual(quality?.rating, 'good', 'with avg ~60 a price of 45 is below average');
    },
  },
  {
    name: 'single price history still judges correctly',
    run: () => {
      const lowest = evaluateDealQuality({ ...base, currentPrice: 39.99, priceHistory: history(39.99) });
      assert.strictEqual(lowest?.rating, 'excellent');
      const above = evaluateDealQuality({ ...base, currentPrice: 43.0, priceHistory: history(39.99) });
      assert.strictEqual(above?.rating, 'great');
    },
  },
  {
    name: 'a quality badge renders in the digest for eligible deals',
    run: () => {
      const html = renderBestDealsSection(
        [
          {
            title: 'Mario Kart 8 Deluxe',
            currentPrice: 39.99,
            originalPrice: 59.99,
            discountPercent: 33,
            score: 100,
            reasons: [],
            ageRating: 'E',
            storeUrl: 'https://store/',
            quality: { rating: 'excellent', reason: 'New lowest price' },
          },
        ],
        'USD',
      );
      assert.ok(html.includes('Excellent deal'), 'quality badge not rendered');
      assert.ok(html.includes('New lowest price'), 'quality reason not rendered');
    },
  },
  {
    name: 'deals without quality render no quality badge',
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
      assert.ok(!html.includes('Excellent deal'), 'no quality badge expected');
      assert.ok(!html.includes('Great deal') && !html.includes('Good deal') && !html.includes('Weak sale'), 'no quality badge expected');
    },
  },
];

async function validateDealQuality(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll deal quality validation checks passed.');
}

if (require.main === module) {
  validateDealQuality().catch((error: unknown) => {
    console.error('Deal quality validation failed:', error);
    process.exitCode = 1;
  });
}