import { WishlistItem } from '../models';
import { TitleMatch, matchTitlesToCandidates } from './title-matcher';

export interface WishlistResolution {
  item: WishlistItem;
  match: TitleMatch;
  matched: boolean;
  /** The candidate title the wishlist item resolved to (only when matched). */
  matchedTitle?: string;
}

/**
 * Resolves every wishlist item against a list of candidate titles (collected
 * games, catalog entries, or monitored titles). Matching is conservative and
 * ambiguity-aware: a wishlist title is only resolved when it matches exactly
 * one candidate; when several candidates fit, it is left unresolved.
 */
export function resolveWishlistTitles(
  items: WishlistItem[],
  candidateTitles: string[],
): WishlistResolution[] {
  const matches = matchTitlesToCandidates(
    items.map((item) => item.gameTitle),
    candidateTitles,
  );
  return items.map((item, index) => {
    const match = matches[index];
    return {
      item,
      match,
      matched: match.matched,
      matchedTitle: match.matched ? match.matchedTitle : undefined,
    };
  });
}
