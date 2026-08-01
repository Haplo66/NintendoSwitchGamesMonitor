import { FreeGame, GameDeal, NotificationReport } from '../models';

const COLORS = {
  bg: '#f4f5f7',
  card: '#ffffff',
  panel: '#fafbfc',
  border: '#e1e5ea',
  text: '#17202a',
  muted: '#5d6b7a',
  accent: '#e60012',
  success: '#1a7f37',
  link: '#1a56db',
  linkBg: '#e8f0fe',
};

const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

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

function priceText(price: number): string {
  return `font-family:${FONT_FAMILY}; font-size:13px; color:${COLORS.muted}; text-decoration:line-through;`;
}

function currentPriceText(price: number): string {
  return `font-family:${FONT_FAMILY}; font-size:18px; font-weight:bold; color:${COLORS.accent};`;
}

function discountBadge(discountPercent: number): string {
  return (
    `<span style="font-family:${FONT_FAMILY}; font-size:12px; font-weight:bold; color:#ffffff;` +
    ` background-color:${COLORS.accent}; border-radius:4px; padding:2px 6px; margin-left:6px;">` +
    `-${discountPercent}%</span>`
  );
}

function ageRatingBadge(ageRating: string): string {
  const label = escapeHtml(ageRating || 'NR');
  return (
    `<span style="font-family:${FONT_FAMILY}; font-size:12px; color:${COLORS.link};` +
    ` background-color:${COLORS.linkBg}; border-radius:4px; padding:2px 8px;">${label}</span>`
  );
}

function actionButton(label: string, url: string, backgroundColor: string): string {
  const href = escapeHtml(url);
  return (
    `<a href="${href}" target="_blank" style="display:inline-block; margin-top:12px;` +
    ` background-color:${backgroundColor}; color:#ffffff; text-decoration:none;` +
    ` padding:10px 20px; border-radius:6px; font-size:14px; font-family:${FONT_FAMILY};">` +
    `${escapeHtml(label)}</a>`
  );
}

function reasonsList(reasons: string[]): string {
  if (reasons.length === 0) return '';
  const items = reasons
    .map(
      (reason) =>
        `<li style="font-family:${FONT_FAMILY}; font-size:13px; color:${COLORS.text};` +
        ` padding:2px 0;"><span style="color:${COLORS.success};">✓</span> ${escapeHtml(reason)}</li>`,
    )
    .join('');
  return `<ul style="margin:10px 0 0 0; padding:0; list-style:none;">${items}</ul>`;
}

export function renderHeader(): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"` +
    ` style="background-color:${COLORS.accent};">` +
    `<tr><td align="center" style="padding:28px 20px;">` +
    `<div style="font-size:40px; line-height:1;">🎮</div>` +
    `<h1 style="margin:10px 0 0 0; font-size:22px; color:#ffffff;` +
    ` font-family:${FONT_FAMILY};">Nintendo Switch Games Monitor</h1>` +
    `<p style="margin:6px 0 0 0; font-size:13px; color:#ffe6e6; font-family:${FONT_FAMILY};">` +
    `New deals picked for your family</p>` +
    `</td></tr></table>`
  );
}

function renderDealCard(deal: GameDeal): string {
  const savings = deal.previousPrice - deal.currentPrice;
  const savingsLabel =
    savings > 0 ? `<span style="font-family:${FONT_FAMILY}; font-size:12px; color:${COLORS.success}; font-weight:bold;"> · Save ${formatPrice(savings)}</span>` : '';

  return (
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    ` border-radius:8px; padding:16px 18px; margin:0 0 16px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0 0 8px 0; font-size:16px; color:${COLORS.text}; font-family:${FONT_FAMILY};">${escapeHtml(deal.title)}</h3>` +
    `<div>` +
    `<span style="${priceText(deal.previousPrice)}">${formatPrice(deal.previousPrice)}</span>` +
    `<span style="margin-left:6px;">${currentPriceText(deal.currentPrice)}${formatPrice(deal.currentPrice)}</span>` +
    `${discountBadge(deal.discountPercent)}${savingsLabel}` +
    `</div>` +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(deal.ageRating)}</td>` +
    `</tr></table>` +
    `${reasonsList(deal.reasons)}` +
    `${actionButton('View Deal', deal.storeUrl, COLORS.link)}` +
    `</div>`
  );
}

function renderFreeGameCard(game: FreeGame): string {
  return (
    `<div style="background-color:${COLORS.panel}; border:1px solid ${COLORS.border};` +
    ` border-radius:8px; padding:16px 18px; margin:0 0 12px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:0 12px 0 0;">` +
    `<h3 style="margin:0; font-size:16px; color:${COLORS.text}; font-family:${FONT_FAMILY};">${escapeHtml(game.title)}</h3>` +
    `<div style="margin-top:6px; font-family:${FONT_FAMILY}; font-size:13px; font-weight:bold; color:${COLORS.success};">Free to download</div>` +
    `</td>` +
    `<td align="right" valign="top" style="white-space:nowrap;">${ageRatingBadge(game.ageRating)}</td>` +
    `</tr></table>` +
    `${actionButton('Get It Free', game.storeUrl, COLORS.success)}` +
    `</div>`
  );
}

function sectionHeader(emoji: string, label: string): string {
  return (
    `<h2 style="margin:20px 0 12px 0; font-size:18px; color:${COLORS.text}; font-family:${FONT_FAMILY};">` +
    `${emoji} ${escapeHtml(label)}</h2>`
  );
}

export function renderDealsSection(deals: GameDeal[]): string {
  if (deals.length === 0) return '';
  const cards = deals.map(renderDealCard).join('');
  return `${sectionHeader('🔥', 'Discounted Games')}${cards}`;
}

export function renderFreeGamesSection(freeGames: FreeGame[]): string {
  if (freeGames.length === 0) return '';
  const cards = freeGames.map(renderFreeGameCard).join('');
  return `${sectionHeader('🎁', 'Free Games')}${cards}`;
}

export function renderSummary(report: NotificationReport): string {
  const dealCount = report.deals.length;
  const freeCount = report.freeGames.length;
  const dealNoun = dealCount === 1 ? 'game' : 'games';
  const freeNoun = freeCount === 1 ? 'game' : 'games';
  const generatedAt = escapeHtml(new Date(report.generatedAt).toLocaleString());

  return (
    `<div style="border-top:1px solid ${COLORS.border}; margin-top:24px; padding-top:16px;">` +
    `<p style="margin:0 0 4px 0; font-family:${FONT_FAMILY}; font-size:13px; color:${COLORS.text};">` +
    `<strong>Summary:</strong> ${dealCount} discounted ${dealNoun} and ${freeCount} free ${freeNoun} found.` +
    `</p>` +
    `<p style="margin:0; font-family:${FONT_FAMILY}; font-size:12px; color:${COLORS.muted};">` +
    `Generated on ${generatedAt} · Nintendo Switch Games Monitor` +
    `</p>` +
    `</div>`
  );
}
