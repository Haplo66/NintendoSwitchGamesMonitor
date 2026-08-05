import 'dotenv/config';

import * as assert from 'node:assert';

import { DEFAULT_NOTIFICATION_SETTINGS } from '../config/settings-loader';
import { Game, GameAnalysis, MonitorResult } from '../models';
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

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'LEGO Jurassic World',
    platform: 'Nintendo Switch',
    currentPrice: 3.99,
    originalPrice: 39.99,
    currency: 'USD',
    genres: ['Action', 'Adventure'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game): GameAnalysis {
  return {
    game,
    familyMatches: [
      { profileName: 'Alex (Kid)', matched: true, reasons: ['Matches preferred genre "Adventure"'] },
    ],
    dealScore: { score: 100, reasons: ['Matches 1 family profile(s)'] },
  };
}

function resultWith(overrides: Partial<MonitorResult> = {}): MonitorResult {
  return {
    generatedAt: '2026-08-05T00:00:00.000Z',
    collector: 'test',
    currency: 'USD',
    minDealScore: 70,
    defaultWishlistDiscountPercent: DEFAULT_NOTIFICATION_SETTINGS.defaultWishlistDiscountPercent,
    executionTimeMs: 42,
    analyzedCount: 0,
    potentialMatchCount: 0,
    reportedCount: 0,
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

function recommendationTitles(result: MonitorResult): string[] {
  const digest = buildDailyDigest(result);
  return digest.recommendations.flatMap((recommendation) =>
    recommendation.games.map((game) => game.title),
  );
}

export async function validateRecommendations(): Promise<void> {
  const checks: Check[] = [
    {
      name: 'discounted family match appears',
      run: () => {
        const analysis = makeAnalysis(makeGame({ currentPrice: 3.99, originalPrice: 39.99 }));
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [analysis] });
        assert.deepStrictEqual(recommendationTitles(result), ['LEGO Jurassic World']);
      },
    },
    {
      name: 'full-price family match excluded',
      run: () => {
        const analysis = makeAnalysis(
          makeGame({ currentPrice: 39.99, originalPrice: 39.99 }),
        );
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [analysis] });
        assert.deepStrictEqual(recommendationTitles(result), []);
      },
    },
    {
      name: 'full-price wishlist game is not recommended and stays in Wishlist Watch',
      run: () => {
        const stardew = makeGame({
          title: 'Stardew Valley',
          currentPrice: 49.99,
          originalPrice: 49.99,
        });
        const analysis = makeAnalysis(stardew);
        analysis.wishlistMatch = {
          matched: true,
          wishlistItem: { gameTitle: 'Stardew Valley', targetPrice: 40, notifyOnAnyDiscount: false },
          priceTargetReached: false,
          effectiveTargetPrice: 40,
          targetPriceOrigin: 'configured',
        };
        const result = resultWith({
          analyses: [analysis],
          reportedAnalyses: [analysis],
          wishlist: {
            items: [{ gameTitle: 'Stardew Valley', targetPrice: 40, notifyOnAnyDiscount: false }],
          },
          monitoredTitles: ['Stardew Valley'],
        });
        assert.deepStrictEqual(recommendationTitles(result), []);
        const digest = buildDailyDigest(result);
        const watch = digest.wishlistWatch.find((item) => item.title === 'Stardew Valley');
        assert.ok(watch, 'Full-price wishlist game must remain in Wishlist Watch');
        assert.strictEqual(watch.status, 'full-price');
        const html = renderDigestEmail(digest);
        assert.ok(html.includes('Full Price'), 'Wishlist Watch must show the full-price status');
      },
    },
    {
      name: 'active historical deal remains visible',
      run: () => {
        const zelda = makeGame({
          title: 'The Legend of Zelda: Breath of the Wild',
          currentPrice: 39.99,
          originalPrice: 59.99,
        });
        const analysis = makeAnalysis(zelda);
        const result = resultWith({
          analyses: [analysis],
          reportedAnalyses: [analysis],
          dealHistory: {
            entries: [
              {
                gameTitle: 'The Legend of Zelda: Breath of the Wild',
                firstSeenOnSale: '2026-07-20T00:00:00.000Z',
                lastSeenOnSale: '2026-08-05T00:00:00.000Z',
                firstNotified: '2026-07-20T00:00:00.000Z',
                lastNotified: '2026-07-20T00:00:00.000Z',
                lastNotifiedPrice: 39.99,
                notificationCount: 1,
                currentlyOnSale: true,
              },
            ],
          },
        });
        assert.deepStrictEqual(recommendationTitles(result), [
          'The Legend of Zelda: Breath of the Wild',
        ]);
      },
    },
    {
      name: 'free games remain visible',
      run: () => {
        const fortnite = makeGame({
          title: 'Fortnite',
          currentPrice: 0,
          originalPrice: undefined,
        });
        const analysis = makeAnalysis(fortnite);
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [analysis] });
        assert.deepStrictEqual(recommendationTitles(result), ['Fortnite']);
        const digest = buildDailyDigest(result);
        const game = digest.recommendations[0].games[0];
        assert.strictEqual(game.isFree, true);
        assert.strictEqual(game.discountPercent, 0);
      },
    },
    {
      name: 'recommended games expose price status and render it',
      run: () => {
        const lego = makeGame({ currentPrice: 3.99, originalPrice: 39.99 });
        const result = resultWith({
          analyses: [makeAnalysis(lego)],
          reportedAnalyses: [makeAnalysis(lego)],
        });
        const digest = buildDailyDigest(result);
        const game = digest.recommendations[0].games[0];
        assert.strictEqual(game.currentPrice, 3.99);
        assert.strictEqual(game.originalPrice, 39.99);
        assert.strictEqual(game.discountPercent, 90);
        assert.strictEqual(game.isFree, false);
        const html = renderDigestEmail(digest);
        assert.ok(html.includes('-90%'), 'Discount badge missing in rendered recommendation');
        assert.ok(html.includes('USD 3.99'), 'Price missing in rendered recommendation');
        assert.ok(html.includes('LEGO Jurassic World'), 'Recommended title missing');
      },
    },
    {
      name: 'blacklisted-style full-price catalog game is not recommended',
      run: () => {
        const odyssey = makeAnalysis(
          makeGame({
            title: 'Super Mario Odyssey',
            currentPrice: 59.99,
            originalPrice: 59.99,
          }),
        );
        const result = resultWith({
          analyses: [odyssey],
          reportedAnalyses: [odyssey],
        });
        assert.deepStrictEqual(recommendationTitles(result), []);
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll recommendation validation checks passed.');
}

if (require.main === module) {
  validateRecommendations().catch((error: unknown) => {
    console.error('Recommendation validation failed:', error);
    process.exitCode = 1;
  });
}
