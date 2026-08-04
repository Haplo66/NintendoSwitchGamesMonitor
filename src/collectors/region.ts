import { NintendoRegion } from '../models/settings';

export const DEFAULT_NINTENDO_REGION: NintendoRegion = 'US';

export const SUPPORTED_REGIONS: readonly NintendoRegion[] = ['US'];

export interface RegionProfile {
  country: string;
  currency: string;
  storeBase: string;
}

export const REGION_PROFILES: Record<NintendoRegion, RegionProfile> = {
  US: {
    country: 'US',
    currency: 'USD',
    storeBase: 'https://www.nintendo.com',
  },
};

export function normalizeNintendoRegion(raw: string): NintendoRegion {
  const region = raw.trim().toUpperCase();
  if (region !== 'US') {
    throw new Error(
      `Illegal NINTENDO_REGION "${raw}". Expected one of: ${SUPPORTED_REGIONS.join(', ')}.`,
    );
  }
  return region;
}

export function resolveNintendoRegion(env: NodeJS.ProcessEnv = process.env): NintendoRegion {
  const raw = env.NINTENDO_REGION?.trim();
  if (!raw) {
    return DEFAULT_NINTENDO_REGION;
  }
  return normalizeNintendoRegion(raw);
}