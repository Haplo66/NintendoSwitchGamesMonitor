import { Game } from '../models';
import { normalizeGameTitle } from '../collectors/nintendo-price-collector';

/**
 * Returns true when the given game title exactly matches one of the
 * blacklisted titles. Matching is case-insensitive and applied to the
 * normalized (trimmed + lowercased) title, so "Carrot Smash", "carrot
 * smash", and "  Carrot Smash  " all match the same blacklist entry.
 */
export function isGameBlacklisted(title: string, blacklistedGames: string[]): boolean {
  const normalized = normalizeGameTitle(title);
  return blacklistedGames.some((entry) => normalizeGameTitle(entry) === normalized);
}

/**
 * Filters a collected game list so blacklisted titles never reach analysis,
 * recommendations, Best Deals, or notification generation. Games checked
 * statistics keep using the unfiltered collection count. An empty blacklist
 * returns the original array unchanged.
 */
export function filterBlacklistedGames(games: Game[], blacklistedGames: string[]): Game[] {
  if (!blacklistedGames || blacklistedGames.length === 0) {
    return games;
  }
  return games.filter((game) => !isGameBlacklisted(game.title, blacklistedGames));
}
