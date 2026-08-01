import * as path from 'node:path';
import { Wishlist, WishlistItem } from '../models';
import { ConfigError, loadJsonFile } from './json-loader';
import { validateWishlistItem } from './validators';

export function loadWishlist(filePath?: string): Wishlist {
  const resolved = filePath ?? path.resolve(process.cwd(), 'data', 'wishlist.json');
  const data = loadJsonFile<unknown>(resolved);

  if (data === null || typeof data !== 'object') {
    throw new ConfigError(`Wishlist file must contain a JSON object: "${resolved}"`);
  }

  const items = (data as Wishlist).items;
  if (!Array.isArray(items)) {
    throw new ConfigError(`Wishlist file must contain an "items" array: "${resolved}"`);
  }

  return {
    items: items.map((raw, index) => {
      const item = raw as WishlistItem;
      const errors = validateWishlistItem(item);
      if (errors.length > 0) {
        throw new ConfigError(
          `Invalid wishlist item at index ${index} in "${resolved}": ${errors.join('; ')}`,
        );
      }
      return item;
    }),
  };
}
