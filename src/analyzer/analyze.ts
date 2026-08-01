import { FamilyProfile, Game, GameAnalysis, Wishlist } from '../models';
import { scoreDeal } from './deal-score';
import { matchGameToProfiles } from './family-matcher';
import { matchGameToWishlist } from './wishlist-matcher';

export function analyzeGamesWith(
  games: Game[],
  profiles: FamilyProfile[],
  wishlist: Wishlist,
): GameAnalysis[] {
  return games.map((game) => {
    const familyMatches = matchGameToProfiles(game, profiles);
    const wishlistMatch = matchGameToWishlist(game, wishlist);
    const dealScore = scoreDeal({
      game,
      familyMatchCount: familyMatches.filter((match) => match.matched).length,
      wishlistMatched: wishlistMatch?.matched ?? false,
      priceTargetReached: wishlistMatch?.priceTargetReached ?? false,
    });
    return {
      game,
      familyMatches,
      wishlistMatch: wishlistMatch ?? undefined,
      dealScore,
    };
  });
}
