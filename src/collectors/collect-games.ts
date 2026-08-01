import { Game } from '../models';
import { GameCollector } from './game-collector';
import { MockGameCollector } from './mock-game-collector';

function formatPrice(game: Game): string {
  const price = `${game.currency} ${game.currentPrice.toFixed(2)}`;
  if (game.originalPrice === undefined || game.currentPrice >= game.originalPrice) {
    return price;
  }
  const discount = Math.round(((game.originalPrice - game.currentPrice) / game.originalPrice) * 100);
  return `${price} (was ${game.currency} ${game.originalPrice.toFixed(2)}, ${discount}% off)`;
}

function displayGames(games: Game[]): void {
  if (games.length === 0) {
    console.log('No games collected.');
    return;
  }
  games.forEach((game, index) => {
    const tags = [game.platform, game.ageRating ? `Rating: ${game.ageRating}` : null]
      .filter((tag): tag is string => tag !== null)
      .join(' · ');
    const genres = game.genres.length > 0 ? game.genres.join(', ') : 'N/A';
    console.log('');
    console.log(`[${index + 1}] ${game.title}`);
    console.log(`    Price: ${formatPrice(game)}`);
    console.log(`    ${tags} · Genres: ${genres}`);
    console.log(`    Source: ${game.source} (id: ${game.id})`);
    if (game.storeUrl) {
      console.log(`    Store: ${game.storeUrl}`);
    }
  });
}

export async function collectGames(): Promise<Game[]> {
  const collector: GameCollector = new MockGameCollector();
  const games = await collector.collectGames();

  const source = games[0]?.source ?? 'unknown';
  console.log(`Collected ${games.length} games from "${source}" source.`);
  displayGames(games);
  return games;
}

if (require.main === module) {
  collectGames().catch((error: unknown) => {
    console.error('Failed to collect games:', error);
    process.exitCode = 1;
  });
}
