import 'dotenv/config';

import * as assert from 'node:assert';

import { DailyDigest } from '../models';
import { renderDigestEmail } from './email-renderer';
import { MockEmailProvider } from './mock-email-provider';

function buildSampleDigest(): DailyDigest {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    dateLabel: 'Saturday, August 1, 2026',
    collector: 'mock',
    currency: 'USD',
    defaultWishlistDiscountPercent: 40,
    summary: {
      gamesChecked: 5,
      potentialMatches: 4,
      newNotifications: 3,
      wishlistHits: 2,
      freeGames: 1,
      skippedByCooldown: 1,
    },
    wishlistAlerts: [
      {
        title: 'Mario Kart 8 <script>alert("xss")</script> Deluxe',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        targetPrice: 44.99,
        targetPriceOrigin: 'configured',
        targetReached: true,
        ageRating: 'E',
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/?ref=test',
      },
    ],
    bestDeals: [
      {
        title: 'The Legend of Zelda: Breath of the Wild',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        score: 92,
        reasons: ['Age appropriate for the family', 'Great for multiplayer & family nights'],
        ageRating: 'E10+',
        storeUrl:
          'https://www.nintendo.com/store/products/the-legend-of-zelda-breath-of-the-wild/',
      },
    ],
    freeGames: [
      {
        title: 'Fortnite',
        ageRating: 'T',
        storeUrl: 'https://www.nintendo.com/store/products/fortnite/',
      },
    ],
    recommendations: [
      {
        profileName: 'Alex (Kid)',
        games: [
          { title: 'Mario Kart 8 Deluxe', reasons: ['Racing', 'Age appropriate'] },
        ],
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

function emptyDigest(): DailyDigest {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    dateLabel: 'Saturday, August 1, 2026',
    collector: 'mock',
    currency: 'USD',
    defaultWishlistDiscountPercent: 40,
    summary: {
      gamesChecked: 0,
      potentialMatches: 0,
      newNotifications: 0,
      wishlistHits: 0,
      freeGames: 0,
      skippedByCooldown: 0,
    },
    wishlistAlerts: [],
    bestDeals: [],
    freeGames: [],
    recommendations: [],
    priceWatch: [],
  };
}

function hasStat(html: string, value: number, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`>${value}</div><div[^>]*>${escaped}</div>`).test(html);
}

interface Check {
  name: string;
  run: () => void | Promise<void>;
}

async function runChecks(checks: Check[]): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${check.name}`);
      console.error(`    ${(error as Error).message}`);
    }
  }
  if (failed > 0) {
    throw new Error(`${failed} check(s) failed`);
  }
}

export async function validateEmailRendering(): Promise<void> {
  const digest = buildSampleDigest();
  const html = renderDigestEmail(digest);
  const emptyHtml = renderDigestEmail(emptyDigest());

  const checks: Check[] = [
    {
      name: 'HTML output is generated',
      run: () => {
        assert.ok(typeof html === 'string' && html.length > 0, 'HTML is empty');
        assert.ok(html.trim().startsWith('<!DOCTYPE html>'), 'Missing doctype');
        assert.ok(html.includes('<html'), 'Missing <html>');
        assert.ok(html.includes('</html>'), 'Missing </html>');
      },
    },
    {
      name: 'Header renders title, date and collector',
      run: () => {
        assert.ok(html.includes('Nintendo Switch Daily Digest'), 'Header title missing');
        assert.ok(html.includes('Saturday, August 1, 2026'), 'Date missing');
        assert.ok(html.includes('mock collector'), 'Collector missing');
      },
    },
    {
      name: 'HTML escaping works',
      run: () => {
        assert.ok(html.includes('&lt;script&gt;'), 'Script tag was not escaped');
        assert.ok(html.includes('&quot;xss&quot;'), 'Quotes were not escaped');
        assert.ok(!html.includes('<script>'), 'Raw <script> leaked into output');
        assert.ok(html.includes('multiplayer &amp; family'), 'Ampersand was not escaped');
      },
    },
    {
      name: 'Summary section renders with correct values',
      run: () => {
        assert.ok(html.includes('Today\u2019s Summary'), 'Summary section missing');
        assert.ok(hasStat(html, 5, 'Games checked'), 'Games checked value wrong');
        assert.ok(hasStat(html, 4, 'Potential matches'), 'Potential matches value wrong');
        assert.ok(hasStat(html, 3, 'New notifications'), 'New notifications value wrong');
        assert.ok(hasStat(html, 2, 'Wishlist hits'), 'Wishlist hits value wrong');
        assert.ok(hasStat(html, 1, 'Free games'), 'Free games value wrong');
        assert.ok(hasStat(html, 1, 'Skipped by cooldown'), 'Skipped by cooldown value wrong');
      },
    },
    {
      name: 'Wishlist Alerts section renders',
      run: () => {
        assert.ok(html.includes('Wishlist Alerts'), 'Wishlist Alerts header missing');
        assert.ok(html.includes('Mario Kart 8'), 'Wishlist alert title missing');
        assert.ok(html.includes('Configured target:'), 'Wishlist target label missing');
        assert.ok(html.includes('USD 44.99'), 'Wishlist target price missing');
        assert.ok(html.includes('YES'), 'Target reached YES badge missing');
        assert.ok(html.includes('View Deal'), 'Wishlist alert button missing');
      },
    },
    {
      name: 'Best Deals section renders',
      run: () => {
        assert.ok(html.includes('Best Deals'), 'Best Deals header missing');
        assert.ok(html.includes('Breath of the Wild'), 'Best deal title missing');
        assert.ok(html.includes('-33%'), 'Discount badge missing');
        assert.ok(html.includes('Score 92'), 'Deal score missing');
        assert.ok(html.includes('Age appropriate for the family'), 'Reason missing');
        assert.ok(html.includes('USD 39.99'), 'Current price missing');
        assert.ok(html.includes('View Deal'), 'Best deal button missing');
      },
    },
    {
      name: 'Free Games section renders',
      run: () => {
        assert.ok(html.includes('Free Games'), 'Free Games header missing');
        assert.ok(html.includes('Fortnite'), 'Free game title missing');
        assert.ok(html.includes('Free to download'), 'Free label missing');
        assert.ok(html.includes('Get It Free'), 'Free game button missing');
      },
    },
    {
      name: 'Recommended For Your Family section renders',
      run: () => {
        assert.ok(html.includes('Recommended For Your Family'), 'Recommended header missing');
        assert.ok(html.includes('Alex (Kid)'), 'Profile name missing');
        assert.ok(html.includes('Racing'), 'Recommendation reason missing');
        assert.ok(html.includes('Age appropriate'), 'Recommendation reason missing');
      },
    },
    {
      name: 'Price Watch section renders',
      run: () => {
        assert.ok(html.includes('Price Watch'), 'Price Watch header missing');
        assert.ok(html.includes('Stardew Valley'), 'Price watch title missing');
        assert.ok(html.includes('USD 35.00'), 'Target price missing');
        assert.ok(html.includes('USD 37.00'), 'Current price missing');
        assert.ok(html.includes('Only USD 2.00 away'), 'Difference label missing');
      },
    },
    {
      name: 'Monitoring Statistics section renders',
      run: () => {
        assert.ok(html.includes('Monitoring Statistics'), 'Statistics header missing');
        assert.ok(html.includes('Execution time'), 'Execution time label missing');
        assert.ok(html.includes('1.2 s'), 'Execution time value missing');
        assert.ok(html.includes('mock'), 'Collector missing');
      },
    },
    {
      name: 'Footer renders',
      run: () => {
        assert.ok(html.includes('Generated automatically by'), 'Footer missing');
        assert.ok(html.includes('Nintendo Switch Games Monitor'), 'Footer brand missing');
      },
    },
    {
      name: 'empty sections disappear gracefully',
      run: () => {
        assert.ok(!emptyHtml.includes('Wishlist Alerts'), 'Empty Wishlist Alerts still shown');
        assert.ok(!emptyHtml.includes('Best Deals'), 'Empty Best Deals still shown');
        assert.ok(!emptyHtml.includes('Free Games'), 'Empty Free Games still shown');
        assert.ok(
          !emptyHtml.includes('Recommended For Your Family'),
          'Empty Recommended still shown',
        );
        assert.ok(!emptyHtml.includes('Price Watch'), 'Empty Price Watch still shown');
        assert.ok(!emptyHtml.includes('Monitoring Statistics'), 'Hidden statistics still shown');
        assert.ok(emptyHtml.includes('Today\u2019s Summary'), 'Summary should always render');
        assert.ok(
          emptyHtml.includes('Generated automatically by'),
          'Footer should always render',
        );
      },
    },
    {
      name: 'Email can be captured by mock provider',
      run: async () => {
        const provider = new MockEmailProvider({ logToConsole: false });
        await provider.sendEmail({ subject: 'Test Subject', html });
        const last = provider.getLastEmail();
        assert.ok(last, 'Mock provider captured no email');
        assert.strictEqual(last.subject, 'Test Subject');
        assert.strictEqual(last.html, html);
        assert.strictEqual(provider.getSentEmails().length, 1);
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll email rendering checks passed.');
}

if (require.main === module) {
  validateEmailRendering().catch((error: unknown) => {
    console.error('Email validation failed:', error);
    process.exitCode = 1;
  });
}
