import { FamilyProfile, NotificationHistory, NotificationRecord, WishlistItem } from '../models';

export function validateFamilyProfile(profile: FamilyProfile): string[] {
  const errors: string[] = [];
  if (typeof profile.name !== 'string' || profile.name.trim() === '') {
    errors.push('name must be a non-empty string');
  }
  if (profile.maxAge !== undefined && (typeof profile.maxAge !== 'number' || profile.maxAge <= 0)) {
    errors.push('maxAge must be a positive number when provided');
  }
  if (
    !Array.isArray(profile.preferredGenres) ||
    !profile.preferredGenres.every((genre) => typeof genre === 'string')
  ) {
    errors.push('preferredGenres must be an array of strings');
  }
  if (
    !Array.isArray(profile.excludedGenres) ||
    !profile.excludedGenres.every((genre) => typeof genre === 'string')
  ) {
    errors.push('excludedGenres must be an array of strings');
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
  if (typeof item.notifyOnAnyDiscount !== 'boolean') {
    errors.push('notifyOnAnyDiscount must be a boolean');
  }
  return errors;
}

export function validateNotificationRecord(record: NotificationRecord): string[] {
  const errors: string[] = [];
  if (typeof record.gameId !== 'string' || record.gameId.trim() === '') {
    errors.push('gameId must be a non-empty string');
  }
  if (typeof record.title !== 'string' || record.title.trim() === '') {
    errors.push('title must be a non-empty string');
  }
  if (record.notificationType !== 'deal' && record.notificationType !== 'free' && record.notificationType !== 'wishlist') {
    errors.push("notificationType must be one of: 'deal', 'free', 'wishlist'");
  }
  if (typeof record.score !== 'number' || record.score < 0) {
    errors.push('score must be a non-negative number');
  }
  if (typeof record.price !== 'number' || record.price < 0) {
    errors.push('price must be a non-negative number');
  }
  if (typeof record.notifiedAt !== 'string' || Number.isNaN(Date.parse(record.notifiedAt))) {
    errors.push('notifiedAt must be a valid date string');
  }
  return errors;
}

export function validateNotificationHistory(history: NotificationHistory): string[] {
  if (!Array.isArray(history.records)) {
    return ['records must be an array'];
  }
  return history.records.flatMap((record, index) =>
    validateNotificationRecord(record).map((error) => `record ${index}: ${error}`),
  );
}
