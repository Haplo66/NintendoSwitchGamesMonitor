import * as path from 'node:path';
import { Wishlist, WishlistItem } from '../models';
import { ConfigError, loadJsonFile } from './json-loader';
import { validateWishlistItem } from './validators';

export interface LoadWishlistOptions {
  defaultNotifyOnAnyDiscount?: boolean;
}

export function normalizeWishlistItem(raw: unknown, defaultNotifyOnAnyDiscount: boolean): WishlistItem {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      gameTitle: undefined as unknown as string,
      notifyOnAnyDiscount: defaultNotifyOnAnyDiscount,
    };
  }
  const value = raw as Record<string, unknown>;
  return {
    gameTitle: value.gameTitle as string,
    targetPrice: value.targetPrice as number | undefined,
    notifyOnAnyDiscount:
      (value.notifyOnAnyDiscount as boolean | undefined) ?? defaultNotifyOnAnyDiscount,
    notes: value.notes as string | undefined,
  };
}

export function loadWishlist(filePath?: string, options: LoadWishlistOptions = {}): Wishlist {
  const resolved = filePath ?? path.resolve(process.cwd(), 'data', 'wishlist.json');
  const data = loadJsonFile<unknown>(resolved);

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`Wishlist file must contain a JSON object: "${resolved}"`);
  }

  const rawItems = (data as Record<string, unknown>).items;
  if (!Array.isArray(rawItems)) {
    throw new ConfigError(`Wishlist file must contain an "items" array: "${resolved}"`);
  }

  const defaultNotifyOnAnyDiscount = options.defaultNotifyOnAnyDiscount ?? false;
  const items: WishlistItem[] = rawItems.map((raw) =>
    normalizeWishlistItem(raw, defaultNotifyOnAnyDiscount),
  );

  const errors: string[] = [];
  const seenTitles = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const validationErrors = validateWishlistItem(item);
    for (const error of validationErrors) {
      errors.push(`Invalid wishlist item at index ${index} in "${resolved}": ${error}`);
    }
    if (typeof item.gameTitle === 'string' && item.gameTitle.trim() !== '') {
      const key = item.gameTitle.trim().toLowerCase();
      if (seenTitles.has(key)) {
        errors.push(`Duplicate wishlist title "${item.gameTitle}" at index ${index} in "${resolved}"`);
      }
      seenTitles.add(key);
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(errors.join('\n'));
  }
  return { items };
}
