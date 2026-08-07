import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DealHistory, Game, GameAnalysis, MonitorResult } from '../models';
import {
  buildMonitorReportData,
  generateMonitorReportHtml,
  generateMonitorReportMarkdown,
  MonitorReportData,
} from './monitor-report-generator';
import { writeMonitorReports } from './report-writer';

interface Check {
  name: string;
  run: () => void;
}

async function runChecks(checks: Check[]): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      check.run();
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

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Mario Kart 8 Deluxe',
    platform: 'Nintendo Switch',
    currentPrice: 34.99,
    originalPrice: 59.99,
    currency: 'EUR',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game, wishlistMatch?: GameAnalysis['wishlistMatch']): GameAnalysis {
  const analysis: GameAnalysis = {
    game,
    familyMatches: [],
    dealScore: { score: 100, reasons: ['Age appropriate for the family'] },
  };
  if (wishlistMatch !== undefined) {
    analysis.wishlistMatch = wishlistMatch;
  } else if (game.id === 'game-1') {
    analysis.familyMatches = [
      { profileName: 'Alex (Kid)', matched: true, reasons: ['Age appropriate'] },
      { profileName: 'Maya (Teen)', matched: false, reasons: [] },
    ];
    analysis.wishlistMatch = {
      matched: true,
      wishlistItem: { gameTitle: 'Mario Kart 8 Deluxe', targetPrice: 39.99, notifyOnAnyDiscount: false },
      priceTargetReached: true,
      effectiveTargetPrice: 39.99,
      targetPriceOrigin: 'configured',
    };
  }
  return analysis;
}

function sampleResult(): MonitorResult {
  const marioKart = makeGame({ id: 'game-1', currentPrice: 34.99 });
  const fortnite = makeGame({ id: 'game-2', title: 'Fortnite', currentPrice: 0, originalPrice: 0 });
  const odyssey = makeGame({ id: 'game-5', title: 'Super Mario Odyssey', currentPrice: 41.99 });
  const fallGuys = makeGame({ id: 'game-3', title: 'Fall Guys', currentPrice: 29.99 });
  const chess = makeGame({ id: 'game-4', title: 'Chess', currentPrice: 9.99 });
  const stardew = makeGame({ id: 'game-6', title: 'Stardew Valley', currentPrice: 37 });
  const stardewAnalysis = makeAnalysis(stardew, {
    matched: true,
    wishlistItem: { gameTitle: 'Stardew Valley', notifyOnAnyDiscount: false },
    priceTargetReached: false,
    effectiveTargetPrice: 35.99,
    targetPriceOrigin: 'auto',
  });

  const analyses = [
    makeAnalysis(marioKart),
    makeAnalysis(fortnite),
    makeAnalysis(odyssey),
    makeAnalysis(fallGuys),
    makeAnalysis(chess),
    stardewAnalysis,
  ];
  const reportedAnalyses = [makeAnalysis(marioKart), makeAnalysis(fortnite), makeAnalysis(odyssey)];

  const dealHistory: DealHistory = {
    entries: [
      {
        gameTitle: 'Chess',
        firstSeenOnSale: '2026-07-28T00:00:00.000Z',
        lastSeenOnSale: '2026-08-01T00:00:00.000Z',
        firstNotified: '2026-07-28T00:00:00.000Z',
        lastNotified: '2026-07-28T00:00:00.000Z',
        lastNotifiedPrice: 9.99,
        notificationCount: 1,
        currentlyOnSale: true,
      },
      {
        gameTitle: 'Fall Guys',
        firstSeenOnSale: '2026-07-30T00:00:00.000Z',
        lastSeenOnSale: '2026-07-31T00:00:00.000Z',
        firstNotified: '2026-07-30T00:00:00.000Z',
        lastNotified: '2026-07-30T00:00:00.000Z',
        notificationCount: 1,
        currentlyOnSale: false,
      },
    ],
  };

  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    collector: 'mock',
    currency: 'EUR',
    minDealScore: 80,
    defaultWishlistDiscountPercent: 40,
    executionTimeMs: 1234,
    analyzedCount: analyses.length,
    potentialMatchCount: 4,
    reportedCount: reportedAnalyses.length,
    skippedByCooldownCount: 1,
    analyses,
    reportedAnalyses,
    skippedByCooldownAnalyses: [makeAnalysis(fallGuys)],
    skippedByScoreAnalyses: [makeAnalysis(chess)],
    dealHistory,
    wishlist: {
      items: [
        { gameTitle: 'Stardew Valley', targetPrice: 35.99, notifyOnAnyDiscount: false },
        { gameTitle: 'Super Mario RPG', notifyOnAnyDiscount: false },
        { gameTitle: "Luigi's Mansion 3", targetPrice: 44.99, notifyOnAnyDiscount: false },
      ],
    },
    monitoredTitles: ['Mario Kart 8 Deluxe', 'Fortnite', 'Super Mario Odyssey', 'Fall Guys', 'Chess', 'Stardew Valley', "Luigi's Mansion 3"],
    wishlistGames: [
      makeGame({
        id: 'game-7',
        title: "Luigi's Mansion 3",
        currentPrice: 59.99,
        originalPrice: 59.99,
      }),
    ],
  };
}

