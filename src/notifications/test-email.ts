import 'dotenv/config';

import { DailyDigest } from '../models';
import { loadAppConfig } from '../config/app-config';
import { createEmailProvider } from './email-factory';
import { renderDigestEmail } from './email-renderer';

function buildSampleDigest(): DailyDigest {
  return {
    generatedAt: new Date().toISOString(),
    dateLabel: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    collector: 'mock',
    currency: 'USD',
    defaultWishlistDiscountPercent: 40,
    summary: {
      newDeals: 3,
      wishlistGamesOnSale: 2,
      stillActiveDeals: 1,
      biggestDiscountPercent: 42,
      biggestDiscountTitle: 'Mario Kart 8 Deluxe',
      gamesChecked: 5,
    },
    stillOnSale: [
      {
        title: 'Super Mario Odyssey',
        currentPrice: 41.99,
        originalPrice: 59.99,
        discountPercent: 30,
        firstReportedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        daysOnSale: 12,
        storeUrl: 'https://www.nintendo.com/store/products/super-mario-odyssey/',
      },
    ],
    wishlistWatch: [
      {
        title: 'Mario Kart 8 Deluxe',
        status: 'target-reached',
        currentPrice: 34.99,
        originalPrice: 59.99,
        discountPercent: 42,
        targetPrice: 39.99,
        targetPriceOrigin: 'configured',
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/',
      },
      {
        title: 'Super Mario RPG',
        status: 'not-monitored',
      },
    ],
    wishlistAlerts: [
      {
        title: 'Mario Kart 8 Deluxe',
        currentPrice: 34.99,
        originalPrice: 59.99,
        discountPercent: 42,
        targetPrice: 39.99,
        targetPriceOrigin: 'configured',
        targetReached: true,
        ageRating: 'E',
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/',
      },
      {
        title: 'Luigi\u2019s Mansion 3',
        currentPrice: 44.99,
        originalPrice: 59.99,
        discountPercent: 25,
        targetPrice: 35.99,
        targetPriceOrigin: 'auto',
        targetReached: true,
        ageRating: 'E10+',
        storeUrl: 'https://www.nintendo.com/store/products/luigis-mansion-3/',
      },
    ],
    bestDeals: [
      {
        title: 'The Legend of Zelda: Breath of the Wild',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        score: 92,
        reasons: ['Age appropriate for the family', 'Best-selling title', 'Price below $40'],
        ageRating: 'E10+',
        storeUrl:
          'https://www.nintendo.com/store/products/the-legend-of-zelda-breath-of-the-wild/',
      },
      {
        title: 'Super Mario Odyssey',
        currentPrice: 41.99,
        originalPrice: 59.99,
        discountPercent: 30,
        score: 88,
        reasons: ['Great for multiplayer nights', 'On sale now'],
        ageRating: 'E10+',
        storeUrl: 'https://www.nintendo.com/store/products/super-mario-odyssey/',
      },
    ],
    freeGames: [
      {
        title: 'Fortnite',
        ageRating: 'T',
        storeUrl: 'https://www.nintendo.com/store/products/fortnite/',
      },
    ],
    historicalLows: [],
    recommendations: [
      {
        title: 'Mario Kart 8 Deluxe',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        isFree: false,
        onWishlist: true,
        entireFamily: false,
        members: [
          { name: 'Alex (Kid)', reasons: ['Racing', 'Platformer', 'Age appropriate'] },
          { name: 'Maya (Teen)', reasons: ['Racing'] },
        ],
      },
      {
        title: 'Super Mario Odyssey',
        currentPrice: 41.99,
        originalPrice: 59.99,
        discountPercent: 30,
        isFree: false,
        onWishlist: false,
        entireFamily: true,
        members: [
          { name: 'Alex (Kid)', reasons: ['Adventure', 'Platformer', 'Age appropriate'] },
          { name: 'Maya (Teen)', reasons: ['Adventure'] },
        ],
      },
      {
        title: 'The Legend of Zelda: Breath of the Wild',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        isFree: false,
        onWishlist: false,
        entireFamily: false,
        members: [{ name: 'Maya (Teen)', reasons: ['Action', 'Adventure', 'Age appropriate'] }],
      },
    ],
    priceWatch: [
      {
        title: 'Stardew Valley',
        targetPrice: 35,
        currentPrice: 37,
        difference: 2,
      },
    ],
    statistics: {
      gamesChecked: 5,
      reported: 2,
      skipped: 2,
      collector: 'mock',
      executionTime: '1.2 s',
    },
  };
}

export async function sendTestEmail(): Promise<void> {
  const digest = buildSampleDigest();
  const html = renderDigestEmail(digest);
  const config = loadAppConfig();
  const provider = createEmailProvider(config.preferences.emailProvider, {
    emailTo: config.preferences.emailTo,
  });

  await provider.sendEmail({
    subject: '🎮 Nintendo Switch Daily Digest — Test Notification',
    html,
  });

  const target =
    config.preferences.emailProvider === 'mock'
      ? 'mock provider'
      : config.preferences.emailTo ?? '(defaults to SMTP_USER)';
  console.log(`Test email sent via ${config.preferences.emailProvider} to ${target}.`);
}

if (require.main === module) {
  sendTestEmail().catch((error: unknown) => {
    console.error('Failed to send test email:', error);
    process.exitCode = 1;
  });
}
