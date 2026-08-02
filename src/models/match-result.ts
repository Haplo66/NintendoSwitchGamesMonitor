import { WishlistItem } from './wishlist';

export interface FamilyMatchResult {
  profileName: string;
  matched: boolean;
  reasons: string[];
}

export type WishlistTargetPriceOrigin = 'configured' | 'auto';

export interface WishlistMatchResult {
  matched: boolean;
  wishlistItem: WishlistItem;
  priceTargetReached: boolean;
  effectiveTargetPrice?: number;
  targetPriceOrigin?: WishlistTargetPriceOrigin;
}
