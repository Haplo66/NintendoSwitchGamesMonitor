import * as fs from 'node:fs';

import { Game } from '../models';
import { NintendoPlatform, NintendoRegion } from '../models/settings';
import { CollectGamesOptions, GameCollector } from './game-collector';
import { CollectorError } from './collector-error';
import { resolveNintendoRegion } from './region';
import { GamePlatform, gameOnPlatform, resolveNintendoPlatform } from './platform';

export const DEFAULT_GAME_CATALOG_PATH = 'data/game-catalog.json';
export const PRICE_API_URL = 'https://api.ec.nintendo.com/v1/price';

const REQUEST_TIMEOUT_MS = 15000;
const PRICE_BATCH_SIZE = 20;
const USER_AGENT = 'NintendoSwitchGamesMonitor/0.19.0 (+https://github.com/Haplo66/NintendoSwitchGamesMonitor)';
const LANGUAGE = 'en';

export interface CatalogGame {
  nsuid: string;
  title: string;
  slug: string;
  platforms?: GamePlatform[];
  genres?: string[];
  esrbRating?: string;
}

export interface NintendoPriceCollectorOptions {
  currency?: string;
  region?: NintendoRegion;
  platform?: NintendoPlatform;
  catalogPath?: string;
  priceApiUrl?: string;
}

export interface PriceMoney {
  amount?: string;
  currency?: string;
  raw_value?: string;
}

export interface PriceEntry {
  title_id?: number | string;
  sales_status?: string;
  regular_price?: PriceMoney;
  discount_price?: PriceMoney;
}

export interface PriceResponse {
  country?: string;
  prices?: PriceEntry[];
}

function loadCatalogFile(filePath: string): CatalogGame[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new CollectorError(`Failed to read game catalog "${filePath}": ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CollectorError(`Game catalog "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new CollectorError(`Game catalog "${filePath}" must be a JSON array of game entries`);
  }
  return normalizeCatalog(parsed as unknown[]);
}

export function normalizeCatalog(entries: unknown[]): CatalogGame[] {
  const games: CatalogGame[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const nsuid = typeof record.nsuid === 'string' ? record.nsuid.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
    if (!nsuid || !title || !slug) {
      continue;
    }
    const platforms = Array.isArray(record.platforms)
      ? record.platforms.filter((option): option is GamePlatform => option === 'switch1' || option === 'switch2')
      : [];
    const genres = Array.isArray(record.genres)
      ? record.genres.filter((genre): genre is string => typeof genre === 'string')
      : undefined;
    const esrbRating =
      typeof record.esrbRating === 'string' && record.esrbRating.trim() ? record.esrbRating.trim() : undefined;
    games.push({
      nsuid,
      title,
      slug,
      platforms: platforms.length > 0 ? platforms : ['switch1'],
      genres,
      esrbRating,
    });
  }
  return games;
}

export function loadGameCatalog(filePath: string = DEFAULT_GAME_CATALOG_PATH): CatalogGame[] {
  return loadCatalogFile(filePath);
}

export function buildStoreUrl(entry: CatalogGame): string | undefined {
  const slug = entry.slug.trim();
  if (!slug) {
    return undefined;
  }
  return `https://www.nintendo.com/us/store/products/${slug}/`;
}

