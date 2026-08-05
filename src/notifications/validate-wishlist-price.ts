import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Game, GameAnalysis, MonitorResult } from '../models';
import { CatalogGame, NintendoPriceCollector } from '../collectors/nintendo-price-collector';
import { buildDailyDigest } from './daily-digest-builder';
import { renderDigestEmail } from './email-renderer';

interface Check {
  name: string;
  run: () => void;
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

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Mario Kart 8 Deluxe',
    platform: 'Nintendo Switch',
    currentPrice: 34.99,
    originalPrice: 59.99,
    currency: 'EUR',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game, wishlistMatch?: GameAnalysis['wishlistMatch']): GameAnalysis {
  const analysis: GameAnalysis = {
    game,
    familyMatches: [],
    dealScore: { score: 100, reasons: ['Age appropriate for the family'] },
  };
  if (wishlistMatch !== undefined) {
    analysis.wishlistMatch = wishlistMatch;
  }
  return analysis;
}

function makeResult(overrides: Partial<MonitorResult> = {}): MonitorResult {
  return {
    generatedAt: new Date().toISOString(),
    collector: 'test',
    currency: 'EUR',
    minDealScore: 60,
    defaultWishlistDiscountPercent: 20,
    executionTimeMs: 42,
    analyzedCount: 2,
    potentialMatchCount: 2,
    reportedCount: 2,
    skippedByCooldownCount: 0,
    analyses: [],
    reportedAnalyses: [],
    skippedByCooldownAnalyses: [],
    skippedByScoreAnalyses: [],
    dealHistory: { entries: [] },
    wishlist: { items: [] },
    monitoredTitles: [],
    wishlistGames: [],
    ...overrides,
  };
}

function digestSampleResult(): MonitorResult {
  const stardew = makeGame({
    id: 'game-1',
    title: 'Stardew Valley',
    currentPrice: 11.99,
    originalPrice: 19.99,
    storeUrl: 'https://www.nintendo.com/store/products/stardew-valley/',
  });
  const marioKart = makeGame({
    id: 'game-2',
    title: 'Mario Kart 8 Deluxe',
    currentPrice: 34.99,
    originalPrice: 59.99,
    storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/',
  });
  const luigisMansion = makeGame({
    id: 'game-3',
    title: "Luigi's Mansion 3",
    currentPrice: 59.99,
    originalPrice: 59.99,
    storeUrl: 'https://www.nintendo.com/store/products/luigis-mansion-3/',
  });
  const hollowKnight = makeGame({
    id: 'game-4',
    title: 'Hollow Knight',
    currentPrice: 7.49,
    originalPrice: 14.99,
    storeUrl: 'https://www.nintendo.com/store/products/hollow-knight/',
  });

  const stardewAnalysis = makeAnalysis(stardew, {
    matched: true,
    wishlistItem: { gameTitle: 'Stardew Valley', notifyOnAnyDiscount: false },
    priceTargetReached: false,
    effectiveTargetPrice: 15.99,
    targetPriceOrigin: 'auto',
  });
  const marioKartAnalysis = makeAnalysis(marioKart, {
    matched: true,
    wishlistItem: { gameTitle: 'Mario Kart 8 Deluxe', targetPrice: 39.99, notifyOnAnyDiscount: false },
    priceTargetReached: true,
    effectiveTargetPrice: 39.99,
    targetPriceOrigin: 'configured',
  });
  const hollowKnightAnalysis = makeAnalysis(hollowKnight);

  return makeResult({
    analyzedCount: 3,
    potentialMatchCount: 3,
    reportedCount: 2,
    analyses: [stardewAnalysis, marioKartAnalysis, hollowKnightAnalysis],
    reportedAnalyses: [stardewAnalysis, marioKartAnalysis],
    dealHistory: {
      entries: [
        {
          gameTitle: 'Hollow Knight',
          firstSeenOnSale: '2026-07-20T08:00:00.000Z',
          lastSeenOnSale: '2026-08-05T08:00:00.000Z',
          firstNotified: '2026-07-20T09:00:00.000Z',
          lastNotified: '2026-07-20T09:00:00.000Z',
          notificationCount: 1,
          currentlyOnSale: true,
        },
      ],
    },
    wishlist: {
      items: [
        { gameTitle: 'Stardew Valley', notifyOnAnyDiscount: false },
        { gameTitle: 'Mario Kart 8 Deluxe', targetPrice: 39.99, notifyOnAnyDiscount: false },
        { gameTitle: "Luigi's Mansion 3", targetPrice: 45, notifyOnAnyDiscount: false },
        { gameTitle: 'Super Mario RPG', notifyOnAnyDiscount: false },
      ],
    },
    monitoredTitles: [
      'Stardew Valley',
      'Mario Kart 8 Deluxe',
      "Luigi's Mansion 3",
    ],
    wishlistGames: [luigisMansion],
  });
}

