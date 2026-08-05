import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadAppConfig, resolveCollectorSettings } from './app-config';
import { defaultNotificationHistoryFile } from './notification-history-store';
import { parseEnvBoolean } from './settings-loader';
import { resolveEmailProviderKind } from '../notifications/email-factory';
import { decideDigestEmail, runMonitor } from '../pipeline/monitor-run';
import { createGameCollector } from '../collectors/collector-factory';
import { NintendoPriceCollector } from '../collectors/nintendo-price-collector';

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

function workflowFile(): string {
  return path.resolve(process.cwd(), '.github', 'workflows', 'monitor.yml');
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

export async function validateProduction(): Promise<void> {
  const workflow = fs.readFileSync(workflowFile(), 'utf8');

  const historyBackup = readHistoryFile();
  const previousEmailProvider = process.env.EMAIL_PROVIDER;
  const previousGameCollector = process.env.GAME_COLLECTOR;
  const previousPlatform = process.env.NINTENDO_PLATFORM;
  const previousDryRun = process.env.DRY_RUN;
  const previousMinScore = process.env.MIN_DEAL_SCORE;
  const previousCooldown = process.env.NOTIFICATION_COOLDOWN_DAYS;

  let firstScheduled: Awaited<ReturnType<typeof runMonitor>> | undefined;
  let secondScheduled: Awaited<ReturnType<typeof runMonitor>> | undefined;
  let historyAfterFirstRun: string | undefined;

  try {
    process.env.DRY_RUN = 'false';
    process.env.FORCE_EMAIL = 'false';
    process.env.IGNORE_NOTIFICATION_HISTORY = 'false';
    process.env.MIN_DEAL_SCORE = '50';
    process.env.NOTIFICATION_COOLDOWN_DAYS = '14';
    writeHistoryFile(EMPTY_HISTORY);

    firstScheduled = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock' });
    historyAfterFirstRun = readHistoryFile();

    secondScheduled = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock' });
    const historyAfterSecondRun = readHistoryFile();

    const checks: Check[] = [
      {
        name: 'workflow file exists and defines a daily cron schedule',
        run: () => {
          assert.ok(workflow.includes('schedule:'), 'workflow must define a schedule');
          const cronLine = workflow
            .split('\n')
            .find((line) => line.trim().startsWith('- cron:'));
          assert.ok(cronLine !== undefined, 'workflow must define a cron expression');
          assert.ok(
            cronLine.includes('30 6 * * *'),
            `expected once-daily cron "30 6 * * *", got "${cronLine?.trim()}"`,
          );
        },
      },
      {
        name: 'workflow keeps manual workflow_dispatch support',
        run: () => {
          assert.ok(workflow.includes('workflow_dispatch:'), 'workflow must support manual dispatch');
        },
      },
      {
        name: 'workflow defaults to production configuration (gmail, nintendo, switch1)',
        run: () => {
          assert.ok(workflow.includes("'gmail'"), 'EMAIL_PROVIDER must default to gmail');
          assert.ok(workflow.includes("'nintendo'"), 'GAME_COLLECTOR must default to nintendo');
          assert.ok(
            workflow.includes('switch1'),
            'NINTENDO_PLATFORM must default to switch1 in the scheduled path',
          );
        },
      },
      {
        name: 'workflow scheduled path does not force DRY_RUN',
        run: () => {
          assert.ok(workflow.includes('DRY_RUN'), 'workflow must pass DRY_RUN to the pipeline');
          const dryRunLine = workflow.split('\n').find((line) => line.includes('DRY_RUN='));
          assert.ok(
            dryRunLine === undefined || !dryRunLine.includes('true'),
            'the scheduled path must default DRY_RUN to false',
          );
        },
      },
      {
        name: 'workflow references the required email secrets',
        run: () => {
          for (const secret of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_TO']) {
            const needle = '${{ secrets.' + secret + ' }}';
            assert.ok(
              workflow.includes(needle),
              'workflow must pass the ' + secret + ' secret',
            );
          }
        },
      },
      {
        name: 'production settings load GAME_COLLECTOR=nintendo, platform switch1, USD',
        run: () => {
          const settings = resolveCollectorSettings({
            GAME_COLLECTOR: 'nintendo',
            NINTENDO_PLATFORM: 'switch1',
          });
          assert.strictEqual(settings.collectorKind, 'nintendo');
          assert.strictEqual(settings.nintendoRegion, 'US');
          assert.strictEqual(settings.dealsCurrency, 'USD');
          assert.strictEqual(settings.platform, 'switch1');
          assert.ok(
            createGameCollector('nintendo') instanceof NintendoPriceCollector,
            'nintendo collector resolves to NintendoPriceCollector',
          );
          assert.strictEqual(resolveCollectorSettings({ NINTENDO_PLATFORM: 'switch2' }).platform, 'switch2');
          assert.strictEqual(resolveCollectorSettings({ NINTENDO_PLATFORM: 'both' }).platform, 'both');
        },
      },
      {
        name: 'production settings load EMAIL_PROVIDER=gmail and DRY_RUN=false',
        run: () => {
          assert.strictEqual(resolveEmailProviderKind(undefined), 'gmail');
          assert.strictEqual(resolveEmailProviderKind('gmail'), 'gmail');
          assert.strictEqual(parseEnvBoolean('DRY_RUN', 'false'), false);
          assert.strictEqual(parseEnvBoolean('DRY_RUN', undefined), undefined);
          assert.strictEqual(parseEnvBoolean('DRY_RUN', 'true'), true);
          const config = loadAppConfig();
          assert.strictEqual(config.notification.minimumDealScore, 50, 'MIN_DEAL_SCORE env must apply');
        },
      },
      {
        name: 'scheduled run sends an email when new notifications exist',
        run: () => {
          assert.ok(firstScheduled !== undefined);
          assert.ok(
            firstScheduled.result.potentialMatchCount > 0,
            'precondition: the scheduled run must find reportable games',
          );
          assert.ok(
            firstScheduled.result.reportedCount > 0,
            'a scheduled run with new notifications must include them in the email',
          );
          assert.strictEqual(firstScheduled.emailSent, true, 'scheduled (non-dry) run must send the email');
          assert.ok(
            historyAfterFirstRun !== undefined && historyAfterFirstRun !== EMPTY_HISTORY,
            'scheduled run must record notifications to history',
          );
          assert.strictEqual(
            decideDigestEmail(firstScheduled.result.reportedCount, false, false, false).send,
            true,
          );
        },
      },
      {
        name: 'a second scheduled run respects cooldown and adds no new history',
        run: () => {
          assert.ok(secondScheduled !== undefined);
          assert.ok(
            secondScheduled.result.potentialMatchCount > 0,
            'the same games are still reportable, but...',
          );
          assert.strictEqual(
            secondScheduled.result.reportedCount,
            0,
            'cooldown filtering must suppress the already-notified games',
          );
          assert.strictEqual(secondScheduled.emailSent, false, 'no new notifications => no email');
          const afterFirst = JSON.parse(historyAfterFirstRun as string) as {
            entries: Array<{ gameTitle: string; notificationCount: number }>;
          };
          const afterSecond = JSON.parse(readHistoryFile() as string) as {
            entries: Array<{ gameTitle: string; notificationCount: number }>;
          };
          assert.strictEqual(afterSecond.entries.length, afterFirst.entries.length, 'no duplicate entries');
          const countsEqual = afterFirst.entries.every((entry) => {
            const match = afterSecond.entries.find(
              (other) => other.gameTitle === entry.gameTitle,
            );
            return match !== undefined && match.notificationCount === entry.notificationCount;
          });
          assert.ok(countsEqual, 'notification counts must not grow when nothing new is notified');
        },
      },
      {
        name: 'failures are propagated so they are visible in workflow logs',
        run: () => {
          assert.throws(
            () => createGameCollector('unknown'),
            /Unknown game collector/,
            'an unknown collector kind must throw (and fail the workflow step)',
          );
          assert.throws(
            () => resolveCollectorSettings({ NINTENDO_PLATFORM: 'ps5' }),
            /NINTENDO_PLATFORM/,
            'invalid production config must throw',
          );
        },
      },
    ];

    await runChecks(checks);
    console.log('\nAll production validation checks passed.');
  } finally {
    restoreHistoryFile(historyBackup);
    const restore = (key: string, previous: string | undefined): void => {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    };
    restore('EMAIL_PROVIDER', previousEmailProvider);
    restore('GAME_COLLECTOR', previousGameCollector);
    restore('NINTENDO_PLATFORM', previousPlatform);
    restore('DRY_RUN', previousDryRun);
    restore('MIN_DEAL_SCORE', previousMinScore);
    restore('NOTIFICATION_COOLDOWN_DAYS', previousCooldown);
    delete process.env.FORCE_EMAIL;
    delete process.env.IGNORE_NOTIFICATION_HISTORY;
  }
}

if (require.main === module) {
  validateProduction().catch((error: unknown) => {
    console.error('Production validation failed:', error);
    process.exitCode = 1;
  });
}
