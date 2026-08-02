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
import { Game, GameAnalysis, MonitorResult } from '../models';
import { buildDailyDigest } from '../notifications/daily-digest-builder';
import { createEmailProvider } from '../notifications/email-factory';
import { EmailProvider } from '../notifications/email-provider';
import { renderDigestEmail } from '../notifications/email-renderer';

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

export function buildReasons(analysis: GameAnalysis): string[] {
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

export function dealDiscountPercent(game: Game): number {
  return calculateDiscountPercent(game);
}

export async function runMonitor(options: MonitorOptions = {}): Promise<MonitorRunResult> {
  const startedAt = Date.now();
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

  const result: MonitorResult = {
    generatedAt: new Date().toISOString(),
    collector: collectorKind,
    currency: config.collector.dealsCurrency,
    minDealScore,
    defaultWishlistDiscountPercent: config.notification.defaultWishlistDiscountPercent,
    executionTimeMs: Date.now() - startedAt,
    analyzedCount: analyses.length,
    reportedCount: toEmail.length,
    skippedByCooldownCount: skippedByCooldown,
    analyses,
    reportedAnalyses: toEmail,
    skippedByCooldownAnalyses,
    skippedByScoreAnalyses,
  };

  const digest = buildDailyDigest(result, {
    maxBestDeals: config.notification.dailyDigest.maxBestDeals,
    maxWishlistAlerts: config.notification.dailyDigest.maxWishlistAlerts,
    showStatistics: config.notification.dailyDigest.showStatistics,
    showPriceWatch: config.notification.dailyDigest.showPriceWatch,
  });
  const html = renderDigestEmail(digest);

  const provider: EmailProvider = createEmailProvider(options.emailProviderKind);
  await provider.sendEmail({
    subject: `🎮 Nintendo Switch Daily Digest — ${toEmail.length} game(s) worth checking`,
    html,
  });

  const records = toNotificationRecords(toEmail);
  if (records.length > 0) {
    saveNotificationHistory(addNotificationRecords(history, records));
    console.log(`Recorded ${records.length} notification(s) to history.`);
  }

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
