import 'dotenv/config';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { diffCatalogs, diffIsEmpty, formatCatalogRefreshReport } from './catalog-diff';
import { validateCatalogEntries } from './catalog-validation';
import { CatalogGame } from './nintendo-price-collector';
import { refreshCatalog } from './refresh-catalog';
import { GenerateCatalogOptions } from './generate-catalog';

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

function entry(
  nsuid: string,
  title: string,
  overrides: Partial<CatalogGame> = {},
): CatalogGame {
  return {
    nsuid,
    title,
    slug: `${nsuid}-slug`,
    platforms: ['switch1'],
    ...overrides,
  };
}

function baseCatalog(): CatalogGame[] {
  return [
    entry('70010000000001', 'Zelda', { slug: 'zelda-switch', genres: ['Adventure'], esrbRating: 'E10+' }),
    entry('70010000000002', 'Mario', { slug: 'mario-switch', genres: ['Platformer'], esrbRating: 'E' }),
    entry('70010000000003', 'Kirby', { slug: 'kirby-switch', platforms: ['switch2'], genres: ['Party'], esrbRating: 'E' }),
  ];
}

export async function validateRefresh(): Promise<void> {
  const checks: Check[] = [
    {
      name: 'a generated catalog with a new nsuid is detected as added',
      run: () => {
        const current = baseCatalog();
        const generated = [...current, entry('70010000000004', 'Hollow Knight', { slug: 'hollow-knight-switch' })];
        const changes = diffCatalogs(current, generated);
        assert.deepStrictEqual(changes.added.map((e) => e.nsuid), ['70010000000004']);
        assert.strictEqual(changes.removed.length, 0);
        assert.strictEqual(changes.updated.length, 0);
      },
    },
    {
      name: 'a game missing from the generated catalog is detected as removed',
      run: () => {
        const current = baseCatalog();
        const generated = current.filter((c) => c.nsuid !== '70010000000002');
        const changes = diffCatalogs(current, generated);
        assert.deepStrictEqual(changes.removed.map((c) => c.nsuid), ['70010000000002']);
        assert.strictEqual(changes.added.length, 0);
      },
    },
    {
      name: 'metadata changes are detected per field',
      run: () => {
        const current = baseCatalog();
        const generated = baseCatalog();
        generated[0] = { ...generated[0], title: 'Zelda: Breath of the Wild' };
        generated[1] = { ...generated[1], esrbRating: 'Everyone' };
        generated[2] = { ...generated[2], platforms: ['switch1', 'switch2'], genres: ['Party', 'Fighting'] };
        const changes = diffCatalogs(current, generated);
        assert.strictEqual(changes.added.length, 0);
        assert.strictEqual(changes.removed.length, 0);
        assert.strictEqual(changes.updated.length, 3);
        const byNsuid = new Map(changes.updated.map((u) => [u.before.nsuid, u]));
        assert.ok(byNsuid.get('70010000000001')?.changedFields.includes('title'));
        assert.ok(byNsuid.get('70010000000002')?.changedFields.includes('esrbRating'));
        assert.ok(byNsuid.get('70010000000003')?.changedFields.includes('platforms'));
        assert.ok(byNsuid.get('70010000000003')?.changedFields.includes('genres'));
      },
    },
    {
      name: 'identical catalogs produce an empty diff',
      run: () => {
        const current = baseCatalog();
        const generated = current.map((c) => ({ ...c }));
        const changes = diffCatalogs(current, generated);
        assert.ok(diffIsEmpty(changes));
        assert.strictEqual(changes.added.length, 0);
        assert.strictEqual(changes.removed.length, 0);
        assert.strictEqual(changes.updated.length, 0);
      },
    },
    {
      name: 'comparison is stable by nsuid (a rename is an update, not remove+add)',
      run: () => {
        const current = baseCatalog();
        const generated = baseCatalog();
        generated[1] = { ...generated[1], title: 'Super Mario Odyssey', slug: 'mario-odyssey-switch' };
        const changes = diffCatalogs(current, generated);
        assert.strictEqual(changes.added.length, 0, 'renamed game must not be a new add');
        assert.strictEqual(changes.removed.length, 0, 'renamed game must not be a removal');
        assert.strictEqual(changes.updated.length, 1);
        assert.deepStrictEqual(changes.updated[0].changedFields, ['title', 'slug']);
      },
    },
    {
      name: 'platform/genre reordering is not reported as a change',
      run: () => {
        const current = [
          entry('70010000000001', 'Zelda', {
            slug: 'zelda-switch',
            genres: ['Adventure', 'Action'],
            platforms: ['switch1', 'switch2'],
          }),
        ];
        const generated = [
          entry('70010000000001', 'Zelda', {
            slug: 'zelda-switch',
            genres: ['Action', 'Adventure'],
            platforms: ['switch2', 'switch1'],
          }),
        ];
        const changes = diffCatalogs(current, generated);
        assert.strictEqual(changes.updated.length, 0, 'array reorder should not be flagged');
      },
    },
    {
      name: 'added games maintain required fields',
      run: () => {
        const generated = [
          ...baseCatalog(),
          entry('70010000000004', 'Celeste', { slug: 'celeste-switch', platforms: ['switch1'], genres: ['Platformer'], esrbRating: 'E' }),
        ];
        const errors = validateCatalogEntries(generated);
        assert.deepStrictEqual(errors, [], `added game breaks required fields:\n- ${errors.join('\n- ')}`);
      },
    },
    {
      name: 'removed games are reported, not silently deleted',
      run: () => {
        const current = baseCatalog();
        const generated = current.slice(0, 2);
        const changes = diffCatalogs(current, generated);
        assert.strictEqual(changes.removed.length, 1, 'removed game was not reported');
        assert.strictEqual(changes.removed[0].nsuid, '70010000000003');
      },
    },
    {
      name: 'duplicate detection still works on the generated catalog',
      run: () => {
        const duplicated = [
          { nsuid: '70010000000001', title: 'A', slug: 'a-switch', platforms: ['switch1'] as CatalogGame['platforms'] },
          { nsuid: '70010000000001', title: 'B', slug: 'b-switch', platforms: ['switch1'] as CatalogGame['platforms'] },
        ];
        const errors = validateCatalogEntries(duplicated);
        assert.ok(errors.some((error) => error.includes('Duplicate nsuid')), 'duplicate nsuid not detected');
      },
    },
    {
      name: 'refresh report lists added, removed, and updated games',
      run: () => {
        const current = baseCatalog();
        const generated = [
          ...current.slice(0, 2),
          entry('70010000000004', 'Hollow Knight', { slug: 'hollow-knight-switch' }),
        ];
        const changes = diffCatalogs(current, generated);
        const report = formatCatalogRefreshReport(current.length, changes);
        assert.match(report, /New games: 1/);
        assert.match(report, /Removed games: 1/);
        assert.ok(report.includes('+ Hollow Knight'));
        assert.ok(report.includes('- Kirby'));
      },
    },
    {
      name: 'refresh dry run does not overwrite the committed catalog',
      run: async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-refresh-'));
        const catalogPath = path.join(dir, 'game-catalog.json');
        fs.writeFileSync(catalogPath, `${JSON.stringify(baseCatalog(), null, 2)}\n`, 'utf8');
        const generator = async (options: GenerateCatalogOptions): Promise<void> => {
          fs.writeFileSync(options.outPath as string, `${JSON.stringify(baseCatalog(), null, 2)}\n`, 'utf8');
        };
        try {
          const before = fs.readFileSync(catalogPath, 'utf8');
          const result = await refreshCatalog({ catalogPath, apply: false, generator });
          assert.strictEqual(result.applied, false);
          assert.ok(result.changes.added.length === 0 && result.changes.removed.length === 0);
          const after = fs.readFileSync(catalogPath, 'utf8');
          assert.strictEqual(after, before, 'catalog was overwritten in dry-run mode');
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
    },
  ];

  await runChecks(checks);
  console.log('\nAll catalog refresh validation checks passed.');
}

if (require.main === module) {
  validateRefresh().catch((error: unknown) => {
    console.error('Catalog refresh validation failed:', error);
    process.exitCode = 1;
  });
}