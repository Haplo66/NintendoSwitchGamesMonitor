import 'dotenv/config';

import { loadAppConfig } from '../config/app-config';
import { runMonitor } from '../pipeline/monitor-run';
import {
  buildMonitorReportData,
  generateMonitorReportHtml,
  generateMonitorReportMarkdown,
} from './monitor-report-generator';
import { MonitorReportFiles, writeMonitorReports } from './report-writer';

export async function generateReport(): Promise<MonitorReportFiles> {
  const config = loadAppConfig();
  const { result } = await runMonitor({ collectorKind: 'mock', emailProviderKind: 'mock' });
  const data = buildMonitorReportData(result, {
    maxBestDeals: config.notification.dailyDigest.maxBestDeals,
    maxWishlistAlerts: config.notification.dailyDigest.maxWishlistAlerts,
    maxHistoricalLows: config.notification.dailyDigest.maxHistoricalLows,
    showStatistics: config.notification.dailyDigest.showStatistics,
    showPriceWatch: config.notification.dailyDigest.showPriceWatch,
    recommendedFamilyGamesLimit: config.notification.dailyDigest.recommendedFamilyGamesLimit,
    blacklist: config.blacklist,
  });
  const markdown = generateMonitorReportMarkdown(data);
  const html = generateMonitorReportHtml(data);
  return writeMonitorReports(markdown, html);
}

if (require.main === module) {
  generateReport()
    .then((files) => {
      console.log('\nReports written:');
      console.log(`  Markdown: ${files.markdownFile}`);
      console.log(`  HTML:     ${files.htmlFile}`);
    })
    .catch((error: unknown) => {
      console.error('Report generation failed:', error);
      process.exitCode = 1;
    });
}
