import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MonitorReportFiles {
  markdownFile: string;
  htmlFile: string;
}

export function monitorReportStamp(date?: Date): string {
  const d = date ?? new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function uniquePath(dir: string, base: string, extension: string): string {
  const candidate = (n: number): string =>
    path.join(dir, n <= 1 ? `${base}.${extension}` : `${base}-${n}.${extension}`);
  let n = 1;
  while (fs.existsSync(candidate(n))) {
    n += 1;
  }
  return candidate(n);
}

export function writeMonitorReports(
  markdown: string,
  html: string,
  options: { outDir?: string; stamp?: string } = {},
): MonitorReportFiles {
  const outDir = options.outDir ?? path.resolve(process.cwd(), 'reports');
  const stamp = options.stamp ?? monitorReportStamp();
  const htmlDir = path.join(outDir, 'html');

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(htmlDir, { recursive: true });

  const markdownFile = uniquePath(outDir, `monitor-${stamp}`, 'md');
  const htmlFile = uniquePath(htmlDir, `monitor-${stamp}`, 'html');

  fs.writeFileSync(markdownFile, markdown, 'utf8');
  fs.writeFileSync(htmlFile, html, 'utf8');

  return { markdownFile, htmlFile };
}
