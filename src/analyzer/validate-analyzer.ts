import 'dotenv/config';

import * as assert from 'node:assert';

import { loadFamilyProfiles } from '../config/family-profiles-loader';
import { loadGameCatalog } from '../collectors/nintendo-price-collector';
import { FamilyProfile, Game } from '../models';
import { analyzeGamesWith } from './analyze';
import { applyHistoricalLowScore, displayScore, scoreDeal } from './deal-score';
import { matchGameToProfile, matchGameToProfiles, normalizeGenre } from './family-matcher';

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

function profile(name: string, excludedGenres: string[], preferredGenres: string[] = []): FamilyProfile {
  return { name, excludedGenres, preferredGenres };
}

function game(genres: string[], overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Test Game',
    platform: 'Nintendo Switch',
    currentPrice: 9.99,
    originalPrice: 29.99,
    currency: 'USD',
    genres,
    source: 'test',
    ...overrides,
  };
}

export async function validateAnalyzer(): Promise<void> {
  const realProfiles = loadFamilyProfiles();
  const realCatalog = loadGameCatalog();

  const checks: Check[] = [
    {
      name: 'a game tagged "Shooting" is excluded for a profile that excludes "Shooter"',
      run: () => {
        const match = matchGameToProfile(game(['Action', 'Shooting']), profile('Kid', ['Shooter']));
        assert.strictEqual(match.matched, false, 'game tagged Shooting should be blocked by Shooter exclusion');
        assert.ok(
          match.reasons.some((reason) => reason.includes('excluded')),
          `expected an exclusion reason, got: ${match.reasons.join('; ')}`,
        );
      },
    },
    {
      name: 'a game tagged "Shooter" is excluded for a profile that excludes "Shooting"',
      run: () => {
        const match = matchGameToProfile(game(['Shooter']), profile('Kid', ['Shooting']));
        assert.strictEqual(match.matched, false, 'game tagged Shooter should be blocked by Shooting exclusion');
      },
    },
    {
      name: 'a game tagged "Horror" is excluded for a profile that excludes "Horror"',
      run: () => {
        const match = matchGameToProfile(game(['Horror']), profile('Kid', ['Horror']));
        assert.strictEqual(match.matched, false, 'game tagged Horror should be blocked by Horror exclusion');
      },
    },
    {
      name: 'a horror genre variant is excluded too',
      run: () => {
        const match = matchGameToProfile(game(['Survival Horror']), profile('Kid', ['Horror']));
        assert.strictEqual(match.matched, false, 'Survival Horror should normalize to the Horror family');
      },
    },
    {
      name: 'excluded genres take precedence over preferred genres',
      run: () => {
        const match = matchGameToProfile(
          game(['Action', 'Shooting']),
          profile('Kid', ['Shooter'], ['Action']),
        );
        assert.strictEqual(match.matched, false, 'exclusion must win over a preferred genre');
        assert.ok(
          match.reasons.some((reason) => reason.includes('excluded')),
          `expected only the exclusion reason, got: ${match.reasons.join('; ')}`,
        );
        assert.ok(
          !match.reasons.some((reason) => reason.includes('preferred')),
          'preferred genre must not be reported when excluded',
        );
      },
    },
    {
      name: 'a game is blocked for one profile and matched for another',
      run: () => {
        const results = matchGameToProfiles(game(['Shooting']), [
          profile('NoShooter', ['Shooter']),
          profile('FineWithIt', []),
        ]);
        const blocked = results.find((match) => match.profileName === 'NoShooter');
        const allowed = results.find((match) => match.profileName === 'FineWithIt');
        assert.ok(blocked, 'expected a NoShooter profile result');
        assert.ok(allowed, 'expected a FineWithIt profile result');
        assert.strictEqual(blocked!.matched, false, 'NoShooter profile must block the game');
        assert.strictEqual(allowed!.matched, true, 'profile without the exclusion must match');
      },
    },
    {
      name: 'a game without genre metadata is not blocked by genre exclusion',
      run: () => {
        const match = matchGameToProfile(game([]), profile('Kid', ['Shooter']));
        assert.strictEqual(
          match.matched,
          true,
          'no genres means no genre exclusion can fire (age rating may still block)',
        );
      },
    },
    {
      name: 'a non-excluded game is recommended normally',
      run: () => {
        const match = matchGameToProfile(game(['Action']), profile('Kid', ['Shooter', 'Horror']));
        assert.strictEqual(match.matched, true, 'Action game must be matched for a Shooter/Horror-excluding profile');
      },
    },
    {
      name: 'preferred genres match across vocabulary variants ("Role playing" vs "RPG")',
      run: () => {
        const match = matchGameToProfile(game(['Role playing']), profile('Kid', [], ['RPG']));
        assert.strictEqual(match.matched, true, 'Role playing should satisfy a preferred RPG genre');
        assert.ok(match.reasons.some((reason) => reason.includes('preferred')));
      },
    },
    {
      name: 'DOOM is not recommended to any family profile excluding Shooter',
      run: () => {
        const doom = realCatalog.find((entry) => entry.title === 'DOOM');
        assert.ok(doom, 'DOOM must exist in the catalog');
        const results = matchGameToProfiles(game(doom.genres ?? [], { title: doom.title }), realProfiles);
        for (const match of results) {
          assert.strictEqual(
            match.matched,
            false,
            `DOOM must not be recommended to ${match.profileName}`,
          );
        }
      },
    },
    {
      name: 'sniper games are not recommended to any family profile excluding Shooter',
      run: () => {
        const sniperTitles = [
          'Call of Sniper Combat - WW2',
          'Johnny Trigger: Sniper',
          'Zombie Sniper Shooter - Stickman War',
          'Sniper Dan',
          'The GhostX : Sniper Simulator (Tactical Shooting & Eliminator)',
        ];
        for (const title of sniperTitles) {
          const entry = realCatalog.find((candidate) => candidate.title === title);
          assert.ok(entry, `${title} must exist in the catalog`);
          const results = matchGameToProfiles(game(entry.genres ?? [], { title }), realProfiles);
          for (const match of results) {
            assert.strictEqual(
              match.matched,
              false,
              `${title} must not be recommended to ${match.profileName}`,
            );
          }
        }
      },
    },
    {
      name: 'LEGO games remain recommended to profiles excluding Shooter',
      run: () => {
        const legoTitles = ['LEGO Bricktales', 'LEGO CITY Undercover', "LEGO Builder's Journey"];
        for (const title of legoTitles) {
          const entry = realCatalog.find((candidate) => candidate.title === title);
          assert.ok(entry, `${title} must exist in the catalog`);
          const results = matchGameToProfiles(game(entry.genres ?? [], { title }), realProfiles);
          assert.ok(
            results.some((match) => match.matched),
            `${title} should be recommended to at least one profile`,
          );
        }
      },
    },
    {
      name: 'platform games remain recommended to profiles excluding Shooter',
      run: () => {
        const platformTitles = ['Kirby and the Forgotten Land', 'Kirby Air Riders', 'Arcade Archives Mario Bros.'];
        for (const title of platformTitles) {
          const entry = realCatalog.find((candidate) => candidate.title === title);
          assert.ok(entry, `${title} must exist in the catalog`);
          const results = matchGameToProfiles(game(entry.genres ?? [], { title }), realProfiles);
          assert.ok(
            results.some((match) => match.matched),
            `${title} should be recommended to at least one profile`,
          );
        }
      },
    },
    {
      name: 'blocked profiles contribute no family bonus to the deal score',
      run: () => {
        const doom = realCatalog.find((entry) => entry.title === 'DOOM');
        assert.ok(doom, 'DOOM must exist in the catalog');
        const analyses = analyzeGamesWith(
          [game(doom.genres ?? [], { title: doom.title, currentPrice: 9.99, originalPrice: 59.99 })],
          realProfiles,
          { items: [] },
        );
        const analysis = analyses[0];
        assert.ok(
          analysis.familyMatches.every((match) => !match.matched),
          'DOOM must not match any profile',
        );
        assert.ok(
          !analysis.dealScore.reasons.some((reason) => reason.includes('family profile')),
          'a blocked game must not earn a family-match bonus',
        );
      },
    },
    {
      name: 'the price-target bonus is separate from the wishlist bonus',
      run: () => {
        const withoutTarget = scoreDeal({
          game: game([], { currentPrice: 29.99, originalPrice: 59.99 }),
          familyMatchCount: 0,
          wishlistMatched: true,
          priceTargetReached: false,
          historicalLowReached: false,
        });
        const atTarget = scoreDeal({
          game: game([], { currentPrice: 29.99, originalPrice: 59.99 }),
          familyMatchCount: 0,
          wishlistMatched: true,
          priceTargetReached: true,
          historicalLowReached: false,
        });
        assert.ok(
          withoutTarget.reasons.some((reason) => reason.includes('On wishlist')),
          'a wishlist match must report the wishlist bonus',
        );
        assert.ok(
          !withoutTarget.reasons.some((reason) => reason.includes('Price target reached')),
          'a wishlist match without the target reached must not claim the target bonus',
        );
        assert.ok(
          atTarget.reasons.some((reason) => reason.includes('Price target reached')),
          'a wishlist match with the target reached must report the target bonus',
        );
        assert.ok(
          atTarget.score > withoutTarget.score,
          'reaching the price target must add a distinct bonus on top of the wishlist bonus',
        );
      },
    },
    {
      name: 'a deal at its historical low earns a bonus and sorts the same way',
      run: () => {
        const normal = scoreDeal({
          game: game([], { currentPrice: 34.99, originalPrice: 59.99 }),
          familyMatchCount: 0,
          wishlistMatched: false,
          priceTargetReached: false,
          historicalLowReached: false,
        });
        const atLow = scoreDeal({
          game: game([], { currentPrice: 34.99, originalPrice: 59.99 }),
          familyMatchCount: 0,
          wishlistMatched: false,
          priceTargetReached: false,
          historicalLowReached: true,
        });
        assert.ok(
          atLow.reasons.some((reason) => reason.includes('historical low')),
          'a historical-low deal should report the historical-low bonus',
        );
        assert.ok(atLow.score > normal.score, 'a historical-low deal must score higher');
        const augmented = applyHistoricalLowScore({ score: 100, reasons: [] }, true);
        assert.strictEqual(augmented.score, 115, 'applyHistoricalLowScore must add the bonus');
        assert.ok(
          augmented.reasons.includes('At its historical low'),
          'applyHistoricalLowScore must add the historical-low reason',
        );
        assert.strictEqual(
          applyHistoricalLowScore({ score: 100, reasons: [] }, false).score,
          100,
          'applyHistoricalLowScore must be a no-op when not at a historical low',
        );
      },
    },
    {
      name: 'genre normalization maps variant labels onto one family',
      run: () => {
        assert.strictEqual(normalizeGenre('Shooting'), 'shooter');
        assert.strictEqual(normalizeGenre('Shooter'), 'shooter');
        assert.strictEqual(normalizeGenre('First-Person Shooter'), 'shooter');
        assert.strictEqual(normalizeGenre('  FPS '), 'shooter');
        assert.strictEqual(normalizeGenre('Survival Horror'), 'horror');
        assert.strictEqual(normalizeGenre('Role playing'), 'role-playing');
        assert.strictEqual(normalizeGenre('RPG'), 'role-playing');
        assert.strictEqual(normalizeGenre('Action'), 'action');
        assert.strictEqual(normalizeGenre('Puzzle'), 'puzzle');
      },
    },
    {
      name: 'family match adds a small per-profile bonus without overwhelming the deal value',
      run: () => {
        const base = { currentPrice: 35.94, originalPrice: 59.99 };
        const noMatch = scoreDeal({
          game: game([], base),
          familyMatchCount: 0,
          wishlistMatched: false,
          priceTargetReached: false,
          historicalLowReached: false,
        });
        const oneMatch = scoreDeal({
          game: game([], base),
          familyMatchCount: 1,
          wishlistMatched: false,
          priceTargetReached: false,
          historicalLowReached: false,
        });
        const fourMatches = scoreDeal({
          game: game([], base),
          familyMatchCount: 4,
          wishlistMatched: false,
          priceTargetReached: false,
          historicalLowReached: false,
        });
        assert.ok(
          oneMatch.reasons.some((reason) => reason.includes('family profile')),
          'a family match must still report the family-match reason',
        );
        assert.strictEqual(
          oneMatch.score - noMatch.score,
          2,
          'each matching family profile must contribute a small +2 bonus',
        );
        assert.strictEqual(
          fourMatches.score - noMatch.score,
          8,
          'four matching profiles must contribute +8 total, not +40',
        );
        assert.ok(
          fourMatches.score < 100,
          'an ordinary discounted family game must remain well below the display cap',
        );
        assert.strictEqual(
          displayScore(fourMatches.score),
          fourMatches.score,
          'a score below the cap must be displayed unchanged',
        );
      },
    },
    {
      name: 'display score never exceeds 100 but internal score stays intact',
      run: () => {
        assert.strictEqual(displayScore(50), 50, 'scores below the cap pass through');
        assert.strictEqual(displayScore(100), 100, 'scores at the cap pass through');
        assert.strictEqual(displayScore(105), 100, 'scores above the cap clamp to 100');
        assert.strictEqual(displayScore(150), 100, 'high internal scores clamp to 100');
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll analyzer validation checks passed.');
}

if (require.main === module) {
  validateAnalyzer().catch((error: unknown) => {
    console.error('Analyzer validation failed:', error);
    process.exitCode = 1;
  });
}
