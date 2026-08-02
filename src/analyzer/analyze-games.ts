import 'dotenv/config';

import { MockGameCollector } from '../collectors/mock-game-collector';
import { loadFamilyProfiles } from '../config/family-profiles-loader';
import { resolveNotificationSettings } from '../config/settings-loader';
import { loadWishlist } from '../config/wishlist-loader';
import { GameAnalysis } from '../models';
import { analyzeGamesWith } from './analyze';

function formatPrice(price: number, currency: string): string {
  return `${currency} ${price.toFixed(2)}`;
}

function printAnalysisReport(results: GameAnalysis[]): void {
  for (const analysis of results) {
    const game = analysis.game;
    console.log('');
    console.log(`[${game.title}]`);
    const priceInfo =
      game.originalPrice !== undefined && game.originalPrice > game.currentPrice
        ? `${formatPrice(game.currentPrice, game.currency)} (was ${formatPrice(game.originalPrice, game.currency)})`
        : formatPrice(game.currentPrice, game.currency);
    console.log(`    Price: ${priceInfo} · Rating: ${game.ageRating ?? 'N/A'} · Genres: ${game.genres.join(', ')}`);

    const matchedProfiles = analysis.familyMatches.filter((match) => match.matched);
    if (matchedProfiles.length > 0) {
      console.log(`    Family matches: ${matchedProfiles.map((match) => match.profileName).join(', ')}`);
    } else {
      console.log('    Family matches: none');
    }
    for (const match of analysis.familyMatches) {
      if (match.reasons.length > 0) {
        console.log(`      - ${match.profileName}: ${match.reasons.join('; ')}`);
      }
    }

    if (analysis.wishlistMatch) {
      const match = analysis.wishlistMatch;
      let target: string;
      if (match.effectiveTargetPrice !== undefined && match.targetPriceOrigin !== undefined) {
        const origin =
          match.targetPriceOrigin === 'configured' ? 'configured target' : 'auto target';
        target = ` ${origin} ${formatPrice(match.effectiveTargetPrice, game.currency)}`;
      } else {
        target = ' no target price';
      }
      console.log(
        `    Wishlist: matched "${match.wishlistItem.gameTitle}" (${target}, reached: ${match.priceTargetReached})`,
      );
    } else {
      console.log('    Wishlist: no match');
    }

    console.log(
      `    Deal score: ${analysis.dealScore.score} — reasons: ${analysis.dealScore.reasons.join(', ') || 'none'}`,
    );
  }

  const withFamilyMatch = results.filter((result) =>
    result.familyMatches.some((match) => match.matched),
  ).length;
  const withWishlistMatch = results.filter((result) => result.wishlistMatch !== undefined).length;
  const top = [...results].sort((a, b) => b.dealScore.score - a.dealScore.score)[0];

  console.log('');
  console.log(
    `Summary: analyzed ${results.length} games; ${withFamilyMatch} family-friendly, ` +
      `${withWishlistMatch} on wishlist, top score ${top.dealScore.score} (${top.game.title}).`,
  );
}

export async function analyzeGames(): Promise<GameAnalysis[]> {
  const collector = new MockGameCollector();
  const games = await collector.collectGames();
  const profiles = loadFamilyProfiles();
  const wishlist = loadWishlist();

  console.log(
    `Analyzing ${games.length} games against ${profiles.length} family profile(s) and ${wishlist.items.length} wishlist item(s).`,
  );

  const settings = resolveNotificationSettings();
  const results: GameAnalysis[] = analyzeGamesWith(
    games,
    profiles,
    wishlist,
    settings.defaultWishlistDiscountPercent,
  );

  printAnalysisReport(results);
  return results;
}

if (require.main === module) {
  analyzeGames().catch((error: unknown) => {
    console.error('Failed to analyze games:', error);
    process.exitCode = 1;
  });
}
