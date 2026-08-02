import { DailyDigest } from '../models';
import {
  escapeHtml,
  renderBestDealsSection,
  renderDigestHeader,
  renderDigestSummary,
  renderFooter,
  renderFreeGamesSection,
  renderPriceWatchSection,
  renderRecommendedSection,
  renderStatisticsSection,
  renderWishlistAlertsSection,
} from './email-template';

export function composeDigestSections(digest: DailyDigest): string {
  return (
    renderDigestSummary(digest.summary) +
    renderWishlistAlertsSection(digest.wishlistAlerts, digest.currency, digest) +
    renderBestDealsSection(digest.bestDeals, digest.currency) +
    renderFreeGamesSection(digest.freeGames) +
    renderRecommendedSection(digest.recommendations) +
    renderPriceWatchSection(digest.priceWatch, digest.currency) +
    (digest.statistics ? renderStatisticsSection(digest.statistics) : '')
  );
}

export function wrapDigestDocument(sections: string, header: string): string {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml('Nintendo Switch Daily Digest')}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:10px; overflow:hidden;">
          <tr>
            <td>${header}</td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px 24px;">${sections}</td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px 24px;">${renderFooter()}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderDigestEmail(digest: DailyDigest): string {
  return wrapDigestDocument(composeDigestSections(digest), renderDigestHeader(digest));
}
