import 'dotenv/config';

import { analyzeGamesWith } from '../analyzer/analyze';
import { calculateDiscountPercent } from '../analyzer/deal-score';
import { createGameCollector } from '../collectors/collector-factory';
import { GameCollector } from '../collectors/game-collector';
import { loadAppConfig } from '../config/app-config';
import {
  addNotificationRecords,
  filterNotifiableGames,
  loadNotificationHistory,
  saveNotificationHistory,
  toNotificationRecords,
} from '../config/notification-history-store';
import {
  FreeGame,
  Game,
  GameAnalysis,
  GameDeal,
  MonitorResult,
  NotificationReport,
  NotificationReportSummary,
} from '../models';
import { createEmailProvider } from '../notifications/email-factory';
import { EmailProvider } from '../notifications/email-provider';
import { renderNotificationEmail } from '../notifications/email-renderer';

export const DEFAULT_MIN_DEAL_SCORE = 80;
export const DEFAULT_DEAL_LIMIT = 100;
export const DEFAULT_MAX_GAMES_PER_EMAIL = 10;

export interface MonitorOptions {
  collectorKind?: string;
  emailProviderKind?: string;
  minDealScore?: number;
  dealLimit?: number;
  maxGamesPerEmail?: number;
}

export interface MonitorRunResult {
  result: MonitorResult;
  html: string;
}

export interface ReportingOptions {
  notifyFreeGames: boolean;
  notifyWishlistMatches: boolean;
}

export function isWorthReporting(
  analysis: GameAnalysis,
  minDealScore: number,
  options: ReportingOptions = { notifyFreeGames: true, notifyWishlistMatches: true },
): boolean {
  const isFree = analysis.game.currentPrice === 0;
  const onWishlist = (analysis.wishlistMatch?.matched ?? false) && options.notifyWishlistMatches;
  if (isFree && options.notifyFreeGames) {
    return true;
  }
  if (onWishlist) {
    return true;
  }
  return analysis.dealScore.score >= minDealScore;
}

export function limitGamesPerEmail(analyses: GameAnalysis[], maxGamesPerEmail: number): GameAnalysis[] {
  if (analyses.length <= maxGamesPerEmail) {
    return analyses;
  }
  return [...analyses].sort((a, b) => b.dealScore.score - a.dealScore.score).slice(0, maxGamesPerEmail);
}

function resolveStoreUrl(game: Game): string {
  if (game.storeUrl) {
    return game.storeUrl;
  }
  return `https://www.nintendo-europe.com/en-gb/search/?term=${encodeURIComponent(game.title)}`;
}

function buildReasons(analysis: GameAnalysis): string[] {
  const reasons = [...analysis.dealScore.reasons];
  const matchedProfiles = analysis.familyMatches
    .filter((match) => match.matched)
    .map((match) => match.profileName);
  if (matchedProfiles.length > 0) {
    reasons.push(`Matches: ${matchedProfiles.join(', ')}`);
  }
  if (analysis.wishlistMatch) {
    reasons.push('On wishlist');
  }
  return reasons;
}

