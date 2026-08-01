import { DekuDealsCollector } from './deku-deals-collector';
import { GameCollector } from './game-collector';
import { MockGameCollector } from './mock-game-collector';

export type GameCollectorKind = 'mock' | 'deku';

export function createGameCollector(kind?: GameCollectorKind | string): GameCollector {
  const selected = (kind ?? process.env.GAME_COLLECTOR ?? 'mock').toLowerCase();

  switch (selected) {
    case 'deku':
      return new DekuDealsCollector();
    case 'mock':
      return new MockGameCollector();
    default:
      throw new Error(`Unknown game collector: "${selected}"`);
  }
}
