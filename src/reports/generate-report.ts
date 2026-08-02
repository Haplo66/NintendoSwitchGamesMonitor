import 'dotenv/config';

import { runMonitor } from '../pipeline/monitor-run';
import {
  buildMonitorReportData,
  generateMonitorReportHtml,
  generateMonitorReportMarkdown,
} from './monitor-report-generator';
import { MonitorReportFiles, writeMonitorReports } from './report-writer';

export async function generateReport(): Promise<MonitorReportFiles> {
  const { result } = await runMonitor({ emailProviderKind: 'mock' });
  const data = buildMonitorReportData(result);
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
