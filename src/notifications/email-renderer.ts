import { NotificationReport } from '../models';
import {
  escapeHtml,
  renderDealsSection,
  renderFreeGamesSection,
  renderHeader,
  renderSummary,
} from './email-template';

export function renderNotificationEmail(report: NotificationReport): string {
  const title = 'Nintendo Switch Games Monitor';
  const sections =
    renderDealsSection(report.deals) + renderFreeGamesSection(report.freeGames) + renderSummary(report);

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
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
