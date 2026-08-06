import { CatalogGame } from './nintendo-price-collector';

/**
 * A single metadata change between two versions of a catalog entry. `before` is
 * the entry as it existed in the current catalog and `after` is its replacement
 * in the generated catalog. `changedFields` lists exactly which tracked fields
 * actually differ (so a report can read "title changed", "genres changed", …).
 */
export interface CatalogUpdate {
  before: CatalogGame;
  after: CatalogGame;
  changedFields: CatalogDiffField[];
}

/**
 * Fields the diff tracks. Every change in these fields is an "updated" entry;
 * anything else is ignored for stability purposes (so noise like reordering of
 * optional metadata never flags a catalog as churned).
 */
export const CATALOG_DIFF_FIELDS = ['title', 'slug', 'platforms', 'esrbRating', 'genres'] as const;
export type CatalogDiffField = (typeof CATALOG_DIFF_FIELDS)[number];

/**
 * Structured result of comparing a generated catalog against the current one.
 * Comparison is keyed by the stable identifier `nsuid`, never by title or slug,
 * so a renamed game is reported as an update rather than a remove + add.
 */
export interface CatalogChanges {
  added: CatalogGame[];
  removed: CatalogGame[];
  updated: CatalogUpdate[];
}

const FIELD_DISPLAY_NAMES: Record<CatalogDiffField, string> = {
  title: 'title',
  slug: 'slug',
  platforms: 'platforms',
  esrbRating: 'ESRB rating',
  genres: 'genres',
};

function normalizeComparable(value: unknown): unknown {
  // Array fields (platforms, genres) are order-insensitive, so compare them as
  // sorted sets instead of treating a reorder as a content change.
  if (Array.isArray(value)) {
    return [...value].sort();
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b));
}

/**
 * Compares a generated catalog against the current committed catalog, keyed by
 * `nsuid`. Returns added, removed, and updated entries. Field changes are
 * detected only for the tracked metadata fields; the entries are returned
 * unchanged so callers can present details however they like.
 */
export function diffCatalogs(current: CatalogGame[], generated: CatalogGame[]): CatalogChanges {
  const generatedByNsuid = new Map<string, CatalogGame>();
  for (const entry of generated) {
    generatedByNsuid.set(entry.nsuid, entry);
  }

  const currentNsuids = new Set(current.map((entry) => entry.nsuid));

  const added: CatalogGame[] = [];
  for (const entry of generated) {
    if (!currentNsuids.has(entry.nsuid)) {
      added.push(entry);
    }
  }

  const removed: CatalogGame[] = [];
  for (const entry of current) {
    if (!generatedByNsuid.has(entry.nsuid)) {
      removed.push(entry);
    }
  }

  const updated: CatalogUpdate[] = [];
  for (const entry of current) {
    const candidate = generatedByNsuid.get(entry.nsuid);
    if (!candidate) {
      continue;
    }
    const changedFields = CATALOG_DIFF_FIELDS.filter(
      (field) => !valuesEqual(entry[field], candidate[field]),
    );
    if (changedFields.length > 0) {
      updated.push({ before: entry, after: candidate, changedFields });
    }
  }

  return { added, removed, updated };
}

export function diffIsEmpty(changes: CatalogChanges): boolean {
  return changes.added.length === 0 && changes.removed.length === 0 && changes.updated.length === 0;
}

/**
 * Renders a compact, human-readable summary of a catalog refresh. Designed to
 * be short enough to skim in CI output while still naming every game that was
 * added, removed, or changed.
 */
export function formatCatalogRefreshReport(
  currentCount: number,
  changes: CatalogChanges,
): string {
  const line: string[] = [];
  line.push('Catalog Refresh');
  line.push('');
  line.push(`Current games: ${currentCount}`);
  line.push(`New games: ${changes.added.length}`);
  line.push(`Removed games: ${changes.removed.length}`);
  line.push(`Updated games: ${changes.updated.length}`);

  if (changes.added.length > 0) {
    line.push('');
    line.push('Added:');
    for (const entry of changes.added) {
      line.push(`+ ${entry.title}`);
    }
  }
  if (changes.removed.length > 0) {
    line.push('');
    line.push('Removed:');
    for (const entry of changes.removed) {
      line.push(`- ${entry.title}`);
    }
  }
  if (changes.updated.length > 0) {
    line.push('');
    line.push('Updated:');
    for (const entry of changes.updated) {
      line.push(`* ${entry.after.title}`);
      for (const field of entry.changedFields) {
        line.push(`  ${FIELD_DISPLAY_NAMES[field]} changed`);
      }
    }
  }
  if (diffIsEmpty(changes)) {
    line.push('');
    line.push('No changes detected.');
  }

  return line.join('\n');
}