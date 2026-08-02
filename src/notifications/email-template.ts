import {
  DailyDigest,
  DigestBestDeal,
  DigestFamilyRecommendation,
  DigestPriceWatchItem,
  DigestStatistics,
  DigestSummary,
  DigestWishlistAlert,
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
    `${topBorder} border-radius:8px; padding:14px 16px; margin:0 0 14px 0;">${inner}</div>`
  );
}

function priceRow(currency: string, original: number | undefined, current: number, accentColor: string): string {
  const originalHtml =
    original !== undefined && original > current
      ? `<span style="font-family:${FONT}; font-size:13px; color:${COLORS.muted};` +
        ` text-decoration:line-through; margin-right:6px;">${formatMoney(currency, original)}</span>`
      : '';
  const discount =
    original !== undefined && original > current
      ? badge(`-${Math.round(((original - current) / original) * 100)}%`, COLORS.discount)
      : '';
  return (
    `${originalHtml}<span style="font-family:${FONT}; font-size:18px; font-weight:bold;` +
    ` color:${accentColor};">${formatMoney(currency, current)}</span>${discount}`
  );
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
  const stats = [
    ['Games checked', summary.gamesChecked],
    ['Deals found', summary.dealsFound],
    ['Wishlist hits', summary.wishlistHits],
    ['Free games', summary.freeGames],
    ['Skipped', summary.skippedByCooldown],
  ];
  const cells = stats
    .map(
      ([label, value]) =>
        `<td align="center" style="padding:12px 4px;">` +
        `<div style="font-family:${FONT}; font-size:22px; font-weight:bold; color:${COLORS.text};">${value}</div>` +
        `<div style="font-family:${FONT}; font-size:11px; color:${COLORS.muted};">${label}</div>` +
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
    `<div>${priceRow(currency, alert.originalPrice, alert.currentPrice, COLORS.wishlist)}</div>` +
    `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; color:${COLORS.text};">` +
    `${targetLabel}: <strong>${formatMoney(currency, alert.targetPrice)}</strong> · Reached: ${reachedBadge}` +
    `</div>` +
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
  const discount =
    deal.discountPercent > 0 ? badge(`-${deal.discountPercent}%`, COLORS.discount) : '';
  const score = badge(`Score ${deal.score}`, COLORS.accent);
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(deal.title)}</h3>` +
    `<div>${priceRow(currency, deal.originalPrice, deal.currentPrice, COLORS.accent)} ${discount} ${score}</div>` +
    `${reasonsList(deal.reasons)}` +
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
  const cards = deals.map((deal) => renderBestDealCard(deal, currency)).join('');
  return sectionHeader('🔥', 'Best Deals', COLORS.accent) + cards;
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

function renderRecommendationProfile(recommendation: DigestFamilyRecommendation): string {
  const games = recommendation.games
    .map(
      (game) =>
        `<li style="font-family:${FONT}; font-size:14px; color:${COLORS.text}; padding:6px 0;">` +
        `<span style="color:${COLORS.success}; font-weight:bold;">✓</span> <strong>${escapeHtml(game.title)}</strong>` +
        (game.reasons.length > 0
          ? `<div style="font-size:12px; color:${COLORS.muted}; margin-top:2px;">Reason: ${game.reasons
              .map((reason) => escapeHtml(reason))
              .join(' · ')}</div>`
          : '') +
        `</li>`,
    )
    .join('');
  return (
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    ` border-radius:8px; padding:12px 16px; margin:0 0 12px 0;">` +
    `<h3 style="margin:0 0 4px 0; font-size:15px; color:${COLORS.link}; font-family:${FONT};">` +
    `${escapeHtml(recommendation.profileName)}</h3>` +
    `<ul style="margin:0; padding:0; list-style:none;">${games}</ul>` +
    `</div>`
  );
}

export function renderRecommendedSection(recommendations: DigestFamilyRecommendation[]): string {
  if (recommendations.length === 0) {
    return '';
  }
  const blocks = recommendations.map(renderRecommendationProfile).join('');
  return sectionHeader('⭐', 'Recommended For Your Family', COLORS.free) + blocks;
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
