import {
  DailyDigest,
  DealQualityRating,
  DigestBestDeal,
  DigestDealQuality,
  DigestFamilyRecommendation,
  DigestHistoricalLow,
  DigestPriceContext,
  DigestPriceWatchItem,
  DigestStatistics,
  DigestStillOnSale,
  DigestSummary,
  DigestWishlistAlert,
  DigestWishlistWatch,
  FreeGame,
} from '../models';

const COLORS = {
  bg: '#f4f5f7',
  card: '#ffffff',
  panel: '#fafbfc',
  border: '#e1e5ea',
  text: '#17202a',
  muted: '#5d6b7a',
  accent: '#e60012',
  wishlist: '#6d28d9',
  free: '#1a7f37',
  discount: '#ea580c',
  success: '#1a7f37',
  danger: '#c62828',
  link: '#1a56db',
  linkBg: '#e8f0fe',
  time: '#0e7490',
};

const FONT = 'Arial, Helvetica, sans-serif';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatMoney(currency: string, value: number): string {
  return `${currency} ${value.toFixed(2)}`;
}

function badge(label: string, backgroundColor: string, color = '#ffffff'): string {
  return (
    `<span style="font-family:${FONT}; font-size:12px; font-weight:bold; color:${color};` +
    ` background-color:${backgroundColor}; border-radius:4px; padding:2px 6px;` +
    ` display:inline-block; margin:0 2px 2px 0;">${escapeHtml(label)}</span>`
  );
}

function ageRatingBadge(ageRating: string): string {
  return badge(ageRating || 'NR', COLORS.linkBg, COLORS.link);
}

function actionButton(label: string, url: string, backgroundColor: string): string {
  const href = escapeHtml(url);
  return (
    `<a href="${href}" target="_blank" style="display:inline-block; margin-top:10px;` +
    ` background-color:${backgroundColor}; color:#ffffff; text-decoration:none;` +
    ` padding:9px 18px; border-radius:6px; font-size:13px; font-weight:bold; font-family:${FONT};">` +
    `${escapeHtml(label)}</a>`
  );
}

function reasonsList(reasons: string[]): string {
  if (reasons.length === 0) {
    return '';
  }
  const items = reasons
    .map(
      (reason) =>
        `<li style="font-family:${FONT}; font-size:13px; color:${COLORS.text};` +
        ` padding:2px 0;"><span style="color:${COLORS.success};">✓</span> ${escapeHtml(reason)}</li>`,
    )
    .join('');
  return `<ul style="margin:8px 0 0 0; padding:0; list-style:none;">${items}</ul>`;
}

function sectionHeader(emoji: string, title: string, color: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
    ` style="margin:24px 0 12px 0;"><tr><td style="border-left:4px solid ${color};` +
    ` padding-left:10px; font-family:${FONT}; font-size:18px; font-weight:bold;` +
    ` color:${COLORS.text};">${emoji} ${escapeHtml(title)}</td></tr></table>`
  );
}

function card(inner: string, accentColor?: string): string {
  const topBorder = accentColor ? ` border-top:3px solid ${accentColor};` : '';
  return (
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    `${topBorder} border-radius:8px; padding:16px 18px; margin:0 0 14px 0;">${inner}</div>`
  );
}

/**
 * Number of items at or below which a long list is rendered as a single,
 * full-width column. Above this threshold the section switches to a
 * responsive two-column table to make long lists easier to scan.
 */
const TWO_COLUMN_THRESHOLD = 6;

/**
 * Renders a list of card HTML strings. Fewer than `threshold` items render as
 * a single column (preserving the existing look); `threshold` or more render
 * as a responsive two-column table so long sections are easier to scan.
 */
function renderCardGrid(
  cards: string[],
  threshold: number = TWO_COLUMN_THRESHOLD,
): string {
  if (cards.length <= threshold) {
    return cards.join('');
  }
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const left = cards[i];
    const right = cards[i + 1] ?? '';
    rows.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
      ` style="table-layout:fixed;"><tr>` +
      `<td width="50%" valign="top" style="padding:0 10px 0 0;">${left}</td>` +
      `<td width="50%" valign="top" style="padding:0 0 0 10px;">${right}</td>` +
      `</tr></table>`,
    );
  }
  return rows.join('');
}

