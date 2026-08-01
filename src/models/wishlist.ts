export interface WishlistItem {
  id: string;
  gameTitle: string;
  targetPrice?: number;
  notifyOnAnyDiscount: boolean;
  notes?: string;
}

export interface Wishlist {
  items: WishlistItem[];
}
