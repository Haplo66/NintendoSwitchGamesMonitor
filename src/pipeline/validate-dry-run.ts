import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';

import { resolveCollectorSettings } from '../config/app-config';
import { defaultNotificationHistoryFile } from '../config/notification-history-store';
import { createGameCollector } from '../collectors/collector-factory';
import { NintendoPriceCollector } from '../collectors/nintendo-price-collector';
import {
  DEFAULT_EMAIL_PROVIDER,
  createEmailProvider,
  resolveEmailProviderKind,
} from '../notifications/email-factory';
import { MockEmailProvider } from '../notifications/mock-email-provider';
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

const EMPTY_HISTORY = `${JSON.stringify({ records: [] }, null, 2)}\n`;

function verifyDecision(
  count: number,
  sendEmptyDigest: boolean,
  forceDigestEmail: boolean,
  dryRun: boolean,
  expectedSend: boolean,
  expectedReason: string,
): void {
  assert.deepStrictEqual(decideDigestEmail(count, sendEmptyDigest, forceDigestEmail, dryRun), {
    send: expectedSend,
    reason: expectedReason,
  });
}

export async function validateDryRun(): Promise<void> {
  process.env.IGNORE_NOTIFICATION_HISTORY = 'false';

  const backup = readHistoryFile();
  writeHistoryFile(EMPTY_HISTORY);

  const previousEmailProvider = process.env.EMAIL_PROVIDER;
  const previousGameCollector = process.env.GAME_COLLECTOR;

  try {
    const dryRunResult = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock', dryRun: true });
    const historyAfterDryRun = readHistoryFile();

    process.env.EMAIL_PROVIDER = 'gmail';
    process.env.GAME_COLLECTOR = 'nintendo';

    const checks: Check[] = [
      {
        name: 'production configuration loads GAME_COLLECTOR=nintendo',
        run: () => {
          const collector = resolveCollectorSettings({ GAME_COLLECTOR: 'nintendo' });
          assert.strictEqual(collector.collectorKind, 'nintendo', 'GAME_COLLECTOR=nintendo must select the nintendo collector');
          assert.ok(
            createGameCollector('nintendo') instanceof NintendoPriceCollector,
            'createGameCollector("nintendo") must produce a NintendoPriceCollector',
          );
        },
      },
      {
        name: 'production configuration loads EMAIL_PROVIDER=gmail',
        run: () => {
          assert.strictEqual(DEFAULT_EMAIL_PROVIDER, 'gmail', 'Production email provider default must be gmail');
          assert.strictEqual(resolveEmailProviderKind(undefined), 'gmail', 'Unset EMAIL_PROVIDER must resolve to gmail');
          assert.strictEqual(resolveEmailProviderKind('gmail'), 'gmail');
          assert.ok(createEmailProvider('mock') instanceof MockEmailProvider, 'mock provider resolves correctly');
        },
      },
      {
        name: 'dry run is a one-time command-line flag, not a preference',
        run: () => {
          assert.deepStrictEqual(resolveRunFlags(['--dry-run']), {
            dryRun: true,
            forceDigestEmail: false,
          });
          assert.deepStrictEqual(resolveRunFlags(['--force-email']), {
            dryRun: false,
            forceDigestEmail: true,
          });
          assert.deepStrictEqual(resolveRunFlags([]), {
            dryRun: false,
            forceDigestEmail: false,
          });
        },
      },
      {
        name: 'DRY_RUN runs the full pipeline (games collected, analyzed, reported)',
        run: () => {
          assert.ok(dryRunResult.result.analyzedCount > 0, 'DRY_RUN should run full collection/analysis');
          assert.ok(dryRunResult.result.potentialMatchCount > 0, 'DRY_RUN should find reportable games');
        },
      },
      {
        name: 'DRY_RUN generates the HTML digest/report',
        run: () => {
          assert.ok(
            dryRunResult.html.includes('Nintendo Switch Daily Digest'),
            'DRY_RUN should generate the HTML digest',
          );
        },
      },
      {
        name: 'DRY_RUN does not send an email',
        run: () => {
          assert.ok(
            dryRunResult.result.potentialMatchCount > 0,
            'Precondition: DRY_RUN should have something worth sending',
          );
          assert.strictEqual(dryRunResult.emailSent, false, 'DRY_RUN must not send an email');
        },
      },
      {
        name: 'DRY_RUN does not modify notification history',
        run: () => {
          assert.strictEqual(
            historyAfterDryRun,
            EMPTY_HISTORY,
            'History file changed after DRY_RUN run',
          );
        },
      },
      {
        name: 'digest email decision logic covers all combinations',
        run: () => {
          verifyDecision(0, false, false, false, false, 'no new notifications');
          verifyDecision(3, false, false, false, true, '3 new notification(s)');
          verifyDecision(0, true, false, false, true, 'sendEmptyDigest=true');
          verifyDecision(0, false, true, false, true, 'forceDigestEmail=true');
          verifyDecision(3, false, false, true, true, 'DRY_RUN=true');
          verifyDecision(0, true, false, true, true, 'DRY_RUN=true');
          verifyDecision(0, false, true, true, true, 'DRY_RUN=true');
          verifyDecision(0, false, false, true, false, 'no new notifications');
        },
      },
      {
        name: 'DRY_RUN reports an email would be sent but suppresses delivery',
        run: () => {
          const decision = decideDigestEmail(
            dryRunResult.result.potentialMatchCount,
            false,
            false,
            true,
          );
          assert.ok(decision.send, 'DRY_RUN should indicate an email would be sent');
          assert.strictEqual(dryRunResult.emailSent, false, 'but the email must not actually be sent');
        },
      },
    ];

    await runChecks(checks);
    console.log('\nAll DRY_RUN validation checks passed.');
  } finally {
    restoreHistoryFile(backup);
    if (previousEmailProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = previousEmailProvider;
    }
    if (previousGameCollector === undefined) {
      delete process.env.GAME_COLLECTOR;
    } else {
      process.env.GAME_COLLECTOR = previousGameCollector;
    }
  }
}

if (require.main === module) {
  validateDryRun().catch((error: unknown) => {
    console.error('DRY_RUN validation failed:', error);
    process.exitCode = 1;
  });
}