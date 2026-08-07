import { applyHistoricalLowScore, calculateDiscountPercent } from '../analyzer/deal-score';
import { matchGameToWishlist } from '../analyzer/wishlist-matcher';
import { BlacklistSource, isGameBlacklisted } from '../config/blacklist';
import { DEFAULT_DAILY_DIGEST_SETTINGS } from '../config/settings-loader';
import { evaluateDealQuality } from '../history/deal-quality';
import { getPriceContext } from '../history/price-intelligence';
import { matchTitleToCandidates, matchTitlesToCandidates } from '../matching/title-matcher';
import {
  DailyDigest,
  DigestBestDeal,
  DigestDealQuality,
  DigestFamilyRecommendation,
  DigestFamilyRecommendationMember,
  DigestHistoricalLow,
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
  recommendedFamilyGamesLimit?: number;
  /** Blacklisted titles must never surface in the digest outside Wishlist Watch.
   * Passed explicitly so deal-history-derived sections (e.g. Still On Sale) are
   * filtered even though analysis-based sections already exclude them. */
  blacklist?: BlacklistSource;
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

function dealQualityFor(
  result: MonitorResult,
  title: string,
  game: Game,
): DigestDealQuality | undefined {
  const entry = result.dealHistory.entries.find(
    (candidate) => titleKey(candidate.gameTitle) === titleKey(title),
  );
  if (!entry || !entry.priceHistory || entry.priceHistory.length === 0) {
    return undefined;
  }
  const quality = evaluateDealQuality({
    currentPrice: game.currentPrice,
    originalPrice: game.originalPrice ?? game.currentPrice,
    discountPercent: calculateDiscountPercent(game),
    priceHistory: entry.priceHistory,
  });
  if (!quality) {
    return undefined;
  }
  return { rating: quality.rating, reason: quality.reason };
}

function buildStillOnSale(
  result: MonitorResult,
  isBlacklisted: (title: string) => boolean,
  highlightedAnalyses: GameAnalysis[],
): DigestStillOnSale[] {
  const highlightedTitles = new Set(highlightedAnalyses.map((analysis) => titleKey(analysis.game.title)));
  const gameByTitle = new Map(
    result.analyses.map((analysis) => [titleKey(analysis.game.title), analysis.game]),
  );

  const items: DigestStillOnSale[] = [];
  for (const entry of result.dealHistory.entries) {
    if (!entry.currentlyOnSale || !entry.firstNotified) {
      continue;
    }
    if (isBlacklisted(entry.gameTitle)) {
      continue;
    }
    if (highlightedTitles.has(titleKey(entry.gameTitle))) {
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
      quality: dealQualityFor(result, entry.gameTitle, game),
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

function isHistoricalLow(result: MonitorResult, game: Game): boolean {
  return priceContextFor(result, game.title, game.currentPrice)?.isLowestRecorded ?? false;
}

function makeBlacklistGuard(blacklist: BlacklistSource | undefined): (title: string) => boolean {
  if (blacklist === undefined) {
    return () => false;
  }
  return (title: string) => isGameBlacklisted(title, blacklist);
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
  const recommendedFamilyGamesLimit =
    options.recommendedFamilyGamesLimit ??
    DEFAULT_DAILY_DIGEST_SETTINGS.recommendedFamilyGamesLimit;
  const isBlacklisted = makeBlacklistGuard(options.blacklist);
  const hasBlacklist = options.blacklist !== undefined;
  // Analysis-based sections are normally already blacklist-filtered upstream at
  // collection time. Re-filtering here guarantees a blacklisted game never leaks
  // into Best Deals, Free Games, Wishlist Alerts, recommendations, Price Watch or
  // the biggest-discount summary regardless of how the digest was invoked.
  const analyses = hasBlacklist
    ? result.analyses.filter((analysis) => !isBlacklisted(analysis.game.title))
    : result.analyses;
  const reportedAnalyses = hasBlacklist
    ? result.reportedAnalyses.filter((analysis) => !isBlacklisted(analysis.game.title))
    : result.reportedAnalyses;

  // Highlight sections (Best Deals, Free Family Games, Historical Lows) reflect
  // every report-worthy deal, not just the ones newly notified this run. A game
  // skipped by cooldown is still a current deal worth showing, so we fold the
  // cooldown-skipped analyses in alongside the newly notified ones. Cooldown
  // semantics are unchanged: it only governs new notifications, not display.
  const reportableAnalyses = [...reportedAnalyses];
  for (const analysis of result.skippedByCooldownAnalyses) {
    if (!isBlacklisted(analysis.game.title)) {
      const key = titleKey(analysis.game.title);
      if (!reportableAnalyses.some((candidate) => titleKey(candidate.game.title) === key)) {
        reportableAnalyses.push(analysis);
      }
    }
  }

  const stillOnSale = buildStillOnSale(result, isBlacklisted, reportableAnalyses);
  const wishlistWatch = buildWishlistWatch(result);
  const wishlistGamesOnSale = wishlistWatch.filter(
    (item) => item.status === 'on-sale' || item.status === 'target-reached',
  ).length;

  let biggestDiscountPercent = 0;
  let biggestDiscountTitle: string | undefined;
  for (const analysis of analyses) {
    if (!isOnSale(analysis.game)) {
      continue;
    }
    const percent = calculateDiscountPercent(analysis.game);
    if (percent > biggestDiscountPercent) {
      biggestDiscountPercent = percent;
      biggestDiscountTitle = analysis.game.title;
    }
  }

  const wishlistAlerts: DigestWishlistAlert[] = reportedAnalyses
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
        quality: dealQualityFor(result, analysis.game.title, analysis.game),
      };
    });

  const historicalLows: DigestHistoricalLow[] = reportableAnalyses
    .filter((analysis) => isOnSale(analysis.game) && isHistoricalLow(result, analysis.game))
    .map((analysis) => {
      const context = priceContextFor(result, analysis.game.title, analysis.game.currentPrice);
      return {
        title: analysis.game.title,
        currentPrice: analysis.game.currentPrice,
        originalPrice: analysis.game.originalPrice,
        discountPercent: calculateDiscountPercent(analysis.game),
        lowPrice: context?.lowestPrice ?? analysis.game.currentPrice,
        ageRating: analysis.game.ageRating ?? 'NR',
        storeUrl: resolveStoreUrl(analysis.game),
      };
    })
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, maxBestDeals);

  const alertTitles = new Set(wishlistAlerts.map((alert) => alert.title));
  // A game already shown in Historical Lows (a stronger claim: lowest recorded
  // price) is not repeated in Best Deals to avoid duplicate entries.
  const historicalLowTitles = new Set(historicalLows.map((item) => titleKey(item.title)));
  // The analyzer scores deals without the price history; re-apply the
  // historical-low bonus here (where history is available) so a deal at its
  // lowest recorded price ranks higher in Best Deals and carries the reason.
  const bestDeals: DigestBestDeal[] = reportableAnalyses
    .filter(
      (analysis) =>
        analysis.game.currentPrice > 0 &&
        !alertTitles.has(analysis.game.title) &&
        !historicalLowTitles.has(titleKey(analysis.game.title)),
    )
    .map((analysis) => ({
      analysis,
      scored: applyHistoricalLowScore(
        analysis.dealScore,
        isHistoricalLow(result, analysis.game),
      ),
    }))
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, maxBestDeals)
    .map(({ analysis, scored }) => ({
      title: analysis.game.title,
      currentPrice: analysis.game.currentPrice,
      originalPrice: analysis.game.originalPrice,
      discountPercent: calculateDiscountPercent(analysis.game),
      score: scored.score,
      reasons: scored.reasons,
      ageRating: analysis.game.ageRating ?? 'NR',
      storeUrl: resolveStoreUrl(analysis.game),
      priceContext: priceContextFor(result, analysis.game.title, analysis.game.currentPrice),
      quality: dealQualityFor(result, analysis.game.title, analysis.game),
    }));

  const freeGames = reportableAnalyses
    .filter((analysis) => analysis.game.currentPrice === 0)
    .map((analysis) => {
      const matchedProfiles = analysis.familyMatches.filter((match) => match.matched);
      return {
        title: analysis.game.title,
        ageRating: analysis.game.ageRating ?? 'NR',
        storeUrl: resolveStoreUrl(analysis.game),
        reasons: matchedProfiles.flatMap((match) => [match.profileName, ...match.reasons]),
      };
    });

  interface PendingRecommendation {
    title: string;
    currentPrice: number;
    originalPrice?: number;
    discountPercent: number;
    isFree: boolean;
    onWishlist: boolean;
    entireFamily: boolean;
    members: DigestFamilyRecommendationMember[];
    score: number;
  }

  const pending: PendingRecommendation[] = [];
  for (const analysis of reportedAnalyses) {
    if (!isRecommendationEligible(analysis, result)) {
      continue;
    }
    const matched = analysis.familyMatches.filter((match) => match.matched);
    if (matched.length === 0) {
      continue;
    }
    const entireFamily =
      analysis.familyMatches.length > 0 && matched.length === analysis.familyMatches.length;
    pending.push({
      title: analysis.game.title,
      currentPrice: analysis.game.currentPrice,
      originalPrice: analysis.game.originalPrice,
      discountPercent: calculateDiscountPercent(analysis.game),
      isFree: analysis.game.currentPrice === 0,
      onWishlist: analysis.wishlistMatch?.matched ?? false,
      entireFamily,
      members: matched.map((match) => ({ name: match.profileName, reasons: match.reasons })),
      score: analysis.dealScore.score,
    });
  }

  pending.sort(
    (a, b) =>
      Number(b.onWishlist) - Number(a.onWishlist) ||
      Number(b.entireFamily) - Number(a.entireFamily) ||
      b.members.length - a.members.length ||
      b.score - a.score ||
      a.title.localeCompare(b.title),
  );

  const recommendations: DigestFamilyRecommendation[] = pending
    .slice(0, recommendedFamilyGamesLimit)
    .map(
      ({ title, currentPrice, originalPrice, discountPercent, isFree, onWishlist, entireFamily, members }) => ({
        title,
        currentPrice,
        originalPrice,
        discountPercent,
        isFree,
        onWishlist,
        entireFamily,
        members,
      }),
    );

  let priceWatch: DigestPriceWatchItem[] = [];
  if (showPriceWatch) {
    priceWatch = analyses
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

  const summary: DigestSummary = {
    bestDeals: bestDeals.length,
    historicalLows: historicalLows.length,
    freeGames: freeGames.length,
    wishlistGamesOnSale,
    stillActiveDeals: stillOnSale.length,
    biggestDiscountPercent,
    biggestDiscountTitle,
    gamesChecked: result.analyzedCount,
  };

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
    historicalLows,
    recommendations,
    priceWatch,
    statistics,
  };
}