import { DealHistory, DealHistoryEntry, FamilyProfile, WishlistItem } from '../models';

export function validateFamilyProfile(profile: FamilyProfile): string[] {
  const errors: string[] = [];
  if (typeof profile.name !== 'string' || profile.name.trim() === '') {
    errors.push('name must be a non-empty string');
  }
  if (profile.maxAge !== undefined && (typeof profile.maxAge !== 'number' || profile.maxAge <= 0)) {
    errors.push('maxAge must be a positive number when provided');
  }
  if (
    profile.preferredGenres !== undefined &&
    (!Array.isArray(profile.preferredGenres) ||
      !profile.preferredGenres.every((genre) => typeof genre === 'string'))
  ) {
    errors.push('preferredGenres must be an array of strings when provided');
  }
  if (
    profile.excludedGenres !== undefined &&
    (!Array.isArray(profile.excludedGenres) ||
      !profile.excludedGenres.every((genre) => typeof genre === 'string'))
  ) {
    errors.push('excludedGenres must be an array of strings when provided');
  }
  if (profile.notes !== undefined && typeof profile.notes !== 'string') {
    errors.push('notes must be a string when provided');
  }
  return errors;
}

export function validateWishlistItem(item: WishlistItem): string[] {
  const errors: string[] = [];
  if (typeof item.gameTitle !== 'string' || item.gameTitle.trim() === '') {
    errors.push('gameTitle must be a non-empty string');
  }
  if (
    item.targetPrice !== undefined &&
    (typeof item.targetPrice !== 'number' || item.targetPrice < 0)
  ) {
    errors.push('targetPrice must be a non-negative number when provided');
  }
  if (item.notifyOnAnyDiscount !== undefined && typeof item.notifyOnAnyDiscount !== 'boolean') {
    errors.push('notifyOnAnyDiscount must be a boolean when provided');
  }
  if (item.notes !== undefined && typeof item.notes !== 'string') {
    errors.push('notes must be a string when provided');
  }
  return errors;
}

export function validateDealHistoryEntry(entry: DealHistoryEntry): string[] {
  const errors: string[] = [];
  if (typeof entry.gameTitle !== 'string' || entry.gameTitle.trim() === '') {
    errors.push('gameTitle must be a non-empty string');
  }
  if (typeof entry.firstSeenOnSale !== 'string' || Number.isNaN(Date.parse(entry.firstSeenOnSale))) {
    errors.push('firstSeenOnSale must be a valid date string');
  }
  if (typeof entry.lastSeenOnSale !== 'string' || Number.isNaN(Date.parse(entry.lastSeenOnSale))) {
    errors.push('lastSeenOnSale must be a valid date string');
  }
  if (
    entry.firstNotified !== undefined &&
    (typeof entry.firstNotified !== 'string' || Number.isNaN(Date.parse(entry.firstNotified)))
  ) {
    errors.push('firstNotified must be a valid date string when provided');
  }
  if (
    entry.lastNotified !== undefined &&
    (typeof entry.lastNotified !== 'string' || Number.isNaN(Date.parse(entry.lastNotified)))
  ) {
    errors.push('lastNotified must be a valid date string when provided');
  }
  if (
    entry.lastNotifiedPrice !== undefined &&
    (typeof entry.lastNotifiedPrice !== 'number' || !Number.isFinite(entry.lastNotifiedPrice))
  ) {
    errors.push('lastNotifiedPrice must be a finite number when provided');
  }
  if (typeof entry.notificationCount !== 'number' || !Number.isInteger(entry.notificationCount) || entry.notificationCount < 0) {
    errors.push('notificationCount must be a non-negative whole number');
  }
  if (typeof entry.currentlyOnSale !== 'boolean') {
    errors.push('currentlyOnSale must be a boolean');
  }
  if (entry.priceHistory !== undefined) {
    if (!Array.isArray(entry.priceHistory)) {
      errors.push('priceHistory must be an array when provided');
    } else {
      for (let index = 0; index < entry.priceHistory.length; index += 1) {
        const observation = entry.priceHistory[index];
        if (
          observation === null ||
          typeof observation !== 'object' ||
          typeof observation.date !== 'string' ||
          Number.isNaN(Date.parse(observation.date)) ||
          typeof observation.price !== 'number' ||
          !Number.isFinite(observation.price)
        ) {
          errors.push(`priceHistory[${index}] must be an object with a valid date and finite price`);
        }
      }
    }
  }
  return errors;
}

export function validateDealHistory(history: DealHistory): string[] {
  if (!Array.isArray(history.entries)) {
    return ['entries must be an array'];
  }
  return history.entries.flatMap((entry, index) =>
    validateDealHistoryEntry(entry).map((error) => `entry ${index}: ${error}`),
  );
}
