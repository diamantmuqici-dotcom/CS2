import type { GameModeId, TeamId } from '../../shared/types';

export interface RatingSnapshot { playerId: string; mode: GameModeId; rating: number; wins: number; losses: number; placementsRemaining: number; updatedAt: number; }
export interface RatingInput { matchId: string; mode: GameModeId; playerId: string; team: Exclude<TeamId, 'SPECTATOR'>; winner: Exclude<TeamId, 'SPECTATOR'> | 'DRAW'; kills: number; deaths: number; roundsWon: number; roundsLost: number; }
export interface RatingResult { delta: number; nextRating: number; reason: string; }

export class RatingService {
  calculate(input: RatingInput, current: RatingSnapshot): RatingResult {
    if (current.placementsRemaining > 0) {
      const nextPlacements = current.placementsRemaining - 1;
      const base = input.winner === 'DRAW' ? 25 : input.winner === input.team ? 180 : -110;
      return { delta: base, nextRating: Math.max(1000, current.rating + base), reason: `Placement ${nextPlacements} matches remaining` };
    }
    const outcome = input.winner === 'DRAW' ? 0 : input.winner === input.team ? 1 : -1;
    const roundDiff = Math.max(-8, Math.min(8, input.roundsWon - input.roundsLost));
    const performance = Math.max(-30, Math.min(30, (input.kills - input.deaths) * 2));
    const delta = Math.round(outcome * 180 + roundDiff * 8 + performance);
    return { delta, nextRating: Math.max(1000, current.rating + delta), reason: 'Server-validated match result' };
  }

  isResultReplay(matchId: string, finalizedMatchIds: ReadonlySet<string>): boolean { return finalizedMatchIds.has(matchId); }
}

export const ratingService = new RatingService();