function renderPriceRow(currency: string, original: number | undefined, current: number, accentColor: string): string {
  const hasDiscount = original !== undefined && original > current;
  const originalHtml = hasDiscount
    ? `<span style="font-family:${FONT}; font-size:13px; color:${COLORS.muted};` +
      ` text-decoration:line-through;">${formatMoney(currency, original)}</span>` +
      `<span style="font-family:${FONT}; font-size:13px; color:${COLORS.muted}; padding:0 4px;">→</span>`
    : '';
  return (
    `${originalHtml}<span style="font-family:${FONT}; font-size:18px; font-weight:bold;` +
    ` color:${accentColor};">${formatMoney(currency, current)}</span>`
  );
}

function renderDealSummary(discountPercent: number | undefined, score?: number): string {
  const parts: string[] = [];
  if (discountPercent !== undefined && discountPercent > 0) {
    parts.push(`🔥 ${badge(`-${discountPercent}%`, COLORS.discount)}`);
  }
  if (score !== undefined) {
    parts.push(badge(`Score ${score}`, COLORS.accent));
  }
  if (parts.length === 0) {
    return '';
  }
  return `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; color:${COLORS.text};">${parts.join(' · ')}</div>`;
}

export function renderDigestHeader(digest: DailyDigest): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
    ` style="background-color:${COLORS.accent};"><tr><td align="center" style="padding:30px 20px;">` +
    `<div style="font-size:40px; line-height:1;">🎮</div>` +
    `<h1 style="margin:10px 0 0 0; font-size:24px; color:#ffffff; font-family:${FONT};">` +
    `Nintendo Switch Daily Digest</h1>` +
    `<p style="margin:8px 0 0 0; font-size:13px; color:#ffe6e6; font-family:${FONT};">` +
    `${escapeHtml(digest.dateLabel)} · ${escapeHtml(digest.collector)} collector</p>` +
    `</td></tr></table>`
  );
}

export function renderDigestSummary(summary: DigestSummary): string {
  const stats: Array<[string, string]> = [
    ['🔥 New Deals', String(summary.newDeals)],
    ['⭐ Wishlist on Sale', String(summary.wishlistGamesOnSale)],
    ['🕒 Still Active', String(summary.stillActiveDeals)],
    [
      '🏷 Biggest Discount',
      summary.biggestDiscountTitle
        ? `-${summary.biggestDiscountPercent}% ${summary.biggestDiscountTitle}`
        : '-',
    ],
    ['📦 Games Checked', String(summary.gamesChecked)],
  ];
  const cells = stats
    .map(
      ([label, value]) =>
        `<td align="center" style="padding:12px 6px;">` +
        `<div style="font-family:${FONT}; font-size:18px; font-weight:bold; color:${COLORS.text}; white-space:nowrap;">${escapeHtml(value)}</div>` +
        `<div style="font-family:${FONT}; font-size:11px; color:${COLORS.muted};">${escapeHtml(label)}</div>` +
        `</td>`,
    )
    .join('');
  return (
    sectionHeader('📊', 'Today\u2019s Summary', COLORS.accent) +
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    ` border-radius:8px; padding:6px 4px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>` +
    `</div>`
  );
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function renderStillOnSaleCard(item: DigestStillOnSale, currency: string): string {
  const daysLabel = item.daysOnSale === 1 ? '1 day on sale' : `${item.daysOnSale} days on sale`;
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(item.title)}</h3>` +
    `<div>${renderPriceRow(currency, item.originalPrice, item.currentPrice, COLORS.time)}</div>` +
    renderDealSummary(item.discountPercent) +
    `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">` +
    `First reported ${formatShortDate(item.firstReportedAt)} · ${daysLabel}</div>` +
    renderDealInsight(item.quality, item.priceContext, currency) +
    `</td>` +
    `</tr></table>` +
    actionButton('View Deal', item.storeUrl, COLORS.time),
    COLORS.time,
  );
}

export function renderStillOnSaleSection(items: DigestStillOnSale[], currency: string): string {
  if (items.length === 0) {
    return '';
  }
  const cards = items.map((item) => renderStillOnSaleCard(item, currency));
  return sectionHeader('🕒', 'Still On Sale', COLORS.time) + renderCardGrid(cards);
}

/**
 * Renders historical price context under a deal card, only when it is useful:
 * "⭐ Lowest price seen" (current price is the best ever, optionally with the
 * previous low) or "Lowest seen: $X" when the current price is not a new low
 * but a cheaper one exists in history. Returns an empty string when there is
 * no meaningful history, so no noise is added to ordinary deals.
 */
