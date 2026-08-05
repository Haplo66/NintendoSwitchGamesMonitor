export type MatchConfidence = 'exact' | 'high' | 'ambiguous' | 'none';

export interface TitleMatch {
  matched: boolean;
  confidence: MatchConfidence;
  /** The candidate title that the query resolved to (only when matched). */
  matchedTitle?: string;
}

// Single tokens that are too generic to resolve on their own. A wishlist title
// made up of only one of these never fuzzy-matches a longer title, so "Deluxe"
// or "Edition" alone cannot accidentally resolve to a game.
const GENERIC_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'game',
  'deluxe',
  'edition',
  'ultimate',
  'collection',
  'bundle',
  'complete',
  'classic',
  'remastered',
  'remake',
  'definitive',
  'standard',
  'special',
  'limited',
  'switch',
  'hd',
  'pack',
  'volume',
]);

/**
 * Normalizes a title for conservative matching:
 * - lowercases
 * - strips accents (é → e) and trademark/copyright symbols (™ ® ©)
 * - folds smart punctuation to ASCII
 * - replaces every remaining non-alphanumeric character with a space
 * - collapses whitespace and trims
 */
export function normalizeTitle(title: string): string {
  let normalized = title.toLowerCase();
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  normalized = normalized
    .replace(/[\u2122\u00ae\u00a9\u00a7]/g, ' ')
    .replace(/[\u2018\u2019\u02bc\u00b4\u0060]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, ' ... ');
  normalized = normalized.replace(/[^a-z0-9]+/g, ' ');
  return normalized.replace(/\s+/g, ' ').trim();
}

export function titleTokens(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

function containsContiguous(candidateTokens: string[], queryTokens: string[]): boolean {
  if (queryTokens.length === 0 || queryTokens.length > candidateTokens.length) {
    return false;
  }
  for (let start = 0; start + queryTokens.length <= candidateTokens.length; start += 1) {
    let found = true;
    for (let offset = 0; offset < queryTokens.length; offset += 1) {
      if (candidateTokens[start + offset] !== queryTokens[offset]) {
        found = false;
        break;
      }
    }
    if (found) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves a single query title against a list of candidate titles using
 * conservative matching:
 *
 * 1. Exact normalized equality → `exact`.
 * 2. The query tokens appear as a contiguous, ordered run inside a candidate
 *    (e.g. "Super Smash Bros" inside "Super Smash Bros. Ultimate"). Exactly one
 *    such candidate → `high`.
 * 3. More than one candidate contains the query → `ambiguous` (not matched).
 * 4. No candidate contains it → `none`.
 *
 * Single generic tokens ("Deluxe", "Edition", ...) are rejected so broad,
 * unsafe matches are never selected. The "Mario" example from the spec is
 * rejected because it matches many candidates at once (ambiguous); a
 * distinctive single token like "Zelda" still resolves when only one candidate
 * contains it.
 */
export function matchTitleToCandidates(query: string, candidates: string[]): TitleMatch {
  const queryTokens = titleTokens(query);
  if (queryTokens.length === 0) {
    return { matched: false, confidence: 'none' };
  }
  const normalizedQuery = queryTokens.join(' ');

  for (const candidate of candidates) {
    if (titleTokens(candidate).join(' ') === normalizedQuery) {
      return { matched: true, confidence: 'exact', matchedTitle: candidate };
    }
  }

  if (queryTokens.length === 1 && GENERIC_WORDS.has(queryTokens[0])) {
    return { matched: false, confidence: 'none' };
  }

  const matches = candidates.filter((candidate) =>
    containsContiguous(titleTokens(candidate), queryTokens),
  );

  if (matches.length === 1) {
    return { matched: true, confidence: 'high', matchedTitle: matches[0] };
  }
  if (matches.length > 1) {
    return { matched: false, confidence: 'ambiguous' };
  }
  return { matched: false, confidence: 'none' };
}

export function matchTitlesToCandidates(queries: string[], candidates: string[]): TitleMatch[] {
  return queries.map((query) => matchTitleToCandidates(query, candidates));
}
