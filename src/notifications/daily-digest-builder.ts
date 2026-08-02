import { calculateDiscountPercent } from '../analyzer/deal-score';
import { DEFAULT_DAILY_DIGEST_SETTINGS } from '../config/settings-loader';
import {
  DailyDigest,
  DigestBestDeal,
  DigestFamilyRecommendation,
  DigestPriceWatchItem,
  DigestStatistics,
  DigestSummary,
  DigestWishlistAlert,
  Game,
  MonitorResult,
} from '../models';

export interface BuildDailyDigestOptions {
  maxBestDeals?: number;
  maxWishlistAlerts?: number;
  showStatistics?: boolean;
  showPriceWatch?: boolean;
}

function formatDigestDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function resolveStoreUrl(game: Game): string {
  if (game.storeUrl) {
    return game.storeUrl;
  }
  return `https://www.nintendo-europe.com/en-gb/search/?term=${encodeURIComponent(game.title)}`;
}

export function buildDailyDigest(
  result: MonitorResult,
  options: BuildDailyDigestOptions = {},
): DailyDigest {
  const maxBestDeals = options.maxBestDeals ?? DEFAULT_DAILY_DIGEST_SETTINGS.maxBestDeals;
  const maxWishlistAlerts = options.maxWishlistAlerts ?? DEFAULT_DAILY_DIGEST_SETTINGS.maxWishlistAlerts;
  const showStatistics = options.showStatistics ?? DEFAULT_DAILY_DIGEST_SETTINGS.showStatistics;
  const showPriceWatch = options.showPriceWatch ?? DEFAULT_DAILY_DIGEST_SETTINGS.showPriceWatch;

  const wishlistHits = result.analyses.filter(
    (analysis) => analysis.wishlistMatch?.matched ?? false,
  ).length;
  const freeGamesCount = result.analyses.filter(
    (analysis) => analysis.game.currentPrice === 0,
  ).length;

  const summary: DigestSummary = {
    gamesChecked: result.analyzedCount,
    potentialMatches: result.potentialMatchCount,
    newNotifications: result.reportedCount,
    wishlistHits,
    freeGames: freeGamesCount,
    skippedByCooldown: result.skippedByCooldownCount,
  };

  const wishlistAlerts: DigestWishlistAlert[] = result.reportedAnalyses
    .filter(
      (analysis) =>
        analysis.wishlistMatch?.matched === true &&
        analysis.wishlistMatch.effectiveTargetPrice !== undefined,
    )
    .slice(0, maxWishlistAlerts)
    .map((analysis) => {
      const match = analysis.wishlistMatch;
      return {
        title: analysis.game.title,
        currentPrice: analysis.game.currentPrice,
        originalPrice: analysis.game.originalPrice,
        discountPercent: calculateDiscountPercent(analysis.game),
        targetPrice: (match?.effectiveTargetPrice as number),
        targetPriceOrigin: match?.targetPriceOrigin ?? 'auto',
        targetReached: match?.priceTargetReached ?? false,
        ageRating: analysis.game.ageRating ?? 'NR',
        storeUrl: resolveStoreUrl(analysis.game),
      };
    });

  const alertTitles = new Set(wishlistAlerts.map((alert) => alert.title));
  const bestDeals: DigestBestDeal[] = result.reportedAnalyses
    .filter(
      (analysis) => analysis.game.currentPrice > 0 && !alertTitles.has(analysis.game.title),
    )
    .sort((a, b) => b.dealScore.score - a.dealScore.score)
    .slice(0, maxBestDeals)
    .map((analysis) => ({
      title: analysis.game.title,
      currentPrice: analysis.game.currentPrice,
      originalPrice: analysis.game.originalPrice,
      discountPercent: calculateDiscountPercent(analysis.game),
      score: analysis.dealScore.score,
      reasons: analysis.dealScore.reasons,
      ageRating: analysis.game.ageRating ?? 'NR',
      storeUrl: resolveStoreUrl(analysis.game),
    }));

  const freeGames = result.reportedAnalyses
    .filter((analysis) => analysis.game.currentPrice === 0)
    .map((analysis) => ({
      title: analysis.game.title,
      ageRating: analysis.game.ageRating ?? 'NR',
      storeUrl: resolveStoreUrl(analysis.game),
    }));

  const recommendationMap = new Map<string, DigestFamilyRecommendation>();
  for (const analysis of result.reportedAnalyses) {
    for (const match of analysis.familyMatches) {
      if (!match.matched) {
        continue;
      }
      let recommendation = recommendationMap.get(match.profileName);
      if (!recommendation) {
        recommendation = { profileName: match.profileName, games: [] };
        recommendationMap.set(match.profileName, recommendation);
      }
      recommendation.games.push({ title: analysis.game.title, reasons: match.reasons });
    }
  }
  const recommendations = [...recommendationMap.values()];

  let priceWatch: DigestPriceWatchItem[] = [];
  if (showPriceWatch) {
    priceWatch = result.analyses
      .filter(
        (analysis) =>
          analysis.wishlistMatch?.matched === true &&
          analysis.wishlistMatch.effectiveTargetPrice !== undefined &&
          analysis.game.currentPrice > (analysis.wishlistMatch.effectiveTargetPrice as number),
      )
      .map((analysis) => {
        const target = analysis.wishlistMatch?.effectiveTargetPrice as number;
        return {
          title: analysis.game.title,
          targetPrice: target,
          currentPrice: analysis.game.currentPrice,
          difference: Math.round((analysis.game.currentPrice - target) * 100) / 100,
        };
      })
      .filter((item) => item.difference <= Math.max(1, item.targetPrice * 0.1))
      .sort((a, b) => a.difference - b.difference)
      .slice(0, maxWishlistAlerts);
  }

  const statistics: DigestStatistics | undefined = showStatistics
    ? {
        gamesChecked: result.analyzedCount,
        reported: result.reportedCount,
        skipped:
          result.skippedByCooldownAnalyses.length + result.skippedByScoreAnalyses.length,
        collector: result.collector,
        executionTime: formatExecutionTime(result.executionTimeMs),
      }
    : undefined;

  return {
    generatedAt: result.generatedAt,
    dateLabel: formatDigestDate(result.generatedAt),
    collector: result.collector,
    currency: result.currency,
    defaultWishlistDiscountPercent: result.defaultWishlistDiscountPercent,
    summary,
    wishlistAlerts,
    bestDeals,
    freeGames,
    recommendations,
    priceWatch,
    statistics,
  };
}
