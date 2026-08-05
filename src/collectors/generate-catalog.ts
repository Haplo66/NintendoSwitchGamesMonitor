import 'dotenv/config';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadWishlist } from '../config/wishlist-loader';
import { matchTitlesToCandidates, TitleMatch } from '../matching/title-matcher';
import { GamePlatform } from './platform';
import { DEFAULT_GAME_CATALOG_PATH } from './nintendo-price-collector';
import { validateCatalogEntries } from './catalog-validation';

export const SITEMAP_URL = 'https://www.nintendo.com/us/store/sitemap.xml';
export const STORE_PRODUCT_PREFIX = 'https://www.nintendo.com/us/store/products/';
export const DEFAULT_CATALOG_TARGET = 300;
export const REQUEST_CONCURRENCY = 8;
export const REQUEST_TIMEOUT_MS = 20000;

export interface GeneratedCatalogEntry {
  nsuid: string;
  title: string;
  slug: string;
  platforms: GamePlatform[];
  genres?: string[];
  esrbRating?: string;
}

// Curated slugs of well-known, family-relevant Nintendo Switch games. These are
// always tried first so the catalog keeps a stable, high-quality core no matter
// how the remaining games are topped up from the sitemap.
export const SEED_SLUGS: string[] = [
  'the-legend-of-zelda-breath-of-the-wild-switch',
  'mario-kart-8-deluxe-switch',
  'super-mario-odyssey-switch',
  'animal-crossing-new-horizons-switch',
  'super-smash-bros-ultimate-switch',
  'kirby-and-the-forgotten-land-switch',
  'metroid-dread-switch',
  'hollow-knight-switch',
  'celeste-switch',
  'hades-switch',
  'stardew-valley-switch',
  'the-legend-of-zelda-tears-of-the-kingdom-switch',
  'the-legend-of-zelda-links-awakening-switch',
  'the-legend-of-zelda-skyward-sword-hd-switch',
  'the-legend-of-zelda-twilight-princess-hd-switch',
  'super-mario-3d-all-stars-switch',
  'super-mario-3d-world-bowsers-fury-switch',
  'super-mario-bros-wonder-switch',
  'super-mario-party-switch',
  'mario-party-superstars-switch',
  'mario-party-jamboree-switch',
  'new-super-mario-bros-u-deluxe-switch',
  'super-mario-maker-2-switch',
  'luigis-mansion-3-switch',
  'donkey-kong-country-tropical-freeze-switch',
  'pikmin-3-deluxe-switch',
  'pikmin-4-switch',
  'splatoon-2-switch',
  'splatoon-3-switch',
  'kirby-star-allies-switch',
  'kirbys-dream-buffet-switch',
  'yoshis-crafted-world-switch',
  'captain-toad-treasure-tracker-switch',
  'miitopia-switch',
  'ring-fit-adventure-switch',
  'nintendo-switch-sports-switch',
  'mario-tennis-aces-switch',
  'mario-golf-super-rush-switch',
  'mario-strikers-battle-league-switch',
  'clubhouse-games-51-worldwide-classics-switch',
  'snipperclips-cut-it-out-together-switch',
  'fire-emblem-three-houses-switch',
  'fire-emblem-engage-switch',
  'fire-emblem-warriors-three-hopes-switch',
  'xenoblade-chronicles-definitive-edition-switch',
  'xenoblade-chronicles-2-switch',
  'xenoblade-chronicles-3-switch',
  'astral-chain-switch',
  'octopath-traveler-switch',
  'octopath-traveler-2-switch',
  'triangle-strategy-switch',
  'bravely-default-2-switch',
  'monster-hunter-rise-switch',
  'monster-hunter-stories-2-wings-of-ruin-switch',
  'bayonetta-2-switch',
  'bayonetta-3-switch',
  'metroid-prime-remastered-switch',
  'pokemon-lets-go-pikachu-switch',
  'pokemon-lets-go-eevee-switch',
  'pokemon-sword-switch',
  'pokemon-shield-switch',
  'pokemon-brilliant-diamond-switch',
  'pokemon-shining-pearl-switch',
  'pokemon-scarlet-switch',
  'pokemon-violet-switch',
  'pokemon-legends-arceus-switch',
  'pokemon-legends-z-a-switch',
  'pokemon-mystery-dungeon-rescue-team-dx-switch',
  'new-pokemon-snap-switch',
  'pokken-tournament-dx-switch',
  'sonic-mania-switch',
  'sonic-colors-ultimate-switch',
  'sonic-frontiers-switch',
  'sonic-superstars-switch',
  'sonic-origins-switch',
  'minecraft-switch',
  'minecraft-dungeons-switch',
  'lego-city-undercover-switch',
  'lego-star-wars-the-skywalker-saga-switch',
  'overcooked-2-switch',
  'overcooked-all-you-can-eat-switch',
  'cuphead-switch',
  'shovel-knight-treasure-trove-switch',
  'yooka-laylee-and-the-impossible-lair-switch',
  'ori-and-the-blind-forest-definitive-edition-switch',
  'ori-and-the-will-of-the-wisps-switch',
  'dead-cells-switch',
  'slay-the-spire-switch',
  'undertale-switch',
  'dark-souls-remastered-switch',
  'the-elder-scrolls-v-skyrim-switch',
  'doom-switch',
  'doom-eternal-switch',
  'the-witcher-3-wild-hunt-complete-edition-switch',
  'diablo-iii-eternal-collection-switch',
  'dragon-quest-xi-s-echoes-of-an-elusive-age-definitive-edition-switch',
  'dragon-quest-builders-2-switch',
  'persona-5-royal-switch',
  'nier-automata-the-end-of-yorha-edition-switch',
  'a-hat-in-time-switch',
  'gris-switch',
  'limbo-switch',
  'terraria-switch',
  'rayman-legends-definitive-edition-switch',
  'crash-bandicoot-n-sane-trilogy-switch',
  'crash-bandicoot-4-its-about-time-switch',
  'spyro-reignited-trilogy-switch',
  'okami-hd-switch',
  'katamari-damacy-roroll-switch',
  'puyo-puyo-tetris-switch',
  'mario-kart-world-switch-2',
  'donkey-kong-bananza-switch-2',
  'pokemon-scarlet-switch',
  'pokemon-violet-switch',
  'pokemon-legends-arceus-switch',
  'pokemon-lets-go-pikachu-switch',
  'pokemon-lets-go-eevee-switch',
  'pokemon-brilliant-diamond-switch',
  'pokemon-shining-pearl-switch',
  'pokemon-sword-switch',
  'pokemon-shield-switch',
  'doom-eternal-70010000018023-switch',
  'doom-switch',
  'super-mario-party-jamboree-switch',
  'donkey-kong-country-tropical-freeze-switch',
  'pikmin-4-switch',
  'luigis-mansion-2-hd-switch',
  'princess-peach-showtime-switch',
  'new-super-mario-bros-u-deluxe-switch',
  'paper-mario-the-thousand-year-door-switch',
  'mario-golf-super-rush-switch',
  'mario-tennis-aces-switch',
  'yoshis-crafted-world-switch',
];

