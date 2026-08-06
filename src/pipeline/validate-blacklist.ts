import 'dotenv/config';

import * as assert from 'node:assert';

import { analyzeGamesWith } from '../analyzer/analyze';
import { filterBlacklistedGames, isGameBlacklisted } from '../config/blacklist';
import { Game, FamilyProfile, GameAnalysis, MonitorResult, Wishlist, WishlistItem, DealHistoryEntry } from '../models';
import { buildDailyDigest } from '../notifications/daily-digest-builder';
import { renderDigestEmail } from '../notifications/email-renderer';
import { isWorthReporting } from '../pipeline/monitor-run';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../config/settings-loader';

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
    title: 'Stardew Valley',
    platform: 'Nintendo Switch',
    currentPrice: 11.99,
    originalPrice: 19.99,
    currency: 'USD',
    genres: ['Simulation'],
    storeUrl: 'https://www.nintendo.com/store/products/stardew-valley/',
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game): GameAnalysis {
  return { game, familyMatches: [], dealScore: { score: 100, reasons: [] } };
}

const EMPTY_PROFILES: FamilyProfile[] = [];

function wishlistFrom(items: WishlistItem[]): Wishlist {
  return { items };
}

function resultWith(overrides: Partial<MonitorResult> = {}): MonitorResult {
  return {
    generatedAt: new Date().toISOString(),
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

export async function validateBlacklist(): Promise<void> {
  const checks: Check[] = [];

  checks.push({
    name: 'blacklisted game is removed from the collection',
    run: () => {
      const carrot = makeGame({ id: 'game-1', title: 'Carrot Smash' });
      const stardew = makeGame({ id: 'game-2', title: 'Stardew Valley' });
      const filtered = filterBlacklistedGames([carrot, stardew], ['Carrot Smash']);
      assert.deepStrictEqual(
        filtered.map((game) => game.title),
        ['Stardew Valley'],
      );
    },
  });

  checks.push({
    name: 'blacklist matching is case-insensitive',
    run: () => {
      assert.ok(isGameBlacklisted('CARROT SMASH', ['carrot smash']), 'Uppercase title must match lowercase entry');
      assert.ok(isGameBlacklisted('carrot smash', ['Carrot Smash']), 'Lowercase title must match mixed-case entry');
      const filtered = filterBlacklistedGames(
        [makeGame({ id: 'game-1', title: 'CaRrOt SmAsH' })],
        ['carrot smash'],
      );
      assert.strictEqual(filtered.length, 0);
    },
  });

  checks.push({
    name: 'blacklist matching uses the normalized title',
    run: () => {
      assert.ok(
        isGameBlacklisted('  Carrot Smash  ', ['Carrot Smash']),
        'Surrounding whitespace must not prevent a match',
      );
      const filtered = filterBlacklistedGames([makeGame({ id: 'game-1', title: 'Carrot Smash' })], ['Carrot Smash']);
      assert.strictEqual(filtered.length, 0);
    },
  });

  checks.push({
    name: 'non-blacklisted games are unchanged',
    run: () => {
      const games = [
        makeGame({ id: 'game-1', title: 'Stardew Valley' }),
        makeGame({ id: 'game-2', title: 'Hollow Knight' }),
      ];
      const filtered = filterBlacklistedGames(games, ['Carrot Smash']);
      assert.strictEqual(filtered.length, 2, 'Unrelated blacklist entry must not change the collection');
      assert.deepStrictEqual(
        filtered.map((game) => game.title),
        ['Stardew Valley', 'Hollow Knight'],
      );
      assert.strictEqual(filterBlacklistedGames(games, []), games, 'Empty blacklist returns the same array');
    },
  });

  checks.push({
    name: 'blacklisted game is excluded from deal analysis',
    run: () => {
      const carrot = makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 0 });
      const stardew = makeGame({ id: 'game-2', title: 'Stardew Valley', currentPrice: 0 });
      const wishlist = wishlistFrom([{ gameTitle: 'Carrot Smash', notifyOnAnyDiscount: true }]);
      const filtered = filterBlacklistedGames([carrot, stardew], ['Carrot Smash']);
      const analyses = analyzeGamesWith(filtered, EMPTY_PROFILES, wishlist, 40);
      const titles = analyses.map((analysis) => analysis.game.title);
      assert.ok(!titles.includes('Carrot Smash'), 'Blacklisted game must not be analyzed');
      assert.ok(titles.includes('Stardew Valley'), 'Non-blacklisted game must still be analyzed');
    },
  });

  checks.push({
    name: 'blacklisted game does not generate a notification',
    run: () => {
      const carrot = makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 0 });
      const stardew = makeGame({ id: 'game-2', title: 'Stardew Valley', currentPrice: 0 });
      const wishlist = wishlistFrom([{ gameTitle: 'Carrot Smash', notifyOnAnyDiscount: true }]);
      const filtered = filterBlacklistedGames([carrot, stardew], ['Carrot Smash']);
      const analyses = analyzeGamesWith(filtered, EMPTY_PROFILES, wishlist, 40);
      const reported = analyses.filter((analysis) =>
        isWorthReporting(analysis, 70, { notifyFreeGames: true, notifyWishlistMatches: true }),
      );
      const titles = reported.map((analysis) => analysis.game.title);
      assert.ok(!titles.includes('Carrot Smash'), 'Blacklisted game must not be notified even if on the wishlist');
    },
  });

  checks.push({
    name: 'blacklisted-but-wishlisted game stays visible in Wishlist Watch with its price',
    run: () => {
      const carrotGame = makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 59.99, originalPrice: 59.99 });
      // The on-sale sibling demonstrates tracking: filtered out of analysis,
      // but surfaced through wishlistGames for Wishlist Watch only.
      const result = resultWith({
        analyzedCount: 1,
        analyses: [makeAnalysis(makeGame({ id: 'game-2', title: 'Stardew Valley' }))],
        wishlist: wishlistFrom([
          {
            gameTitle: 'Carrot Smash',
            targetPrice: 40,
            notifyOnAnyDiscount: false,
          },
        ]),
        monitoredTitles: ['Carrot Smash'],
        wishlistGames: [carrotGame],
      });

      const digest = buildDailyDigest(result);
      const watch = digest.wishlistWatch.find((item) => item.title === 'Carrot Smash');
      assert.ok(watch, 'Blacklisted-but-wishlisted game must appear in Wishlist Watch');
      assert.strictEqual(watch.currentPrice, 59.99, 'Wishlist Watch must show the current price');
      assert.notStrictEqual(watch.status, undefined);

      const bestDealTitles = digest.bestDeals.map((deal) => deal.title);
      assert.ok(!bestDealTitles.includes('Carrot Smash'), 'Blacklisted game must not appear in Best Deals');
      const recommendationTitles = digest.recommendations.map((r) => r.title);
      assert.ok(!recommendationTitles.includes('Carrot Smash'), 'Blacklisted game must not be recommended');
    },
  });

  checks.push({
    name: 'blacklisted non-wishlisted game is absent from every digest section',
    run: () => {
      const carrot = makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 0 });
      const result = resultWith({
        analyzedCount: 0,
        analyses: [],
        wishlist: { items: [] },
        monitoredTitles: ['Carrot Smash'],
        wishlistGames: [],
      });
      // Simulate the filter outcome: the blacklisted game never reaches analysis.
      void filterBlacklistedGames([carrot], ['Carrot Smash']);

      const digest = buildDailyDigest(result, { blacklist: ['Carrot Smash'] });
      const html = renderDigestEmail(digest);
      assert.ok(
        !digest.wishlistWatch.some((item) => item.title === 'Carrot Smash'),
        'Blacklisted non-wishlisted game must not appear in Wishlist Watch',
      );
      assert.ok(!html.includes('Carrot Smash'), 'Rendered digest must not contain the blacklisted title');
    },
  });

  checks.push({
    name: 'Still On Sale ignores blacklisted games',
    run: () => {
      const carrotEntry: DealHistoryEntry = {
        gameTitle: 'Carrot Smash',
        firstSeenOnSale: '2026-07-01T00:00:00.000Z',
        lastSeenOnSale: '2026-08-05T00:00:00.000Z',
        firstNotified: '2026-07-02T00:00:00.000Z',
        lastNotified: '2026-07-02T00:00:00.000Z',
        lastNotifiedPrice: 3.99,
        notificationCount: 1,
        currentlyOnSale: true,
      };
      const stardewEntry: DealHistoryEntry = {
        gameTitle: 'Stardew Valley',
        firstSeenOnSale: '2026-07-05T00:00:00.000Z',
        lastSeenOnSale: '2026-08-05T00:00:00.000Z',
        firstNotified: '2026-07-06T00:00:00.000Z',
        lastNotified: '2026-07-06T00:00:00.000Z',
        lastNotifiedPrice: 11.99,
        notificationCount: 1,
        currentlyOnSale: true,
      };
      const result = resultWith({
        dealHistory: { entries: [carrotEntry, stardewEntry] },
        analyses: [
          makeAnalysis(makeGame({ id: 'game-2', title: 'Stardew Valley' })),
          makeAnalysis(makeGame({ id: 'game-1', title: 'Carrot Smash' })),
        ],
      });
      const digest = buildDailyDigest(result, { blacklist: ['Carrot Smash'] });
      const titles = digest.stillOnSale.map((item) => item.title);
      assert.ok(!titles.includes('Carrot Smash'), 'Blacklisted game must not appear in Still On Sale');
      assert.ok(titles.includes('Stardew Valley'), 'Non-blacklisted game must remain in Still On Sale');
      assert.strictEqual(digest.summary.stillActiveDeals, 1, 'Summary must ignore the blacklisted still-active deal');
    },
  });

  checks.push({
    name: 'Today\u2019s Summary Biggest Discount ignores blacklisted games',
    run: () => {
      const result = resultWith({
        analyses: [
          makeAnalysis(makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 1.0, originalPrice: 60 })),
          makeAnalysis(makeGame({ id: 'game-2', title: 'Stardew Valley', currentPrice: 19.99, originalPrice: 19.99 })),
        ],
      });
      // Analyses are already blacklist-filtered upstream, but the digest must not
      // surface a blacklisted biggest-discount game regardless.
      const digest = buildDailyDigest(result, { blacklist: ['Carrot Smash'] });
      assert.notStrictEqual(
        digest.summary.biggestDiscountTitle,
        'Carrot Smash',
        'Blacklisted game must never be the biggest discount',
      );
    },
  });

  checks.push({
    name: 'Best Deals ignores blacklisted games',
    run: () => {
      const carrotAnalysis = makeAnalysis(
        makeGame({ id: 'game-1', title: 'Carrot Smash', currentPrice: 3.99, originalPrice: 39.99 }),
      );
      carrotAnalysis.dealScore = { score: 200, reasons: ['Big'] };
      const stardew = makeAnalysis(
        makeGame({ id: 'game-2', title: 'Stardew Valley', currentPrice: 11.99, originalPrice: 19.99 }),
      );
      const result = resultWith({ analyses: [carrotAnalysis, stardew], reportedAnalyses: [carrotAnalysis, stardew] });
      const digest = buildDailyDigest(result, { blacklist: ['Carrot Smash'] });
      const titles = digest.bestDeals.map((deal) => deal.title);
      assert.ok(!titles.includes('Carrot Smash'), 'Blacklisted game must not appear in Best Deals');
      assert.ok(titles.includes('Stardew Valley'), 'Non-blacklisted game must remain in Best Deals');
    },
  });

  checks.push({
    name: 'blacklisted-but-wishlisted game stays in Wishlist Watch but is absent elsewhere',
    run: () => {
      const carrotGame = makeGame({
        id: 'game-1',
        title: 'Carrot Smash',
        currentPrice: 59.99,
        originalPrice: 59.99,
      });
      const result = resultWith({
        wishlist: wishlistFrom([{ gameTitle: 'Carrot Smash', targetPrice: 40, notifyOnAnyDiscount: false }]),
        monitoredTitles: ['Carrot Smash'],
        wishlistGames: [carrotGame],
      });
      const digest = buildDailyDigest(result, { blacklist: ['Carrot Smash'] });
      const watch = digest.wishlistWatch.find((item) => item.title === 'Carrot Smash');
      assert.ok(watch, 'Blacklisted-but-wishlisted game must stay in Wishlist Watch');
      assert.ok(
        !digest.stillOnSale.some((item) => item.title === 'Carrot Smash'),
        'Blacklisted game must not appear in Still On Sale',
      );
      assert.ok(
        !digest.recommendations.some((rec) => rec.title === 'Carrot Smash'),
        'Blacklisted game must not be recommended',
      );
    },
  });

  checks.push({
    name: 'LEGO blocks LEGO franchise titles',
    run: () => {
      for (const title of [
        'LEGO Jurassic World',
        'LEGO CITY Undercover',
        'LEGO Marvel Super Heroes',
        'LEGO Star Wars: The Skywalker Saga',
        'LEGO Harry Potter Collection',
        'LEGO',
      ]) {
        assert.ok(
          isGameBlacklisted(title, ['LEGO']),
          `"LEGO" must block "${title}"`,
        );
      }
      const blocked = filterBlacklistedGames(
        [
          makeGame({ id: 'game-1', title: 'LEGO Jurassic World' }),
          makeGame({ id: 'game-2', title: 'LEGO Star Wars: The Skywalker Saga' }),
          makeGame({ id: 'game-3', title: 'Mario + Rabbids Kingdom Battle' }),
        ],
        ['LEGO'],
      );
      assert.deepStrictEqual(
        blocked.map((game) => game.title),
        ['Mario + Rabbids Kingdom Battle'],
      );
    },
  });

  checks.push({
    name: 'blacklist matching uses word boundaries and avoids false positives',
    run: () => {
      assert.ok(isGameBlacklisted('LEGO Jurassic World', ['LEGO']), 'LEGO title must match');
      assert.ok(isGameBlacklisted('LEGO', ['LEGO']), 'Exact title must match');
      assert.ok(
        isGameBlacklisted('Super LEGO World', ['LEGO']),
        'LEGO as a whole word anywhere must match',
      );
      assert.strictEqual(
        isGameBlacklisted('Allegory Quest', ['LEGO']),
        false,
        '"lego" inside "Allegory" must not match (word boundaries)',
      );
      assert.strictEqual(
        isGameBlacklisted('Legoland Adventure', ['LEGO']),
        false,
        '"lego" glued to another word must not match',
      );
    },
  });

  checks.push({
    name: 'Today\u2019s Summary biggest discount ignores blacklisted franchise games',
    run: () => {
      const lego = makeAnalysis(
        makeGame({ id: 'game-1', title: 'LEGO Jurassic World', currentPrice: 5.99, originalPrice: 59.99 }),
      );
      const mario = makeAnalysis(
        makeGame({ id: 'game-2', title: 'Mario + Rabbids Kingdom Battle', currentPrice: 14.99, originalPrice: 59.99 }),
      );
      const result = resultWith({ analyses: [lego, mario] });
      const digest = buildDailyDigest(result, { blacklist: ['LEGO'] });
      assert.strictEqual(
        digest.summary.biggestDiscountTitle,
        'Mario + Rabbids Kingdom Battle',
        'Blacklisted franchise game must not be the biggest discount',
      );
    },
  });

  checks.push({
    name: 'Still On Sale ignores blacklisted franchise entries but keeps others',
    run: () => {
      const legoEntry: DealHistoryEntry = {
        gameTitle: 'LEGO Star Wars: The Skywalker Saga',
        firstSeenOnSale: '2026-07-01T00:00:00.000Z',
        lastSeenOnSale: '2026-08-05T00:00:00.000Z',
        firstNotified: '2026-07-02T00:00:00.000Z',
        lastNotified: '2026-07-02T00:00:00.000Z',
        lastNotifiedPrice: 19.99,
        notificationCount: 1,
        currentlyOnSale: true,
      };
      const marioEntry: DealHistoryEntry = {
        gameTitle: 'Mario + Rabbids Kingdom Battle',
        firstSeenOnSale: '2026-07-05T00:00:00.000Z',
        lastSeenOnSale: '2026-08-05T00:00:00.000Z',
        firstNotified: '2026-07-06T00:00:00.000Z',
        lastNotified: '2026-07-06T00:00:00.000Z',
        lastNotifiedPrice: 14.99,
        notificationCount: 1,
        currentlyOnSale: true,
      };
      const result = resultWith({
        dealHistory: { entries: [legoEntry, marioEntry] },
        analyses: [
          makeAnalysis(makeGame({ id: 'game-1', title: 'LEGO Star Wars: The Skywalker Saga' })),
          makeAnalysis(makeGame({ id: 'game-2', title: 'Mario + Rabbids Kingdom Battle' })),
        ],
      });
      const digest = buildDailyDigest(result, { blacklist: ['LEGO'] });
      const stillTitles = digest.stillOnSale.map((item) => item.title);
      assert.ok(
        !stillTitles.includes('LEGO Star Wars: The Skywalker Saga'),
        'Blacklisted franchise game must not appear in Still On Sale',
      );
      assert.ok(
        stillTitles.includes('Mario + Rabbids Kingdom Battle'),
        'Non-blacklisted historical deal must remain in Still On Sale',
      );
    },
  });

  checks.push({
    name: 'Best Deals and recommendations exclude blacklisted franchise games',
    run: () => {
      const legoAnalysis = makeAnalysis(
        makeGame({ id: 'game-1', title: 'LEGO Jurassic World', currentPrice: 5.99, originalPrice: 59.99 }),
      );
      legoAnalysis.dealScore = { score: 300, reasons: [] };
      legoAnalysis.familyMatches = [{ profileName: 'Yaara', matched: true, reasons: ['Adventure'] }];
      const result = resultWith({ analyses: [legoAnalysis], reportedAnalyses: [legoAnalysis] });
      const digest = buildDailyDigest(result, { blacklist: ['LEGO'] });
      assert.ok(
        !digest.bestDeals.some((deal) => deal.title === 'LEGO Jurassic World'),
        'Blacklisted franchise game must not appear in Best Deals',
      );
      assert.ok(
        !digest.recommendations.some((rec) => rec.title === 'LEGO Jurassic World'),
        'Blacklisted franchise game must not be recommended',
      );
    },
  });

  await runChecks(checks);
  console.log('\nAll blacklist validation checks passed.');
}

if (require.main === module) {
  validateBlacklist().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}