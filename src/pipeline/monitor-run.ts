import 'dotenv/config';

import { analyzeGamesWith } from '../analyzer/analyze';
import { calculateDiscountPercent } from '../analyzer/deal-score';
import { createGameCollector } from '../collectors/collector-factory';
import { GameCollector } from '../collectors/game-collector';
import { loadAppConfig } from '../config/app-config';
import {
  filterNotifiableGames,
  loadDealHistory,
  reconcileDealHistory,
  saveDealHistory,
} from '../config/notification-history-store';
import { DealHistory, Game, GameAnalysis, MonitorResult } from '../models';
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
  ignoreNotificationHistory?: boolean;
  forceEmail?: boolean;
  dryRun?: boolean;
}

export interface MonitorRunResult {
  result: MonitorResult;
  html: string;
  emailSent: boolean;
}

export interface DigestEmailDecision {
  send: boolean;
  reason: string;
}

export function decideDigestEmail(
  newNotificationCount: number,
  sendEmptyDigest: boolean,
  forceEmail: boolean,
  dryRun: boolean,
): DigestEmailDecision {
  let decision: DigestEmailDecision;
  if (newNotificationCount > 0) {
    decision = { send: true, reason: `${newNotificationCount} new notification(s)` };
  } else if (sendEmptyDigest) {
    decision = { send: true, reason: 'sendEmptyDigest=true' };
  } else if (forceEmail) {
    decision = { send: true, reason: 'FORCE_EMAIL=true' };
  } else {
    decision = { send: false, reason: 'no new notifications' };
  }
  if (dryRun && decision.send) {
    return { send: true, reason: 'DRY_RUN=true' };
  }
  return decision;
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
  const ignoreNotificationHistory =
    options.ignoreNotificationHistory ??
    process.env.IGNORE_NOTIFICATION_HISTORY === 'true';
  const forceEmail = options.forceEmail ?? process.env.FORCE_EMAIL === 'true';
  const dryRun = options.dryRun ?? process.env.DRY_RUN === 'true';

  console.log('');
  console.log('Monitor configuration:');
  console.log(`  Collector: ${collectorKind}`);
  console.log(`  Region: ${config.collector.nintendoRegion}`);
  console.log(`  Platform: ${config.collector.platform}`);
  console.log(`  Game catalog: ${config.collector.gameCatalogPath}`);
  console.log(`  Email: ${options.emailProviderKind ?? process.env.EMAIL_PROVIDER ?? 'gmail'}`);
  console.log(`  Minimum score: ${minDealScore}`);
  console.log(`  Cooldown: ${cooldownDays} days`);
  console.log(`  Test mode: ${ignoreNotificationHistory || forceEmail || dryRun ? 'enabled' : 'disabled'}`);
  if (ignoreNotificationHistory) console.log('    IGNORE_NOTIFICATION_HISTORY is active');
  if (forceEmail) console.log('    FORCE_EMAIL is active');
  if (dryRun) console.log('    DRY_RUN is active');

  const collector: GameCollector = createGameCollector(collectorKind, {
    currency: config.collector.dealsCurrency,
    region: config.collector.nintendoRegion,
    platform: config.collector.platform,
    catalogPath: config.collector.gameCatalogPath,
  });
  const games = await collector.collectGames({ limit: dealLimit });
  console.log(`Collected ${games.length} game(s) using \"${collectorKind}\" collector.`);

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

  let history: DealHistory = { entries: [] };
  let notifiable: GameAnalysis[] = reported;
  let skippedByCooldown = 0;
  let skippedByCooldownAnalyses: GameAnalysis[] = [];
  if (ignoreNotificationHistory) {
    console.log('Test mode: notification history ignored (IGNORE_NOTIFICATION_HISTORY=true).');
  } else {
    history = loadDealHistory();
    notifiable = filterNotifiableGames(reported, history, cooldownDays);
    skippedByCooldown = reported.length - notifiable.length;
    skippedByCooldownAnalyses = reported.filter((analysis) => !notifiable.includes(analysis));
    if (skippedByCooldown > 0) {
      console.log(
        `${skippedByCooldown} game(s) already notified within the last ${cooldownDays} day(s) (notificationCooldownDays), skipping.`,
      );
    }
  }

  const toEmail = limitGamesPerEmail(notifiable, maxGamesPerEmail);
  const capped = notifiable.length - toEmail.length;
  if (capped > 0) {
    console.log(
      `Report capped to top ${toEmail.length} game(s) by score (maxGamesPerEmail=${maxGamesPerEmail}), dropping ${capped}.`,
    );
  }

  const updatedHistory = reconcileDealHistory(
    history,
    games,
    toEmail.map((analysis) => analysis.game),
    new Date(),
  );

  const skippedByScoreAnalyses = analyses.filter((analysis) => !reported.includes(analysis));

  const result: MonitorResult = {
    generatedAt: new Date().toISOString(),
    collector: collectorKind,
    currency: config.collector.dealsCurrency,
    minDealScore,
    defaultWishlistDiscountPercent: config.notification.defaultWishlistDiscountPercent,
    executionTimeMs: Date.now() - startedAt,
    analyzedCount: analyses.length,
    potentialMatchCount: reported.length,
    reportedCount: toEmail.length,
    skippedByCooldownCount: skippedByCooldown,
    analyses,
    reportedAnalyses: toEmail,
    skippedByCooldownAnalyses,
    skippedByScoreAnalyses,
    dealHistory: updatedHistory,
    wishlist: config.wishlist,
  };

  const digest = buildDailyDigest(result, {
    maxBestDeals: config.notification.dailyDigest.maxBestDeals,
    maxWishlistAlerts: config.notification.dailyDigest.maxWishlistAlerts,
    showStatistics: config.notification.dailyDigest.showStatistics,
    showPriceWatch: config.notification.dailyDigest.showPriceWatch,
  });
  const html = renderDigestEmail(digest);

  const decision = decideDigestEmail(
    toEmail.length,
    config.notification.sendEmptyDigest,
    forceEmail,
    dryRun,
  );
  const emailSent = decision.send && !dryRun;
  if (emailSent) {
    const provider: EmailProvider = createEmailProvider(options.emailProviderKind);
    await provider.sendEmail({
      subject: `🎮 Nintendo Switch Daily Digest — ${toEmail.length} game(s) worth checking`,
      html,
    });
  } else if (decision.send && dryRun) {
    console.log('DRY_RUN: digest rendered but email delivery is suppressed (no email sent).');
  } else if (!decision.send) {
    console.log(`Digest skipped: ${decision.reason}.`);
  }

  if (!ignoreNotificationHistory && !forceEmail && !dryRun) {
    saveDealHistory(updatedHistory);
    console.log(`Recorded deal history (${updatedHistory.entries.length} game(s) tracked).`);
  }

  console.log('');
  console.log('Monitor summary:');
  console.log(`  Potential matches: ${reported.length}`);
  console.log(`  New notifications: ${toEmail.length}`);
  console.log(`  Skipped cooldown: ${skippedByCooldown}`);
  console.log(
    `  Email: ${
      emailSent
        ? `sent (${decision.reason})`
        : decision.send
          ? `not sent (${decision.reason})`
          : `skipped (${decision.reason})`
    }`,
  );

  return { result, html, emailSent };
}

if (require.main === module) {
  runMonitor()
    .then(() => {
      console.log('\nMonitor run complete.');
    })
    .catch((error: unknown) => {
      console.error('Monitor run failed:', error);
      process.exitCode = 1;
    });
}
