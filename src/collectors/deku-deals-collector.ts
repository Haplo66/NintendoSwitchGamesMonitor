import { Game } from '../models';
import { CollectGamesOptions, GameCollector } from './game-collector';
import { CollectorError } from './collector-error';

export const DEFAULT_SOURCE_URL =
  'https://searching.nintendo-europe.com/en/select' +
  '?fq=type:GAME' +
  '&fq=playable_on_txt:HAC' +
  '&fq=price_has_discount_b:true' +
  '&q=*' +
  '&wt=json';

const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = 'NintendoSwitchGamesMonitor/0.6.0 (+https://github.com/Haplo66/NintendoSwitchGamesMonitor)';

export interface DealDoc {
  fs_id?: string | number;
  title?: string;
  url?: string;
  price_regular_f?: number;
  price_discounted_f?: number;
  price_has_discount_b?: boolean;
  playable_on_txt?: string[];
  pretty_agerating_s?: string;
  game_categories_txt?: string[];
  image_url_h16x9_s?: string;
  image_url_sq_s?: string;
}

export interface DekuDealsCollectorOptions {
  sourceUrl?: string;
  currency?: string;
}

function extractDocs(body: unknown): DealDoc[] | null {
  if (body && typeof body === 'object') {
    const response = (body as { response?: { docs?: unknown[] } }).response;
    if (response && Array.isArray(response.docs)) {
      return response.docs as DealDoc[];
    }
  }
  return null;
}

export function mapDealDoc(doc: DealDoc, currency: string): Game | null {
  const rawId = doc.fs_id;
  const title = typeof doc.title === 'string' ? doc.title.trim() : '';
  const currentPrice = doc.price_discounted_f ?? doc.price_regular_f;

  if (rawId === undefined || rawId === null || rawId === '') {
    return null;
  }
  if (!title) {
    return null;
  }
  if (typeof currentPrice !== 'number' || currentPrice < 0) {
    return null;
  }

  const isDiscounted = doc.price_has_discount_b === true && typeof doc.price_regular_f === 'number';
  const storeUrl = doc.url
    ? `https://www.nintendo-europe.com${doc.url.startsWith('/') ? doc.url : `/${doc.url}`}`
    : undefined;

  return {
    id: `dekudeals-${String(rawId)}`,
    title,
    platform: 'Nintendo Switch',
    currentPrice,
    originalPrice: isDiscounted ? doc.price_regular_f : undefined,
    currency,
    ageRating: typeof doc.pretty_agerating_s === 'string' ? doc.pretty_agerating_s : undefined,
    genres: Array.isArray(doc.game_categories_txt)
      ? doc.game_categories_txt.filter((genre): genre is string => typeof genre === 'string')
      : [],
    storeUrl,
    imageUrl:
      typeof doc.image_url_h16x9_s === 'string'
        ? doc.image_url_h16x9_s
        : typeof doc.image_url_sq_s === 'string'
          ? doc.image_url_sq_s
          : undefined,
    source: 'dekudeals',
  };
}

export class DekuDealsCollector implements GameCollector {
  private readonly sourceUrl: string;
  private readonly currency: string;

  constructor(options: DekuDealsCollectorOptions = {}) {
    this.sourceUrl = options.sourceUrl ?? process.env.DEALS_SOURCE_URL ?? DEFAULT_SOURCE_URL;
    this.currency = options.currency ?? process.env.DEALS_CURRENCY ?? DEFAULT_CURRENCY;
  }

  async collectGames(options: CollectGamesOptions = {}): Promise<Game[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const url = new URL(this.sourceUrl);
    url.searchParams.set('rows', String(limit));
    url.searchParams.set('start', '0');
    url.searchParams.set('wt', 'json');

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CollectorError(
        `Failed to fetch deals from "${this.sourceUrl}": ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      throw new CollectorError(
        `Deals source returned HTTP ${response.status} ${response.statusText} for "${this.sourceUrl}"`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new CollectorError(
        `Deals source returned invalid JSON for "${this.sourceUrl}": ${(error as Error).message}`,
      );
    }

    const docs = extractDocs(body);
    if (docs === null) {
      throw new CollectorError(
        `Deals source response is missing the "response.docs" array for "${this.sourceUrl}"`,
      );
    }

    const games: Game[] = [];
    for (const doc of docs) {
      const game = mapDealDoc(doc, this.currency);
      if (game && (!options.currency || game.currency === options.currency)) {
        games.push(game);
      }
    }
    return games;
  }
}
