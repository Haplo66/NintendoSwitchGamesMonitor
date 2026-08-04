import { GameCollector } from './game-collector';
import { MockGameCollector } from './mock-game-collector';
import { NintendoPriceCollector, DEFAULT_GAME_CATALOG_PATH } from './nintendo-price-collector';
import { NintendoRegion } from '../models/settings';

export type GameCollectorKind = 'mock' | 'nintendo';

export interface CollectorFactoryOptions {
  currency?: string;
  region?: NintendoRegion;
  catalogPath?: string;
}

export function createGameCollector(
  kind?: GameCollectorKind | string,
  options: CollectorFactoryOptions = {},
): GameCollector {
  const selected = (kind ?? process.env.GAME_COLLECTOR ?? 'mock').toLowerCase();

  switch (selected) {
    case 'nintendo':
      return new NintendoPriceCollector({
        currency: options.currency,
        region: options.region,
        catalogPath: options.catalogPath,
      });
    case 'mock':
      return new MockGameCollector();
    default:
      throw new Error(`Unknown game collector: "${selected}"`);
  }
}

export { DEFAULT_GAME_CATALOG_PATH };