export interface FamilyProfile {
  id: string;
  name: string;
  maxAge?: number;
  preferredGenres: string[];
  excludedGenres: string[];
  notes?: string;
}
