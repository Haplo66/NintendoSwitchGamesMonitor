import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Game, GameAnalysis, MonitorResult } from '../models';
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

  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    collector: 'mock',
    currency: 'EUR',
    minDealScore: 80,
    defaultWishlistDiscountPercent: 40,
    executionTimeMs: 1234,
    analyzedCount: analyses.length,
    reportedCount: reportedAnalyses.length,
    skippedByCooldownCount: 1,
    analyses,
    reportedAnalyses,
    skippedByCooldownAnalyses: [makeAnalysis(fallGuys)],
    skippedByScoreAnalyses: [makeAnalysis(chess)],
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
    reportedCount: 0,
    skippedByCooldownCount: 0,
    analyses: [],
    reportedAnalyses: [],
    skippedByCooldownAnalyses: [],
    skippedByScoreAnalyses: [],
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
      assert.ok(markdown.includes('| Games checked | 6 |'), 'Games checked wrong');
      assert.ok(markdown.includes('| Deals found | 2 |'), 'Deals found wrong');
      assert.ok(markdown.includes('| Wishlist hits | 2 |'), 'Wishlist hits wrong');
      assert.ok(markdown.includes('| Free games | 1 |'), 'Free games wrong');
      assert.ok(markdown.includes('| Skipped by cooldown | 1 |'), 'Skipped cooldown wrong');
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
      assert.ok(markdown.includes('## 🆓 Free Games'), 'Free Games section missing');
      assert.ok(markdown.includes('Fortnite'), 'Free game missing');
      assert.ok(markdown.includes('Free to download'), 'Free label missing');
    },
  },
  {
    name: 'markdown family recommendations render',
    run: () => {
      assert.ok(markdown.includes('## ⭐ Recommended For Your Family'), 'Recommendations missing');
      assert.ok(markdown.includes('### Alex (Kid)'), 'Profile name missing');
      assert.ok(markdown.includes('- ✓ Mario Kart 8 Deluxe'), 'Recommendation game missing');
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
      assert.ok(html.includes('Best Deals'), 'Best Deals missing in HTML');
      assert.ok(html.includes('Free Games'), 'Free Games missing in HTML');
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
      assert.strictEqual(data.digest.summary.dealsFound, 2);
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
      assert.ok(!md.includes('## 🔥 Best Deals'), 'Empty best deals shown');
      assert.ok(!md.includes('## 🆓 Free Games'), 'Empty free games shown');
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
