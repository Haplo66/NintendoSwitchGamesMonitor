import { NintendoRegion } from '../models/settings';

export const DEFAULT_NINTENDO_REGION: NintendoRegion = 'US';

export const SUPPORTED_REGIONS: readonly NintendoRegion[] = ['US', 'EU'];

export interface RegionProfile {
  currency: string;
  sourceUrl: string;
  storeBase: string;
}

export const REGION_PROFILES: Record<NintendoRegion, RegionProfile> = {
  US: {
    currency: 'USD',
    sourceUrl:
      'https://searching.nintendo.com/wow/en_US/search/select' +
      '?fq=type:GAME' +
      '&fq=playable_on_txt:HAC' +
      '&fq=price_has_discount_b:true' +
      '&q=*' +
      '&wt=json',
    storeBase: 'https://www.nintendo.com',
  },
  EU: {
    currency: 'EUR',
    sourceUrl:
      'https://searching.nintendo-europe.com/en/select' +
      '?fq=type:GAME' +
      '&fq=playable_on_txt:HAC' +
      '&fq=price_has_discount_b:true' +
      '&q=*' +
      '&wt=json',
    storeBase: 'https://www.nintendo-europe.com',
  },
};

export function normalizeNintendoRegion(raw: string): NintendoRegion {
  const region = raw.trim().toUpperCase();
  if (region !== 'US' && region !== 'EU') {
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