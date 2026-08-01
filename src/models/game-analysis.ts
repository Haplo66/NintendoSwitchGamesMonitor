import { DealScoreResult } from './deal-score-result';
import { Game } from './game';
import { FamilyMatchResult, WishlistMatchResult } from './match-result';

export interface GameAnalysis {
  game: Game;
  familyMatches: FamilyMatchResult[];
  wishlistMatch?: WishlistMatchResult;
  dealScore: DealScoreResult;
}