function renderPriceContext(context: DigestPriceContext | undefined, currency: string): string {
  if (!context) {
    return '';
  }
  let text: string;
  if (context.isLowestRecorded) {
    const previous =
      context.previousLowest !== undefined
        ? ` · Previous low ${formatMoney(currency, context.previousLowest)}`
        : '';
    text = `⭐ Lowest price seen${previous}`;
  } else if (context.lowestPrice !== undefined) {
    text = `Lowest seen: ${formatMoney(currency, context.lowestPrice)}`;
  } else {
    return '';
  }
  return (
    `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; font-weight:bold;` +
    ` color:${COLORS.success};">${text}</div>`
  );
}

const QUALITY_META: Record<DealQualityRating, { label: string; color: string }> = {
  excellent: { label: '⭐ Excellent deal', color: COLORS.success },
  great: { label: '⭐ Great deal', color: COLORS.success },
  good: { label: '👍 Good deal', color: COLORS.link },
  weak: { label: '⚠️ Weak sale', color: COLORS.danger },
};

function renderDealQuality(quality: DigestDealQuality | undefined): string {
  if (!quality) {
    return '';
  }
  const meta = QUALITY_META[quality.rating];
  return (
    `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; font-weight:bold;` +
    ` color:${meta.color};">${meta.label}</div>` +
    `<div style="font-family:${FONT}; font-size:11px; color:${COLORS.muted};">${escapeHtml(quality.reason)}</div>`
  );
}

/**
 * Renders the deal insight line for a card. A sale-quality badge takes
 * precedence (it already carries the "new lowest" information); otherwise fall
 * back to the quieter historical price context. Returns an empty string when
 * there is neither, so ordinary deals get no extra noise.
 */
function renderDealInsight(
  quality: DigestDealQuality | undefined,
  priceContext: DigestPriceContext | undefined,
  currency: string,
): string {
  const qualityHtml = renderDealQuality(quality);
  if (qualityHtml) {
    return qualityHtml;
  }
  return renderPriceContext(priceContext, currency);
}

export function wishlistStatusMeta(status: DigestWishlistWatch['status']): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'on-sale':
      return { label: '🔥 On Sale', color: COLORS.success };
    case 'target-reached':
      return { label: '🎯 Target Price Reached', color: COLORS.wishlist };
    case 'full-price':
      return { label: '⚪ Full Price', color: COLORS.muted };
    case 'not-monitored':
      return { label: '⚪ Not currently tracked', color: COLORS.muted };
  }
}

