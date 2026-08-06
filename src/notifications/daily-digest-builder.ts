import { calculateDiscountPercent } from '../analyzer/deal-score';
import { matchGameToWishlist } from '../analyzer/wishlist-matcher';
import { DEFAULT_DAILY_DIGEST_SETTINGS } from '../config/settings-loader';
import { getPriceContext } from '../history/price-intelligence';
import { matchTitleToCandidates, matchTitlesToCandidates } from '../matching/title-matcher';
import {
  DailyDigest,
  DigestBestDeal,
  DigestFamilyRecommendation,
  DigestPriceContext,
  DigestPriceWatchItem,
  DigestStatistics,
  DigestStillOnSale,
  DigestSummary,
  DigestWishlistAlert,
  DigestWishlistWatch,
  Game,
  GameAnalysis,
  MonitorResult,
  WishlistWatchStatus,
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

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

function daysBetween(earlierIso: string, laterIso: string): number {
  const earlier = Date.parse(earlierIso);
  const later = Date.parse(laterIso);
  if (Number.isNaN(earlier) || Number.isNaN(later)) {
    return 0;
  }
  const ms = later - earlier;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function priceContextFor(
  result: MonitorResult,
  title: string,
  currentPrice: number,
): DigestPriceContext | undefined {
  const entry = result.dealHistory.entries.find(
    (candidate) => titleKey(candidate.gameTitle) === titleKey(title),
  );
  if (!entry || !entry.priceHistory || entry.priceHistory.length === 0) {
    return undefined;
  }
  const context = getPriceContext(entry.priceHistory, currentPrice);
  if (context.lowestPrice === undefined && !context.isLowestRecorded) {
    return undefined;
  }
  return context;
}

function buildStillOnSale(result: MonitorResult): DigestStillOnSale[] {
  const reportedTitles = new Set(result.reportedAnalyses.map((analysis) => titleKey(analysis.game.title)));
  const gameByTitle = new Map(
    result.analyses.map((analysis) => [titleKey(analysis.game.title), analysis.game]),
  );

  const items: DigestStillOnSale[] = [];
  for (const entry of result.dealHistory.entries) {
    if (!entry.currentlyOnSale || !entry.firstNotified) {
      continue;
    }
    if (reportedTitles.has(titleKey(entry.gameTitle))) {
      continue;
    }
    const game = gameByTitle.get(titleKey(entry.gameTitle));
    if (!game || !isOnSale(game)) {
      continue;
    }
    items.push({
      title: entry.gameTitle,
      currentPrice: game.currentPrice,
      originalPrice: game.originalPrice,
      discountPercent: calculateDiscountPercent(game),
      firstReportedAt: entry.firstNotified,
      daysOnSale: daysBetween(entry.firstSeenOnSale, result.generatedAt),
      storeUrl: resolveStoreUrl(game),
      priceContext: priceContextFor(result, entry.gameTitle, game.currentPrice),
    });
  }
  items.sort((a, b) => b.discountPercent - a.discountPercent);
  return items;
}

function buildWishlistWatch(result: MonitorResult): DigestWishlistWatch[] {
  // Combine deal-result games and wishlist-price games into one candidate set,
  // deduplicated by title, then resolve every wishlist item against it with the
  // conservative matcher. A wishlist title like "Super Smash Bros" therefore
  // matches the catalog game "Super Smash Bros. Ultimate" and shows its price,
  // while an ambiguous or unknown title stays "Not currently tracked".
  const candidateGames = [
    ...result.analyses.map((analysis) => analysis.game),
    ...result.wishlistGames,
  ].filter(
    (game, index, all) =>
      all.findIndex((other) => titleKey(other.title) === titleKey(game.title)) === index,
  );
  const gameByTitle = new Map(candidateGames.map((game) => [titleKey(game.title), game]));
  const analysisByTitle = new Map(
    result.analyses.map((analysis) => [titleKey(analysis.game.title), analysis]),
  );
  const matches = matchTitlesToCandidates(
    result.wishlist.items.map((item) => item.gameTitle),
    candidateGames.map((game) => game.title),
  );

  return result.wishlist.items.map((item, index) => {
    const match = matches[index];
    const game =
      match.matched && match.matchedTitle
        ? gameByTitle.get(titleKey(match.matchedTitle))
        : undefined;

    if (!game) {
      const monitored = matchTitleToCandidates(item.gameTitle, result.monitoredTitles).matched;
      return {
        title: item.gameTitle,
        status: monitored ? 'full-price' : 'not-monitored',
        targetPrice: item.targetPrice,
      };
    }

    const analysis =
      match.matchedTitle !== undefined ? analysisByTitle.get(titleKey(match.matchedTitle)) : undefined;
    const onSale = isOnSale(game);
    const discountPercent = calculateDiscountPercent(game);

    // Reuse the analyzed wishlist match when available (on-sale games);
    // otherwise compute target pricing from the full-price game we fetched
    // just for Wishlist Watch.
    const wishlistMatch =
      analysis?.wishlistMatch ??
      matchGameToWishlist(
        game,
        { items: [item] },
        result.defaultWishlistDiscountPercent,
      );
    const targetReached = wishlistMatch?.priceTargetReached ?? false;

    let status: WishlistWatchStatus;
    if (targetReached) {
      status = 'target-reached';
    } else if (onSale) {
      status = 'on-sale';
    } else {
      status = 'full-price';
    }

    return {
      title: item.gameTitle,
      status,
      currentPrice: game.currentPrice,
      originalPrice: game.originalPrice,
      discountPercent,
      targetPrice: wishlistMatch?.effectiveTargetPrice ?? item.targetPrice,
      targetPriceOrigin: wishlistMatch?.targetPriceOrigin,
      storeUrl: resolveStoreUrl(game),
    };
  });
}

function isOnSale(game: Game): boolean {
  return game.originalPrice !== undefined && game.originalPrice > game.currentPrice;
}

function isRecommendationEligible(analysis: GameAnalysis, result: MonitorResult): boolean {
  if (analysis.game.currentPrice === 0) {
    return true;
  }
  if (isOnSale(analysis.game)) {
    return true;
  }
  return result.dealHistory.entries.some(
    (entry) => titleKey(entry.gameTitle) === titleKey(analysis.game.title) && entry.currentlyOnSale,
  );
}

export function buildDailyDigest(
  result: MonitorResult,
  options: BuildDailyDigestOptions = {},
): DailyDigest {
  const maxBestDeals = options.maxBestDeals ?? DEFAULT_DAILY_DIGEST_SETTINGS.maxBestDeals;
  const maxWishlistAlerts = options.maxWishlistAlerts ?? DEFAULT_DAILY_DIGEST_SETTINGS.maxWishlistAlerts;
  const showStatistics = options.showStatistics ?? DEFAULT_DAILY_DIGEST_SETTINGS.showStatistics;
  const showPriceWatch = options.showPriceWatch ?? DEFAULT_DAILY_DIGEST_SETTINGS.showPriceWatch;

  const stillOnSale = buildStillOnSale(result);
  const wishlistWatch = buildWishlistWatch(result);
  const wishlistGamesOnSale = wishlistWatch.filter(
    (item) => item.status === 'on-sale' || item.status === 'target-reached',
  ).length;

  let biggestDiscountPercent = 0;
  let biggestDiscountTitle: string | undefined;
  for (const analysis of result.analyses) {
    if (!isOnSale(analysis.game)) {
      continue;
    }
    const percent = calculateDiscountPercent(analysis.game);
    if (percent > biggestDiscountPercent) {
      biggestDiscountPercent = percent;
      biggestDiscountTitle = analysis.game.title;
    }
  }

  const summary: DigestSummary = {
    newDeals: result.reportedCount,
    wishlistGamesOnSale,
    stillActiveDeals: stillOnSale.length,
    biggestDiscountPercent,
    biggestDiscountTitle,
    gamesChecked: result.analyzedCount,
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
        priceContext: priceContextFor(
          result,
          analysis.game.title,
          analysis.game.currentPrice,
        ),
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
      priceContext: priceContextFor(result, analysis.game.title, analysis.game.currentPrice),
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
    if (!isRecommendationEligible(analysis, result)) {
      continue;
    }
    for (const match of analysis.familyMatches) {
      if (!match.matched) {
        continue;
      }
      let recommendation = recommendationMap.get(match.profileName);
      if (!recommendation) {
        recommendation = { profileName: match.profileName, games: [] };
        recommendationMap.set(match.profileName, recommendation);
      }
      recommendation.games.push({
        title: analysis.game.title,
        reasons: match.reasons,
        currentPrice: analysis.game.currentPrice,
        originalPrice: analysis.game.originalPrice,
        discountPercent: calculateDiscountPercent(analysis.game),
        isFree: analysis.game.currentPrice === 0,
      });
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
    stillOnSale,
    wishlistWatch,
    wishlistAlerts,
    bestDeals,
    freeGames,
    recommendations,
    priceWatch,
    statistics,
  };
}