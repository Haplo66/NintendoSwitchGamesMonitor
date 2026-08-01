export interface Game {
  id: string;
  title: string;
  description?: string;
  platform: string;
  currentPrice: number;
  originalPrice?: number;
  currency: string;
  ageRating?: string;
  genres: string[];
  storeUrl?: string;
  imageUrl?: string;
  source: string;
}
