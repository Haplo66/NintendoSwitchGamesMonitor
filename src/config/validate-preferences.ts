import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConfigError } from './json-loader';
import { loadAppConfig } from './app-config';
import { DEFAULT_APP_PREFERENCES, loadAppPreferences } from './preferences';
import {
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
  GmailProvider,
  gmailTransportOptions,
  mailFrom,
} from '../notifications/gmail-provider';
import { resolveRunFlags } from '../pipeline/monitor-run';
import { resolveRunMode } from '../scripts/run-monitor';
import { createEmailProvider } from '../notifications/email-factory';

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

function tempFile(data: unknown): string {
  const file = path.join(os.tmpdir(), `nsm-prefs-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  return file;
}

function withEnv(
  env: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    run();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

export async function validatePreferences(): Promise<void> {
  const checks: Check[] = [
    {
      name: 'defaults apply when the settings file is missing',
      run: () => {
        const file = path.join(os.tmpdir(), 'nsm-missing-prefs.json');
        assert.deepStrictEqual(loadAppPreferences({}, file), DEFAULT_APP_PREFERENCES);
      },
    },
    {
      name: 'settings.json preference values load correctly',
      run: () => {
        const file = tempFile({
          platform: 'switch2',
          emailProvider: 'mock',
          gameCollector: 'nintendo',
          logLevel: 'warn',
          emailTo: 'family@example.com',
        });
        try {
          assert.deepStrictEqual(loadAppPreferences({}, file), {
            platform: 'switch2',
            emailProvider: 'mock',
            gameCollector: 'nintendo',
            logLevel: 'warn',
            emailTo: 'family@example.com',
          });
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'partial settings merge with defaults',
      run: () => {
        const file = tempFile({ platform: 'switch2' });
        try {
          const prefs = loadAppPreferences({}, file);
          assert.strictEqual(prefs.platform, 'switch2');
          assert.strictEqual(prefs.emailProvider, DEFAULT_APP_PREFERENCES.emailProvider);
          assert.strictEqual(prefs.gameCollector, DEFAULT_APP_PREFERENCES.gameCollector);
          assert.strictEqual(prefs.logLevel, DEFAULT_APP_PREFERENCES.logLevel);
          assert.strictEqual(prefs.emailTo, undefined);
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'environment variables override settings.json values',
      run: () => {
        const file = tempFile({
          platform: 'switch2',
          emailProvider: 'mock',
          gameCollector: 'mock',
          logLevel: 'warn',
          emailTo: 'settings@example.com',
        });
        try {
          const prefs = loadAppPreferences(
            {
              NINTENDO_PLATFORM: 'switch1',
              EMAIL_PROVIDER: 'gmail',
              GAME_COLLECTOR: 'nintendo',
              LOG_LEVEL: 'debug',
            },
            file,
          );
          assert.strictEqual(prefs.platform, 'switch1', 'env platform must win');
          assert.strictEqual(prefs.emailProvider, 'gmail', 'env email provider must win');
          assert.strictEqual(prefs.gameCollector, 'nintendo', 'env game collector must win');
          assert.strictEqual(prefs.logLevel, 'debug', 'env log level must win');
          assert.strictEqual(
            prefs.emailTo,
            'settings@example.com',
            'emailTo has no env override and must come from settings.json',
          );
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'environment normalization accepts mixed case',
      run: () => {
        const prefs = loadAppPreferences(
          {
            NINTENDO_PLATFORM: 'Switch2',
            EMAIL_PROVIDER: 'MOCK',
            GAME_COLLECTOR: 'NINTENDO',
            LOG_LEVEL: 'INFO',
          },
          path.join(os.tmpdir(), 'nsm-no-settings.json'),
        );
        assert.strictEqual(prefs.platform, 'switch2');
        assert.strictEqual(prefs.emailProvider, 'mock');
        assert.strictEqual(prefs.gameCollector, 'nintendo');
        assert.strictEqual(prefs.logLevel, 'info');
      },
    },
    {
      name: 'invalid preference values are rejected',
      run: () => {
        const cases: unknown[] = [
          { platform: 'ps5' },
          { emailProvider: 'smtp' },
          { gameCollector: 'deku' },
          { logLevel: 'verbose' },
          { emailTo: 42 },
        ];
        for (const bad of cases) {
          const file = tempFile(bad);
          try {
            assert.throws(() => loadAppPreferences({}, file), ConfigError);
          } finally {
            fs.rmSync(file, { force: true });
          }
        }
        assert.throws(
          () => loadAppPreferences({ NINTENDO_PLATFORM: 'ps5' }),
          /NINTENDO_PLATFORM/,
        );
        assert.throws(
          () => loadAppPreferences({ GAME_COLLECTOR: 'deku' }),
          /Illegal game collector/,
        );
      },
    },
    {
      name: 'app config exposes preferences and applies them to the collector',
      run: () => {
        const config = loadAppConfig();
        assert.ok(
          ['switch1', 'switch2', 'both'].includes(config.preferences.platform),
        );
        assert.strictEqual(config.collector.platform, config.preferences.platform);
        assert.strictEqual(config.collector.collectorKind, config.preferences.gameCollector);
        assert.ok(['gmail', 'mock'].includes(config.preferences.emailProvider));
        assert.ok(['debug', 'info', 'warn', 'error', 'silent'].includes(config.preferences.logLevel));
        assert.ok(
          config.preferences.emailTo === undefined ||
            typeof config.preferences.emailTo === 'string',
        );
      },
    },
    {
      name: 'dryRun/forceDigestEmail are execution modes, not preferences',
      run: () => {
        const file = tempFile({
          platform: 'switch2',
          dryRun: true,
          forceDigestEmail: true,
        });
        try {
          const prefs = loadAppPreferences({}, file);
          const asRecord = prefs as unknown as Record<string, unknown>;
          const keys = Object.keys(prefs).sort();
          assert.deepStrictEqual(keys, [
            'emailProvider',
            'emailTo',
            'gameCollector',
            'logLevel',
            'platform',
          ]);
          assert.strictEqual(asRecord.dryRun, undefined);
          assert.strictEqual(asRecord.forceDigestEmail, undefined);
        } finally {
          fs.rmSync(file, { force: true });
        }
        const flags = resolveRunFlags([]);
        assert.deepStrictEqual(flags, { dryRun: false, forceDigestEmail: false });
      },
    },
    {
      name: '.env.example keeps only secrets and NODE_ENV',
      run: () => {
        const content = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
        const keys = [...content.matchAll(/^([A-Z_]+)=/gm)].map((match) => match[1]);
        assert.deepStrictEqual(keys.sort(), ['NODE_ENV', 'SMTP_PASSWORD', 'SMTP_USER'].sort());
      },
    },
    {
      name: 'gmail provider owns its SMTP defaults (host/port/secure)',
      run: () => {
        assert.strictEqual(GMAIL_SMTP_HOST, 'smtp.gmail.com');
        assert.strictEqual(GMAIL_SMTP_PORT, 465);
        const options = gmailTransportOptions('a@gmail.com', 'pw');
        assert.strictEqual(options.host, 'smtp.gmail.com');
        assert.strictEqual(options.port, 465);
        assert.strictEqual(options.secure, true);
      },
    },
    {
      name: 'SMTP_USER and SMTP_PASSWORD are required for the gmail provider',
      run: () => {
        withEnv({ SMTP_USER: undefined, SMTP_PASSWORD: 'pw' }, () => {
          assert.throws(() => GmailProvider.fromEnv(), /SMTP_USER/);
        });
        withEnv({ SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: undefined }, () => {
          assert.throws(() => GmailProvider.fromEnv(), /SMTP_PASSWORD/);
        });
      },
    },
    {
      name: 'MAIL_FROM is derived from SMTP_USER (single source of truth)',
      run: () => {
        assert.strictEqual(mailFrom('a@gmail.com'), 'a@gmail.com');
        withEnv({ SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'pw' }, () => {
          const provider = GmailProvider.fromEnv({ to: 'b@gmail.com' });
          assert.strictEqual(provider.getFromAddress(), 'a@gmail.com');
        });
      },
    },
    {
      name: 'emailTo defaults to the sender (SMTP_USER) when not configured',
      run: () => {
        withEnv({ SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'pw', EMAIL_TO: undefined }, () => {
          const provider = GmailProvider.fromEnv({});
          assert.strictEqual(provider.getRecipient(), 'a@gmail.com');
          const explicit = GmailProvider.fromEnv({ to: 'b@gmail.com' });
          assert.strictEqual(explicit.getRecipient(), 'b@gmail.com');
        });
      },
    },
    {
      name: 'no EMAIL_TO environment variable is required',
      run: () => {
        withEnv({ SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'pw', EMAIL_TO: undefined }, () => {
          assert.doesNotThrow(() => GmailProvider.fromEnv({}), 'fromEnv must not read EMAIL_TO');
          const provider = GmailProvider.fromEnv({});
          assert.strictEqual(provider.getRecipient(), 'a@gmail.com');
        });
      },
    },
    {
      name: 'runtime source code contains no EMAIL_TO reference',
      run: () => {
        const runtimeFiles = [
          path.resolve(process.cwd(), 'src', 'notifications', 'gmail-provider.ts'),
          path.resolve(process.cwd(), 'src', 'notifications', 'email-factory.ts'),
          path.resolve(process.cwd(), 'src', 'config', 'preferences.ts'),
          path.resolve(process.cwd(), 'src', 'pipeline', 'monitor-run.ts'),
          path.resolve(process.cwd(), 'src', 'notifications', 'test-email.ts'),
        ];
        for (const file of runtimeFiles) {
          const content = fs.readFileSync(file, 'utf8');
          assert.ok(
            !content.includes('EMAIL_TO'),
            `${path.basename(file)} must not reference EMAIL_TO`,
          );
        }
      },
    },
    {
      name: 'emailTo comes only from settings.json (EMAIL_TO is not honored)',
      run: () => {
        const settingsFile = tempFile({ emailTo: 'settings@example.com' });
        try {
          const prefs = loadAppPreferences({ EMAIL_TO: 'env@example.com' }, settingsFile);
          assert.strictEqual(
            prefs.emailTo,
            'settings@example.com',
            'settings emailTo must win over an EMAIL_TO env var',
          );
        } finally {
          fs.rmSync(settingsFile, { force: true });
        }
        const missingFile = path.join(os.tmpdir(), 'nsm-no-settings-email-to.json');
        const prefs = loadAppPreferences({ EMAIL_TO: 'env@example.com' }, missingFile);
        assert.strictEqual(prefs.emailTo, undefined, 'EMAIL_TO must not supply a recipient');
      },
    },
    {
      name: 'emailTo from settings.json reaches the gmail provider recipient',
      run: () => {
        withEnv({ SMTP_USER: 'sender@gmail.com', SMTP_PASSWORD: 'pw', EMAIL_TO: undefined }, () => {
          const provider = createEmailProvider('gmail', { emailTo: 'family@example.com' });
          assert.strictEqual(
            (provider as GmailProvider).getRecipient(),
            'family@example.com',
            'provider recipient must come from the resolved settings emailTo',
          );
        });
      },
    },
    {
      name: 'runtime modes resolve from command-line flags only',
      run: () => {
        assert.deepStrictEqual(resolveRunMode(['node', 'runner.js']), {
          dryRun: false,
          forceDigestEmail: false,
        });
        assert.deepStrictEqual(resolveRunMode(['node', 'runner.js', '--dry-run']), {
          dryRun: true,
          forceDigestEmail: false,
        });
        assert.deepStrictEqual(resolveRunMode(['node', 'runner.js', '--force-email']), {
          dryRun: false,
          forceDigestEmail: true,
        });
        assert.deepStrictEqual(resolveRunMode(['node', 'runner.js', 'dry']), {
          dryRun: true,
          forceDigestEmail: false,
        });
        assert.deepStrictEqual(resolveRunMode(['node', 'runner.js', 'test-email']), {
          dryRun: false,
          forceDigestEmail: true,
        });
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll preferences validation checks passed.');
}

if (require.main === module) {
  validatePreferences().catch((error: unknown) => {
    console.error('Preferences validation failed:', error);
    process.exitCode = 1;
  });
}
