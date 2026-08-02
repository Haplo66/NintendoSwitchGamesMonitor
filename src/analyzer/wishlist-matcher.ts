import { DEFAULT_NOTIFICATION_SETTINGS } from '../config/settings-loader';
import { Game, Wishlist, WishlistMatchResult, WishlistItem } from '../models';

function titlesMatch(gameTitle: string, wishTitle: string): boolean {
  const game = gameTitle.toLowerCase().trim();
  const wish = wishTitle.toLowerCase().trim();
  return game === wish || game.includes(wish) || wish.includes(game);
}

export function computeWishlistTargetPrice(
  game: Game,
  item: WishlistItem,
  defaultWishlistDiscountPercent: number,
): number | undefined {
  if (item.targetPrice !== undefined) {
    return item.targetPrice;
  }
  if (game.originalPrice === undefined || game.originalPrice <= 0) {
    return undefined;
  }
  const raw = game.originalPrice * (1 - defaultWishlistDiscountPercent / 100);
  return Math.round(raw * 100) / 100;
}

export function isPriceTargetReached(
  game: Game,
  item: WishlistItem,
  defaultWishlistDiscountPercent: number,
): boolean {
  const target = computeWishlistTargetPrice(game, item, defaultWishlistDiscountPercent);
  if (target !== undefined) {
    return game.currentPrice <= target;
  }
  return game.originalPrice !== undefined && game.currentPrice < game.originalPrice;
}

export function matchGameToWishlist(
  game: Game,
  wishlist: Wishlist,
  defaultWishlistDiscountPercent: number = DEFAULT_NOTIFICATION_SETTINGS.defaultWishlistDiscountPercent,
): WishlistMatchResult | null {
  const item = wishlist.items.find((wishlistItem) =>
    titlesMatch(game.title, wishlistItem.gameTitle),
  );
  if (!item) {
    return null;
  }
  const target = computeWishlistTargetPrice(game, item, defaultWishlistDiscountPercent);
  const result: WishlistMatchResult = {
    matched: true,
    wishlistItem: item,
    priceTargetReached: isPriceTargetReached(game, item, defaultWishlistDiscountPercent),
  };
  if (target !== undefined) {
    result.effectiveTargetPrice = target;
    result.targetPriceOrigin = item.targetPrice !== undefined ? 'configured' : 'auto';
  }
  return result;
}
