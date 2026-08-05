export interface DigestSummary {
  newDeals: number;
  wishlistGamesOnSale: number;
  stillActiveDeals: number;
  biggestDiscountPercent: number;
  biggestDiscountTitle?: string;
  gamesChecked: number;
}

export interface DigestStillOnSale {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  firstReportedAt: string;
  daysOnSale: number;
  storeUrl: string;
}

export type WishlistWatchStatus = 'on-sale' | 'target-reached' | 'full-price' | 'not-monitored';

export interface DigestWishlistWatch {
  title: string;
  status: WishlistWatchStatus;
  currentPrice?: number;
  originalPrice?: number;
  discountPercent?: number;
  targetPrice?: number;
  targetPriceOrigin?: 'configured' | 'auto';
  storeUrl?: string;
}

export interface DigestWishlistAlert {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  targetPrice: number;
  targetPriceOrigin: 'configured' | 'auto';
  targetReached: boolean;
  ageRating: string;
  storeUrl: string;
}

export interface DigestBestDeal {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  score: number;
  reasons: string[];
  ageRating: string;
  storeUrl: string;
}

export interface DigestFreeGame {
  title: string;
  ageRating: string;
  storeUrl: string;
}

export interface DigestRecommendationGame {
  title: string;
  reasons: string[];
}

export interface DigestFamilyRecommendation {
  profileName: string;
  games: DigestRecommendationGame[];
}

export interface DigestPriceWatchItem {
  title: string;
  targetPrice: number;
  currentPrice: number;
  difference: number;
}

export interface DigestStatistics {
  gamesChecked: number;
  reported: number;
  skipped: number;
  collector: string;
  executionTime: string;
}

export interface DailyDigest {
  generatedAt: string;
  dateLabel: string;
  collector: string;
  currency: string;
  defaultWishlistDiscountPercent: number;
  summary: DigestSummary;
  stillOnSale: DigestStillOnSale[];
  wishlistWatch: DigestWishlistWatch[];
  wishlistAlerts: DigestWishlistAlert[];
  bestDeals: DigestBestDeal[];
  freeGames: DigestFreeGame[];
  recommendations: DigestFamilyRecommendation[];
  priceWatch: DigestPriceWatchItem[];
  statistics?: DigestStatistics;
}