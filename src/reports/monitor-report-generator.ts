import { GameAnalysis, MonitorResult } from '../models';
import {
  BuildDailyDigestOptions,
  buildDailyDigest,
} from '../notifications/daily-digest-builder';
import {
  composeDigestSections,
  wrapDigestDocument,
} from '../notifications/email-renderer';
import { escapeHtml, renderDigestHeader } from '../notifications/email-template';

const FONT = 'Arial, Helvetica, sans-serif';

export interface MonitorReportData {
  digest: ReturnType<typeof buildDailyDigest>;
  skippedByCooldown: GameAnalysis[];
  skippedByScore: GameAnalysis[];
}

export function buildMonitorReportData(
  result: MonitorResult,
  options: BuildDailyDigestOptions = {},
): MonitorReportData {
  return {
    digest: buildDailyDigest(result, options),
    skippedByCooldown: result.skippedByCooldownAnalyses,
    skippedByScore: result.skippedByScoreAnalyses,
  };
}

function formatAmount(currency: string, value: number): string {
  return `${currency} ${value.toFixed(2)}`;
}

function statusMeta(stats: string): string {
  switch (stats) {
    case 'on-sale':
      return '🔥 On Sale';
    case 'target-reached':
      return '🎯 Target Price Reached';
    case 'full-price':
      return '⚪ Full Price';
    case 'not-monitored':
      return '⚪ Not currently tracked';
    default:
      return stats;
  }
}

function formatLink(label: string, url: string): string {
  return `[${label}](${url})`;
}