function emptyResult(): MonitorResult {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    collector: 'mock',
    currency: 'EUR',
    minDealScore: 80,
    defaultWishlistDiscountPercent: 40,
    executionTimeMs: 500,
    analyzedCount: 0,
    potentialMatchCount: 0,
    reportedCount: 0,
    skippedByCooldownCount: 0,
    analyses: [],
    reportedAnalyses: [],
    skippedByCooldownAnalyses: [],
    skippedByScoreAnalyses: [],
    dealHistory: { entries: [] },
    wishlist: { items: [] },
    monitoredTitles: [],
    wishlistGames: [],
  };
}

const sampleData: MonitorReportData = buildMonitorReportData(sampleResult());
const markdown = generateMonitorReportMarkdown(sampleData);
const html = generateMonitorReportHtml(sampleData);
const emptyData: MonitorReportData = buildMonitorReportData(emptyResult());

const checks: Check[] = [
  {
    name: 'markdown report is generated with digest header',
    run: () => {
      assert.ok(typeof markdown === 'string' && markdown.length > 0, 'Markdown is empty');
      assert.ok(markdown.includes('# 🎮 Nintendo Switch Daily Digest'), 'Header missing');
      assert.ok(markdown.includes('- **Date:**'), 'Date missing');
      assert.ok(markdown.includes('- **Collector:** mock'), 'Collector missing');
      assert.ok(markdown.includes("## 📊 Today's Summary"), 'Summary section missing');
    },
  },
  {
    name: 'markdown summary table has correct values',
    run: () => {
      assert.ok(markdown.includes('| 🔥 New Deals | 3 |'), 'New Deals wrong');
      assert.ok(markdown.includes('| ⭐ Wishlist Games on Sale | 1 |'), 'Wishlist on Sale wrong');
      assert.ok(markdown.includes('| 🕒 Still Active Deals | 1 |'), 'Still Active wrong');
      assert.ok(markdown.includes('| 🏷 Biggest Discount | -83% (Chess) |'), 'Biggest Discount wrong');
      assert.ok(markdown.includes('| 📦 Games Checked | 6 |'), 'Games checked wrong');
    },
  },
  {
    name: 'markdown wishlist watch renders with statuses',
    run: () => {
      assert.ok(markdown.includes("## 👀 Wishlist Watch"), 'Wishlist Watch section missing');
      assert.ok(markdown.includes('🔥 On Sale — Stardew Valley'), 'On Sale status missing');
      assert.ok(markdown.includes('⚪ Not currently tracked — Super Mario RPG'), 'Not tracked status missing');
      assert.ok(
        markdown.includes('Add this game to the monitored catalog'),
        'Not tracked hint missing',
      );
      assert.ok(
        markdown.includes("⚪ Full Price — Luigi's Mansion 3"),
        'Monitored full-price status missing',
      );
      assert.ok(markdown.includes('**Current price:** EUR 37.00'), 'Wishlist watch current price missing');
      assert.ok(markdown.includes('**Target price:** EUR 35.99'), 'Wishlist watch target price missing');
      assert.ok(
        markdown.includes("**Current price:** EUR 59.99"),
        'Full-price wishlist game must still show its current price',
      );
    },
  },
  {
    name: 'markdown still on sale renders with duration',
    run: () => {
      assert.ok(markdown.includes('## 🕒 Still On Sale'), 'Still On Sale section missing');
      assert.ok(markdown.includes('Chess'), 'Still on sale game missing');
      assert.ok(markdown.includes('**Current price:** EUR 9.99'), 'Still on sale current price missing');
      assert.ok(markdown.includes('**Original price:** EUR 59.99'), 'Still on sale original price missing');
      assert.ok(markdown.includes('**Discount:** 83%'), 'Still on sale discount missing');
      assert.ok(markdown.includes('**On sale for:** 4 day(s)'), 'Still on sale days missing');
      assert.ok(markdown.includes('[View Deal]('), 'Still on sale link missing');
    },
  },
  {
    name: 'markdown wishlist alerts render',
    run: () => {
      assert.ok(markdown.includes('## 🎯 Wishlist Alerts'), 'Wishlist Alerts section missing');
      assert.ok(markdown.includes('Mario Kart 8 Deluxe'), 'Alert title missing');
      assert.ok(markdown.includes('**Configured target:** EUR 39.99'), 'Configured target missing');
      assert.ok(markdown.includes('**Target reached:** YES'), 'Target reached missing');
      assert.ok(markdown.includes('[View Deal]('), 'Store link missing');
    },
  },
  {
    name: 'markdown best deals render',
    run: () => {
      assert.ok(markdown.includes('## 🔥 Best Deals'), 'Best Deals section missing');
      assert.ok(markdown.includes('Super Mario Odyssey'), 'Best deal title missing');
      assert.ok(markdown.includes('**Deal score:** 100'), 'Deal score missing');
      assert.ok(markdown.includes('**Why recommended:**'), 'Why recommended missing');
    },
  },
  {
    name: 'markdown free games render',
    run: () => {
      assert.ok(markdown.includes('## 🆓 Free Family Games'), 'Free Family Games section missing');
      assert.ok(markdown.includes('Fortnite'), 'Free game missing');
      assert.ok(markdown.includes('Free to download'), 'Free label missing');
    },
  },
  {
    name: 'markdown family recommendations render',
    run: () => {
      assert.ok(markdown.includes('## ⭐ Recommended For Your Family'), 'Recommendations missing');
      assert.ok(markdown.includes('### Mario Kart 8 Deluxe'), 'Recommended game title missing');
      assert.ok(markdown.includes('- ✓ Alex (Kid)'), 'Matching member missing');
    },
  },
  {
    name: 'markdown price watch renders',
    run: () => {
      assert.ok(markdown.includes('## 📉 Price Watch'), 'Price Watch section missing');
      assert.ok(markdown.includes('Stardew Valley'), 'Price watch game missing');
      assert.ok(markdown.includes('**Target:** EUR 35.99'), 'Price watch target missing');
      assert.ok(markdown.includes('**Current:** EUR 37.00'), 'Price watch current missing');
      assert.ok(markdown.includes('Only EUR 1.01 away'), 'Price watch difference missing');
    },
  },
  {
    name: 'markdown statistics and footer render',
    run: () => {
      assert.ok(markdown.includes('## 📈 Monitoring Statistics'), 'Statistics section missing');
      assert.ok(markdown.includes('| Collector | mock |'), 'Collector stat missing');
      assert.ok(markdown.includes('| Execution time | 1.2 s |'), 'Execution time missing');
      assert.ok(markdown.includes('## Skipped Games'), 'Skipped section missing');
      assert.ok(markdown.includes('Fall Guys'), 'Skipped cooldown game missing');
      assert.ok(markdown.includes('Chess'), 'Skipped score game missing');
      assert.ok(markdown.includes('Generated automatically by **NintendoSwitchGamesMonitor**'), 'Footer missing');
    },
  },
  {
    name: 'html report is generated',
    run: () => {
      assert.ok(typeof html === 'string' && html.length > 0, 'HTML is empty');
      assert.ok(html.trim().startsWith('<!DOCTYPE html>'), 'Missing doctype');
      assert.ok(html.includes('Nintendo Switch Daily Digest'), 'Report title missing');
      assert.ok(html.includes('Wishlist Alerts'), 'Wishlist Alerts missing in HTML');
      assert.ok(html.includes('Wishlist Watch'), 'Wishlist Watch missing in HTML');
      assert.ok(html.includes('Still On Sale'), 'Still On Sale missing in HTML');
      assert.ok(html.includes('Best Deals'), 'Best Deals missing in HTML');
      assert.ok(html.includes('Free Family Games'), 'Free Family Games missing in HTML');
      assert.ok(html.includes('Recommended For Your Family'), 'Recommendations missing in HTML');
      assert.ok(html.includes('Price Watch'), 'Price Watch missing in HTML');
      assert.ok(html.includes('Monitoring Statistics'), 'Statistics missing in HTML');
      assert.ok(html.includes('Skipped Games'), 'Skipped section missing in HTML');
      assert.ok(html.includes('Mario Kart 8 Deluxe'), 'Reported game missing in HTML');
    },
  },
  {
    name: 'buildMonitorReportData builds a digest from a monitor result',
    run: () => {
      const data = buildMonitorReportData(sampleResult());
      assert.strictEqual(data.digest.summary.gamesChecked, 6);
      assert.strictEqual(data.digest.summary.newDeals, 3);
      assert.strictEqual(data.digest.wishlistWatch.length, 3);
      assert.strictEqual(data.digest.wishlistWatch[0].status, 'on-sale');
      assert.strictEqual(data.digest.wishlistWatch[1].status, 'not-monitored');
      assert.strictEqual(data.digest.wishlistWatch[2].status, 'full-price');
      assert.strictEqual(data.digest.wishlistWatch[2].currentPrice, 59.99);
      assert.strictEqual(data.digest.stillOnSale.length, 1);
      assert.strictEqual(data.digest.stillOnSale[0].title, 'Chess');
      assert.strictEqual(data.digest.wishlistAlerts.length, 1);
      assert.strictEqual(data.digest.bestDeals.length, 1);
      assert.strictEqual(data.digest.freeGames.length, 1);
      assert.strictEqual(data.digest.recommendations.length, 1);
      assert.strictEqual(data.digest.priceWatch.length, 1);
      assert.strictEqual(data.skippedByCooldown.length, 1);
      assert.strictEqual(data.skippedByScore.length, 1);
    },
  },
  {
    name: 'empty results handled correctly',
    run: () => {
      const md = generateMonitorReportMarkdown(emptyData);
      const h = generateMonitorReportHtml(emptyData);
      assert.ok(md.includes('Generated automatically by **NintendoSwitchGamesMonitor**'), 'Markdown footer missing');
      assert.ok(!md.includes('## 🎯 Wishlist Alerts'), 'Empty wishlist alerts shown');
      assert.ok(md.includes("## 👀 Wishlist Watch"), 'Wishlist Watch must always show');
      assert.ok(!md.includes('## 🕒 Still On Sale'), 'Empty still on sale shown');
      assert.ok(!md.includes('## 🔥 Best Deals'), 'Empty best deals shown');
      assert.ok(!md.includes('## 🆓 Free Family Games'), 'Empty free family games shown');
      assert.ok(!md.includes('## ⭐ Recommended For Your Family'), 'Empty recommendations shown');
      assert.ok(!md.includes('## 📉 Price Watch'), 'Empty price watch shown');
      assert.ok(h.trim().startsWith('<!DOCTYPE html>'), 'Empty HTML missing doctype');
      assert.ok(h.includes('Today\u2019s Summary'), 'Empty HTML summary missing');
    },
  },
  {
    name: 'report files are written without overwriting',
    run: () => {
      const dir = path.join(os.tmpdir(), `nsm-reports-${Date.now()}-${Math.random()}`);
      try {
        const first = writeMonitorReports(markdown, html, { outDir: dir, stamp: '2026-08-01-1200' });
        const second = writeMonitorReports(markdown, html, { outDir: dir, stamp: '2026-08-01-1200' });
        assert.ok(fs.existsSync(first.markdownFile), 'First markdown missing');
        assert.ok(fs.existsSync(first.htmlFile), 'First html missing');
        assert.ok(first.markdownFile.endsWith('monitor-2026-08-01-1200.md'), 'Unexpected first file name');
        assert.ok(second.markdownFile.endsWith('monitor-2026-08-01-1200-2.md'), 'Second file should be suffixed');
        assert.notStrictEqual(first.markdownFile, second.markdownFile);
        assert.ok(fs.existsSync(second.markdownFile), 'Second markdown missing');
        assert.ok(fs.existsSync(second.htmlFile), 'Second html missing');
        assert.strictEqual(fs.readFileSync(first.markdownFile, 'utf8'), markdown);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];

export async function validateReports(): Promise<void> {
  await runChecks(checks);
  console.log('\nAll report validation checks passed.');
}

if (require.main === module) {
  validateReports().catch((error: unknown) => {
    console.error('Report validation failed:', error);
    process.exitCode = 1;
  });
}
