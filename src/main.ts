import 'dotenv/config';

import { name, version } from '../package.json';

export function main(): void {
  const appName = process.env.APP_NAME ?? name;
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  console.log(`[${appName} v${version}] service is running (env: ${nodeEnv})`);
}

if (require.main === module) {
  main();
}