export function generateMonitorReportMarkdown(data: MonitorReportData): string {
  const digest = data.digest;
  const out: string[] = [];

  out.push('# 🎮 Nintendo Switch Daily Digest');
  out.push('');
  out.push(`- **Date:** ${digest.dateLabel}`);
  out.push(`- **Collector:** ${digest.collector}`);
  out.push('');

  out.push("## 📊 Today's Summary");
  out.push('');
  out.push('| Metric | Value |');
  out.push('| --- | ---: |');
  out.push(`| 🔥 New Deals | ${digest.summary.newDeals} |`);
  out.push(`| ⭐ Wishlist Games on Sale | ${digest.summary.wishlistGamesOnSale} |`);
  out.push(`| 🕒 Still Active Deals | ${digest.summary.stillActiveDeals} |`);
  out.push(
    `| 🏷 Biggest Discount | ${
      digest.summary.biggestDiscountTitle
        ? `-${digest.summary.biggestDiscountPercent}% (${digest.summary.biggestDiscountTitle})`
        : '-'
    } |`,
  );
  out.push(`| 📦 Games Checked | ${digest.summary.gamesChecked} |`);
  out.push('');

  out.push('## 👀 Wishlist Watch');
  out.push('');
  if (digest.wishlistWatch.length > 0) {
    for (const item of digest.wishlistWatch) {
      const status = statusMeta(item.status);
      out.push(`### ${status} — ${item.title}`);
      out.push('');
      if (item.currentPrice !== undefined) {
        out.push(`- **Current price:** ${formatAmount(digest.currency, item.currentPrice)}`);
      }
      if (item.targetPrice !== undefined) {
        out.push(`- **Target price:** ${formatAmount(digest.currency, item.targetPrice)}`);
      }
      if (item.discountPercent !== undefined && item.discountPercent > 0) {
        out.push(`- **Discount:** ${item.discountPercent}%`);
      }
      if (item.status === 'not-monitored') {
        out.push('');
        out.push('_Add this game to the monitored catalog to enable price tracking._');
      }
      if (item.storeUrl) {
        out.push('');
        out.push(formatLink('View Deal', item.storeUrl));
      }
      out.push('');
    }
  } else {
    out.push('No games on your wishlist yet.');
    out.push('');
  }

  if (digest.stillOnSale.length > 0) {
    out.push('## 🕒 Still On Sale');
    out.push('');
    for (const item of digest.stillOnSale) {
      out.push(`### ${item.title}`);
      out.push('');
      out.push(`- **Current price:** ${formatAmount(digest.currency, item.currentPrice)}`);
      if (item.originalPrice !== undefined && item.originalPrice > item.currentPrice) {
        out.push(`- **Original price:** ${formatAmount(digest.currency, item.originalPrice)}`);
        out.push(`- **Discount:** ${item.discountPercent}%`);
      }
      out.push(`- **First reported:** ${item.firstReportedAt}`);
      out.push(`- **On sale for:** ${item.daysOnSale} day(s)`);
      out.push('');
      out.push(formatLink('View Deal', item.storeUrl));
      out.push('');
    }
  }

  if (digest.wishlistAlerts.length > 0) {
    out.push('## 🎯 Wishlist Alerts');
    out.push('');
    for (const alert of digest.wishlistAlerts) {
      out.push(`### ${alert.title}`);
      out.push('');
      out.push(`- **Current price:** ${formatAmount(digest.currency, alert.currentPrice)}`);
      if (alert.originalPrice !== undefined && alert.originalPrice > alert.currentPrice) {
        out.push(`- **Original price:** ${formatAmount(digest.currency, alert.originalPrice)}`);
        out.push(`- **Discount:** ${alert.discountPercent}%`);
      }
      const targetLabel =
        alert.targetPriceOrigin === 'configured'
          ? 'Configured target'
          : `Auto target (${digest.defaultWishlistDiscountPercent}% discount)`;
      out.push(`- **${targetLabel}:** ${formatAmount(digest.currency, alert.targetPrice)}`);
      out.push(`- **Target reached:** ${alert.targetReached ? 'YES' : 'NO'}`);
      out.push('');
      out.push(formatLink('View Deal', alert.storeUrl));
      out.push('');
    }
  }

  if (digest.bestDeals.length > 0) {
    out.push('## 🔥 Best Deals');
    out.push('');
    for (const deal of digest.bestDeals) {
      out.push(`### ${deal.title}`);
      out.push('');
      out.push(`- **Current price:** ${formatAmount(digest.currency, deal.currentPrice)}`);
      if (deal.originalPrice !== undefined && deal.originalPrice > deal.currentPrice) {
        out.push(`- **Original price:** ${formatAmount(digest.currency, deal.originalPrice)}`);
        out.push(`- **Discount:** ${deal.discountPercent}%`);
      }
      out.push(`- **Deal score:** ${deal.score}`);
      if (deal.reasons.length > 0) {
        out.push(`- **Why recommended:** ${deal.reasons.join('; ')}`);
      }
      out.push('');
      out.push(formatLink('View Deal', deal.storeUrl));
      out.push('');
    }
  }

  if (digest.freeGames.length > 0) {
    out.push('## 🆓 Free Games');
    out.push('');
    for (const game of digest.freeGames) {
      out.push(`- **${game.title}** — Free to download`);
      out.push('');
      out.push(`  ${formatLink('Get It Free', game.storeUrl)}`);
      out.push('');
    }
  }

  if (digest.recommendations.length > 0) {
    out.push('## ⭐ Recommended For Your Family');
    out.push('');
    for (const recommendation of digest.recommendations) {
      out.push(`### ${recommendation.profileName}`);
      out.push('');
      for (const game of recommendation.games) {
        const status = game.isFree
          ? '🆓 Free to download'
          : game.discountPercent > 0
            ? `🔥 -${game.discountPercent}% (${formatAmount(digest.currency, game.currentPrice)})`
            : '⚪ Full Price';
        const reason = game.reasons.length > 0 ? ` — ${game.reasons.join(', ')}` : '';
        out.push(`- ✓ ${game.title}${reason}`);
        out.push(`  ${status}`);
      }
      out.push('');
    }
  }

  if (digest.priceWatch.length > 0) {
    out.push('## 📉 Price Watch');
    out.push('');
    for (const item of digest.priceWatch) {
      out.push(`### ${item.title}`);
      out.push('');
      out.push(`- **Target:** ${formatAmount(digest.currency, item.targetPrice)}`);
      out.push(`- **Current:** ${formatAmount(digest.currency, item.currentPrice)}`);
      out.push(`- **Only ${formatAmount(digest.currency, item.difference)} away**`);
      out.push('');
    }
  }

  if (digest.statistics) {
    out.push('## 📈 Monitoring Statistics');
    out.push('');
    out.push('| Metric | Value |');
    out.push('| --- | --- |');
    out.push(`| Games checked | ${digest.statistics.gamesChecked} |`);
    out.push(`| Reported | ${digest.statistics.reported} |`);
    out.push(`| Skipped | ${digest.statistics.skipped} |`);
    out.push(`| Collector | ${digest.statistics.collector} |`);
    out.push(`| Execution time | ${digest.statistics.executionTime} |`);
    out.push('');
  }

  const skippedCooldownNames = data.skippedByCooldown.map(
    (analysis) =>
      `- ${analysis.game.title} (${formatAmount(analysis.game.currency, analysis.game.currentPrice)})`,
  );
  const skippedScoreNames = data.skippedByScore.map((analysis) => `- ${analysis.game.title}`);

  out.push('## Skipped Games');
  out.push('');
  out.push('### Already notified (cooldown)');
  out.push('');
  out.push(skippedCooldownNames.length > 0 ? skippedCooldownNames.join('\n') : 'None.');
  out.push('');
  out.push('### Below deal score threshold');
  out.push('');
  out.push(skippedScoreNames.length > 0 ? skippedScoreNames.join('\n') : 'None.');
  out.push('');

  out.push('---');
  out.push('');
  out.push('Generated automatically by **NintendoSwitchGamesMonitor**');

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
  const heading = `<h2 style="margin:24px 0 4px 0; font-size:18px; color:#17202a; font-family:${FONT};">Skipped Games</h2>`;
  return (
    heading +
    renderSkippedGroup('Already notified (cooldown)', data.skippedByCooldown, 'None.') +
    renderSkippedGroup('Below deal score threshold', data.skippedByScore, 'None.')
  );
}

export function generateMonitorReportHtml(data: MonitorReportData): string {
  const sections = composeDigestSections(data.digest) + renderSkippedSection(data);
  return wrapDigestDocument(sections, renderDigestHeader(data.digest));
}
