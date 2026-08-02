import { calculateDiscountPercent } from '../analyzer/deal-score';
import { GameAnalysis, MonitorResult, NotificationReportSummary } from '../models';
import { buildNotificationReport } from '../pipeline/monitor-run';
import {
  escapeHtml,
  renderDealsSection,
  renderFreeGamesSection,
  renderHeader,
  renderSummary,
} from '../notifications/email-template';

const FONT = 'Arial, Helvetica, sans-serif';

export interface MonitorReportData {
  generatedAt: string;
  collector: string;
  minDealScore: number;
  gamesCollected: number;
  gamesAnalyzed: number;
  reported: GameAnalysis[];
  skippedByCooldown: GameAnalysis[];
  skippedByScore: GameAnalysis[];
}

export function buildMonitorReportData(result: MonitorResult): MonitorReportData {
  return {
    generatedAt: result.generatedAt,
    collector: result.collector,
    minDealScore: result.minDealScore,
    gamesCollected: result.analyzedCount,
    gamesAnalyzed: result.analyzedCount,
    reported: result.reportedAnalyses,
    skippedByCooldown: result.skippedByCooldownAnalyses,
    skippedByScore: result.skippedByScoreAnalyses,
  };
}

function formatAmount(currency: string, value: number): string {
  return `${currency} ${value.toFixed(2)}`;
}

function wishlistLabel(analysis: GameAnalysis): string {
  const match = analysis.wishlistMatch;
  if (!match || !match.matched) {
    return 'None';
  }
  const target =
    match.wishlistItem.targetPrice !== undefined
      ? `, target ${formatAmount(analysis.game.currency, match.wishlistItem.targetPrice)}`
      : '';
  return `Matched "${match.wishlistItem.gameTitle}"${target}, reached: ${match.priceTargetReached}`;
}

function familyLabel(analysis: GameAnalysis): string {
  const matched = analysis.familyMatches
    .filter((match) => match.matched)
    .map((match) => match.profileName);
  return matched.length > 0 ? matched.join(', ') : 'None';
}

function reasonsList(analysis: GameAnalysis): string[] {
  const reasons = [...analysis.dealScore.reasons];
  const profiles = analysis.familyMatches
    .filter((match) => match.matched)
    .map((match) => match.profileName);
  if (profiles.length > 0) {
    reasons.push(`Matches: ${profiles.join(', ')}`);
  }
  if (analysis.wishlistMatch) {
    reasons.push('On wishlist');
  }
  return reasons;
}

export function generateMonitorReportMarkdown(data: MonitorReportData): string {
  const out: string[] = [];
  out.push('# NintendoSwitchGamesMonitor — Monitoring Report');
  out.push('');
  out.push(`- **Executed:** ${data.generatedAt}`);
  out.push(`- **Collector:** ${data.collector}`);
  out.push(`- **Minimum deal score:** ${data.minDealScore}`);
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push('| Metric | Count |');
  out.push('| --- | ---: |');
  out.push(`| Games collected | ${data.gamesCollected} |`);
  out.push(`| Games analyzed | ${data.gamesAnalyzed} |`);
  out.push(`| Games reported | ${data.reported.length} |`);
  out.push(`| Games skipped by cooldown | ${data.skippedByCooldown.length} |`);
  out.push('');
  out.push('## Top Opportunities');
  out.push('');
  if (data.reported.length === 0) {
    out.push('No games worth reporting this run.');
    out.push('');
  } else {
    for (const analysis of data.reported) {
      const game = analysis.game;
      out.push(`### ${game.title}`);
      out.push('');
      out.push(`- **Current price:** ${formatAmount(game.currency, game.currentPrice)}`);
      if (game.originalPrice !== undefined && game.originalPrice > game.currentPrice) {
        out.push(`- **Original price:** ${formatAmount(game.currency, game.originalPrice)}`);
        out.push(`- **Discount:** ${calculateDiscountPercent(game)}%`);
      }
      out.push(`- **Score:** ${analysis.dealScore.score}`);
      out.push(`- **Wishlist match:** ${wishlistLabel(analysis)}`);
      out.push(`- **Family matches:** ${familyLabel(analysis)}`);
      const reasons = reasonsList(analysis);
      if (reasons.length > 0) {
        out.push(`- **Reasons:** ${reasons.join('; ')}`);
      }
      out.push('');
    }
  }

  out.push('## Skipped');
  out.push('');
  out.push(`### Low score (below ${data.minDealScore})`);
  out.push('');
  if (data.skippedByScore.length === 0) {
    out.push('None.');
    out.push('');
  } else {
    for (const analysis of data.skippedByScore) {
      out.push(`- ${analysis.game.title} (score ${analysis.dealScore.score})`);
    }
    out.push('');
  }
  out.push('### Already notified (cooldown)');
  out.push('');
  if (data.skippedByCooldown.length === 0) {
    out.push('None.');
    out.push('');
  } else {
    for (const analysis of data.skippedByCooldown) {
      out.push(`- ${analysis.game.title} (${formatAmount(analysis.game.currency, analysis.game.currentPrice)})`);
    }
    out.push('');
  }

  return out.join('\n');
}