// Substrings that make a sitemap slug look like DLC, hardware, amiibo, or other
// non-game products. Candidates containing any of these are skipped.
const NON_GAME_MARKERS: string[] = [
  '-expansion-pass-',
  'expansion-pass-',
  '-bundle-',
  '-bundle',
  '-upgrade-pack',
  '-double-pack',
  '-triple-pack',
  '-dlc',
  'amiibo-',
  '-postcard',
  '-controller-',
  'joy-con',
  'pro-controller',
  '-console-',
  'switch-2-system',
  '-screen-protector',
  '-case-switch',
  'membership',
  '-gift-card',
  '-giftcard',
  'nso-',
  '-nso',
  '-online-membership',
  '-hardware',
  'labo-',
  '-toy-con',
  'nintendo-switch-2-',
  '-switch-2-edition',
];

// Keywords that bias the automated top-up toward family-relevant titles.
const FAMILY_KEYWORDS: string[] = [
  'mario',
  'zelda',
  'kirby',
  'pokemon',
  'splatoon',
  'animal-crossing',
  'donkey-kong',
  'pikmin',
  'metroid',
  'yoshi',
  'wario',
  'luigi',
  'sonic',
  'minecraft',
  'lego',
  'stardew',
  'hollow',
  'celeste',
  'hades',
  'cuphead',
  'octopath',
  'fire-emblem',
  'xenoblade',
  'tetris',
  'overcooked',
  'smash',
  'mario-party',
  'mario-kart',
  'snip',
  'yooka',
  'shovel-knight',
  'golf-story',
  'monster-hunter',
  'persona',
  'dead-cells',
  'slay-the-spire',
  'undertale',
  'crash-bandicoot',
  'spyro',
  'rayman',
  'gris',
  'oriente',
];

