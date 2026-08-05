import 'dotenv/config';

import { MonitorOptions, runMonitor } from '../pipeline/monitor-run';

export type RunMonitorMode = 'dry' | 'test-email';

const POSITIONAL_MODES: readonly RunMonitorMode[] = ['dry', 'test-email'];

export interface ResolvedRunMode {
  dryRun: boolean;
  forceEmail: boolean;
}

/** Resolves runtime execution modes from CLI args (positional or `--flag`). */
export function resolveRunMode(argv: string[]): ResolvedRunMode {
  const args = argv.slice(2);
  let dryRun = args.includes('--dry-run') || args.includes('dry');
  const forceEmail = args.includes('--force-email') || args.includes('test-email');
  return { dryRun, forceEmail };
}

export async function runLocalMonitor(argv: string[] = process.argv): Promise<void> {
  const mode = resolveRunMode(argv);

  if (mode.dryRun && mode.forceEmail) {
    throw new Error(
      'Cannot combine --dry-run and --force-email: dry run suppresses email delivery.',
    );
  }

  if (mode.dryRun) {
    console.log('Local monitor mode: dry run (full pipeline, no email sent, no history written).');
  } else if (mode.forceEmail) {
    console.log(
      'Local monitor mode: force email (digest sent even with 0 new notifications, no history written).',
    );
  } else {
    console.log('Local monitor mode: normal execution.');
  }

  const options: MonitorOptions = {
    dryRun: mode.dryRun,
    forceEmail: mode.forceEmail,
  };
  await runMonitor(options);
}

if (require.main === module) {
  runLocalMonitor().catch((error: unknown) => {
    console.error('Monitor run failed:', error);
    process.exitCode = 1;
  });
}
