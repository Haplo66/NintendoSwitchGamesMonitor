export interface WishlistItem {
  gameTitle: string;
  targetPrice?: number;
  notifyOnAnyDiscount: boolean;
  notes?: string;
}

export interface Wishlist {
  items: WishlistItem[];
}
