import 'dotenv/config';

import * as assert from 'node:assert';

import { DailyDigest } from '../models';
import { renderDigestEmail } from './email-renderer';
import {
  renderBestDealsSection,
  renderRecommendedSection,
  renderStillOnSaleSection,
  renderWishlistAlertsSection,
  renderWishlistWatchSection,
} from './email-template';
import { MockEmailProvider } from './mock-email-provider';

function buildSampleDigest(): DailyDigest {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    dateLabel: 'Saturday, August 1, 2026',
    collector: 'mock',
    currency: 'USD',
    defaultWishlistDiscountPercent: 40,
    summary: {
      bestDeals: 3,
      historicalLows: 1,
      freeGames: 1,
      wishlistGamesOnSale: 1,
      stillActiveDeals: 1,
      biggestDiscountPercent: 33,
      biggestDiscountTitle: 'Breath of the Wild',
      gamesChecked: 5,
    },
    stillOnSale: [
      {
        title: 'Super Mario Odyssey',
        currentPrice: 39.99,
        originalPrice: 59.99,
        discountPercent: 33,
        firstReportedAt: '2026-07-20T00:00:00.000Z',
        daysOnSale: 12,
        storeUrl: 'https://www.nintendo.com/store/products/super-mario-odyssey/',
      },
    ],
    wishlistWatch: [
      {
        title: 'Mario Kart 8 Deluxe',
        status: 'target-reached',
        currentPrice: 39.99,
        originalPrice: 59.99,
        targetPrice: 44.99,
        discountPercent: 33,
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/?ref=test',
      },
      {
        title: 'Super Mario RPG',
        status: 'not-monitored',
      },
      {
        title: "Luigi's Mansion 3",
        status: 'full-price',
        currentPrice: 59.99,
        originalPrice: 59.99,
        discountPercent: 0,
        targetPrice: 44.99,
        storeUrl: 'https://www.nintendo.com/store/products/luigis-mansion-3/',
      },
    ],
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
          { name: 'Alex (Kid)', reasons: ['Racing', 'Age appropriate'] },
          { name: 'Sam (Teen)', reasons: ['Racing'] },
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
      bestDeals: 0,
      historicalLows: 0,
      freeGames: 0,
      wishlistGamesOnSale: 0,
      stillActiveDeals: 0,
      biggestDiscountPercent: 0,
      gamesChecked: 0,
    },
    stillOnSale: [],
    wishlistWatch: [],
    wishlistAlerts: [],
    bestDeals: [],
    freeGames: [],
    historicalLows: [],
    recommendations: [],
    priceWatch: [],
  };
}

function manyCardsDigest(overrides: {
  stillOnSale?: number;
  bestDeals?: number;
  recommendations?: 'none' | 'members' | 'entire-family';
} = {}): DailyDigest {
  const base = buildSampleDigest();
  const stillCount = overrides.stillOnSale ?? 0;
  const dealsCount = overrides.bestDeals ?? 0;
  base.stillOnSale = Array.from({ length: stillCount }, (_, index) => ({
    title: `Still Deal ${index + 1}`,
    currentPrice: 39.99,
    originalPrice: 59.99,
    discountPercent: 33,
    firstReportedAt: '2026-07-20T00:00:00.000Z',
    daysOnSale: 12,
    storeUrl: 'https://www.nintendo.com/store/products/demo/',
  }));
  base.bestDeals = Array.from({ length: dealsCount }, (_, index) => ({
    title: `Best Deal ${index + 1}`,
    currentPrice: 39.99,
    originalPrice: 59.99,
    discountPercent: 33,
    score: 92,
    reasons: ['Great value'],
    ageRating: 'E',
    storeUrl: 'https://www.nintendo.com/store/products/demo/',
  }));
  if (overrides.recommendations === 'members') {
    base.recommendations = [
      {
        title: 'Mario Wonder',
        currentPrice: 49.99,
        originalPrice: 59.99,
        discountPercent: 17,
        isFree: false,
        onWishlist: false,
        entireFamily: false,
        members: [
          { name: 'Yaara', reasons: ['Adventure'] },
          { name: 'Barak', reasons: ['Action'] },
          { name: 'Alon', reasons: ['Action'] },
        ],
      },
    ];
  } else if (overrides.recommendations === 'entire-family') {
    base.recommendations = [
      {
        title: 'Mario Wonder',
        currentPrice: 49.99,
        originalPrice: 59.99,
        discountPercent: 17,
        isFree: false,
        onWishlist: false,
        entireFamily: true,
        members: [
          { name: 'Yaara', reasons: ['Adventure'] },
          { name: 'Barak', reasons: ['Action'] },
          { name: 'Alon', reasons: ['Action'] },
        ],
      },
    ];
  }
  return base;
}