function renderWishlistWatchCard(item: DigestWishlistWatch, currency: string): string {
  const meta = wishlistStatusMeta(item.status);
  let details = `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; color:${COLORS.text};">`;
  if (item.currentPrice !== undefined) {
    details += `Current Price: <strong>${formatMoney(currency, item.currentPrice)}</strong>`;
    if (item.originalPrice !== undefined && item.originalPrice > item.currentPrice) {
      details += ` <span style="color:${COLORS.muted}; text-decoration:line-through; font-size:12px;">Regular: ${formatMoney(currency, item.originalPrice)}</span>`;
    }
    if (item.discountPercent !== undefined && item.discountPercent > 0) {
      details += ` ${badge(`-${item.discountPercent}%`, COLORS.discount)}`;
    }
  }
  if (item.targetPrice !== undefined) {
    details += `${item.currentPrice !== undefined ? ' · ' : ''}Target: <strong>${formatMoney(currency, item.targetPrice)}</strong>`;
  }
  if (item.status === 'not-monitored') {
    details += `<div style="margin-top:6px; font-size:12px; color:${COLORS.muted};">Add this game to the monitored catalog to enable price tracking.</div>`;
  }
  details += '</div>';
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(item.title)}</h3>` +
    `<div>${badge(meta.label, meta.color)}</div>` +
    details +
    `</td>` +
    `</tr></table>`,
    COLORS.wishlist,
  );
}

export function renderWishlistWatchSection(items: DigestWishlistWatch[], currency: string): string {
  const header = sectionHeader('👀', 'Wishlist Watch', COLORS.wishlist);
  if (items.length === 0) {
    return (
      header +
      `<p style="margin:0 0 10px 0; font-size:13px; color:${COLORS.muted}; font-family:${FONT};">` +
      `No games on your wishlist yet.</p>`
    );
  }
  const cards = items.map((item) => renderWishlistWatchCard(item, currency)).join('');
  return header + cards;
}

function renderWishlistAlertCard(alert: DigestWishlistAlert, currency: string, digest: DailyDigest): string {
  const reachedBadge = alert.targetReached
    ? badge('YES', COLORS.success)
    : badge('NO', COLORS.danger);
  const targetLabel =
    alert.targetPriceOrigin === 'configured'
      ? 'Configured target'
      : `Auto target (${digest.defaultWishlistDiscountPercent}% discount)`;
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(alert.title)}</h3>` +
    `<div>${renderPriceRow(currency, alert.originalPrice, alert.currentPrice, COLORS.wishlist)}</div>` +
    renderDealSummary(alert.discountPercent) +
    `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; color:${COLORS.text};">` +
    `${targetLabel}: <strong>${formatMoney(currency, alert.targetPrice)}</strong> · Reached: ${reachedBadge}` +
    `</div>` +
    renderDealInsight(alert.quality, alert.priceContext, currency) +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(alert.ageRating)}</td>` +
    `</tr></table>` +
    actionButton('View Deal', alert.storeUrl, COLORS.wishlist),
    COLORS.wishlist,
  );
}

export function renderWishlistAlertsSection(alerts: DigestWishlistAlert[], currency: string, digest: DailyDigest): string {
  if (alerts.length === 0) {
    return '';
  }
  const cards = alerts.map((alert) => renderWishlistAlertCard(alert, currency, digest)).join('');
  return sectionHeader('🎯', 'Wishlist Alerts', COLORS.wishlist) + cards;
}

function renderBestDealCard(deal: DigestBestDeal, currency: string): string {
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(deal.title)}</h3>` +
    `<div>${renderPriceRow(currency, deal.originalPrice, deal.currentPrice, COLORS.accent)}</div>` +
    renderDealSummary(deal.discountPercent, deal.score) +
    `${reasonsList(deal.reasons)}` +
    renderDealInsight(deal.quality, deal.priceContext, currency) +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(deal.ageRating)}</td>` +
    `</tr></table>` +
    actionButton('View Deal', deal.storeUrl, COLORS.link),
    COLORS.accent,
  );
}

export function renderBestDealsSection(deals: DigestBestDeal[], currency: string): string {
  if (deals.length === 0) {
    return '';
  }
  const cards = deals.map((deal) => renderBestDealCard(deal, currency));
  return sectionHeader('🔥', 'Best Deals', COLORS.accent) + renderCardGrid(cards);
}

function renderFreeGameCard(game: FreeGame): string {
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(game.title)}</h3>` +
    `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.free};">` +
    `🆓 Free to download</div>` +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(game.ageRating)}</td>` +
    `</tr></table>` +
    actionButton('Get It Free', game.storeUrl, COLORS.free),
    COLORS.free,
  );
}

export function renderFreeGamesSection(freeGames: FreeGame[]): string {
  if (freeGames.length === 0) {
    return '';
  }
  const cards = freeGames.map(renderFreeGameCard).join('');
  return sectionHeader('🆓', 'Free Games', COLORS.free) + cards;
}

function renderHistoricalLowCard(deal: DigestHistoricalLow, currency: string): string {
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(deal.title)}</h3>` +
    `<div>${renderPriceRow(currency, deal.originalPrice, deal.currentPrice, COLORS.time)}</div>` +
    renderDealSummary(deal.discountPercent) +
    `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; font-weight:bold;` +
    ` color:${COLORS.success};">⭐ At its lowest recorded price (${formatMoney(currency, deal.lowPrice)})</div>` +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(deal.ageRating)}</td>` +
    `</tr></table>` +
    actionButton('View Deal', deal.storeUrl, COLORS.time),
    COLORS.time,
  );
}

export function renderHistoricalLowsSection(items: DigestHistoricalLow[], currency: string): string {
  if (items.length === 0) {
    return '';
  }
  const cards = items.map((item) => renderHistoricalLowCard(item, currency));
  return sectionHeader('⭐', 'Historical Lows', COLORS.time) + renderCardGrid(cards);
}

function recommendationPriceStatus(game: DigestFamilyRecommendation, currency: string): string {
  if (game.isFree) {
    return (
      `<div style="font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.free};">` +
      `🆓 Free to download</div>`
    );
  }
  if (game.originalPrice !== undefined && game.originalPrice > game.currentPrice) {
    return (
      `<div style="margin-top:4px;">${renderPriceRow(currency, game.originalPrice, game.currentPrice, COLORS.accent)}</div>` +
      renderDealSummary(game.discountPercent)
    );
  }
  return (
    `<div style="margin-top:4px; font-family:${FONT}; font-size:13px; color:${COLORS.muted};">` +
    `⚪ Full Price</div>`
  );
}

function renderRecommendationCard(recommendation: DigestFamilyRecommendation, currency: string): string {
  const who =
    recommendation.entireFamily
      ? `<div style="font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.success};">👨‍👩‍👧‍👦 Entire family</div>`
      : recommendation.members
          .map(
            (member) =>
              `<div style="font-family:${FONT}; font-size:13px; color:${COLORS.text}; padding:2px 0;">` +
              `<span style="color:${COLORS.success}; font-weight:bold;">✓</span> <strong>${escapeHtml(member.name)}</strong>` +
              (member.reasons.length > 0
                ? ` <span style="color:${COLORS.muted};">· ${member.reasons
                    .map((reason) => escapeHtml(reason))
                    .join(', ')}</span>`
                : '') +
              `</div>`,
          )
          .join('');
  const wishlistTag = recommendation.onWishlist
    ? ` <span style="color:${COLORS.muted}; font-size:12px;">(on wishlist)</span>`
    : '';
  return card(
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(recommendation.title)}${wishlistTag}</h3>` +
      recommendationPriceStatus(recommendation, currency) +
      `<div style="margin-top:8px; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">Recommended for:</div>` +
      `<div style="margin-top:2px;">${who}</div>`,
    COLORS.free,
  );
}

