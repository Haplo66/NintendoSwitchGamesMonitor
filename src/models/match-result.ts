import { WishlistItem } from './wishlist';

export interface FamilyMatchResult {
  profileName: string;
  matched: boolean;
  reasons: string[];
}

export interface WishlistMatchResult {
  matched: boolean;
  wishlistItem: WishlistItem;
  priceTargetReached: boolean;
}
