import 'dotenv/config';

import * as assert from 'node:assert';

import { DEFAULT_NOTIFICATION_SETTINGS } from '../config/settings-loader';
import { Game, GameAnalysis, MonitorResult } from '../models';
import { isWorthReporting } from '../pipeline/monitor-run';
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
  return digest.recommendations.map((recommendation) => recommendation.title);
}

function buildDigest(result: MonitorResult): ReturnType<typeof buildDailyDigest> {
  return buildDailyDigest(result);
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
        const digest = buildDigest(result);
        const game = digest.recommendations[0];
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
        const digest = buildDigest(result);
        const game = digest.recommendations[0];
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
    {
      name: 'recommendations group by game and list every matching member once',
      run: () => {
        const mario = makeGame({ title: 'Mario Wonder', currentPrice: 49.99, originalPrice: 59.99 });
        const analysis = buildAnalysis(mario, [
          { profileName: 'Yaara', matched: true, reasons: ['Adventure'] },
          { profileName: 'Barak', matched: true, reasons: ['Action'] },
          { profileName: 'Alon', matched: true, reasons: ['Action'] },
        ]);
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [analysis] });
        const digest = buildDigest(result);
        assert.strictEqual(digest.recommendations.length, 1, 'Each game must appear exactly once');
        const rec = digest.recommendations[0];
        assert.strictEqual(rec.title, 'Mario Wonder');
        assert.deepStrictEqual(
          rec.members.map((m) => m.name).sort(),
          ['Alon', 'Barak', 'Yaara'],
          'Every matching family member must be listed under the game',
        );
        assert.deepStrictEqual(
          rec.members.find((m) => m.name === 'Yaara')?.reasons,
          ['Adventure'],
          'Each member must preserve their own match reason',
        );
      },
    },
    {
      name: 'entire family collapses into a single label',
      run: () => {
        const mario = makeGame({ title: 'Mario Wonder', currentPrice: 49.99, originalPrice: 59.99 });
        const analysis = buildAnalysis(mario, [
          { profileName: 'Yaara', matched: true, reasons: ['Adventure'] },
          { profileName: 'Barak', matched: true, reasons: ['Action'] },
          { profileName: 'Alon', matched: true, reasons: ['Action'] },
        ]);
        const partial = buildAnalysis(makeGame({ title: 'Zelda', currentPrice: 39.99, originalPrice: 59.99 }), [
          { profileName: 'Yaara', matched: true, reasons: ['Adventure'] },
          { profileName: 'Barak', matched: false, reasons: [] },
          { profileName: 'Alon', matched: false, reasons: [] },
        ]);
        const result = resultWith({
          analyses: [analysis, partial],
          reportedAnalyses: [analysis, partial],
        });
        const digest = buildDigest(result);
        const marioRec = digest.recommendations.find((r) => r.title === 'Mario Wonder');
        const zeldaRec = digest.recommendations.find((r) => r.title === 'Zelda');
        assert.strictEqual(marioRec?.entireFamily, true, 'Whole-family game must be flagged');
        assert.strictEqual(zeldaRec?.entireFamily, false, 'Partial match must not be flagged');
        const html = renderDigestEmail(digest);
        assert.ok(html.includes('Entire family'), 'Entire family label missing');
      },
    },
    {
      name: 'recommendations order: wishlist, entire family, most members, then score',
      run: () => {
        const wishlistGame = buildAnalysis(
          makeGame({ title: 'Wishlist' }),
          [{ profileName: 'Yaara', matched: true, reasons: ['Adventure'] }],
          wishlistMatch(),
        );
        const entireGame = buildAnalysis(
          makeGame({ title: 'Every Kid' }),
          [
            { profileName: 'Yaara', matched: true, reasons: [] },
            { profileName: 'Barak', matched: true, reasons: [] },
            { profileName: 'Alon', matched: true, reasons: [] },
          ],
        );
        const crowdGame = buildAnalysis(
          makeGame({ title: 'Two Match' }),
          [
            { profileName: 'Yaara', matched: true, reasons: [] },
            { profileName: 'Barak', matched: true, reasons: [] },
            { profileName: 'Alon', matched: false, reasons: [] },
          ],
        );
        const topScore = buildAnalysis(
          makeGame({ title: 'High Score' }),
          [
            { profileName: 'Yaara', matched: true, reasons: [] },
            { profileName: 'Barak', matched: false, reasons: [] },
            { profileName: 'Alon', matched: false, reasons: [] },
          ],
        );
        topScore.dealScore = { score: 500, reasons: [] };
        const result = resultWith({
          analyses: [topScore, entireGame, crowdGame, wishlistGame],
          reportedAnalyses: [topScore, entireGame, crowdGame, wishlistGame],
        });
        assert.deepStrictEqual(recommendationTitles(result), [
          'Wishlist',
          'Every Kid',
          'Two Match',
          'High Score',
        ]);
      },
    },
    {
      name: 'recommendedFamilyGamesLimit applies after sorting',
      run: () => {
        const games: GameAnalysis[] = [];
        for (let i = 1; i <= 15; i += 1) {
          const analysis = buildAnalysis(
            makeGame({ title: `Game ${i}`, currentPrice: 0, originalPrice: undefined }),
            [{ profileName: 'Yaara', matched: true, reasons: [] }],
          );
          analysis.dealScore = { score: 100 + i, reasons: [] };
          games.push(analysis);
        }
        const result = resultWith({ analyses: games, reportedAnalyses: games });
        const digest = buildDailyDigest(result, { recommendedFamilyGamesLimit: 4 });
        assert.strictEqual(digest.recommendations.length, 4, 'Recommendations must be capped at the limit');
      },
    },
    {
      name: 'Best Deals are sorted by deal score descending',
      run: () => {
        const high = makeAnalysis(makeGame({ title: 'High', currentPrice: 30, originalPrice: 60 }));
        high.dealScore = { score: 150, reasons: ['x'] };
        const mid = makeAnalysis(makeGame({ title: 'Mid', currentPrice: 30, originalPrice: 60 }));
        mid.dealScore = { score: 100, reasons: ['x'] };
        const low = makeAnalysis(makeGame({ title: 'Low', currentPrice: 30, originalPrice: 60 }));
        low.dealScore = { score: 50, reasons: ['x'] };
        const result = resultWith({
          analyses: [low, high, mid],
          reportedAnalyses: [low, high, mid],
        });
        const scores = buildDailyDigest(result).bestDeals.map((deal) => deal.score);
        assert.deepStrictEqual(
          scores,
          [...scores].sort((a, b) => b - a),
          'Best Deals must be sorted by deal score descending',
        );
      },
    },
    {
      name: 'a deal at its historical low renders in Historical Lows',
      run: () => {
        const zelda = makeAnalysis(
          makeGame({
            title: 'The Legend of Zelda: Breath of the Wild',
            currentPrice: 39.99,
            originalPrice: 59.99,
          }),
        );
        const result = resultWith({
          analyses: [zelda],
          reportedAnalyses: [zelda],
          dealHistory: {
            entries: [
              {
                gameTitle: 'The Legend of Zelda: Breath of the Wild',
                firstSeenOnSale: '2026-07-20T00:00:00.000Z',
                lastSeenOnSale: '2026-08-05T00:00:00.000Z',
                firstNotified: '2026-07-20T00:00:00.000Z',
                lastNotified: '2026-07-20T00:00:00.000Z',
                lastNotifiedPrice: 49.99,
                notificationCount: 1,
                currentlyOnSale: true,
                priceHistory: [
                  { date: '2026-07-20', price: 49.99 },
                  { date: '2026-08-05', price: 39.99 },
                ],
              },
            ],
          },
        });
        const digest = buildDailyDigest(result);
        assert.strictEqual(digest.historicalLows.length, 1, 'historical-low deal must be listed');
        assert.strictEqual(
          digest.historicalLows[0].title,
          'The Legend of Zelda: Breath of the Wild',
        );
        assert.strictEqual(digest.historicalLows[0].lowPrice, 39.99);
        const html = renderDigestEmail(digest);
        assert.ok(html.includes('Historical Lows'), 'Historical Lows section missing');
        assert.ok(html.includes('lowest recorded price'), 'Historical Lows badge missing');
      },
    },
    {
      name: 'Wishlist Alerts renders before Best Deals',
      run: () => {
        const alertGame = makeAnalysis(
          makeGame({ title: 'Mario Kart 8', currentPrice: 34.99, originalPrice: 59.99 }),
        );
        alertGame.wishlistMatch = {
          matched: true,
          wishlistItem: { gameTitle: 'Mario Kart 8', targetPrice: 39.99, notifyOnAnyDiscount: false },
          priceTargetReached: true,
          effectiveTargetPrice: 39.99,
          targetPriceOrigin: 'configured',
        };
        const bestGame = makeAnalysis(
          makeGame({ title: 'Zelda', currentPrice: 39.99, originalPrice: 59.99 }),
        );
        const result = resultWith({
          analyses: [alertGame, bestGame],
          reportedAnalyses: [alertGame, bestGame],
        });
        const digest = buildDailyDigest(result);
        assert.strictEqual(digest.wishlistAlerts.length, 1, 'one wishlist alert expected');
        assert.ok(
          digest.bestDeals.some((deal) => deal.title === 'Zelda'),
          'a non-wishlist deal must land in Best Deals',
        );
        const html = renderDigestEmail(digest);
        const alerts = html.indexOf('Wishlist Alerts');
        const best = html.indexOf('>🔥 Best Deals</td>');
        assert.ok(alerts >= 0 && best >= 0, 'sections must render');
        assert.ok(alerts < best, 'Wishlist Alerts must appear before Best Deals');
      },
    },
    {
      name: 'a matching free game is included with its family reason',
      run: () => {
        const fortnite = makeGame({ title: 'Fortnite', currentPrice: 0, originalPrice: undefined });
        const analysis = buildAnalysis(fortnite, [
          { profileName: 'Kids 8-12', matched: true, reasons: ['Puzzle preference'] },
        ]);
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [analysis] });
        const digest = buildDailyDigest(result);
        const game = digest.freeGames.find((g) => g.title === 'Fortnite');
        assert.ok(game, 'matching free game must be included in Free Family Games');
        assert.deepStrictEqual(
          game?.reasons,
          ['Kids 8-12', 'Puzzle preference'],
          'family profile + reason must be attached',
        );
        const html = renderDigestEmail(digest);
        assert.ok(html.includes('Free Family Games'), 'Free Family Games header missing');
        assert.ok(html.includes('Kids 8-12'), 'family profile missing in rendered free card');
      },
    },
    {
      name: 'a free game in an excluded genre is not included',
      run: () => {
        const fortnite = makeGame({ title: 'Fortnite', currentPrice: 0, originalPrice: undefined });
        const analysis = buildAnalysis(fortnite, [
          { profileName: 'Kids 8-12', matched: false, reasons: [] },
        ]);
        analysis.dealScore = { score: 0, reasons: [] };
        assert.strictEqual(
          isWorthReporting(analysis, 100, { notifyFreeGames: true, notifyWishlistMatches: true }),
          false,
          'free game matching no family profile must not be reported',
        );
        const result = resultWith({ analyses: [analysis], reportedAnalyses: [] });
        assert.deepStrictEqual(buildDailyDigest(result).freeGames, []);
      },
    },
    {
      name: 'a matching free game does not need the score threshold',
      run: () => {
        const matching = buildAnalysis(
          makeGame({ title: 'Matching', currentPrice: 0, originalPrice: undefined }),
          [{ profileName: 'Kids 8-12', matched: true, reasons: [] }],
        );
        matching.dealScore = { score: 0, reasons: [] };
        assert.strictEqual(
          isWorthReporting(matching, 100, { notifyFreeGames: true, notifyWishlistMatches: true }),
          true,
          'matching free game must be reported regardless of score',
        );
        const fortnite = buildAnalysis(
          makeGame({ title: 'Unmatched', currentPrice: 0, originalPrice: undefined }),
          [{ profileName: 'Kids 8-12', matched: false, reasons: [] }],
        );
        fortnite.dealScore = { score: 0, reasons: [] };
        assert.strictEqual(
          isWorthReporting(fortnite, 100, { notifyFreeGames: true, notifyWishlistMatches: true }),
          false,
          'unmatched free game must not be reported even with a high threshold',
        );
      },
    },
      {
        name: 'a cooldown-skipped deal at its historical low still appears in Historical Lows',
        run: () => {
          const zelda = makeAnalysis(
            makeGame({
              title: 'The Legend of Zelda: Breath of the Wild',
              currentPrice: 39.99,
              originalPrice: 59.99,
            }),
          );
          const result = resultWith({
            reportedAnalyses: [],
            skippedByCooldownAnalyses: [zelda],
            dealHistory: {
              entries: [
                {
                  gameTitle: 'The Legend of Zelda: Breath of the Wild',
                  firstSeenOnSale: '2026-07-20T00:00:00.000Z',
                  lastSeenOnSale: '2026-08-05T00:00:00.000Z',
                  firstNotified: '2026-07-20T00:00:00.000Z',
                  lastNotified: '2026-07-20T00:00:00.000Z',
                  lastNotifiedPrice: 49.99,
                  notificationCount: 1,
                  currentlyOnSale: true,
                  priceHistory: [
                    { date: '2026-07-20', price: 49.99 },
                    { date: '2026-08-05', price: 39.99 },
                  ],
                },
              ],
            },
          });
          const digest = buildDailyDigest(result);
          const low = digest.historicalLows.find((item) => item.title === zelda.game.title);
          assert.ok(low, 'cooldown-skipped historical-low deal must appear in Historical Lows');
          assert.strictEqual(low?.lowPrice, 39.99);
          const html = renderDigestEmail(digest);
          assert.ok(html.includes('Historical Lows'), 'Historical Lows section missing');
        },
      },
      {
        name: 'a cooldown-skipped matching free game still appears in Free Family Games',
        run: () => {
          const fortnite = buildAnalysis(
            makeGame({ title: 'Fortnite', currentPrice: 0, originalPrice: undefined }),
            [{ profileName: 'Kids 8-12', matched: true, reasons: ['Puzzle preference'] }],
          );
          const result = resultWith({
            reportedAnalyses: [],
            skippedByCooldownAnalyses: [fortnite],
          });
          const digest = buildDailyDigest(result);
          const game = digest.freeGames.find((g) => g.title === 'Fortnite');
          assert.ok(game, 'cooldown-skipped matching free game must appear in Free Family Games');
          assert.deepStrictEqual(game?.reasons, ['Kids 8-12', 'Puzzle preference']);
          const html = renderDigestEmail(digest);
          assert.ok(html.includes('Free Family Games'), 'Free Family Games section missing');
        },
      },
      {
        name: 'a cooldown-skipped best-scored deal still appears in Best Deals',
        run: () => {
          const zelda = makeAnalysis(
            makeGame({
              title: 'The Legend of Zelda: Breath of the Wild',
              currentPrice: 39.99,
              originalPrice: 59.99,
            }),
          );
          zelda.dealScore = { score: 500, reasons: ['Family match'] };
          const result = resultWith({
            reportedAnalyses: [],
            skippedByCooldownAnalyses: [zelda],
          });
          const digest = buildDailyDigest(result);
          const deal = digest.bestDeals.find((item) => item.title === zelda.game.title);
          assert.ok(deal, 'cooldown-skipped best-scored deal must appear in Best Deals');
          const html = renderDigestEmail(digest);
          assert.ok(html.includes('Best Deals'), 'Best Deals section missing');
        },
      },
      {
        name: 'a game at its historical low is not duplicated in Best Deals',
        run: () => {
          const zelda = buildAnalysis(
            makeGame({
              title: 'The Legend of Zelda: Breath of the Wild',
              currentPrice: 39.99,
              originalPrice: 59.99,
            }),
            [],
          );
          const result = resultWith({
            analyses: [zelda],
            reportedAnalyses: [zelda],
            dealHistory: {
              entries: [
                {
                  gameTitle: 'The Legend of Zelda: Breath of the Wild',
                  firstSeenOnSale: '2026-07-20T00:00:00.000Z',
                  lastSeenOnSale: '2026-08-05T00:00:00.000Z',
                  firstNotified: '2026-07-20T00:00:00.000Z',
                  lastNotified: '2026-07-20T00:00:00.000Z',
                  lastNotifiedPrice: 49.99,
                  notificationCount: 1,
                  currentlyOnSale: true,
                  priceHistory: [
                    { date: '2026-07-20', price: 49.99 },
                    { date: '2026-08-05', price: 39.99 },
                  ],
                },
              ],
            },
          });
          const digest = buildDailyDigest(result);
          const low = digest.historicalLows.find((item) => item.title === zelda.game.title);
          assert.ok(low, 'the historical-low deal must appear in Historical Lows');
          assert.ok(
            !digest.bestDeals.some((item) => item.title === zelda.game.title),
            'the same deal must not be repeated in Best Deals',
          );
        },
      },
      {
        name: 'Today\'s Summary reflects the digest content counts',
        run: () => {
          const fortnite = buildAnalysis(
            makeGame({ title: 'Fortnite', currentPrice: 0, originalPrice: undefined }),
            [{ profileName: 'Kids 8-12', matched: true, reasons: ['Puzzle preference'] }],
          );
          const zelda = buildAnalysis(
            makeGame({
              title: 'The Legend of Zelda: Breath of the Wild',
              currentPrice: 39.99,
              originalPrice: 59.99,
            }),
            [],
          );
          const result = resultWith({
            analyses: [fortnite, zelda],
            reportedAnalyses: [fortnite, zelda],
          });
          const digest = buildDailyDigest(result);
          assert.strictEqual(digest.summary.bestDeals, digest.bestDeals.length);
          assert.strictEqual(digest.summary.freeGames, digest.freeGames.length);
          assert.strictEqual(digest.summary.historicalLows, digest.historicalLows.length);
          const html = renderDigestEmail(digest);
          assert.ok(html.includes('Best Deals'), 'Best Deals stat must render');
          assert.ok(html.includes('Free Games'), 'Free Games stat must render');
          assert.ok(html.includes('Historical Lows'), 'Historical Lows stat must render');
        },
      },
  ];

  await runChecks(checks);
  console.log('\nAll recommendation validation checks passed.');
}

function buildAnalysis(
  game: Game,
  familyMatches: GameAnalysis['familyMatches'],
  wishlistMatch?: GameAnalysis['wishlistMatch'],
): GameAnalysis {
  return {
    game,
    familyMatches,
    wishlistMatch: wishlistMatch ?? { matched: false, wishlistItem: undefined as never, priceTargetReached: false },
    dealScore: { score: 100, reasons: [] },
  };
}

function wishlistMatch(): NonNullable<GameAnalysis['wishlistMatch']> {
  return {
    matched: true,
    wishlistItem: { gameTitle: 'Wishlist', targetPrice: 20, notifyOnAnyDiscount: false },
    priceTargetReached: true,
    effectiveTargetPrice: 20,
    targetPriceOrigin: 'configured',
  };
}

if (require.main === module) {
  validateRecommendations().catch((error: unknown) => {
    console.error('Recommendation validation failed:', error);
    process.exitCode = 1;
  });
}
