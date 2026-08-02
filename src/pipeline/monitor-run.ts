import 'dotenv/config';

import { analyzeGamesWith } from '../analyzer/analyze';
import { createGameCollector } from '../collectors/collector-factory';
import { GameCollector } from '../collectors/game-collector';
import { loadFamilyProfiles } from '../config/family-profiles-loader';
import {
  addNotificationRecords,
  filterNotifiableGames,
  loadNotificationHistory,
  notificationCooldownDays,
  saveNotificationHistory,
  toNotificationRecords,
} from '../config/notification-history-store';
import { loadWishlist } from '../config/wishlist-loader';
import { calculateDiscountPercent } from '../analyzer/deal-score';
import {
  FreeGame,
  Game,
  GameAnalysis,
  GameDeal,
  MonitorResult,
  NotificationReport,
} from '../models';
import { createEmailProvider } from '../notifications/email-factory';
import { EmailProvider } from '../notifications/email-provider';
import { renderNotificationEmail } from '../notifications/email-renderer';

export const DEFAULT_MIN_DEAL_SCORE = 80;
export const DEFAULT_DEAL_LIMIT = 100;

export interface MonitorOptions {
  collectorKind?: string;
  minDealScore?: number;
  dealLimit?: number;
}

export interface MonitorRunResult {
  result: MonitorResult;
  html: string;
}

export function isWorthReporting(analysis: GameAnalysis, minDealScore: number): boolean {
  return (
    analysis.game.currentPrice === 0 ||
    (analysis.wishlistMatch?.matched ?? false) ||
    analysis.dealScore.score >= minDealScore
  );
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

export function buildNotificationReport(analyses: GameAnalysis[]): NotificationReport {
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
    deals,
    freeGames,
  };
}

export async function runMonitor(options: MonitorOptions = {}): Promise<MonitorRunResult> {
  const collectorKind = options.collectorKind ?? process.env.GAME_COLLECTOR ?? 'mock';
  const minDealScore =
    options.minDealScore ?? Number(process.env.MIN_DEAL_SCORE ?? DEFAULT_MIN_DEAL_SCORE);
  const dealLimit = options.dealLimit ?? Number(process.env.DEALS_LIMIT ?? DEFAULT_DEAL_LIMIT);

  const collector: GameCollector = createGameCollector(collectorKind);
  const games = await collector.collectGames({ limit: dealLimit });
  console.log(`Collected ${games.length} game(s) using "${collectorKind}" collector.`);

  const profiles = loadFamilyProfiles();
  const wishlist = loadWishlist();
  console.log(
    `Analyzing against ${profiles.length} family profile(s) and ${wishlist.items.length} wishlist item(s)...`,
  );

  const analyses = analyzeGamesWith(games, profiles, wishlist);
  const reported = analyses.filter((analysis) => isWorthReporting(analysis, minDealScore));

  const cooldownDays = notificationCooldownDays();
  const history = loadNotificationHistory();
  const notifiable = filterNotifiableGames(reported, history, cooldownDays);
  const skippedByCooldown = reported.length - notifiable.length;
  if (skippedByCooldown > 0) {
    console.log(
      `${skippedByCooldown} game(s) already notified within the last ${cooldownDays} day(s) (NOTIFICATION_COOLDOWN_DAYS), skipping.`,
    );
  }

  console.log(
    `${notifiable.length} of ${analyses.length} game(s) meet the reporting threshold (score >= ${minDealScore}, free, or on wishlist):`,
  );
  for (const analysis of notifiable) {
    console.log(`  - ${analysis.game.title} (score ${analysis.dealScore.score})`);
  }

  const report = buildNotificationReport(notifiable);
  const html = renderNotificationEmail(report);

  const provider: EmailProvider = createEmailProvider();
  await provider.sendEmail({
    subject: `🎮 Nintendo Switch Games Monitor — ${notifiable.length} game(s) worth checking`,
    html,
  });

  const records = toNotificationRecords(notifiable);
  if (records.length > 0) {
    saveNotificationHistory(addNotificationRecords(history, records));
    console.log(`Recorded ${records.length} notification(s) to history.`);
  }

  const result: MonitorResult = {
    generatedAt: report.generatedAt,
    collector: collectorKind,
    minDealScore,
    analyzedCount: analyses.length,
    reportedCount: notifiable.length,
    skippedByCooldownCount: skippedByCooldown,
    analyses,
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
