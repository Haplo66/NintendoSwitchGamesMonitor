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
    currentPrice: 39.99,
    originalPrice: 59.99,
    currency: 'EUR',
    genres: ['Racing'],
    source: 'test',
    ...overrides,
  };
}

function makeAnalysis(game: Game): GameAnalysis {
  const analysis: GameAnalysis = {
    game,
    familyMatches: [],
    dealScore: { score: 100, reasons: ['Age appropriate for the family'] },
  };
  if (game.id === 'game-1') {
    analysis.familyMatches = [
      { profileName: 'Alex (Kid)', matched: true, reasons: ['Age appropriate'] },
      { profileName: 'Maya (Teen)', matched: false, reasons: [] },
    ];
    analysis.wishlistMatch = {
      matched: true,
      wishlistItem: { id: 'w1', gameTitle: 'Mario Kart 8 Deluxe', notifyOnAnyDiscount: false },
      priceTargetReached: true,
    };
  }
  return analysis;
}

function sampleData(): MonitorReportData {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    collector: 'mock',
    minDealScore: 80,
    gamesCollected: 5,
    gamesAnalyzed: 5,
    reported: [
      makeAnalysis(makeGame()),
      makeAnalysis(makeGame({ id: 'game-2', title: 'Fortnite', currentPrice: 0 })),
    ],
    skippedByCooldown: [makeAnalysis(makeGame({ id: 'game-3', title: 'Fall Guys', currentPrice: 29.99 }))],
    skippedByScore: [makeAnalysis(makeGame({ id: 'game-4', title: 'Chess', currentPrice: 9.99 }))],
  };
}

function emptyData(): MonitorReportData {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    collector: 'mock',
    minDealScore: 80,
    gamesCollected: 3,
    gamesAnalyzed: 3,
    reported: [],
    skippedByCooldown: [],
    skippedByScore: [makeAnalysis(makeGame({ id: 'game-4', title: 'Chess', currentPrice: 9.99 }))],
  };
}

function buildResult(data: MonitorReportData): MonitorResult {
  return {
    generatedAt: data.generatedAt,
    collector: data.collector,
    minDealScore: data.minDealScore,
    analyzedCount: data.gamesAnalyzed,
    reportedCount: data.reported.length,
    skippedByCooldownCount: data.skippedByCooldown.length,
    analyses: [],
    reportedAnalyses: data.reported,
    skippedByCooldownAnalyses: data.skippedByCooldown,
    skippedByScoreAnalyses: data.skippedByScore,
  };
}

const sample = sampleData();
const markdown = generateMonitorReportMarkdown(sample);
const html = generateMonitorReportHtml(sample);

const checks: Check[] = [
  {
    name: 'markdown report is generated',
    run: () => {
      assert.ok(typeof markdown === 'string' && markdown.length > 0, 'Markdown is empty');
      assert.ok(markdown.includes('# NintendoSwitchGamesMonitor'), 'Header missing');
      assert.ok(markdown.includes('2026-08-01T12:00:00.000Z'), 'Timestamp missing');
      assert.ok(markdown.includes('**Collector:** mock'), 'Collector missing');
      assert.ok(markdown.includes('## Summary'), 'Summary section missing');
      assert.ok(markdown.includes('## Top Opportunities'), 'Top opportunities missing');
      assert.ok(markdown.includes('## Skipped'), 'Skipped section missing');
    },
  },
  {
    name: 'markdown includes reported games with details',
    run: () => {
      assert.ok(markdown.includes('Mario Kart 8 Deluxe'), 'Reported title missing');
      assert.ok(markdown.includes('EUR 39.99'), 'Current price missing');
      assert.ok(markdown.includes('EUR 59.99'), 'Original price missing');
      assert.ok(markdown.includes('**Score:** 100'), 'Score missing');
      assert.ok(markdown.includes('Matched "Mario Kart 8 Deluxe"'), 'Wishlist match missing');
      assert.ok(markdown.includes('Alex (Kid)'), 'Family match missing');
      assert.ok(markdown.includes('Age appropriate for the family'), 'Reason missing');
    },
  },
  {
    name: 'markdown includes skipped games',
    run: () => {
      assert.ok(markdown.includes('Low score (below 80)'), 'Low score group missing');
      assert.ok(markdown.includes('Chess'), 'Skipped low-score game missing');
      assert.ok(markdown.includes('Already notified (cooldown)'), 'Cooldown group missing');
      assert.ok(markdown.includes('Fall Guys'), 'Skipped cooldown game missing');
    },
  },
  {
    name: 'html report is generated',
    run: () => {
      assert.ok(typeof html === 'string' && html.length > 0, 'HTML is empty');
      assert.ok(html.trim().startsWith('<!DOCTYPE html>'), 'Missing doctype');
      assert.ok(html.includes('NintendoSwitchGamesMonitor'), 'Report title missing');
      assert.ok(html.includes('Discounted Games'), 'Deal section missing');
      assert.ok(html.includes('Mario Kart 8 Deluxe'), 'Reported game missing in HTML');
      assert.ok(html.includes('Skipped'), 'Skipped section missing in HTML');
    },
  },
  {
    name: 'buildMonitorReportData maps a monitor result',
    run: () => {
      const data = buildMonitorReportData(buildResult(sample));
      assert.strictEqual(data.reported.length, sample.reported.length);
      assert.strictEqual(data.reported[0].game.title, 'Mario Kart 8 Deluxe');
      assert.strictEqual(data.skippedByCooldown.length, 1);
      assert.strictEqual(data.skippedByScore.length, 1);
      assert.strictEqual(data.gamesCollected, 5);
    },
  },
  {
    name: 'empty results handled correctly',
    run: () => {
      const data = emptyData();
      const md = generateMonitorReportMarkdown(data);
      const h = generateMonitorReportHtml(data);
      assert.ok(md.includes('No games worth reporting this run.'), 'Markdown empty-state missing');
      assert.ok(md.includes('None.'), 'Markdown none-state missing');
      assert.ok(h.trim().startsWith('<!DOCTYPE html>'), 'Empty HTML missing doctype');
      assert.ok(h.includes('No games worth reporting this run.'), 'HTML empty-state missing');
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
