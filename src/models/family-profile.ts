export interface FamilyProfile {
  name: string;
  maxAge?: number;
  preferredGenres: string[];
  excludedGenres: string[];
  notes?: string;
}
