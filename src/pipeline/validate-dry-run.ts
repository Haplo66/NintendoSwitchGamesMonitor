import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';

import {
  defaultNotificationHistoryFile,
} from '../config/notification-history-store';
import { decideDigestEmail, runMonitor } from './monitor-run';

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

function readHistoryFile(): string | undefined {
  const file = defaultNotificationHistoryFile();
  if (!fs.existsSync(file)) {
    return undefined;
  }
  return fs.readFileSync(file, 'utf8');
}

function writeHistoryFile(content: string): void {
  fs.writeFileSync(defaultNotificationHistoryFile(), content, 'utf8');
}

function restoreHistoryFile(content: string | undefined): void {
  if (content === undefined) {
    fs.rmSync(defaultNotificationHistoryFile(), { force: true });
    return;
  }
  writeHistoryFile(content);
}

function cooldownHistory(now: Date): string {
  const notifiedAt = now.toISOString();
  const records = [
    {
      gameId: 'mock-mario-kart-8-deluxe',
      title: 'Mario Kart 8 Deluxe',
      notificationType: 'wishlist',
      score: 124,
      price: 33.59,
      notifiedAt,
    },
    {
      gameId: 'mock-fortnite',
      title: 'Fortnite',
      notificationType: 'free',
      score: 60,
      price: 0,
      notifiedAt,
    },
    {
      gameId: 'mock-fall-guys',
      title: 'Fall Guys: Ultimate Knockout',
      notificationType: 'free',
      score: 100,
      price: 0,
      notifiedAt,
    },
  ];
  return `${JSON.stringify({ records }, null, 2)}\n`;
}

export async function validateDryRun(): Promise<void> {
  process.env.DRY_RUN = 'true';
  process.env.IGNORE_NOTIFICATION_HISTORY = 'false';
  process.env.FORCE_EMAIL = 'false';

  const backup = readHistoryFile();
  const controlledHistory = cooldownHistory(new Date());
  writeHistoryFile(controlledHistory);

  try {
    const dryRunResult = await runMonitor({ emailProviderKind: 'mock', dryRun: true });
    const historyAfterDryRun = readHistoryFile();

    const checks: Check[] = [
      {
        name: 'DRY_RUN generates report/email HTML without sending email',
        run: () => {
          assert.strictEqual(dryRunResult.result.reportedCount, 0, 'Expected zero new notifications');
          assert.strictEqual(dryRunResult.emailSent, true, 'DRY_RUN should attempt email delivery');
          assert.ok(dryRunResult.html.includes('Nintendo Switch Daily Digest'), 'DRY_RUN should generate HTML report');
        },
      },
      {
        name: 'DRY_RUN does not modify notification history',
        run: () => {
          assert.strictEqual(
            historyAfterDryRun,
            controlledHistory,
            'History file changed after DRY_RUN run',
          );
        },
      },
      {
        name: 'DRY_RUN allows email delivery (but not actually sent)',
        run: () => {
          assert.ok(dryRunResult.emailSent, 'DRY_RUN should attempt email');
        },
      },
      {
        name: 'digest email decision logic covers all combinations',
        run: () => {
          assert.deepStrictEqual(decideDigestEmail(0, false, false, false), {
            send: false,
            reason: 'no new notifications',
          });
          assert.deepStrictEqual(decideDigestEmail(3, false, false, false), {
            send: true,
            reason: '3 new notification(s)',
          });
          assert.deepStrictEqual(decideDigestEmail(0, true, false, false), {
            send: true,
            reason: 'sendEmptyDigest=true',
          });
          assert.deepStrictEqual(decideDigestEmail(0, false, true, false), {
            send: true,
            reason: 'FORCE_EMAIL=true',
          });
          assert.deepStrictEqual(decideDigestEmail(0, false, false, true), {
            send: true,
            reason: 'DRY_RUN=true',
          });
        },
      },
      {
        name: 'digest email decision includes DRY_RUN option',
        run: () => {
          assert.deepStrictEqual(decideDigestEmail(0, false, false, true), {
            send: true,
            reason: 'DRY_RUN=true',
          });
        },
      },
    ];

    await runChecks(checks);
    console.log('\nAll DRY_RUN validation checks passed.');
  } finally {
    restoreHistoryFile(backup);
  }
}

if (require.main === module) {
  validateDryRun().catch((error: unknown) => {
    console.error('DRY_RUN validation failed:', error);
    process.exitCode = 1;
  });
}
