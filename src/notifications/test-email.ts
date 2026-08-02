import 'dotenv/config';

import { NotificationReport } from '../models';
import { createEmailProvider } from './email-factory';
import { renderNotificationEmail } from './email-renderer';

function buildSampleReport(): NotificationReport {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      gamesChecked: 3,
      gamesMatched: 3,
      gamesSkippedByCooldown: 0,
      gamesReported: 3,
    },
    deals: [
      {
        title: 'The Legend of Zelda: Breath of the Wild',
        currentPrice: 39.99,
        previousPrice: 59.99,
        discountPercent: 33,
        ageRating: 'E10+',
        storeUrl:
          'https://www.nintendo.com/store/products/the-legend-of-zelda-breath-of-the-wild/',
        reasons: ['Age appropriate for the family', 'Best-selling title', 'Price below $40'],
      },
      {
        title: 'Mario Kart 8 Deluxe',
        currentPrice: 41.99,
        previousPrice: 59.99,
        discountPercent: 30,
        ageRating: 'E',
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/',
        reasons: ['Great for multiplayer nights', 'On sale now'],
      },
    ],
    freeGames: [
      {
        title: 'Fortnite',
        ageRating: 'T',
        storeUrl: 'https://www.nintendo.com/store/products/fortnite/',
      },
    ],
  };
}

export async function sendTestEmail(): Promise<void> {
  const report = buildSampleReport();
  const html = renderNotificationEmail(report);
  const provider = createEmailProvider();

  await provider.sendEmail({
    subject: '🎮 Nintendo Switch Games Monitor — Test Notification',
    html,
  });

  const target = process.env.EMAIL_PROVIDER === 'mock' ? 'mock provider' : process.env.EMAIL_TO;
  console.log(`Test email sent via ${process.env.EMAIL_PROVIDER ?? 'gmail'} to ${target}.`);
}

if (require.main === module) {
  sendTestEmail().catch((error: unknown) => {
    console.error('Failed to send test email:', error);
    process.exitCode = 1;
  });
}
