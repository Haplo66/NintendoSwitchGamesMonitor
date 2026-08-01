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

  const excludedHit = game.genres.find((genre) => profile.excludedGenres.includes(genre));
  if (excludedHit) {
    blocked = true;
    reasons.push(`Genre "${excludedHit}" is excluded for this profile`);
  }

  if (!blocked) {
    const preferredHit = game.genres.find((genre) => profile.preferredGenres.includes(genre));
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
