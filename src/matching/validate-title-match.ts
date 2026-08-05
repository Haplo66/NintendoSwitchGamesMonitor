import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { analyzeGamesWith } from '../analyzer/analyze';
import { matchTitleToCandidates, matchTitlesToCandidates } from './title-matcher';
import { resolveWishlistTitles } from './wishlist-resolver';
import { CatalogGame, NintendoPriceCollector } from '../collectors/nintendo-price-collector';
import { orderCatalogForOutput, GeneratedCatalogEntry } from '../collectors/generate-catalog';
import { Game, GameAnalysis, MonitorResult } from '../models';
import { buildDailyDigest } from '../notifications/daily-digest-builder';
import { renderDigestEmail } from '../notifications/email-renderer';

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

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Stardew Valley',
    platform: 'Nintendo Switch',
    currentPrice: 14.99,
    originalPrice: 19.99,
    currency: 'USD',
    genres: ['Simulation'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game): GameAnalysis {
  return { game, familyMatches: [], dealScore: { score: 100, reasons: [] } };
}

function makeResult(overrides: Partial<MonitorResult> = {}): MonitorResult {
  return {
    generatedAt: new Date().toISOString(),
    collector: 'test',
    currency: 'USD',
    minDealScore: 70,
    defaultWishlistDiscountPercent: 40,
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

function catalogEntry(title: string, nsuid: string): GeneratedCatalogEntry {
  return {
    nsuid,
    title,
    slug: nsuid,
    platforms: ['switch1'],
    genres: ['Action'],
    esrbRating: 'E',
  };
}

export async function validateTitleMatch(): Promise<void> {
  const checks: Check[] = [];

  // ---- Matching: exact / fuzzy / normalization / ambiguity ----

  checks.push({
    name: 'exact title match resolves with exact confidence',
    run: () => {
      const match = matchTitleToCandidates('Mario Kart 8 Deluxe', [
        'Stardew Valley',
        'Mario Kart 8 Deluxe',
      ]);
      assert.strictEqual(match.matched, true);
      assert.strictEqual(match.confidence, 'exact');
      assert.strictEqual(match.matchedTitle, 'Mario Kart 8 Deluxe');
    },
  });

  checks.push({
    name: 'Super Smash Bros resolves to Super Smash Bros. Ultimate',
    run: () => {
      const match = matchTitleToCandidates('Super Smash Bros', [
        'The Legend of Zelda: Breath of the Wild',
        'Super Smash Bros. Ultimate',
      ]);
      assert.strictEqual(match.matched, true, 'Subtitle/suffix match expected');
      assert.strictEqual(match.confidence, 'high');
      assert.strictEqual(match.matchedTitle, 'Super Smash Bros. Ultimate');
    },
  });

  checks.push({
    name: 'Pokemon resolves to Pokemon (accent stripping)',
    run: () => {
      const exact = matchTitleToCandidates('Pokemon', ['Pokémon']);
      assert.strictEqual(exact.matched, true, 'Accent differences must not block an exact match');
      assert.strictEqual(exact.confidence, 'exact');
      assert.strictEqual(exact.matchedTitle, 'Pokémon');

      const contained = matchTitleToCandidates('Pokemon', ['Pokémon Scarlet']);
      assert.strictEqual(contained.matched, true, 'Accented candidate must match a plain query');
      assert.strictEqual(contained.confidence, 'high');
    },
  });

  checks.push({
    name: 'punctuation and trademark differences normalize away',
    run: () => {
      const match = matchTitleToCandidates('Super Smash Bros.', [
        'Super Smash Bros™',
        'Mario Kart 8 Deluxe',
      ]);
      assert.strictEqual(match.matched, true);
      assert.strictEqual(match.confidence, 'exact');
      assert.strictEqual(match.matchedTitle, 'Super Smash Bros™');
    },
  });

  checks.push({
    name: 'a single generic token never fuzzy-matches',
    run: () => {
      const match = matchTitleToCandidates('Deluxe', ['Mario Kart 8 Deluxe']);
      assert.strictEqual(match.matched, false, 'Generic suffix must not resolve on its own');
      assert.strictEqual(match.confidence, 'none');
    },
  });

  checks.push({
    name: 'Mario is ambiguous across Mario Kart, Mario Party and Super Mario (false positive prevention)',
    run: () => {
      const match = matchTitleToCandidates('Mario', [
        'Mario Kart 8 Deluxe',
        'Mario Party Superstars',
        'Super Mario Odyssey',
      ]);
      assert.strictEqual(match.matched, false, 'Broad franchise name must not resolve');
      assert.strictEqual(match.confidence, 'ambiguous');
    },
  });

  checks.push({
    name: 'Zelda resolves when only one candidate contains it',
    run: () => {
      const match = matchTitleToCandidates('Zelda', [
        'Stardew Valley',
        'The Legend of Zelda: Breath of the Wild',
      ]);
      assert.strictEqual(
        match.matched,
        true,
        'Distinctive single token must resolve when unambiguous',
      );
      assert.strictEqual(match.confidence, 'high');
      assert.strictEqual(match.matchedTitle, 'The Legend of Zelda: Breath of the Wild');
    },
  });

  checks.push({
    name: 'Zelda is ambiguous across multiple Zelda games',
    run: () => {
      const match = matchTitleToCandidates('Zelda', [
        'The Legend of Zelda: Breath of the Wild',
        'The Legend of Zelda: Tears of the Kingdom',
      ]);
      assert.strictEqual(match.matched, false);
      assert.strictEqual(match.confidence, 'ambiguous');
    },
  });

  checks.push({
    name: 'partial-word substrings do not match',
    run: () => {
      const match = matchTitleToCandidates('Sma', ['Super Smash Bros. Ultimate']);
      assert.strictEqual(match.matched, false, 'A partial word must not match');
    },
  });

  checks.push({
    name: 'real catalog: Super Smash Bros resolves uniquely',
    run: () => {
      const { loadGameCatalog } =
        require('../collectors/nintendo-price-collector') as typeof import('../collectors/nintendo-price-collector');
      const titles = loadGameCatalog().map((entry) => entry.title);
      const match = matchTitleToCandidates('Super Smash Bros', titles);
      assert.strictEqual(match.matched, true);
      assert.strictEqual(match.matchedTitle, 'Super Smash Bros. Ultimate');
    },
  });

  checks.push({
    name: 'real catalog: Mario is ambiguous',
    run: () => {
      const { loadGameCatalog } =
        require('../collectors/nintendo-price-collector') as typeof import('../collectors/nintendo-price-collector');
      const titles = loadGameCatalog().map((entry) => entry.title);
      const match = matchTitleToCandidates('Mario', titles);
      assert.strictEqual(match.matched, false);
      assert.strictEqual(match.confidence, 'ambiguous');
    },
  });

  // ---- Matching: analysis integration ----

  checks.push({
    name: 'analysis: Super Smash Bros wishlist item matches the Ultimate deal',
    run: () => {
      const ultimate = makeGame({
        id: 'game-1',
        title: 'Super Smash Bros. Ultimate',
        currentPrice: 41.99,
        originalPrice: 59.99,
      });
      const stardew = makeGame({ id: 'game-2', title: 'Stardew Valley' });
      const analyses = analyzeGamesWith(
        [ultimate, stardew],
        [],
        { items: [{ gameTitle: 'Super Smash Bros', notifyOnAnyDiscount: false }] },
        40,
      );
      const smash = analyses.find(
        (analysis) => analysis.game.title === 'Super Smash Bros. Ultimate',
      );
      assert.ok(smash, 'Ultimate must be analyzed');
      assert.strictEqual(
        smash!.wishlistMatch?.matched,
        true,
        'Fuzzy wishlist title must match the deal',
      );
      assert.strictEqual(smash!.wishlistMatch?.wishlistItem.gameTitle, 'Super Smash Bros');
      const nonMatch = analyses.find((analysis) => analysis.game.title === 'Stardew Valley');
      assert.ok(!nonMatch!.wishlistMatch, 'Unrelated game must not match the wishlist item');
    },
  });

  checks.push({
    name: 'analysis: Mario wishlist item is ambiguous and matches nothing',
    run: () => {
      const games = [
        makeGame({ id: 'game-1', title: 'Mario Kart 8 Deluxe' }),
        makeGame({ id: 'game-2', title: 'Super Mario Odyssey' }),
      ];
      const analyses = analyzeGamesWith(
        games,
        [],
        { items: [{ gameTitle: 'Mario', notifyOnAnyDiscount: false }] },
        40,
      );
      for (const analysis of analyses) {
        assert.ok(!analysis.wishlistMatch, `"Mario" must not resolve to ${analysis.game.title}`);
      }
    },
  });

  // ---- Catalog generation ----

  const sampleEntries = [
    catalogEntry('Fortnite', '7000000000001'),
    catalogEntry('Super Smash Bros. Ultimate', '7000000000002'),
    catalogEntry('Stardew Valley', '7000000000003'),
    catalogEntry('The Legend of Zelda: Breath of the Wild', '7000000000004'),
    catalogEntry('Mario Kart 8 Deluxe', '7000000000005'),
    catalogEntry('Hollow Knight', '7000000000006'),
    catalogEntry('Mario Party Superstars', '7000000000007'),
    catalogEntry('Super Mario Odyssey', '7000000000008'),
  ];

  checks.push({
    name: 'catalog output prioritizes resolved wishlist games',
    run: () => {
      const ordered = orderCatalogForOutput(
        [...sampleEntries],
        ['Super Smash Bros', 'Stardew'],
        5,
      );
      assert.deepStrictEqual(
        ordered.entries.map((entry) => entry.title),
        [
          'Super Smash Bros. Ultimate',
          'Stardew Valley',
          'Fortnite',
          'Hollow Knight',
          'Mario Kart 8 Deluxe',
        ],
      );
      assert.deepStrictEqual(ordered.missingWishlistTitles, []);
    },
  });

  checks.push({
    name: 'generated catalog contains the resolved wishlist games',
    run: () => {
      const ordered = orderCatalogForOutput(
        [...sampleEntries],
        ['Zelda', 'Hollow Knight'],
        6,
      );
      const titles = ordered.entries.map((entry) => entry.title);
      assert.ok(
        titles.includes('The Legend of Zelda: Breath of the Wild'),
        'Zelda must resolve to Breath of the Wild',
      );
      assert.ok(titles.includes('Hollow Knight'), 'Hollow Knight must be present');
      assert.strictEqual(
        ordered.entries[0].title,
        'The Legend of Zelda: Breath of the Wild',
      );
    },
  });

  checks.push({
    name: 'unresolved wishlist titles are reported and not injected',
    run: () => {
      const ordered = orderCatalogForOutput(
        [...sampleEntries],
        ['Super Smash Bros', 'Mario', 'Does Not Exist'],
        4,
      );
      assert.deepStrictEqual(ordered.missingWishlistTitles, ['Mario', 'Does Not Exist']);
      const titles = ordered.entries.map((entry) => entry.title);
      assert.ok(!titles.includes('Does Not Exist'), 'Unknown game must not be invented');
      assert.ok(!titles.includes('Mario'), 'Ambiguous title must not hijack a catalog entry');
    },
  });

  // ---- Digest: Wishlist Watch behavior ----

  checks.push({
    name: 'tracked wishlist game (fuzzy match) shows price, not "Not currently tracked"',
    run: () => {
      const ultimate = makeGame({
        id: 'game-1',
        title: 'Super Smash Bros. Ultimate',
        currentPrice: 41.99,
        originalPrice: 59.99,
        storeUrl: 'https://www.nintendo.com/store/products/super-smash-bros-ultimate/',
      });
      const result = makeResult({
        analyses: [makeAnalysis(ultimate)],
        wishlist: {
          items: [{ gameTitle: 'Super Smash Bros', targetPrice: 45, notifyOnAnyDiscount: false }],
        },
        monitoredTitles: ['Super Smash Bros. Ultimate'],
      });
      const digest = buildDailyDigest(result);
      const watch = digest.wishlistWatch.find((item) => item.title === 'Super Smash Bros');
      assert.ok(watch, 'Fuzzy-resolved wishlist item must appear in Wishlist Watch');
      assert.notStrictEqual(watch!.status, 'not-monitored');
      assert.strictEqual(watch!.currentPrice, 41.99);
      assert.strictEqual(watch!.originalPrice, 59.99);
      assert.ok((watch!.discountPercent ?? 0) > 0, 'Discount percent expected for the tracked deal');
      assert.strictEqual(watch!.targetPrice, 45);
      const html = renderDigestEmail(digest);
      assert.ok(
        !html.includes('Not currently tracked'),
        'Tracked game must not say "Not currently tracked"',
      );
    },
  });

  checks.push({
    name: 'untracked wishlist game keeps the "Not currently tracked" message',
    run: () => {
      const result = makeResult({
        wishlist: { items: [{ gameTitle: 'Imaginary Game 3000', notifyOnAnyDiscount: false }] },
        monitoredTitles: ['Stardew Valley'],
      });
      const digest = buildDailyDigest(result);
      const watch = digest.wishlistWatch.find((item) => item.title === 'Imaginary Game 3000');
      assert.ok(watch);
      assert.strictEqual(watch!.status, 'not-monitored');
      assert.strictEqual(watch!.currentPrice, undefined);
      const html = renderDigestEmail(digest);
      assert.ok(
        html.includes('Not currently tracked'),
        'Untracked game must keep the existing message',
      );
    },
  });

  checks.push({
    name: 'ambiguous wishlist title stays untracked in the digest',
    run: () => {
      const botw = makeGame({
        id: 'game-1',
        title: 'The Legend of Zelda: Breath of the Wild',
        currentPrice: 59.99,
        originalPrice: 59.99,
      });
      const totk = makeGame({
        id: 'game-2',
        title: 'The Legend of Zelda: Tears of the Kingdom',
        currentPrice: 69.99,
        originalPrice: 69.99,
      });
      const result = makeResult({
        wishlistGames: [botw, totk],
        wishlist: { items: [{ gameTitle: 'Zelda', notifyOnAnyDiscount: false }] },
      });
      const digest = buildDailyDigest(result);
      const watch = digest.wishlistWatch.find((item) => item.title === 'Zelda');
      assert.ok(watch);
      assert.strictEqual(watch!.status, 'not-monitored');
      assert.strictEqual(
        watch!.currentPrice,
        undefined,
        'Ambiguous title must not pick a game',
      );
    },
  });

  // ---- Resolver helper ----

  checks.push({
    name: 'wishlist resolver reports per-item matches',
    run: () => {
      const resolutions = resolveWishlistTitles(
        [
          { gameTitle: 'Super Smash Bros', notifyOnAnyDiscount: false },
          { gameTitle: 'Nope', notifyOnAnyDiscount: false },
        ],
        ['Super Smash Bros. Ultimate', 'Stardew Valley'],
      );
      assert.strictEqual(resolutions[0].matched, true);
      assert.strictEqual(resolutions[0].matchedTitle, 'Super Smash Bros. Ultimate');
      assert.strictEqual(resolutions[1].matched, false);
    },
  });

  // ---- Collector: wishlist price resolution ----

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-match-'));
  const catalogPath = path.join(tempDir, 'catalog.json');
  const collectorCatalog: CatalogGame[] = [
    {
      nsuid: '7000000000001',
      title: 'Super Smash Bros. Ultimate',
      slug: 'super-smash-bros-ultimate',
      platforms: ['switch1'],
    },
    {
      nsuid: '7000000000002',
      title: 'Mario Kart 8 Deluxe',
      slug: 'mario-kart-8-deluxe',
      platforms: ['switch1'],
    },
    {
      nsuid: '7000000000003',
      title: 'Pokémon Scarlet',
      slug: 'pokemon-scarlet',
      platforms: ['switch1'],
    },
    {
      nsuid: '7000000000004',
      title: 'Super Mario Odyssey',
      slug: 'super-mario-odyssey',
      platforms: ['switch1'],
    },
  ];
  fs.writeFileSync(catalogPath, JSON.stringify(collectorCatalog), 'utf8');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const prices = url.searchParams
      .getAll('ids')
      .filter((id) => /^\d+$/.test(id))
      .map((id) => ({
        title_id: id,
        regular_price: { currency: 'USD', raw_value: '59.99' },
        discount_price:
          id === '7000000000001'
            ? { currency: 'USD', raw_value: '41.99' }
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
      name: 'collector resolves a short wishlist title to its catalog game',
      run: async () => {
        const collector = new NintendoPriceCollector({ catalogPath });
        const games = await collector.collectWishlistPrices(['Super Smash Bros', 'Pokemon']);
        assert.strictEqual(games.length, 2, 'Both fuzzy titles must resolve to catalog entries');
        const smash = games.find((game) => game.title === 'Super Smash Bros. Ultimate');
        assert.ok(smash, 'Smash must resolve to Ultimate');
        assert.strictEqual(smash!.currentPrice, 41.99);
        assert.strictEqual(smash!.originalPrice, 59.99);
        const pokemon = games.find((game) => game.title === 'Pokémon Scarlet');
        assert.ok(pokemon, 'Pokemon must resolve to Pokémon Scarlet (accent-insensitive)');
      },
    });

    checks.push({
      name: 'collector leaves ambiguous titles untracked',
      run: async () => {
        const collector = new NintendoPriceCollector({ catalogPath });
        const games = await collector.collectWishlistPrices(['Mario']);
        assert.strictEqual(games.length, 0, 'Ambiguous title must not resolve to a single game');
      },
    });

    void matchTitlesToCandidates;
    await runChecks(checks);
    console.log('\nAll wishlist-driven catalog tracking checks passed.');
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  validateTitleMatch().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