function hasTwoColumnLayout(sectionHtml: string): boolean {
  return sectionHtml.includes('table-layout:fixed') && sectionHtml.includes('width="50%"');
}

function hasMobileCollapseCss(sectionHtml: string): boolean {
  return (
    sectionHtml.includes('@media only screen and (max-width: 600px)') &&
    sectionHtml.includes('digest-grid-cell')
  );
}

/**
 * Extracts every `class="digest-card"` outer table height in order.
 * Card heights are now computed PER SECTION from that section's own tallest
 * card (never a shared global constant), so all cards within one section must
 * share an identical height while different sections may differ.
 */
function cardHeights(html: string): number[] {
  const heights: number[] = [];
  const re = /class="digest-card"[^>]*height="(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    heights.push(parseInt(match[1], 10));
  }
  return heights;
}

/** Counts cards that carry exactly the given height. */
function cardHeightCount(html: string, height: number): number {
  return cardHeights(html).filter((h) => h === height).length;
}

function isUniform(heights: number[]): boolean {
  return heights.length === 0 || heights.every((h) => h === heights[0]);
}

/**
 * Counts cards that carry the height attribute with inline `height:100%;`.
 * Together with `hasRowStretchStructure` this proves every card stretches its
 * chrome to the shared section height so no card ends shorter than its mate.
 */
function cardStretchCount(html: string, height: number): number {
  const re = new RegExp(`height="${height}"[^>]*height:100%;`, 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    count += 1;
  }
  return count;
}

/**
 * True when the section emits its cards as siblings of a single grid <tr>, with
 * each card being a direct child of its own <td> (no <div> between the cell and
 * the card table). This is what guarantees row-level equal height: every card
 * in the row occupies one cell and inherits the shared stretched row.
 */
function hasRowStretchStructure(sectionHtml: string): boolean {
  return (
    sectionHtml.includes('class="digest-grid"') &&
    sectionHtml.includes('table-layout:fixed') &&
    sectionHtml.includes('class="digest-grid-cell"') &&
    sectionHtml.includes('class="digest-card"') &&
    sectionHtml.includes('height:100%;') &&
    // no <div> bookending the card (a <div> would give a cell its own box)
    !/digest-grid-cell"[^>]*><div[^>]*><table/.test(sectionHtml)
  );
}

function countGridRows(sectionHtml: string): number {
  const re = /<tr[^>]*>\s*<td class="digest-grid-cell"/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sectionHtml)) !== null) {
    count += 1;
  }
  return count;
}