export function renderRecommendedSection(
  recommendations: DigestFamilyRecommendation[],
  currency: string,
): string {
  if (recommendations.length === 0) {
    return '';
  }
  const cards = recommendations.map((recommendation) => renderRecommendationCard(recommendation, currency));
  return sectionHeader('⭐', 'Recommended For Your Family', COLORS.free) + cards;
}

function renderPriceWatchCard(item: DigestPriceWatchItem, currency: string): string {
  return (
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    ` border-radius:8px; padding:12px 16px; margin:0 0 10px 0;">` +
    `<div style="font-family:${FONT}; font-size:14px; font-weight:bold; color:${COLORS.text};">${escapeHtml(item.title)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>` +
    `<td style="font-family:${FONT}; font-size:13px; color:${COLORS.muted};">Target:<br/><strong style="color:${COLORS.text};">${formatMoney(currency, item.targetPrice)}</strong></td>` +
    `<td style="font-family:${FONT}; font-size:13px; color:${COLORS.muted};">Current:<br/><strong style="color:${COLORS.text};">${formatMoney(currency, item.currentPrice)}</strong></td>` +
    `<td align="right" style="font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.link};">` +
    `Only ${formatMoney(currency, item.difference)} away</td>` +
    `</tr></table>` +
    `</div>`
  );
}

export function renderPriceWatchSection(items: DigestPriceWatchItem[], currency: string): string {
  if (items.length === 0) {
    return '';
  }
  const cards = items.map((item) => renderPriceWatchCard(item, currency)).join('');
  return sectionHeader('📉', 'Price Watch', COLORS.link) + cards;
}

function renderStatisticsRow(label: string, value: string): string {
  return (
    `<tr><td style="padding:6px 0; font-family:${FONT}; font-size:13px; color:${COLORS.muted};">${escapeHtml(label)}</td>` +
    `<td align="right" style="padding:6px 0; font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.text};">${escapeHtml(value)}</td></tr>`
  );
}

export function renderStatisticsSection(statistics: DigestStatistics): string {
  const rows =
    renderStatisticsRow('Games checked', String(statistics.gamesChecked)) +
    renderStatisticsRow('Reported', String(statistics.reported)) +
    renderStatisticsRow('Skipped', String(statistics.skipped)) +
    renderStatisticsRow('Collector', statistics.collector) +
    renderStatisticsRow('Execution time', statistics.executionTime);
  return (
    sectionHeader('📈', 'Monitoring Statistics', COLORS.muted) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
    ` style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border}; border-radius:8px; padding:6px 14px;">` +
    `<tr><td style="padding:6px 14px;">${rows}</td></tr></table>`
  );
}

export function renderFooter(): string {
  return (
    `<div style="border-top:1px solid ${COLORS.border}; margin-top:24px; padding-top:16px; text-align:center;">` +
    `<p style="margin:0; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">` +
    `Generated automatically by<br/><strong style="color:${COLORS.text};">Nintendo Switch Games Monitor</strong>` +
    `</p></div>`
  );
}
