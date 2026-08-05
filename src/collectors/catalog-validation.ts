import { buildStoreUrl, CatalogGame } from './nintendo-price-collector';
import { GAME_PLATFORMS, GamePlatform } from './platform';

export const STORE_URL_PATTERN = /^https:\/\/www\.nintendo\.com\/us\/store\/products\/[a-z0-9-]+\/$/;

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && !slug.startsWith('-') && !slug.endsWith('-');
}

/**
 * Validates a normalized catalog for structural integrity. Returns a list of
 * human-readable problems; an empty array means the catalog is healthy.
 */
export function validateCatalogEntries(catalog: CatalogGame[]): string[] {
  const errors: string[] = [];

  const seenNsuid = new Set<string>();
  const seenSlug = new Set<string>();

  for (const entry of catalog) {
    const nsuid = entry.nsuid.trim();
    const title = entry.title.trim();
    const slug = entry.slug.trim();

    if (!nsuid) {
      errors.push(`Entry "${title || slug || '?'}" is missing its nsuid`);
    } else if (seenNsuid.has(nsuid)) {
      errors.push(`Duplicate nsuid "${nsuid}" (${title})`);
    } else {
      seenNsuid.add(nsuid);
    }

    if (!title) {
      errors.push(`Entry "${slug || nsuid || '?'}" is missing its title`);
    }

    if (!slug) {
      errors.push(`Entry "${title || nsuid || '?'}" is missing its slug`);
    } else {
      const slugKey = slug.toLowerCase();
      if (seenSlug.has(slugKey)) {
        errors.push(`Duplicate slug "${slug}" (${title || nsuid})`);
      } else {
        seenSlug.add(slugKey);
      }
      if (!isValidSlug(slug)) {
        errors.push(`Invalid slug "${slug}" (${title || nsuid})`);
      }
    }

    if (!Array.isArray(entry.platforms) || entry.platforms.length === 0) {
      errors.push(`Entry "${title || slug}" has no platforms`);
    } else {
      for (const platform of entry.platforms) {
        if (!GAME_PLATFORMS.includes(platform as GamePlatform)) {
          errors.push(
            `Entry "${title || slug}" has invalid platform "${platform}" (expected ${GAME_PLATFORMS.join(', ')})`,
          );
        }
      }
    }

    if (slug) {
      const url = buildStoreUrl(entry);
      if (!url || !STORE_URL_PATTERN.test(url)) {
        errors.push(`Entry "${title || slug}" produces an invalid store URL "${url ?? ''}"`);
      }
    }
  }

  return errors;
}