export async function validateWishlistPrice(): Promise<void> {
  const checks: Check[] = [];

  checks.push({
    name: 'full-price monitored wishlist game still shows today\u2019s current price',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      const luigi = digest.wishlistWatch.find((item) => item.title === "Luigi's Mansion 3");
      assert.ok(luigi, "Luigi's Mansion 3 must appear in Wishlist Watch");
      assert.strictEqual(luigi.status, 'full-price');
      assert.strictEqual(luigi.currentPrice, 59.99, 'Full-price game must expose its current price');
      assert.strictEqual(luigi.originalPrice, 59.99);
      assert.strictEqual(luigi.discountPercent, 0);
      assert.strictEqual(luigi.targetPrice, 45, 'Configured target price must be kept');
    },
  });

  checks.push({
    name: 'on-sale wishlist game shows current, regular and discount percent',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      const stardew = digest.wishlistWatch.find((item) => item.title === 'Stardew Valley');
      assert.ok(stardew);
      assert.strictEqual(stardew.status, 'on-sale');
      assert.strictEqual(stardew.currentPrice, 11.99);
      assert.strictEqual(stardew.originalPrice, 19.99);
      assert.ok((stardew.discountPercent ?? 0) > 0, 'Discount percent expected on sale');
      assert.strictEqual(stardew.targetPriceOrigin, 'auto');
    },
  });

  checks.push({
    name: 'target-reached wishlist game keeps its status and price',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      const marioKart = digest.wishlistWatch.find((item) => item.title === 'Mario Kart 8 Deluxe');
      assert.ok(marioKart);
      assert.strictEqual(marioKart.status, 'target-reached');
      assert.strictEqual(marioKart.currentPrice, 34.99);
      assert.strictEqual(marioKart.targetPrice, 39.99);
      assert.strictEqual(marioKart.targetPriceOrigin, 'configured');
    },
  });

  checks.push({
    name: 'not-monitored wishlist game shows no price and stays not-monitored',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      const rpg = digest.wishlistWatch.find((item) => item.title === 'Super Mario RPG');
      assert.ok(rpg);
      assert.strictEqual(rpg.status, 'not-monitored');
      assert.strictEqual(rpg.currentPrice, undefined);
      assert.strictEqual(rpg.originalPrice, undefined);
    },
  });

  checks.push({
    name: 'every monitored wishlist game exposes a current price',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      for (const item of digest.wishlistWatch) {
        if (item.status === 'not-monitored') {
          continue;
        }
        assert.ok(
          item.currentPrice !== undefined,
          `Monitored wishlist game "${item.title}" must always expose a current price`,
        );
      }
    },
  });

  checks.push({
    name: 'Wishlist Watch keeps wishlist item order and renders right after the summary',
    run: () => {
      const digest = buildDailyDigest(digestSampleResult());
      assert.deepStrictEqual(
        digest.wishlistWatch.map((item) => item.title),
        ['Stardew Valley', 'Mario Kart 8 Deluxe', "Luigi's Mansion 3", 'Super Mario RPG'],
      );

      const html = renderDigestEmail(digest);
      const summaryIndex = html.indexOf('Today\u2019s Summary');
      const wishlistIndex = html.indexOf('Wishlist Watch');
      const stillOnSaleIndex = html.indexOf('Still On Sale');
      assert.ok(summaryIndex >= 0, 'Summary section missing');
      assert.ok(wishlistIndex >= 0, 'Wishlist Watch section missing');
      assert.ok(stillOnSaleIndex >= 0, 'Still On Sale section missing');
      assert.ok(
        summaryIndex < wishlistIndex && wishlistIndex < stillOnSaleIndex,
        'Wishlist Watch must render after the summary and before Still On Sale',
      );
      assert.ok(html.includes('Current Price:'), 'Current Price label missing');
      assert.ok(html.includes('Full Price'), 'Full Price badge missing for full-price game');
    },
  });

  // Collector-level checks against a stubbed Nintendo price API.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-price-'));
  const catalogPath = path.join(tempDir, 'catalog.json');
  const catalog: CatalogGame[] = [];
  for (let i = 1; i <= 30; i += 1) {
    catalog.push({
      nsuid: `7000000000000${String(i).padStart(2, '0')}`,
      title: `Game ${String(i).padStart(2, '0')}`,
      slug: `game-${String(i).padStart(2, '0')}`,
      platforms: ['switch1'],
    });
  }
  fs.writeFileSync(catalogPath, JSON.stringify(catalog), 'utf8');

  const onSaleNsuid = catalog[0].nsuid;
  const fetchLog: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    fetchLog.push(url.searchParams.getAll('ids').join(','));
    const prices = url.searchParams
      .getAll('ids')
      .filter((id) => /^\d+$/.test(id))
      .map((id) => ({
        title_id: id,
        regular_price: { currency: 'USD', raw_value: '59.99' },
        discount_price:
          id === onSaleNsuid
            ? { currency: 'USD', raw_value: '39.99' }
            : undefined,
      }));
    return {
      ok: true,
      status: 200,
      json: async () => ({ country: 'US', prices }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    checks.push({
      name: 'collector reuses already-fetched prices (no duplicate API requests)',
      run: async () => {
        const collector = new NintendoPriceCollector({ catalogPath });
        fetchLog.length = 0;
        const games = await collector.collectGames({ limit: 1 });
        assert.strictEqual(fetchLog.length, 1, 'Deal discovery should fetch the first price batch once');
        assert.strictEqual(games.length, 1, 'Only the discounted game should be a deal');

        const wishlistGames = await collector.collectWishlistPrices(['Game 01']);
        assert.strictEqual(fetchLog.length, 1, 'Wishlist lookup must reuse cached prices, no new requests');
        assert.strictEqual(wishlistGames.length, 1);
        assert.strictEqual(wishlistGames[0].currentPrice, 39.99);
      },
    });

    checks.push({
      name: 'collector fetches only the wishlist prices it has not yet fetched',
      run: async () => {
        const collector = new NintendoPriceCollector({ catalogPath });
        fetchLog.length = 0;
        await collector.collectGames({ limit: 1 });

        const cached = await collector.collectWishlistPrices(['Game 01']);
        assert.strictEqual(fetchLog.length, 1, 'Cached nsuid must not trigger a request');

        const fullPrice = await collector.collectWishlistPrices(['Game 21']);
        assert.strictEqual(fetchLog.length, 2, 'Only the missing nsuid batch should be fetched');
        assert.strictEqual(fullPrice.length, 1);
        assert.strictEqual(fullPrice[0].currentPrice, 59.99, 'Full-price game exposes regular price');
        assert.strictEqual(fullPrice[0].originalPrice, 59.99);
      },
    });

    await runChecks(checks);
    console.log('\nAll wishlist price tracking checks passed.');
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  validateWishlistPrice().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
