import * as path from 'node:path';
import { FamilyProfile } from '../models';
import { ConfigError, loadJsonFile } from './json-loader';
import { validateFamilyProfile } from './validators';

export function loadFamilyProfiles(filePath?: string): FamilyProfile[] {
  const resolved = filePath ?? path.resolve(process.cwd(), 'data', 'family-profile.json');
  const data = loadJsonFile<unknown>(resolved);

  if (!Array.isArray(data)) {
    throw new ConfigError(`Family profiles file must contain an array: "${resolved}"`);
  }

  return data.map((raw, index) => {
    const profile = raw as FamilyProfile;
    const errors = validateFamilyProfile(profile);
    if (errors.length > 0) {
      throw new ConfigError(
        `Invalid family profile at index ${index} in "${resolved}": ${errors.join('; ')}`,
      );
    }
    return profile;
  });
}
