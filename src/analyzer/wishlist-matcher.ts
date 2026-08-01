import { Game, Wishlist, WishlistMatchResult, WishlistItem } from '../models';

function titlesMatch(gameTitle: string, wishTitle: string): boolean {
  const game = gameTitle.toLowerCase().trim();
  const wish = wishTitle.toLowerCase().trim();
  return game === wish || game.includes(wish) || wish.includes(game);
}

export function isPriceTargetReached(game: Game, item: WishlistItem): boolean {
  if (item.targetPrice !== undefined) {
    return game.currentPrice <= item.targetPrice;
  }
  return game.originalPrice !== undefined && game.currentPrice < game.originalPrice;
}

export function matchGameToWishlist(
  game: Game,
  wishlist: Wishlist,
): WishlistMatchResult | null {
  const item = wishlist.items.find((wishlistItem) =>
    titlesMatch(game.title, wishlistItem.gameTitle),
  );
  if (!item) {
    return null;
  }
  return {
    matched: true,
    wishlistItem: item,
    priceTargetReached: isPriceTargetReached(game, item),
  };
}
