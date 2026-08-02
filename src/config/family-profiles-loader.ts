import * as path from 'node:path';
import { FamilyProfile } from '../models';
import { ConfigError, loadJsonFile } from './json-loader';
import { validateFamilyProfile } from './validators';

export function normalizeFamilyProfile(raw: unknown): FamilyProfile {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { name: undefined as unknown as string, preferredGenres: [], excludedGenres: [] };
  }
  const value = raw as Record<string, unknown>;
  return {
    name: value.name as string,
    maxAge: value.maxAge as number | undefined,
    preferredGenres: (value.preferredGenres as string[] | undefined) ?? [],
    excludedGenres: (value.excludedGenres as string[] | undefined) ?? [],
    notes: value.notes as string | undefined,
  };
}

export function loadFamilyProfiles(filePath?: string): FamilyProfile[] {
  const resolved = filePath ?? path.resolve(process.cwd(), 'data', 'family-profile.json');
  const data = loadJsonFile<unknown>(resolved);

  if (!Array.isArray(data)) {
    throw new ConfigError(`Family profiles file must contain an array: "${resolved}"`);
  }

  const profiles: FamilyProfile[] = data.map((raw) => normalizeFamilyProfile(raw));

  const errors: string[] = [];
  const seenNames = new Set<string>();
  for (let index = 0; index < profiles.length; index++) {
    const profile = profiles[index];
    const validationErrors = validateFamilyProfile(profile);
    for (const error of validationErrors) {
      errors.push(`Invalid family profile at index ${index} in "${resolved}": ${error}`);
    }
    if (typeof profile.name === 'string' && profile.name.trim() !== '') {
      const key = profile.name.trim().toLowerCase();
      if (seenNames.has(key)) {
        errors.push(`Duplicate family profile name "${profile.name}" at index ${index} in "${resolved}"`);
      }
      seenNames.add(key);
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(errors.join('\n'));
  }
  return profiles;
}
