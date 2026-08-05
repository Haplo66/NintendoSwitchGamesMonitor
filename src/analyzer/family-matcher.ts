import { FamilyProfile, Game, FamilyMatchResult } from '../models';

const RATING_MIN_AGES: Record<string, number> = {
  EC: 3,
  E: 6,
  'E10+': 10,
  T: 13,
  M: 17,
  AO: 18,
  RP: 18,
};

export function ratingMinAge(ageRating: string): number | null {
  return RATING_MIN_AGES[ageRating.toUpperCase()] ?? null;
}

// Canonical genre families. Nintendo's store tags shooter games as "Shooting"
// and RPGs as "Role playing", while family profiles may say "Shooter" / "RPG";
// the same games can also be described several ways. Excluded genres are a hard
// filter, so we fold variant labels onto one canonical form before comparing,
// otherwise a profile excluding "Shooter" would never block a game tagged
// "Shooting". Unknown labels pass through after case/whitespace folding.
const GENRE_SYNONYMS: Record<string, string> = {
  shooting: 'shooter',
  shooter: 'shooter',
  'first-person shooter': 'shooter',
  'first person shooter': 'shooter',
  fps: 'shooter',
  'third-person shooter': 'shooter',
  'third person shooter': 'shooter',
  tps: 'shooter',
  "shoot-'em-up": 'shooter',
  "shoot 'em up": 'shooter',
  'shoot em up': 'shooter',
  'run and gun': 'shooter',
  'action shooter': 'shooter',

  horror: 'horror',
  'survival horror': 'horror',
  'psychological horror': 'horror',

  'role playing': 'role-playing',
  'role-playing': 'role-playing',
  rpg: 'role-playing',
};

export function normalizeGenre(label: string): string {
  const key = label.trim().toLowerCase().replace(/\s+/g, ' ');
  return GENRE_SYNONYMS[key] ?? key;
}

export function matchGameToProfile(game: Game, profile: FamilyProfile): FamilyMatchResult {
  const reasons: string[] = [];
  let blocked = false;

  if (profile.maxAge !== undefined) {
    if (game.ageRating) {
      const minAge = ratingMinAge(game.ageRating);
      if (minAge !== null && minAge > profile.maxAge) {
        blocked = true;
        reasons.push(`Age rating ${game.ageRating} (${minAge}+) exceeds max age ${profile.maxAge}`);
      }
    } else {
      reasons.push('No age rating available, not restricted');
    }
  }

  const excludedGenres = profile.excludedGenres.map(normalizeGenre);
  const excludedHit = game.genres.find((genre) => excludedGenres.includes(normalizeGenre(genre)));
  if (excludedHit) {
    blocked = true;
    reasons.push(`Genre "${excludedHit}" is excluded for this profile`);
  }

  if (!blocked) {
    const preferredGenres = profile.preferredGenres.map(normalizeGenre);
    const preferredHit = game.genres.find((genre) =>
      preferredGenres.includes(normalizeGenre(genre)),
    );
    if (preferredHit) {
      reasons.push(`Matches preferred genre "${preferredHit}"`);
    }
  }

  return {
    profileName: profile.name,
    matched: !blocked,
    reasons,
  };
}

export function matchGameToProfiles(
  game: Game,
  profiles: FamilyProfile[],
): FamilyMatchResult[] {
  return profiles.map((profile) => matchGameToProfile(game, profile));
}
