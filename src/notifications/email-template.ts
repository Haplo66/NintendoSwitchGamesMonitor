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
  DigestFreeGame,
} from '../models';
import { displayScore } from '../analyzer/deal-score';

const COLORS = {
  bg: '#f4f5f7',
  card: '#ffffff',
  panel: '#fafbfc',
  border: '#e1e5ea',
  text: '#17202a',
  muted: '#5d6b7a',
  accent: '#e60012',
  bestDeal: '#e60012',
  wishlist: '#6d28d9',
  free: '#1a7f37',
  historical: '#b45309',
  still: '#0e7490',
  recommended: '#0f766e',
  discount: '#ea580c',
  success: '#1a7f37',
  danger: '#c62828',
  link: '#1a56db',
  linkBg: '#e8f0fe',
  time: '#0e7490',
};

const FONT = 'Arial, Helvetica, sans-serif';

/**
 * Card height model. Heights are computed PER SECTION from the actual content
 * of that section's cards (tallest card wins) rather than from any shared,
 * guessed global constant. See `estimateCardHeight`.
 *
 * Each grid section decides its own height independently: Best Deals uses the
 * height of its tallest Best Deal card, Still On Sale its own, Recommended its
 * own, Historical Lows its own, Wishlist Watch its own. Because the height is
 * applied to a <table> `height` attribute (treated as a minimum by email table
 * layout), no card clips and shorter cards simply stretch to match the tallest.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Approximate text width available inside a single two-column card, in px.
 * Cards are 50% of the ~600px digest body minus the column gutter and the
 * card's own 18px horizontal padding (2*18). Used only to estimate how many
 * lines a piece of content wraps into on a card; scaled up generously so the
 * returned height is always >= the real rendered height (never clip).
 */
const CARD_TEXT_WIDTH = 280;

/** Approximate on-screen width of one glyph of a given font size (px). */
function glyphWidth(fontSize: number): number {
  return Math.max(1, Math.round(fontSize * 0.55));
}

/**
 * Counts how many rendered lines a plain text run needs inside one card.
 * Falls back to a single line for very short text.
 */
function linesForText(text: string, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(CARD_TEXT_WIDTH / glyphWidth(fontSize)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

/**
 * Estimates the rendered height (px) a card's body + footer content requires.
 *
 * This is CONTENT-DRIVEN: it walks the card's body/footer HTML, tracks the
 * fontSize of each text run from the inline styles the template emits, and
 * sums each wrapped line's height. It deliberately returns a value >= the
 * natural rendered height (generous per-line whitespace + body chrome) so a
 * section can pass one shared height to all its cards without ever clipping
 * the tallest one. Sections use this to size themselves to their own tallest
 * card rather than relying on a shared global constant.
 */
function estimateCardHeight(body: string, footer?: string): number {
  const parse = (html: string): number => {
    let total = 0;
    const tokenRe = /<([a-z0-9]+)([^>]*)>|([^<]*)/g;
    let fontSize = 13;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(html)) !== null) {
      if (match.index === tokenRe.lastIndex) {
        tokenRe.lastIndex += 1;
        continue;
      }
      if (match[1]) {
        const attrs = match[2];
        const sizeMatch = /font-size:(\d+(?:\.\d+)?)px/.exec(attrs);
        if (sizeMatch) {
          fontSize = parseFloat(sizeMatch[1]);
        }
        if (match[1] === 'br') {
          total += Math.round(fontSize * 1.35);
        }
        continue;
      }
      const text = match[3];
      if (!text || text.length === 0) {
        continue;
      }
      const plain = text.replace(/\s+/g, ' ').trim();
      if (plain.length === 0) {
        continue;
      }
      total += Math.round(linesForText(plain, fontSize) * fontSize * 1.35);
    }
    return total;
  };

  const bodyBlockGap = (body.match(/margin-top:(\d+)px/g) || [])
    .map((m) => parseInt((/margin-top:(\d+)px/.exec(m) || ['', '0'])[1], 10))
    .reduce((a, b) => a + b, 0);
  const footerHeight = footer ? 1 + 20 + 10 + parse(footer) : 0;
  return Math.ceil(3 + 1 + 32 + bodyBlockGap + parse(body) + footerHeight);
}

/**
 * Renders a card grid where equal heights are achieved at the ROW level.
 *
 * Cards are grouped into rows of two as DIRECT sibling <td> cells inside a
 * single shared <tr>. Each row computes its own height from its own two cards
 * (the taller of the pair decides that row), so two cards sitting in the same
 * row always render at exactly the same height while a different row is free to
 * be a different height. This is the critical distinction from any
 * section-wide height: a card is only ever as tall as its row sibling, never as
 * tall as the whole section. See `estimateCardHeight` for how each card's
 * natural content height is measured.
 */
