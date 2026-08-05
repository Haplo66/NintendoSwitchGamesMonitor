import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConfigError } from './json-loader';
import { loadAppConfig } from './app-config';
import { DEFAULT_APP_PREFERENCES, loadAppPreferences } from './preferences';

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
          dryRun: true,
          forceEmail: true,
          logLevel: 'warn',
        });
        try {
          assert.deepStrictEqual(loadAppPreferences({}, file), {
            platform: 'switch2',
            emailProvider: 'mock',
            dryRun: true,
            forceEmail: true,
            logLevel: 'warn',
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
          assert.strictEqual(prefs.dryRun, false);
          assert.strictEqual(prefs.forceEmail, false);
          assert.strictEqual(prefs.logLevel, DEFAULT_APP_PREFERENCES.logLevel);
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
          dryRun: false,
          forceEmail: false,
          logLevel: 'warn',
        });
        try {
          const prefs = loadAppPreferences(
            {
              NINTENDO_PLATFORM: 'switch1',
              EMAIL_PROVIDER: 'gmail',
              DRY_RUN: 'true',
              FORCE_EMAIL: 'true',
              LOG_LEVEL: 'debug',
            },
            file,
          );
          assert.strictEqual(prefs.platform, 'switch1', 'env platform must win');
          assert.strictEqual(prefs.emailProvider, 'gmail', 'env email provider must win');
          assert.strictEqual(prefs.dryRun, true, 'env DRY_RUN must win');
          assert.strictEqual(prefs.forceEmail, true, 'env FORCE_EMAIL must win');
          assert.strictEqual(prefs.logLevel, 'debug', 'env log level must win');
        } finally {
          fs.rmSync(file, { force: true });
        }
      },
    },
    {
      name: 'environment normalization accepts mixed case',
      run: () => {
        const prefs = loadAppPreferences(
          { NINTENDO_PLATFORM: 'Switch2', EMAIL_PROVIDER: 'MOCK', LOG_LEVEL: 'INFO' },
          path.join(os.tmpdir(), 'nsm-no-settings.json'),
        );
        assert.strictEqual(prefs.platform, 'switch2');
        assert.strictEqual(prefs.emailProvider, 'mock');
        assert.strictEqual(prefs.logLevel, 'info');
      },
    },
    {
      name: 'invalid preference values are rejected',
      run: () => {
        const cases: unknown[] = [
          { platform: 'ps5' },
          { emailProvider: 'smtp' },
          { logLevel: 'verbose' },
          { dryRun: 'yes' },
          { forceEmail: 1 },
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
      },
    },
    {
      name: 'app config exposes preferences and applies platform to the collector',
      run: () => {
        const config = loadAppConfig();
        assert.ok(config.preferences.platform === 'switch1' || config.preferences.platform === 'switch2' || config.preferences.platform === 'both');
        assert.strictEqual(config.collector.platform, config.preferences.platform);
        assert.strictEqual(
          config.preferences.emailProvider === 'gmail' || config.preferences.emailProvider === 'mock',
          true,
        );
        assert.ok(['debug', 'info', 'warn', 'error', 'silent'].includes(config.preferences.logLevel));
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