function renderSkippedGroup(heading: string, items: GameAnalysis[], emptyText: string): string {
  const headingHtml = `<h3 style="margin:16px 0 8px 0; font-size:15px; color:#17202a; font-family:${FONT};">${escapeHtml(heading)}</h3>`;
  if (items.length === 0) {
    return (
      headingHtml +
      `<p style="margin:0 0 4px 0; font-size:13px; color:#5d6b7a; font-family:${FONT};">${escapeHtml(emptyText)}</p>`
    );
  }
  const listItems = items
    .map((analysis) => {
      const game = analysis.game;
      const detail = `score ${analysis.dealScore.score} · ${escapeHtml(formatAmount(game.currency, game.currentPrice))}`;
      return (
        `<li style="font-size:13px; color:#17202a; font-family:${FONT}; padding:2px 0;">` +
        `${escapeHtml(game.title)} <span style="color:#5d6b7a;">(${detail})</span></li>`
      );
    })
    .join('');
  return headingHtml + `<ul style="margin:0 0 8px 0; padding:0 0 0 18px;">${listItems}</ul>`;
}

function renderSkippedSection(data: MonitorReportData): string {
  const heading = `<h2 style="margin:24px 0 4px 0; font-size:18px; color:#17202a; font-family:${FONT};">Skipped</h2>`;
  return (
    heading +
    renderSkippedGroup(`Low score (below ${data.minDealScore})`, data.skippedByScore, 'None.') +
    renderSkippedGroup('Already notified (cooldown)', data.skippedByCooldown, 'None.')
  );
}

function renderEmptyState(): string {
  return `<p style="margin:0; font-size:14px; color:#5d6b7a; font-family:${FONT};">No games worth reporting this run.</p>`;
}

function wrapDocument(sections: string): string {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NintendoSwitchGamesMonitor — Monitoring Report</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:10px; overflow:hidden;">
          <tr>
            <td>${renderHeader()}</td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px 24px;">${sections}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateMonitorReportHtml(data: MonitorReportData): string {
  const summary: NotificationReportSummary = {
    gamesChecked: data.gamesAnalyzed,
    gamesMatched: data.reported.length + data.skippedByCooldown.length,
    gamesSkippedByCooldown: data.skippedByCooldown.length,
    gamesReported: data.reported.length,
  };
  const report = buildNotificationReport(data.reported, summary);
  const sections =
    (data.reported.length === 0 ? renderEmptyState() : '') +
    renderDealsSection(report.deals) +
    renderFreeGamesSection(report.freeGames) +
    renderSkippedSection(data) +
    renderSummary(report);
  return wrapDocument(sections);
}