type CardSpec = { body: string; accentColor?: string; footer?: string };

/**
 * Renders one two-column row: the two direct-sibling card cells plus the
 * shared row height (the taller of the pair's estimated natural heights). An
 * odd trailing card fills the leading cell and the right cell stays empty but
 * is given the same height so a single-card row stays aligned to its own card.
 */
function renderGridRow(left: CardSpec, right: CardSpec | undefined, gutter: number): string {
  const rowHeight = right
    ? Math.max(estimateCardHeight(left.body, left.footer), estimateCardHeight(right.body, right.footer))
    : estimateCardHeight(left.body, left.footer);
  const leftCell =
    `<td class="digest-grid-cell" width="50%" valign="top" height="${rowHeight}"` +
    ` style="padding-right:${gutter}px;">` +
    card(left.body, left.accentColor, left.footer) +
    `</td>`;
  const rightCell = right
    ? `<td class="digest-grid-cell" width="50%" valign="top" height="${rowHeight}"` +
      ` style="padding-left:${gutter}px;">` +
      card(right.body, right.accentColor, right.footer) +
      `</td>`
    : `<td class="digest-grid-cell" width="50%" valign="top" height="${rowHeight}"` +
      ` style="padding-left:${gutter}px;"><table role="presentation" class="digest-card" width="100%" style="height:100%;"></table></td>`;
  return (
    `<table role="presentation" class="digest-grid" width="100%" cellpadding="0" cellspacing="0"` +
    ` style="width:100%; table-layout:fixed; border-collapse:separate; margin:0 0 ${gutter}px 0;">` +
    `<tr>${leftCell}${rightCell}</tr></table>`
  );
}

/**
 * Builds the full section grid with ROW-level equal heights (see
 * `renderGridRow`). Cards are paired two-by-two into rows; the right cell of an
 * odd trailing pair is kept empty so a lone card still occupies a full row.
 */
function renderCardGrid(specs: CardSpec[], gutter = 10): string {
  if (specs.length === 0) {
    return '';
  }
  const rows: string[] = [];
  for (let i = 0; i < specs.length; i += 2) {
    rows.push(renderGridRow(specs[i], specs[i + 1], gutter));
  }
  return rows.join('');
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
    ` style="margin:24px 0 14px 0;"><tr><td>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-radius:6px;` +
    ` background-color:${color}; padding:7px 12px;"><tr><td style="font-family:${FONT};` +
    ` font-size:16px; font-weight:bold; color:#ffffff;">${emoji} ${escapeHtml(title)}</td>` +
    `</tr></table></td></tr></table>`
  );
}

/**
 * Renders a theme chip label used at the top of a card to visually tie it to
 * its section accent color.
 */
function themeChip(label: string, color: string): string {
  return (
    `<span style="font-family:${FONT}; font-size:10px; font-weight:bold; color:#ffffff;` +
    ` background-color:${color}; border-radius:3px; padding:1px 5px; display:inline-block;` +
    ` margin:0 0 6px 0; text-transform:uppercase; letter-spacing:0.4px;">` +
    `${escapeHtml(label)}</span>`
  );
}

/**
 * Renders the card body with a bordered, padded chrome. The card's outer
 * <table> is the DIRECT, sole child of its grid <td> (the two cards in a row
 * are siblings) and fills that cell with `height:100%`, so the card never
 * decides its own height: the shared <tr>/<td> row height does. No
 * `overflow:hidden` and no `min-height`; `height:100%` lets a shorter card's
 * chrome stretch to match the taller sibling while nothing is ever clipped.
 * The row height itself is computed by `renderGridRow` from the row's own two
 * cards.
 */
function card(body: string, accentColor?: string, footer?: string): string {
  const topBorder = accentColor ? ` border-top:3px solid ${accentColor};` : '';
  const footerHtml = footer
    ? `<tr><td valign="bottom" style="padding:10px 18px; border-top:1px solid ${COLORS.border};">${footer}</td></tr>`
    : '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
    ` class="digest-card" width="100%"` +
    ` style="background-color:${COLORS.panel};` +
    ` border:1px solid ${COLORS.border};${topBorder} border-radius:8px;` +
    ` width:100%; height:100%;"><tr><td valign="top" style="padding:16px 18px;">` +
    `${body}</td></tr>${footerHtml}</table>`
  );
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
    parts.push(badge(`Deal Score: ${displayScore(score)}`, COLORS.accent));
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
    ['🔥 Best Deals', String(summary.bestDeals)],
    ['⭐ Historical Lows', String(summary.historicalLows)],
    ['🆓 Free Games', String(summary.freeGames)],
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