function isGameSlug(slug: string): boolean {
  if (!slug.endsWith('-switch') && !slug.endsWith('-switch-2')) {
    return false;
  }
  return !NON_GAME_MARKERS.some((marker) => slug.includes(marker));
}

function platformsForSlug(slug: string): GamePlatform[] {
  return slug.endsWith('-switch-2') ? ['switch2'] : ['switch1'];
}

function cleanTitle(name: string): string {
  let cleaned = name.replace(/[\u2122\u00ae]/g, '');
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Fold smart punctuation to ASCII so titles match wishlist entries typed with
  // plain apostrophes/quotes ("Yoshi's", "Pokemon: Let's Go").
  cleaned = cleaned
    .replace(/[\u2018\u2019\u02bc\u00b4\u0060]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

// DLC, demos, expansion passes, and other add-on content carry nsuids that do
// not start with "7001" (e.g. 7003/7005/7007). Full standalone games are the
// only entries we want in the monitored catalog.
function isStandaloneGameNsuid(nsuid: string): boolean {
  return nsuid.startsWith('7001');
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NintendoSwitchGamesMonitor/0.20.0 (+catalog-generator)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for "${url}"`);
  }
  return response.text();
}

export async function fetchSitemapSlugs(): Promise<string[]> {
  const xml = await fetchText(SITEMAP_URL);
  const slugs: string[] = [];
  const locPattern = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = locPattern.exec(xml)) !== null) {
    const url = match[1];
    if (!url.startsWith(STORE_PRODUCT_PREFIX)) {
      continue;
    }
    const slug = url.slice(STORE_PRODUCT_PREFIX.length).replace(/\/$/, '');
    if (slug && isGameSlug(slug)) {
      slugs.push(slug);
    }
  }
  return [...new Set(slugs)];
}

interface ApolloGraph {
  [key: string]: {
    nsuid?: string;
    name?: string;
    urlKey?: string;
    contentRating?: { __ref?: string };
    tags?: { genres?: Array<{ label?: string }> };
    softwareDetails?: { romSizes?: Array<{ platform?: string }> };
    [k: string]: unknown;
  } | null;
}

export function extractCatalogEntry(
  apollo: ApolloGraph,
  slug: string,
): GeneratedCatalogEntry | undefined {
  let product: ApolloGraph[string] | undefined;
  for (const key of Object.keys(apollo)) {
    const value = apollo[key];
    if (value && value.urlKey === slug && value.nsuid && value.name) {
      product = value;
      break;
    }
  }
  if (!product) {
    return undefined;
  }
  const nsuid = product.nsuid as string;
  if (!isStandaloneGameNsuid(nsuid)) {
    return undefined;
  }
  const title = cleanTitle(product.name as string);
  // Nintendo Switch Online re-releases of legacy titles ship as separate
  // per-language products ("(English) Pokemon FireRed Version", "(French) ...").
  // These are noise for a deal monitor, so skip them.
  if (/^\([a-z]+\)\s/i.test(title)) {
    return undefined;
  }
  let esrbRating: string | undefined;
  const ratingRef = product.contentRating?.__ref;
  if (ratingRef && apollo[ratingRef] && typeof apollo[ratingRef].label === 'string') {
    esrbRating = apollo[ratingRef].label as string;
  }
  const genres = ((product.tags && product.tags.genres) || [])
    .map((genre) => genre.label)
    .filter((label): label is string => typeof label === 'string' && label.length > 0);
  return {
    nsuid,
    title,
    slug: product.urlKey as string,
    platforms: platformsForSlug(slug),
    genres: genres.length > 0 ? genres : undefined,
    esrbRating: esrbRating && esrbRating.length > 0 ? esrbRating : undefined,
  };
}

async function fetchAndExtract(slug: string): Promise<GeneratedCatalogEntry | undefined> {
  const html = await fetchText(`https://www.nintendo.com/us/store/products/${slug}/`);
  const marker = '__NEXT_DATA__';
  const startMarker = html.indexOf(marker);
  if (startMarker < 0) {
    return undefined;
  }
  const jsonStart = html.indexOf('>', startMarker) + 1;
  const jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonStart < 0 || jsonEnd < 0) {
    return undefined;
  }
  const parsed = JSON.parse(html.slice(jsonStart, jsonEnd)) as {
    props?: { pageProps?: { initialApolloState?: ApolloGraph } };
  };
  const apollo = parsed.props?.pageProps?.initialApolloState;
  if (!apollo) {
    return undefined;
  }
  return extractCatalogEntry(apollo, slug);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

export interface GenerateCatalogOptions {
  target?: number;
  outPath?: string;
  wishlistFile?: string;
}

export interface OrderCatalogOutput {
  entries: GeneratedCatalogEntry[];
  resolutions: TitleMatch[];
  missingWishlistTitles: string[];
}

/**
 * Orders collected entries for the final catalog so that games resolving the
 * user's wishlist come first (in wishlist order, deduplicated by nsuid), and
 * the remaining capacity is filled with the rest of the entries sorted by
 * title. Wishlist titles that resolve to nothing are reported so the user can
 * see which games could not be tracked.
 */
export function orderCatalogForOutput(
  entries: GeneratedCatalogEntry[],
  wishlistTitles: string[],
  target: number,
): OrderCatalogOutput {
  const byTitle = new Map(entries.map((entry) => [entry.title, entry]));
  const titles = entries.map((entry) => entry.title);
  const resolutions = matchTitlesToCandidates(wishlistTitles, titles);

  const prioritized: GeneratedCatalogEntry[] = [];
  const seenNsuids = new Set<string>();
  const missingWishlistTitles: string[] = [];
  wishlistTitles.forEach((title, index) => {
    const match = resolutions[index];
    if (match.matched && match.matchedTitle) {
      const entry = byTitle.get(match.matchedTitle);
      if (entry && !seenNsuids.has(entry.nsuid)) {
        seenNsuids.add(entry.nsuid);
        prioritized.push(entry);
      }
    } else {
      missingWishlistTitles.push(title);
    }
  });

  const remaining = entries
    .filter((entry) => !seenNsuids.has(entry.nsuid))
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
  const output = [
    ...prioritized,
    ...remaining.slice(0, Math.max(0, target - prioritized.length)),
  ];
  return { entries: output, resolutions, missingWishlistTitles };
}

export async function generateCatalog(options: GenerateCatalogOptions = {}): Promise<void> {
  const target = options.target ?? (Number(process.env.CATALOG_TARGET) || DEFAULT_CATALOG_TARGET);
  const outPath = path.resolve(
    process.cwd(),
    options.outPath ?? process.env.CATALOG_OUT ?? DEFAULT_GAME_CATALOG_PATH,
  );

  // Wishlist games have priority: collect a slightly larger pool so there is
  // slack to guarantee every resolvable wishlist game lands in the catalog.
  let wishlistTitles: string[] = [];
  try {
    const wishlist = loadWishlist(options.wishlistFile);
    wishlistTitles = wishlist.items.map((item) => item.gameTitle);
  } catch (error) {
    console.warn(`  Skipping wishlist prioritization (${(error as Error).message}).`);
  }
  const poolTarget = target + wishlistTitles.length + 16;

  console.log('Fetching the Nintendo US store sitemap...');
  const candidates = await fetchSitemapSlugs();
  console.log(`Found ${candidates.length} candidate game slug(s) in the sitemap.`);

  const candidateSet = new Set(candidates);
  const ordered: string[] = [];
  const enqueue = (slug: string): void => {
    if (!candidateSet.has(slug)) {
      console.warn(`  skipping unknown slug (not in sitemap): ${slug}`);
      return;
    }
    if (!ordered.includes(slug)) {
      ordered.push(slug);
    }
  };
  for (const slug of SEED_SLUGS) {
    enqueue(slug);
  }
  const keywordMatched = new Set<string>();
  const rest: string[] = [];
  for (const slug of candidates) {
    if (ordered.includes(slug)) {
      continue;
    }
    if (FAMILY_KEYWORDS.some((keyword) => slug.includes(keyword))) {
      keywordMatched.add(slug);
    } else {
      rest.push(slug);
    }
  }
  // Enqueue keyword slugs family by family, honoring FAMILY_KEYWORDS priority
  // order (mario, zelda, kirby, pokemon, ...) rather than alphabetical order.
  // Alphabetical ordering pushes big families like "pokemon-*" past the target
  // cutoff, silently dropping flagship titles from the generated catalog.
  for (const keyword of FAMILY_KEYWORDS) {
    const familySlugs = [...keywordMatched]
      .filter((slug) => slug.includes(keyword))
      .sort();
    for (const slug of familySlugs) {
      enqueue(slug);
    }
  }
  for (const slug of rest.sort()) {
    if (ordered.length >= target) {
      break;
    }
    enqueue(slug);
  }

  const byNsuid = new Map<string, GeneratedCatalogEntry>();
  const bySlug = new Map<string, GeneratedCatalogEntry>();
  const failures: string[] = [];
  let seen = 0;

  async function processSlug(slug: string): Promise<void> {
    if (byNsuid.size >= poolTarget) {
      return;
    }
    seen += 1;
    try {
      const entry = await fetchAndExtract(slug);
      if (!entry) {
        failures.push(slug);
        return;
      }
      if (bySlug.has(entry.slug.toLowerCase())) {
        return;
      }
      if (byNsuid.has(entry.nsuid)) {
        return;
      }
      byNsuid.set(entry.nsuid, entry);
      bySlug.set(entry.slug.toLowerCase(), entry);
      if (byNsuid.size % 25 === 0 || byNsuid.size === poolTarget) {
        console.log(`  ${byNsuid.size}/${poolTarget} games collected...`);
      }
    } catch (error) {
      failures.push(slug);
    }
  }

  const limited = ordered.slice(0, poolTarget * 3);
  await mapWithConcurrency(limited, REQUEST_CONCURRENCY, processSlug);

  const orderedEntries = orderCatalogForOutput(
    [...byNsuid.values()],
    wishlistTitles,
    target,
  );
  const entries = orderedEntries.entries;

  const errors = validateCatalogEntries(entries);
  if (errors.length > 0) {
    throw new Error(`Generated catalog failed validation:\n- ${errors.join('\n- ')}`);
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  const withEsrb = entries.filter((entry) => entry.esrbRating !== undefined).length;
  const withGenres = entries.filter((entry) => entry.genres !== undefined).length;
  const switch1 = entries.filter((entry) => entry.platforms.includes('switch1')).length;
  const switch2 = entries.filter((entry) => entry.platforms.includes('switch2')).length;
  console.log('');
  console.log(`Wrote ${entries.length} game(s) to ${outPath}:`);
  console.log(`  - with ESRB rating: ${withEsrb}/${entries.length}`);
  console.log(`  - with genres: ${withGenres}/${entries.length}`);
  console.log(`  - Switch 1: ${switch1} · Switch 2: ${switch2}`);
  if (wishlistTitles.length > 0) {
    const resolved = wishlistTitles.length - orderedEntries.missingWishlistTitles.length;
    console.log(`  - wishlist games prioritized: ${resolved}/${wishlistTitles.length}`);
    if (orderedEntries.missingWishlistTitles.length > 0) {
      console.log(`    unresolved: ${orderedEntries.missingWishlistTitles.join(', ')}`);
    }
  }
  console.log(`  - failures (skipped): ${failures.length}`);
  if (failures.length > 0) {
    console.log(`    e.g. ${failures.slice(0, 8).join(', ')}`);
  }
}

if (require.main === module) {
  generateCatalog()
    .then(() => {
      console.log('\nCatalog generation complete.');
    })
    .catch((error: unknown) => {
      console.error('Catalog generation failed:', error);
      process.exitCode = 1;
    });
}
