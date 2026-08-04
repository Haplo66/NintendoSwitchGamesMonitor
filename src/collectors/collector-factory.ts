import { DekuDealsCollector } from './deku-deals-collector';
import { GameCollector } from './game-collector';
import { MockGameCollector } from './mock-game-collector';
import { NintendoRegion } from '../models/settings';

export type GameCollectorKind = 'mock' | 'deku';

export interface CollectorFactoryOptions {
  sourceUrl?: string;
  currency?: string;
  region?: NintendoRegion;
}

export function createGameCollector(
  kind?: GameCollectorKind | string,
  options: CollectorFactoryOptions = {},
): GameCollector {
  const selected = (kind ?? process.env.GAME_COLLECTOR ?? 'mock').toLowerCase();

  switch (selected) {
    case 'deku':
      return new DekuDealsCollector({
        sourceUrl: options.sourceUrl,
        currency: options.currency,
        region: options.region,
      });
    case 'mock':
      return new MockGameCollector();
    default:
      throw new Error(`Unknown game collector: "${selected}"`);
  }
}
