import { FamilyProfile, WishlistItem } from '../models';

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
