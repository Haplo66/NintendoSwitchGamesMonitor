import 'dotenv/config';

import { runMonitor } from '../pipeline/monitor-run';

export type RunMonitorMode = 'dry' | 'test-email';

const MODES: readonly RunMonitorMode[] = ['dry', 'test-email'];

function resolveMode(argv: string[]): RunMonitorMode | undefined {
  const raw = argv[2];
  if (raw === undefined) {
    return undefined;
  }
  if (!MODES.includes(raw as RunMonitorMode)) {
    throw new Error(
      `Unknown mode "${raw}". Expected one of: ${MODES.join(', ')} (or omit for normal execution).`,
    );
  }
  return raw as RunMonitorMode;
}

export async function runLocalMonitor(argv: string[] = process.argv): Promise<void> {
  const mode = resolveMode(argv);

  if (mode === 'dry') {
    process.env.DRY_RUN = 'true';
    console.log('Local monitor mode: DRY_RUN=true (full pipeline, no email sent, no history written).');
  } else if (mode === 'test-email') {
    process.env.FORCE_EMAIL = 'true';
    console.log('Local monitor mode: FORCE_EMAIL=true (digest sent even with 0 new notifications, no history written).');
  } else {
    console.log('Local monitor mode: normal execution.');
  }

  await runMonitor();
}

if (require.main === module) {
  runLocalMonitor().catch((error: unknown) => {
    console.error('Monitor run failed:', error);
    process.exitCode = 1;
  });
}
