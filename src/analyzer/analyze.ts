import { FamilyProfile, Game, GameAnalysis, Wishlist, WishlistItem } from '../models';
import { scoreDeal } from './deal-score';
import { matchGameToProfiles } from './family-matcher';
import { matchGameToWishlist } from './wishlist-matcher';
import { resolveWishlistTitles } from '../matching/wishlist-resolver';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../config/settings-loader';

export function analyzeGamesWith(
  games: Game[],
  profiles: FamilyProfile[],
  wishlist: Wishlist,
  defaultWishlistDiscountPercent: number = DEFAULT_NOTIFICATION_SETTINGS.defaultWishlistDiscountPercent,
): GameAnalysis[] {
  // Resolve wishlist titles against the full collection once, so a title like
  // "Super Smash Bros" can match "Super Smash Bros. Ultimate" while an
  // ambiguous title like "Mario" (many matches) resolves to nothing.
  const candidateTitles = games.map((game) => game.title);
  const resolutions = resolveWishlistTitles(wishlist.items, candidateTitles);
  const itemByResolvedTitle = new Map<string, WishlistItem>();
  for (const resolution of resolutions) {
    if (
      resolution.matched &&
      resolution.matchedTitle !== undefined &&
      !itemByResolvedTitle.has(resolution.matchedTitle)
    ) {
      itemByResolvedTitle.set(resolution.matchedTitle, resolution.item);
    }
  }

  return games.map((game) => {
    const familyMatches = matchGameToProfiles(game, profiles);
    const item = itemByResolvedTitle.get(game.title);
    const wishlistMatch = item
      ? matchGameToWishlist(game, { items: [item] }, defaultWishlistDiscountPercent)
      : null;
    const dealScore = scoreDeal({
      game,
      familyMatchCount: familyMatches.filter((match) => match.matched).length,
      wishlistMatched: wishlistMatch?.matched ?? false,
      priceTargetReached: wishlistMatch?.priceTargetReached ?? false,
      // The analyzer has no access to the price history; the digest builder
      // re-applies the historical-low bonus (see applyHistoricalLowScore) once
      // the deal-history data is available.
      historicalLowReached: false,
    });
    return {
      game,
      familyMatches,
      wishlistMatch: wishlistMatch ?? undefined,
      dealScore,
    };
  });
}