/** Counts the sibling grid cells that wrap a digest-card table (the two-column cells). */
function countCardCells(sectionHtml: string): number {
  const re = /<td class="digest-grid-cell"[^>]*><table role="presentation"[^>]*class="digest-card"/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sectionHtml)) !== null) {
    count += 1;
  }
  return count;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function hasStat(html: string, value: string | number, label: string): boolean {
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
        assert.ok(hasStat(html, 3, '🔥 Best Deals'), 'Best Deals value wrong');
        assert.ok(hasStat(html, 1, '⭐ Historical Lows'), 'Historical Lows value wrong');
        assert.ok(hasStat(html, 1, '🆓 Free Games'), 'Free Games value wrong');
        assert.ok(hasStat(html, 1, '⭐ Wishlist on Sale'), 'Wishlist on Sale value wrong');
        assert.ok(hasStat(html, 1, '🕒 Still Active'), 'Still Active value wrong');
        assert.ok(hasStat(html, '-33% Breath of the Wild', '🏷 Biggest Discount'), 'Biggest Discount value wrong');
        assert.ok(hasStat(html, 5, '📦 Games Checked'), 'Games checked value wrong');
      },
    },
    {
      name: 'Wishlist Watch section renders',
      run: () => {
        assert.ok(html.includes('Wishlist Watch'), 'Wishlist Watch header missing');
        assert.ok(html.includes('Target Price Reached'), 'Target Reached badge missing');
        assert.ok(html.includes('Not currently tracked'), 'Not tracked badge missing');
        assert.ok(html.includes('Mario Kart 8'), 'Wishlist watch game missing');
        assert.ok(html.includes('Super Mario RPG'), 'Not monitored game missing');
        assert.ok(html.includes('Luigi&#39;s Mansion 3'), 'Full-price monitored game missing');
        assert.ok(html.includes('Current Price:'), 'Current Price label missing');
        assert.ok(html.includes('Regular:'), 'Regular Price label missing');
        assert.ok(html.includes('Full Price'), 'Full Price badge missing');
        assert.ok(
          html.includes('Add this game to the monitored catalog to enable price tracking'),
          'Not tracked hint missing',
        );
      },
    },
    {
      name: 'Still On Sale section renders',
      run: () => {
        assert.ok(html.includes('Still On Sale'), 'Still On Sale header missing');
        assert.ok(html.includes('Super Mario Odyssey'), 'Still on sale game missing');
        assert.ok(html.includes('12 days on sale'), 'Days on sale missing');
        assert.ok(html.includes('First reported'), 'First reported missing');
        assert.ok(html.includes('-33%'), 'Discount badge missing');
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
        assert.ok(html.includes('Deal Score: 92'), 'Deal score missing');
        assert.ok(html.includes('Age appropriate for the family'), 'Reason missing');
        assert.ok(html.includes('USD 39.99'), 'Current price missing');
        assert.ok(html.includes('View Deal'), 'Best deal button missing');
      },
    },
    {
      name: 'every deal section uses a single, separated price and discount format',
      run: () => {
        const digest = manyCardsDigest({ bestDeals: 1, stillOnSale: 1, recommendations: 'members' });
        const sections: string[] = [
          renderBestDealsSection(digest.bestDeals, 'USD'),
          renderWishlistAlertsSection(digest.wishlistAlerts, 'USD', digest),
          renderStillOnSaleSection(digest.stillOnSale, 'USD'),
          renderRecommendedSection(digest.recommendations, 'USD'),
        ];
        for (const html of sections) {
          assert.ok(html.includes('→'), 'Prices must be separated by an arrow');
          assert.ok(
            countOccurrences(html, 'USD ') >= 2,
            'Both original and current prices must remain visible',
          );
          assert.ok(html.includes('-33%') || html.includes('-17%'), 'Discount badge must be present');
          assert.strictEqual(
            countOccurrences(html, '>-33%</span>') + countOccurrences(html, '>-17%</span>'),
            1,
            'Discount percentage must appear exactly once (no duplicate or attached badge)',
          );
          assert.ok(
            !html.includes('USD 59.99USD 39.99'),
            'Prices must not be concatenated without a separator',
          );
          assert.ok(
            !/-33%>?\s*-\d+%/.test(html),
            'Two discount badges must never appear together',
          );
          assert.ok(
            !/USD [\d.]+→USD [\d.]+-\d+%/.test(html),
            'Discount badge must not be attached directly to the price',
          );
        }
      },
    },
    {
      name: 'Best Deal card keeps its deal score once',
      run: () => {
        const sectionHtml = renderBestDealsSection(manyCardsDigest({ bestDeals: 1 }).bestDeals, 'USD');
        assert.ok(sectionHtml.includes('Deal Score: 92'), 'Deal score must remain present');
        assert.strictEqual(
          countOccurrences(sectionHtml, '>Deal Score: 92</span>'),
          1,
          'Deal score must appear exactly once',
        );
      },
    },
    {
      name: 'price formatting separates original and current and keeps the score',
      run: () => {
        const sectionHtml = renderBestDealsSection(manyCardsDigest({ bestDeals: 1 }).bestDeals, 'USD');
        assert.ok(sectionHtml.includes('→'), 'Prices must be visually separated');
        assert.ok(sectionHtml.includes('USD 39.99'), 'Current price must remain visible');
        assert.ok(sectionHtml.includes('Deal Score: 92'), 'Deal score must remain present');
        assert.ok(
          !sectionHtml.includes('USD 59.99USD 39.99'),
          'Prices must not be concatenated without a separator',
        );
      },
    },
    {
      name: 'Free Games section renders',
      run: () => {
        assert.ok(html.includes('Free Family Games'), 'Free Games header missing');
        assert.ok(html.includes('Fortnite'), 'Free game title missing');
        assert.ok(html.includes('Free to download'), 'Free label missing');
        assert.ok(html.includes('Get It Free'), 'Free game button missing');
      },
    },
    {
      name: 'Recommended For Your Family section renders',
      run: () => {
        assert.ok(html.includes('Recommended For Your Family'), 'Recommended header missing');
        assert.ok(html.includes('Mario Kart 8 Deluxe'), 'Recommended game title missing');
        assert.ok(html.includes('Alex (Kid)'), 'Profile name missing');
        assert.ok(html.includes('Sam (Teen)'), 'Second matching member missing');
        assert.ok(html.includes('Racing'), 'Recommendation reason missing');
        assert.ok(html.includes('Age appropriate'), 'Recommendation reason missing');
        assert.ok(html.includes('Recommended for:'), 'Recommended for label missing');
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
        assert.ok(!emptyHtml.includes('>🔥 Best Deals</td>'), 'Empty Best Deals still shown');
        assert.ok(!emptyHtml.includes('>⭐ Historical Lows</td>'), 'Empty Historical Lows still shown');
        assert.ok(!emptyHtml.includes('Free Family Games'), 'Empty Free Games still shown');
        assert.ok(
          !emptyHtml.includes('Recommended For Your Family'),
          'Empty Recommended still shown',
        );
        assert.ok(!emptyHtml.includes('Price Watch'), 'Empty Price Watch still shown');
        assert.ok(!emptyHtml.includes('Still On Sale'), 'Empty Still On Sale still shown');
        assert.ok(!emptyHtml.includes('Monitoring Statistics'), 'Hidden statistics still shown');
        assert.ok(emptyHtml.includes('Wishlist Watch'), 'Wishlist Watch should always render');
        assert.ok(emptyHtml.includes('Today\u2019s Summary'), 'Summary should always render');
        assert.ok(
          emptyHtml.includes('Generated automatically by'),
          'Footer should always render',
        );
      },
    },
    {
      name: 'short lists use a two-column grid that collapses on mobile',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ bestDeals: 3, stillOnSale: 3 }));
        assert.ok(hasTwoColumnLayout(html), 'Even short lists must use two columns on desktop');
        assert.ok(hasMobileCollapseCss(html), 'Grid must collapse to a single column on mobile');
      },
    },
    {
      name: 'compact sections (Still On Sale / Recommended / Wishlist Watch) keep 2 columns on desktop and 1 on mobile',
      run: () => {
        const digest = manyCardsDigest({ stillOnSale: 4, recommendations: 'members' });
        digest.wishlistWatch = [
          { title: 'Stardew Valley', status: 'full-price', currentPrice: 14.99 },
          { title: 'Super Smash Bros', status: 'full-price', currentPrice: 59.99 },
        ];
        const html = renderDigestEmail(digest);
        assert.ok(hasTwoColumnLayout(html), 'Compact sections must stay two-column on desktop');
        assert.ok(hasRowStretchStructure(html), 'Compact sections must use the shared row-stretch structure');
        assert.ok(hasMobileCollapseCss(html), 'Compact sections must collapse to a single column on mobile');
      },
    },
    {
      name: 'long Best Deals list uses two columns',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ bestDeals: 7 }));
        assert.ok(hasTwoColumnLayout(html), '7 best deals must use two columns');
      },
    },
    {
      name: 'long Still On Sale list uses two columns',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ stillOnSale: 7 }));
        assert.ok(hasTwoColumnLayout(html), '7 still-on-sale deals must use two columns');
      },
    },
    {
      name: 'two-column grid is used regardless of item count for still on sale',
      run: () => {
        const html6 = renderDigestEmail(manyCardsDigest({ stillOnSale: 6 }));
        const html7 = renderDigestEmail(manyCardsDigest({ stillOnSale: 7 }));
        assert.ok(hasTwoColumnLayout(html6), '6 still-on-sale deals must use two columns');
        assert.ok(hasTwoColumnLayout(html7), '7 still-on-sale deals must use two columns');
      },
    },
    {
      name: 'each section sizes itself to its own tallest card (per-section, not global)',
      run: () => {
        const digest = manyCardsDigest({ bestDeals: 4, stillOnSale: 4, recommendations: 'members' });
        digest.bestDeals[0].reasons = ['Reason one', 'Reason two'];
        digest.stillOnSale.forEach((s) => {
          s.firstReportedAt = '2026-07-20T00:00:00.000Z';
        });
        const bestHtml = renderBestDealsSection(digest.bestDeals, 'USD');
        const stillHtml = renderStillOnSaleSection(digest.stillOnSale, 'USD');
        const recommendedHtml = renderRecommendedSection(digest.recommendations, 'USD');

        const bestHeights = cardHeights(bestHtml);
        const stillHeights = cardHeights(stillHtml);
        const recommendedHeights = cardHeights(recommendedHtml);

        assert.strictEqual(
          bestHeights.length,
          digest.bestDeals.length,
          'Every Best Deal card must be present with a height attribute',
        );
        assert.strictEqual(
          stillHeights.length,
          digest.stillOnSale.length,
          'Every Still On Sale card must be present with a height attribute',
        );
        assert.strictEqual(
          recommendedHeights.length,
          digest.recommendations.length,
          'Every Recommended card must be present with a height attribute',
        );
        assert.ok(
          isUniform(bestHeights),
          'All Best Deal cards must share one identical section height',
        );
        assert.ok(
          isUniform(stillHeights),
          'All Still On Sale cards must share one identical section height',
        );
        assert.ok(
          isUniform(recommendedHeights),
          'All Recommended cards must share one identical section height',
        );
        assert.ok(
          cardHeightCount(bestHtml, bestHeights[0]) === bestHeights.length &&
            cardHeightCount(stillHtml, stillHeights[0]) === stillHeights.length &&
            cardHeightCount(recommendedHtml, recommendedHeights[0]) === recommendedHeights.length,
          'Each section applies exactly one shared height to all of its cards',
        );
      },
    },
    {
      name: 'every section produces row-level equal-height cards (sibling cells, no <div> box, height:100%)',
      run: () => {
        const digest = manyCardsDigest({ stillOnSale: 5, bestDeals: 5, recommendations: 'members' });
        const sections = [
          renderBestDealsSection(digest.bestDeals, 'USD'),
          renderStillOnSaleSection(digest.stillOnSale, 'USD'),
          renderRecommendedSection(digest.recommendations, 'USD'),
        ];
        for (const html of sections) {
          assert.ok(
            hasRowStretchStructure(html),
            'Section must place each card as a direct child of its own grid <td> (no <div> wrapper) so cells stretch to the shared row height',
          );
          assert.ok(
            countCardCells(html) >= 2,
            'Section must render cards inside sibling grid cells',
          );
          assert.ok(
            countGridRows(html) >= 1,
            'Section must group cards into shared grid <tr> rows',
          );
        }
      },
    },
    {
      name: 'a long-title Best Deal card (e.g. Call of Sniper) grows the whole Best Deals section uniformly',
      run: () => {
        const digest = manyCardsDigest({ bestDeals: 4 });
        digest.bestDeals[0].title = 'Call of Sniper Combat - WW2';
        digest.bestDeals[0].reasons = ['Reason one', 'Reason two', 'Reason three'];
        digest.bestDeals[0].priceContext = { isLowestRecorded: true, lowestPrice: 7.99 };
        digest.bestDeals[0].quality = { rating: 'good', reason: 'At its historical low' };
        const html = renderBestDealsSection(digest.bestDeals, 'USD');
        const heights = cardHeights(html);
        assert.strictEqual(heights.length, digest.bestDeals.length, 'All Best Deal cards must be present');
        assert.ok(
          isUniform(heights),
          'All Best Deal cards must share the identical section height even when one has a long title',
        );
        assert.ok(
          heights[0] > 0,
          'The long-title section must compute a positive dynamic height (no clipping)',
        );
        assert.ok(
          hasRowStretchStructure(html),
          'A long-title deal must still sit as a direct sibling cell of the shared row',
        );
      },
    },
    {
      name: 'Megabonk / Monster Hunter Stories 2, DOOM / GhostX, Call of Sniper / GhostX rows share equal-height structure',
      run: () => {
        const ghostX = 'The GhostX : Sniper Simulator (Tactical Shooting & Eliminator)';
        const digest = manyCardsDigest({ bestDeals: 6 });
        digest.bestDeals[0].title = 'Megabonk Smash';
        digest.bestDeals[1].title = 'Monster Hunter Stories 2: Wings of Ruin';
        digest.bestDeals[2].title = 'DOOM';
        digest.bestDeals[3].title = ghostX;
        digest.bestDeals[4].title = 'Call of Sniper Combat - WW2';
        digest.bestDeals[5].title = ghostX;
        const html = renderBestDealsSection(digest.bestDeals, 'USD');
        const heights = cardHeights(html);
        assert.ok(
          hasRowStretchStructure(html),
          'Every reported pair must render as sibling digest-card cells in the shared row',
        );
        assert.strictEqual(heights.length, 6, 'All six deal cards must be present');
        assert.ok(
          isUniform(heights),
          'All six cards, including the long-title ghost, must carry the identical section height',
        );
        assert.strictEqual(
          cardHeightCount(html, heights[0]),
          6,
          'The shared height must be applied to exactly every card in the section',
        );
        assert.strictEqual(
          cardStretchCount(html, heights[0]),
          6,
          'Every card must stretch its chrome via height:100% so no card ends shorter than its row mate',
        );
      },
    },
    {
      name: 'GhostX is not duplicated within Best Deals (cross-section appearance is allowed)',
      run: () => {
        const ghostX = 'The GhostX : Sniper Simulator (Tactical Shooting &amp; Eliminator)';
        const digest = manyCardsDigest({ bestDeals: 3 });
        digest.bestDeals[0].title = 'The GhostX : Sniper Simulator (Tactical Shooting & Eliminator)';
        const html = renderBestDealsSection(digest.bestDeals, 'USD');
        assert.strictEqual(
          countOccurrences(html, ghostX),
          1,
          'GhostX must appear exactly once inside its own Best Deals section',
        );
        // A game may legitimately also appear in another section; only the
        // within-section duplication is a bug. Verified here as a structural
        // sibling cell, which cannot double-render a single games array.
        assert.ok(hasRowStretchStructure(html), 'Best Deals row structure remains intact');
      },
    },
    {
      name: 'Wishlist Watch sizes independently to its own cards and stays two-column',
      run: () => {
        const digest = manyCardsDigest({ bestDeals: 1 });
        digest.wishlistWatch = [
          { title: 'Stardew Valley', status: 'full-price', currentPrice: 14.99, targetPrice: 10.49 },
          { title: 'Super Smash Bros', status: 'full-price', currentPrice: 59.99, targetPrice: 41.99 },
        ];
        const bestHtml = renderBestDealsSection(digest.bestDeals, 'USD');
        const wishlistHtml = renderWishlistWatchSection(digest.wishlistWatch, 'USD');
        const wishlistHeights = cardHeights(wishlistHtml);
        assert.ok(
          wishlistHeights.length === digest.wishlistWatch.length,
          'Wishlist Watch cards must each carry a height',
        );
        assert.ok(
          isUniform(wishlistHeights),
          'Wishlist Watch cards must share one section height computed from the Wishlist Watch cards themselves',
        );
        assert.ok(
          wishlistHeights[0] < cardHeights(bestHtml)[0],
          'Wishlist Watch must size independently and stay below the richer Best Deal section height',
        );
        assert.strictEqual(
          cardHeightCount(bestHtml, cardHeights(bestHtml)[0]),
          1,
          'Best Deal cards must use their own independent section height',
        );
        assert.ok(hasTwoColumnLayout(wishlistHtml), 'Wishlist Watch must remain a two-column grid on desktop');
      },
    },
    {
      name: 'digest uses a wide container and wider column gutter',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ stillOnSale: 7 }));
        assert.ok(html.includes('width="720"'), 'Digest container must be 720px wide');
        assert.ok(html.includes('max-width:720px'), 'Digest container max-width must be 720px');
        assert.ok(html.includes('padding-right:10px;') && html.includes('padding-left:10px;'),
          'Two-column grid must use a 10px gutter');
      },
    },
    {
      name: 'recommendations list every matching member under the game',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ recommendations: 'members' }));
        assert.ok(html.includes('Mario Wonder'), 'Recommended game title missing');
        assert.ok(html.includes('Yaara'), 'Member Yaara missing');
        assert.ok(html.includes('Barak'), 'Member Barak missing');
        assert.ok(html.includes('Alon'), 'Member Alon missing');
        assert.ok(html.includes('Recommended for:'), 'Recommended for label missing');
        assert.ok(!html.includes('Entire family'), 'Individual members must not show the entire family label');
      },
    },
    {
      name: 'entire family collapses into a single label with no trailing comma',
      run: () => {
        const html = renderDigestEmail(manyCardsDigest({ recommendations: 'entire-family' }));
        assert.ok(html.includes('Entire family'), 'Entire family label missing');
        assert.ok(!html.includes('Yaara'), 'Individual members must not be repeated when whole family matches');
        assert.ok(!html.includes('Barak'), 'Individual members must not be repeated when whole family matches');
        const labelIndex = html.indexOf('Entire family');
        const after = html.slice(labelIndex + 'Entire family'.length, labelIndex + 'Entire family'.length + 2);
        assert.ok(!after.includes(','), `Entire family label must not be followed by a comma (got "${after.trim()}")`);
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
