import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';

import {
  defaultNotificationHistoryFile,
} from '../config/notification-history-store';
import { defaultSettingsFile } from '../config/settings-loader';
import { loadAppConfig } from '../config/app-config';
import { decideDigestEmail, resolveRunFlags, runMonitor } from './monitor-run';

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

export async function validateForceEmail(): Promise<void> {
  process.env.IGNORE_NOTIFICATION_HISTORY = 'false';
  const previousCooldown = process.env.NOTIFICATION_COOLDOWN_DAYS;
  process.env.NOTIFICATION_COOLDOWN_DAYS = '14';

  const backup = readHistoryFile();
  const controlledHistory = cooldownHistory(new Date());
  writeHistoryFile(controlledHistory);

  try {
    const forceRun = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock', forceDigestEmail: true });
    const historyAfterForce = readHistoryFile();
    const bypassRun = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock', ignoreNotificationHistory: true });
    const normalRun = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock', forceDigestEmail: false });

    const checks: Check[] = [
      {
        name: 'force email remains available as a command-line flag',
        run: () => {
          assert.deepStrictEqual(resolveRunFlags(['--force-email']), {
            dryRun: false,
            forceDigestEmail: true,
          });
          assert.deepStrictEqual(resolveRunFlags(['--dry-run']), {
            dryRun: true,
            forceDigestEmail: undefined,
          });
          assert.deepStrictEqual(resolveRunFlags([]), {
            dryRun: false,
            forceDigestEmail: undefined,
          });
        },
      },
      {
        name: 'force digest email is read from the real settings.json loading path',
        run: () => {
          const cfg = loadAppConfig();
          const raw = JSON.parse(fs.readFileSync(defaultSettingsFile(), 'utf8')) as Record<
            string,
            unknown
          >;
          const expected = raw.forceDigestEmail ?? false;
          assert.strictEqual(
            cfg.notification.forceDigestEmail,
            expected,
            'settings.json forceDigestEmail must reach the resolved config',
          );
        },
      },
      {
        name: 'FORCE_EMAIL sends email even with zero new notifications',
        run: () => {
          assert.strictEqual(forceRun.result.reportedCount, 0, 'Expected zero new notifications');
          assert.strictEqual(forceRun.emailSent, true, 'FORCE_EMAIL run did not send email');
        },
      },
      {
        name: 'FORCE_EMAIL does not modify notification history',
        run: () => {
          assert.strictEqual(
            historyAfterForce,
            controlledHistory,
            'History file changed after FORCE_EMAIL run',
          );
        },
      },
      {
        name: 'FORCE_EMAIL does not bypass cooldown filtering',
        run: () => {
          assert.strictEqual(forceRun.result.reportedCount, 0, 'FORCE_EMAIL bypassed cooldown filtering');
          assert.ok(
            bypassRun.result.reportedCount > forceRun.result.reportedCount,
            `Bypass mode should report more than FORCE_EMAIL (bypass=${bypassRun.result.reportedCount})`,
          );
        },
      },
      {
        name: 'normal mode skips the digest email when empty',
        run: () => {
          assert.strictEqual(normalRun.result.reportedCount, 0, 'Expected zero new notifications');
          assert.strictEqual(normalRun.emailSent, false, 'Normal mode sent an empty digest');
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
            reason: 'forceDigestEmail=true',
          });
        },
      },
      {
        name: 'digest email decision includes DRY_RUN option',
        run: () => {
          assert.deepStrictEqual(decideDigestEmail(3, false, false, true), {
            send: true,
            reason: 'DRY_RUN=true',
          });
          assert.deepStrictEqual(decideDigestEmail(0, false, false, true), {
            send: false,
            reason: 'no new notifications',
          });
        },
      },
    ];

    await runChecks(checks);
    console.log('\nAll FORCE_EMAIL validation checks passed.');
  } finally {
    restoreHistoryFile(backup);
    if (previousCooldown === undefined) {
      delete process.env.NOTIFICATION_COOLDOWN_DAYS;
    } else {
      process.env.NOTIFICATION_COOLDOWN_DAYS = previousCooldown;
    }
  }
}

if (require.main === module) {
  validateForceEmail().catch((error: unknown) => {
    console.error('FORCE_EMAIL validation failed:', error);
    process.exitCode = 1;
  });
}
