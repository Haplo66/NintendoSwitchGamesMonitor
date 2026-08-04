import { NintendoPlatform } from '../models/settings';

export type GamePlatform = 'switch1' | 'switch2';

export const DEFAULT_NINTENDO_PLATFORM: NintendoPlatform = 'switch1';
export const SUPPORTED_PLATFORMS: readonly NintendoPlatform[] = ['switch1', 'switch2', 'both'];
export const GAME_PLATFORMS: readonly GamePlatform[] = ['switch1', 'switch2'];

export function normalizeNintendoPlatform(raw: string): NintendoPlatform {
  const platform = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-_]/g, '') as NintendoPlatform;
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `Illegal NINTENDO_PLATFORM "${raw}". Expected one of: ${SUPPORTED_PLATFORMS.join(', ')}.`,
    );
  }
  return platform;
}

export function resolveNintendoPlatform(env: NodeJS.ProcessEnv = process.env): NintendoPlatform {
  const raw = env.NINTENDO_PLATFORM?.trim();
  if (!raw) {
    return DEFAULT_NINTENDO_PLATFORM;
  }
  return normalizeNintendoPlatform(raw);
}

export function gameOnPlatform(
  platforms: GamePlatform[] | undefined,
  platform: NintendoPlatform,
): boolean {
  if (platform === 'both') {
    return true;
  }
  if (!platforms || platforms.length === 0) {
    return platform === 'switch1';
  }
  return platforms.includes(platform as GamePlatform);
}