function renderStillOnSaleCard(item: DigestStillOnSale, currency: string): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
  const daysLabel = item.daysOnSale === 1 ? '1 day on sale' : `${item.daysOnSale} days on sale`;
  return {
    body:
      themeChip('Still On Sale', COLORS.still) +
      `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(item.title)}</h3>` +
      `<div>${renderPriceRow(currency, item.originalPrice, item.currentPrice, COLORS.still)}</div>` +
      renderDealSummary(item.discountPercent) +
      `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">` +
      `First reported ${formatShortDate(item.firstReportedAt)} · ${daysLabel}</div>` +
      renderDealInsight(item.quality, item.priceContext, currency),
    accentColor: COLORS.still,
    footer: actionButton('View Deal', item.storeUrl, COLORS.still),
  };
}

export function renderStillOnSaleSection(items: DigestStillOnSale[], currency: string): string {
  if (items.length === 0) {
    return '';
  }
  const cards = items.map((item) => renderStillOnSaleCard(item, currency));
  return sectionHeader('🕒', 'Still On Sale', COLORS.still) + renderCardGrid(cards);
}

/**
 * Renders historical price context under a deal card, only when it is useful:
 * "⭐ At its historical low" (current price is the best ever, optionally with the
 * previous low) or "Historical low: $X" when the current price is not a new low
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
    text = `⭐ At its historical low${previous}`;
  } else if (context.lowestPrice !== undefined) {
    text = `Historical low: ${formatMoney(currency, context.lowestPrice)}`;
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

function renderWishlistWatchCard(item: DigestWishlistWatch, currency: string): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
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
  return {
    body:
      themeChip(meta.label, meta.color) +
      `<h3 style="margin:0 0 6px 0; font-size:15px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(item.title)}</h3>` +
      details,
    accentColor: COLORS.wishlist,
  };
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
  const cards = items.map((item) => renderWishlistWatchCard(item, currency));
  return header + renderCardGrid(cards);
}

function renderWishlistAlertCard(alert: DigestWishlistAlert, currency: string, digest: DailyDigest): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
  const reachedBadge = alert.targetReached
    ? badge('YES', COLORS.success)
    : badge('NO', COLORS.danger);
  const targetLabel =
    alert.targetPriceOrigin === 'configured'
      ? 'Configured target'
      : `Auto target (${digest.defaultWishlistDiscountPercent}% discount)`;
  return {
    body:
      themeChip('Wishlist Alert', COLORS.wishlist) +
      `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(alert.title)}</h3>` +
      `<div>${renderPriceRow(currency, alert.originalPrice, alert.currentPrice, COLORS.wishlist)}</div>` +
      renderDealSummary(alert.discountPercent) +
      `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; color:${COLORS.text};">` +
      `${targetLabel}: <strong>${formatMoney(currency, alert.targetPrice)}</strong> · Reached: ${reachedBadge}` +
      `</div>` +
      renderDealInsight(alert.quality, alert.priceContext, currency),
    accentColor: COLORS.wishlist,
    footer:
      actionButton('View Deal', alert.storeUrl, COLORS.wishlist) + `&nbsp;&nbsp;${ageRatingBadge(alert.ageRating)}`,
  };
}

export function renderWishlistAlertsSection(alerts: DigestWishlistAlert[], currency: string, digest: DailyDigest): string {
  if (alerts.length === 0) {
    return '';
  }
  const cards = alerts
    .map((alert) => {
      const spec = renderWishlistAlertCard(alert, currency, digest);
      return card(spec.body, spec.accentColor, spec.footer);
    })
    .join('');
  return sectionHeader('🎯', 'Wishlist Alerts', COLORS.wishlist) + cards;
}

function renderBestDealCard(deal: DigestBestDeal, currency: string): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
  return {
    body:
      themeChip('Best Deal', COLORS.bestDeal) +
      `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(deal.title)}</h3>` +
      `<div>${renderPriceRow(currency, deal.originalPrice, deal.currentPrice, COLORS.bestDeal)}</div>` +
      renderDealSummary(deal.discountPercent, deal.score) +
      `${reasonsList(deal.reasons)}` +
      renderDealInsight(deal.quality, deal.priceContext, currency),
    accentColor: COLORS.bestDeal,
    footer:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
      `<td valign="middle">${ageRatingBadge(deal.ageRating)}</td>` +
      `<td align="right" valign="middle" style="white-space:nowrap;">${actionButton('View Deal', deal.storeUrl, COLORS.link)}</td>` +
      `</tr></table>`,
  };
}

export function renderBestDealsSection(deals: DigestBestDeal[], currency: string): string {
  if (deals.length === 0) {
    return '';
  }
  const cards = deals.map((deal) => renderBestDealCard(deal, currency));
  return sectionHeader('🔥', 'Best Deals', COLORS.accent) + renderCardGrid(cards);
}

function renderFreeGameCard(game: DigestFreeGame): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
  const reasons =
    game.reasons && game.reasons.length > 0
      ? `<div style="margin-top:4px; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">` +
        `Matches: ${escapeHtml(game.reasons.join(', '))}</div>`
      : '';
  return {
    body:
      themeChip('Free Game', COLORS.free) +
      `<h3 style="margin:0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(game.title)}</h3>` +
      `<div style="margin-top:6px; font-family:${FONT}; font-size:13px; font-weight:bold; color:${COLORS.free};">` +
      `🆓 Free to download</div>` +
      reasons +
      `<div style="margin-top:10px;">${ageRatingBadge(game.ageRating)}</div>`,
    accentColor: COLORS.free,
    footer: actionButton('Get It Free', game.storeUrl, COLORS.free),
  };
}

export function renderFreeGamesSection(freeGames: DigestFreeGame[]): string {
  if (freeGames.length === 0) {
    return '';
  }
  const cards = freeGames.map(renderFreeGameCard);
  return sectionHeader('🆓', 'Free Family Games', COLORS.free) + renderCardGrid(cards);
}

function renderHistoricalLowCard(deal: DigestHistoricalLow, currency: string): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
  return {
    body:
      themeChip('Historical Low', COLORS.historical) +
      `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(deal.title)}</h3>` +
      `<div>${renderPriceRow(currency, deal.originalPrice, deal.currentPrice, COLORS.historical)}</div>` +
      renderDealSummary(deal.discountPercent) +
      `<div style="margin-top:6px; font-family:${FONT}; font-size:12px; font-weight:bold;` +
      ` color:${COLORS.historical};">⭐ At its historical low (${formatMoney(currency, deal.lowPrice)})</div>` +
      `<div style="margin-top:10px;">${ageRatingBadge(deal.ageRating)}</div>`,
    accentColor: COLORS.historical,
    footer: actionButton('View Deal', deal.storeUrl, COLORS.historical),
  };
}

export function renderHistoricalLowsSection(items: DigestHistoricalLow[], currency: string): string {
  if (items.length === 0) {
    return '';
  }
  const cards = items.map((item) => renderHistoricalLowCard(item, currency));
  return sectionHeader('⭐', 'Historical Lows', COLORS.historical) + renderCardGrid(cards);
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

function renderRecommendationCard(recommendation: DigestFamilyRecommendation, currency: string): {
  body: string;
  accentColor?: string;
  footer?: string;
} {
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
  const footer = recommendation.onWishlist
    ? `<span style="font-family:${FONT}; font-size:12px; font-weight:bold; color:${COLORS.wishlist};">🎯 On your wishlist</span>`
    : `<span style="font-family:${FONT}; font-size:12px; font-weight:bold; color:${COLORS.recommended};">` +
      `✓ ${recommendation.entireFamily ? 'Recommended for the entire family' : `Recommended for ${recommendation.members.length} ${recommendation.members.length === 1 ? 'member' : 'members'}`}</span>`;
  return {
    body:
      themeChip('Recommended', COLORS.recommended) +
      `<h3 style="margin:0 0 6px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT};">${escapeHtml(recommendation.title)}${wishlistTag}</h3>` +
      recommendationPriceStatus(recommendation, currency) +
      `<div style="margin-top:8px; font-family:${FONT}; font-size:12px; color:${COLORS.muted};">Recommended for:</div>` +
      `<div style="margin-top:2px;">${who}</div>`,
    accentColor: COLORS.recommended,
    footer,
  };
}

export function renderRecommendedSection(
  recommendations: DigestFamilyRecommendation[],
  currency: string,
): string {
  if (recommendations.length === 0) {
    return '';
  }
  const cards = recommendations.map((recommendation) => renderRecommendationCard(recommendation, currency));
  return sectionHeader('⭐', 'Recommended For Your Family', COLORS.recommended) + renderCardGrid(cards);
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
    renderStatisticsRow('Newly notified', String(statistics.reported)) +
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
