import type { MatchPlayerStats, Vector3D } from '../../shared/types';
import { hasLineOfSight, type AABB } from '../physics/physicsEngine';

export interface VisibleTarget { player: MatchPlayerStats; distance: number; lastSeenAt: number; }

export function collectVisibleTargets(observer: MatchPlayerStats, players: MatchPlayerStats[], obstacles: AABB[], smokes: Vector3D[]): VisibleTarget[] {
  const eye = { x: observer.position.x, y: observer.position.y + 1.62, z: observer.position.z };
  return players.filter((player) => player.alive && player.team !== observer.team && player.id !== observer.id)
    .map((player) => ({ player, distance: Math.hypot(player.position.x - observer.position.x, player.position.y - observer.position.y, player.position.z - observer.position.z), lastSeenAt: Date.now() }))
    .filter((target) => hasLineOfSight(eye, { x: target.player.position.x, y: target.player.position.y + 1.55, z: target.player.position.z }, obstacles, smokes))
    .sort((a, b) => a.distance - b.distance);
}

export function chooseFairTarget(targets: VisibleTarget[], preferredDistance: number): VisibleTarget | null {
  if (!targets.length) return null;
  return [...targets].sort((a, b) => Math.abs(a.distance - preferredDistance) - Math.abs(b.distance - preferredDistance))[0];
}
