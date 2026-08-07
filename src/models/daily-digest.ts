export interface DigestSummary {
  newDeals: number;
  wishlistGamesOnSale: number;
  stillActiveDeals: number;
  biggestDiscountPercent: number;
  biggestDiscountTitle?: string;
  gamesChecked: number;
}

/**
 * Historical price context shown on a deal card. `isLowestRecorded` means the
 * current price is the lowest ever seen (or tied); `previousLowest` is the low
 * before that; otherwise `lowestPrice` is the best historical price on record.
 * Absent entirely when a game has no meaningful price history.
 */
export interface DigestPriceContext {
  lowestPrice?: number;
  isLowestRecorded: boolean;
  previousLowest?: number;
}

export type DealQualityRating = 'excellent' | 'great' | 'good' | 'weak';

/**
 * Informational sale-quality label for a deal, derived from its price history.
 * Shown on a card only when there is enough history to judge.
 */
export interface DigestDealQuality {
  rating: DealQualityRating;
  reason: string;
}

export interface DigestStillOnSale {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  firstReportedAt: string;
  daysOnSale: number;
  storeUrl: string;
  priceContext?: DigestPriceContext;
  quality?: DigestDealQuality;
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
  priceContext?: DigestPriceContext;
  quality?: DigestDealQuality;
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
  priceContext?: DigestPriceContext;
  quality?: DigestDealQuality;
}

export interface DigestFreeGame {
  title: string;
  ageRating: string;
  storeUrl: string;
}

/**
 * A deal now sitting at (or below) its historically lowest recorded price.
 * `lowPrice` is the historical low; `currentPrice` is where it is today.
 */
export interface DigestHistoricalLow {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  lowPrice: number;
  ageRating: string;
  storeUrl: string;
}

export interface DigestFamilyRecommendationMember {
  name: string;
  reasons: string[];
}

/**
 * A family recommendation grouped by game. Each recommended game appears
 * exactly once, with every matching family member listed beneath it (unless
 * the whole family matches, in which case `entireFamily` is true and the
 * individual member list is collapsed into a single "Entire family" label).
 */
export interface DigestFamilyRecommendation {
  title: string;
  currentPrice: number;
  originalPrice?: number;
  discountPercent: number;
  isFree: boolean;
  onWishlist: boolean;
  entireFamily: boolean;
  members: DigestFamilyRecommendationMember[];
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
  historicalLows: DigestHistoricalLow[];
  recommendations: DigestFamilyRecommendation[];
  priceWatch: DigestPriceWatchItem[];
  statistics?: DigestStatistics;
}