export function buildNotificationReport(
  analyses: GameAnalysis[],
  summary: NotificationReportSummary,
): NotificationReport {
  const deals: GameDeal[] = [];
  const freeGames: FreeGame[] = [];

  for (const analysis of analyses) {
    const game = analysis.game;
    if (game.currentPrice === 0) {
      freeGames.push({
        title: game.title,
        ageRating: game.ageRating ?? 'NR',
        storeUrl: resolveStoreUrl(game),
      });
    } else {
      deals.push({
        title: game.title,
        currentPrice: game.currentPrice,
        previousPrice: game.originalPrice ?? game.currentPrice,
        discountPercent: calculateDiscountPercent(game),
        ageRating: game.ageRating ?? 'NR',
        storeUrl: resolveStoreUrl(game),
        reasons: buildReasons(analysis),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    deals,
    freeGames,
  };
}

export async function runMonitor(options: MonitorOptions = {}): Promise<MonitorRunResult> {
  const config = loadAppConfig();

  const collectorKind = options.collectorKind ?? config.collector.collectorKind;
  const minDealScore = options.minDealScore ?? config.notification.minimumDealScore;
  const dealLimit = options.dealLimit ?? config.collector.dealLimit;
  const maxGamesPerEmail = options.maxGamesPerEmail ?? config.notification.maxGamesPerEmail;
  const cooldownDays = config.notification.notificationCooldownDays;

  const collector: GameCollector = createGameCollector(collectorKind, {
    sourceUrl: config.collector.dealsSourceUrl,
    currency: config.collector.dealsCurrency,
  });
  const games = await collector.collectGames({ limit: dealLimit });
  console.log(`Collected ${games.length} game(s) using "${collectorKind}" collector.`);

  const profiles = config.familyProfiles;
  const wishlist = config.wishlist;
  console.log(
    `Analyzing against ${profiles.length} family profile(s) and ${wishlist.items.length} wishlist item(s)...`,
  );

  const analyses = analyzeGamesWith(
    games,
    profiles,
    wishlist,
    config.notification.defaultWishlistDiscountPercent,
  );
  const reported = analyses.filter((analysis) =>
    isWorthReporting(analysis, minDealScore, {
      notifyFreeGames: config.notification.notifyFreeGames,
      notifyWishlistMatches: config.notification.notifyWishlistMatches,
    }),
  );

  console.log(
    `${reported.length} of ${analyses.length} game(s) meet the reporting threshold (score >= ${minDealScore}, free, or on wishlist):`,
  );
  for (const analysis of reported) {
    console.log(`  - ${analysis.game.title} (score ${analysis.dealScore.score})`);
  }

  const history = loadNotificationHistory();
  const notifiable = filterNotifiableGames(reported, history, cooldownDays);
  const skippedByCooldown = reported.length - notifiable.length;
  const skippedByCooldownAnalyses = reported.filter((analysis) => !notifiable.includes(analysis));
  if (skippedByCooldown > 0) {
    console.log(
      `${skippedByCooldown} game(s) already notified within the last ${cooldownDays} day(s) (notificationCooldownDays), skipping.`,
    );
  }

  const toEmail = limitGamesPerEmail(notifiable, maxGamesPerEmail);
  const capped = notifiable.length - toEmail.length;
  if (capped > 0) {
    console.log(
      `Report capped to top ${toEmail.length} game(s) by score (maxGamesPerEmail=${maxGamesPerEmail}), dropping ${capped}.`,
    );
  }

  const skippedByScoreAnalyses = analyses.filter((analysis) => !reported.includes(analysis));

  const summary: NotificationReportSummary = {
    gamesChecked: analyses.length,
    gamesMatched: reported.length,
    gamesSkippedByCooldown: skippedByCooldown,
    gamesReported: toEmail.length,
  };

  const report = buildNotificationReport(toEmail, summary);
  const html = renderNotificationEmail(report);

  const provider: EmailProvider = createEmailProvider(options.emailProviderKind);
  await provider.sendEmail({
    subject: `🎮 Nintendo Switch Games Monitor — ${toEmail.length} game(s) worth checking`,
    html,
  });

  const records = toNotificationRecords(toEmail);
  if (records.length > 0) {
    saveNotificationHistory(addNotificationRecords(history, records));
    console.log(`Recorded ${records.length} notification(s) to history.`);
  }

  const result: MonitorResult = {
    generatedAt: report.generatedAt,
    collector: collectorKind,
    minDealScore,
    defaultWishlistDiscountPercent: config.notification.defaultWishlistDiscountPercent,
    analyzedCount: analyses.length,
    reportedCount: toEmail.length,
    skippedByCooldownCount: skippedByCooldown,
    analyses,
    reportedAnalyses: toEmail,
    skippedByCooldownAnalyses,
    skippedByScoreAnalyses,
  };

  return { result, html };
}

if (require.main === module) {
  runMonitor()
    .then(({ result }) => {
      console.log(
        `\nMonitor run complete: analyzed ${result.analyzedCount} game(s), ` +
          `reported ${result.reportedCount}, email sent via "${process.env.EMAIL_PROVIDER ?? 'gmail'}" provider.`,
      );
    })
    .catch((error: unknown) => {
      console.error('Monitor run failed:', error);
      process.exitCode = 1;
    });
}