function parseMoneyToNumber(value: PriceMoney | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const raw = value.raw_value;
  if (typeof raw !== 'string' || raw === '') {
    return undefined;
  }
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

export function mapPriceToGame(
  entry: CatalogGame,
  price: PriceEntry,
  currency: string,
  expectedCurrency: string,
): Game | null {
  const priceCurrency = price.regular_price?.currency;
  if (!priceCurrency || priceCurrency !== currency || priceCurrency !== expectedCurrency) {
    return null;
  }
  const regularPrice = parseMoneyToNumber(price.regular_price);
  const discountPrice = parseMoneyToNumber(price.discount_price);
  if (regularPrice === undefined || discountPrice === undefined) {
    return null;
  }
  if (discountPrice >= regularPrice) {
    return null;
  }

  return {
    id: `nintendo-price-${entry.nsuid}`,
    title: entry.title,
    platform: 'Nintendo Switch',
    currentPrice: discountPrice,
    originalPrice: regularPrice,
    currency,
    ageRating: entry.esrbRating,
    genres: entry.genres ?? [],
    storeUrl: buildStoreUrl(entry),
    source: 'nintendo-price',
  };
}

export class NintendoPriceCollector implements GameCollector {
  private readonly currency: string;
  private readonly region: NintendoRegion;
  private readonly platform: NintendoPlatform;
  private readonly catalogPath: string;
  private readonly priceApiUrl: string;

  constructor(options: NintendoPriceCollectorOptions = {}) {
    this.region = options.region ?? resolveNintendoRegion(process.env);
    this.currency = options.currency ?? process.env.DEALS_CURRENCY ?? 'USD';
    this.platform = options.platform ?? resolveNintendoPlatform(process.env);
    this.catalogPath = options.catalogPath ?? process.env.GAME_CATALOG ?? DEFAULT_GAME_CATALOG_PATH;
    this.priceApiUrl = options.priceApiUrl ?? PRICE_API_URL;
  }

  filterCatalogByPlatform(catalog: CatalogGame[]): CatalogGame[] {
    return catalog.filter((entry) => gameOnPlatform(entry.platforms, this.platform));
  }

  monitoredTitles(): string[] {
    return this.filterCatalogByPlatform(loadGameCatalog(this.catalogPath)).map(
      (entry) => entry.title,
    );
  }

  private async fetchPrices(nsuids: string[]): Promise<PriceEntry[]> {
    const url = new URL(this.priceApiUrl);
    url.searchParams.set('country', 'US');
    url.searchParams.set('lang', LANGUAGE);
    for (const nsuid of nsuids) {
      url.searchParams.append('ids', nsuid);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CollectorError(
        `Failed to fetch prices from the Nintendo price API: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      throw new CollectorError(
        `Nintendo price API returned HTTP ${response.status} ${response.statusText} for "${this.priceApiUrl}"`,
      );
    }

    let body: PriceResponse;
    try {
      body = (await response.json()) as PriceResponse;
    } catch (error) {
      throw new CollectorError(
        `Nintendo price API returned invalid JSON for "${this.priceApiUrl}": ${(error as Error).message}`,
      );
    }

    if (!Array.isArray(body.prices)) {
      throw new CollectorError(
        `Nintendo price API response is missing the "prices" array for "${this.priceApiUrl}"`,
      );
    }
    return body.prices;
  }

  async collectGames(options: CollectGamesOptions = {}): Promise<Game[]> {
    const catalog = this.filterCatalogByPlatform(loadGameCatalog(this.catalogPath));
    if (catalog.length === 0) {
      return [];
    }
    const limit = options.limit ?? catalog.length;

    const games: Game[] = [];
    for (let start = 0; start < catalog.length; start += PRICE_BATCH_SIZE) {
      const batch = catalog.slice(start, start + PRICE_BATCH_SIZE);
      const prices = await this.fetchPrices(batch.map((entry) => entry.nsuid));
      const byNsuid = new Map<string, PriceEntry>();
      for (const price of prices) {
        if (price.title_id === undefined || price.title_id === null) {
          continue;
        }
        byNsuid.set(String(price.title_id), price);
      }
      for (const entry of batch) {
        const price = byNsuid.get(entry.nsuid);
        if (!price) {
          continue;
        }
        const game = mapPriceToGame(entry, price, this.currency, 'USD');
        if (game && (!options.currency || game.currency === options.currency)) {
          games.push(game);
        }
      }
      if (games.length >= limit) {
        break;
      }
    }
    return games.slice(0, limit);
  }
}