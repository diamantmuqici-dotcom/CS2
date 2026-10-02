import type { GameMapDefinition, Vector3D } from '../../shared/types';

export interface NavigationRoute { waypointIds: string[]; destination: Vector3D; }

export function findNavigationRoute(map: GameMapDefinition, from: Vector3D, tag: 'siteA' | 'siteB' | 'mid' | 'cover'): NavigationRoute | null {
  const candidates = map.waypoints.filter((waypoint) => waypoint.tag === tag);
  if (!candidates.length) return null;
  const destination = candidates.reduce((best, item) => distance(item.position, from) < distance(best.position, from) ? item : best, candidates[0]);
  const route = [destination.id];
  const previous = map.waypoints.find((waypoint) => waypoint.connections.includes(destination.id));
  if (previous) route.unshift(previous.id);
  return { waypointIds: route, destination: { x: destination.position[0], y: destination.position[1], z: destination.position[2] } };
}

function distance(position: [number, number, number], from: Vector3D): number {
  return Math.hypot(position[0] - from.x, position[1] - from.y, position[2] - from.z);
}
