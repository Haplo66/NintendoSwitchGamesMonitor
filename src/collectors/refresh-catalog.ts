import 'dotenv/config';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CatalogChanges,
  diffCatalogs,
  diffIsEmpty,
  formatCatalogRefreshReport,
} from './catalog-diff';
import { validateCatalogEntries } from './catalog-validation';
import { generateCatalog, GenerateCatalogOptions } from './generate-catalog';
import { CatalogGame, DEFAULT_GAME_CATALOG_PATH, loadGameCatalog } from './nintendo-price-collector';

export interface RefreshCatalogOptions extends GenerateCatalogOptions {
  catalogPath?: string;
  /** When true, overwrite the committed catalog with the generated one. */
  apply?: boolean;
  /** Overridable generator (defaults to generateCatalog); used for offline tests. */
  generator?: (options: GenerateCatalogOptions) => Promise<void>;
}

export interface RefreshCatalogResult {
  changes: CatalogChanges;
  currentCount: number;
  applied: boolean;
  targetPath: string;
}

/**
 * Regenerates the catalog into a temporary file, diffs it against the current
 * committed catalog, and prints a concise change summary. By default the
 * committed catalog is NOT overwritten (`apply: false`) — refresh is safe and
 * only writes back when explicitly requested, so a generated catalog is never
 * applied blindly.
 */
export async function refreshCatalog(
  options: RefreshCatalogOptions = {},
): Promise<RefreshCatalogResult> {
  const targetPath = path.resolve(
    process.cwd(),
    options.catalogPath ?? process.env.CATALOG_OUT ?? DEFAULT_GAME_CATALOG_PATH,
  );
  const apply = options.apply ?? process.env.CATALOG_APPLY === 'true';
  const generator = options.generator ?? generateCatalog;

  const tempPath = path.join(os.tmpdir(), `game-catalog-${Date.now()}-${process.pid}.json`);
  try {
    // Run the existing generation logic, but write to a temp file so the
    // committed catalog is untouched until the diff has been reviewed.
    await generator({ ...options, outPath: tempPath });
    const generated = loadGameCatalog(tempPath) as CatalogGame[];
    const current = loadGameCatalog(targetPath);

    const changes = diffCatalogs(current, generated);
    const report = formatCatalogRefreshReport(current.length, changes);
    console.log(report);

    if (apply) {
      const errors = validateCatalogEntries(generated);
      if (errors.length > 0) {
        throw new Error(`Generated catalog failed validation:\n- ${errors.join('\n- ')}`);
      }
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
      if (!diffIsEmpty(changes)) {
        console.log('');
        console.log(`Applied ${changes.added.length} add(s), ${changes.removed.length} removal(s), ` +
          `${changes.updated.length} update(s) to ${targetPath}`);
      }
    } else if (!diffIsEmpty(changes)) {
      console.log('');
      console.log('Dry run: catalog not written. Re-run with --apply to apply changes.');
    }

    return { changes, currentCount: current.length, applied: apply, targetPath };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  refreshCatalog({ apply })
    .then((result) => {
      console.log('');
      console.log(`Refresh complete (${result.applied ? 'applied' : 'dry run'}).`);
    })
    .catch((error: unknown) => {
      console.error('Catalog refresh failed:', error);
      process.exitCode = 1;
    });
}
