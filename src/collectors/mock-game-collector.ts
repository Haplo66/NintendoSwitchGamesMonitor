import { Game } from '../models';
import { CollectGamesOptions, GameCollector } from './game-collector';

export class MockGameCollector implements GameCollector {
  private readonly games: Game[];

  constructor() {
    this.games = [
      {
        id: 'mock-zelda-breath-of-the-wild',
        title: 'The Legend of Zelda: Breath of the Wild',
        description: 'Explore the vast open world of Hyrule in this epic adventure.',
        platform: 'Nintendo Switch',
        currentPrice: 39.99,
        originalPrice: 59.99,
        currency: 'USD',
        ageRating: 'E10+',
        genres: ['Action', 'Adventure'],
        storeUrl: 'https://www.nintendo.com/store/products/the-legend-of-zelda-breath-of-the-wild/',
        imageUrl:
          'https://assets.nintendo.com/image/upload/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/1501253/untitled-2',
        source: 'mock',
      },
      {
        id: 'mock-mario-kart-8-deluxe',
        title: 'Mario Kart 8 Deluxe',
        description: 'Race your friends in the definitive version of Mario Kart.',
        platform: 'Nintendo Switch',
        currentPrice: 33.59,
        originalPrice: 59.99,
        currency: 'USD',
        ageRating: 'E',
        genres: ['Racing', 'Multiplayer'],
        storeUrl: 'https://www.nintendo.com/store/products/mario-kart-8-deluxe/',
        imageUrl:
          'https://assets.nintendo.com/image/upload/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/1574217/untitled',
        source: 'mock',
      },
      {
        id: 'mock-super-mario-odyssey',
        title: 'Super Mario Odyssey',
        description: 'A colorful, kid-friendly platforming adventure across many kingdoms.',
        platform: 'Nintendo Switch',
        currentPrice: 49.99,
        currency: 'USD',
        ageRating: 'E',
        genres: ['Platformer', 'Adventure'],
        storeUrl: 'https://www.nintendo.com/store/products/super-mario-odyssey/',
        imageUrl:
          'https://assets.nintendo.com/image/upload/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/1608454/untitled',
        source: 'mock',
      },
      {
        id: 'mock-fortnite',
        title: 'Fortnite',
        description: 'The hit free-to-play battle royale, with no barrier to entry.',
        platform: 'Nintendo Switch',
        currentPrice: 0,
        currency: 'USD',
        ageRating: 'T',
        genres: ['Action', 'Shooter', 'Multiplayer'],
        storeUrl: 'https://www.nintendo.com/store/products/fortnite/',
        imageUrl:
          'https://assets.nintendo.com/image/upload/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/1501759/untitled',
        source: 'mock',
      },
      {
        id: 'mock-fall-guys',
        title: 'Fall Guys: Ultimate Knockout',
        description: 'A chaotic free-to-play party game where anyone can win.',
        platform: 'Nintendo Switch',
        currentPrice: 0,
        currency: 'USD',
        ageRating: 'E',
        genres: ['Party', 'Action', 'Multiplayer'],
        storeUrl: 'https://www.nintendo.com/store/products/fall-guys-ultimate-knockout/',
        imageUrl:
          'https://assets.nintendo.com/image/upload/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/1773610/untitled',
        source: 'mock',
      },
    ];
  }

  async collectGames(options: CollectGamesOptions = {}): Promise<Game[]> {
    const { limit, currency } = options;
    let games = this.games;
    if (currency) {
      games = games.filter((game) => game.currency === currency);
    }
    if (limit) {
      games = games.slice(0, limit);
    }
    return games.map((game) => ({ ...game }));
  }

  monitoredTitles(): string[] {
    return this.games.map((game) => game.title);
  }

  collectWishlistPrices(titles: string[]): Promise<Game[]> {
    const wanted = new Set(titles.map((title) => title.trim().toLowerCase()));
    return Promise.resolve(
      this.games
        .filter((game) => wanted.has(game.title.trim().toLowerCase()))
        .map((game) => ({ ...game })),
    );
  }
}
