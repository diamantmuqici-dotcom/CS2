import { describe, it, expect } from 'vitest';
import {
  evaluateObjectVisibility,
  evaluatePlayerVisibility
} from '../src/game/rendering/cullingSystem';
import { buildMapAABBs } from '../src/game/physics/physicsEngine';
import { HARBOR_PROTOCOL_MAP, PROVING_GROUNDS_MAP } from '../src/game/maps/officialMaps';
import { DEFAULT_VIDEO_SETTINGS, VideoSettings } from '../src/game/settings/settingsStore';

const video: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS };

const aabbs = buildMapAABBs(HARBOR_PROTOCOL_MAP);
const occluders = aabbs.filter((b) => b.object.occluder);

describe('Smart occlusion object culling', () => {
  it('culls geometry completely behind the camera', () => {
    const cameraPos = { x: 0, y: 1.7, z: -40 };
    const forward = { x: 0, y: 0, z: 1 }; // facing +Z, so anything at z < -42 is behind
    const template = HARBOR_PROTOCOL_MAP.objects.find((o) => o.id === 'mid_center_block')!;
    const behindObj = { ...template, id: 'synthetic_behind', position: [-6, 1.8, -52] as [number, number, number] };

    const decision = evaluateObjectVisibility(cameraPos, forward, 90, 1.78, behindObj, occluders, video);
    expect(decision.visible).toBe(false);
    expect(decision.reason).toBe('behind_camera');
  });

  it('renders geometry inside the active view cone', () => {
    const cameraPos = { x: 0, y: 1.7, z: 30 };
    const forward = { x: 0, y: 0, z: -1 }; // facing -Z toward mid
    const midObject = HARBOR_PROTOCOL_MAP.objects.find((o) => o.id === 'mid_center_block')!;

    const decision = evaluateObjectVisibility(cameraPos, forward, 90, 1.78, midObject, occluders, video);
    expect(decision.visible).toBe(true);
    expect(decision.reason).toBe('visible');
  });

  it('culls distant decorative props beyond the object distance ring', () => {
    const nearVideo: VideoSettings = { ...video, objectVisibilityDistance: 'Near', customObjectDistanceMeters: 35 };
    const cameraPos = { x: 0, y: 1.7, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const farProps = HARBOR_PROTOCOL_MAP.objects.filter((o) => o.lodTier === 'far' || o.lodTier === 'medium');
    expect(farProps.length).toBeGreaterThan(0);

    const farObj = {
      ...farProps[0],
      position: [90, 1, 90] as [number, number, number]
    };
    const decision = evaluateObjectVisibility(cameraPos, forward, 90, 1.78, farObj, occluders, nearVideo);
    expect(decision.visible).toBe(false);
  });

  it('never distance-culls bomb site objective markers', () => {
    const nearVideo: VideoSettings = { ...video, objectVisibilityDistance: 'Near', customObjectDistanceMeters: 20 };
    const cameraPos = { x: 60, y: 1.7, z: 60 };
    const forward = { x: 0, y: 0, z: -1 };
    const siteA = HARBOR_PROTOCOL_MAP.objects.find((o) => o.type === 'bomb_site_a')!;
    const decision = evaluateObjectVisibility(cameraPos, forward, 90, 1.78, siteA, occluders, nearVideo);
    expect(decision.visible).toBe(true);
  });

  it('assigns progressively coarser LOD tiers with distance', () => {
    const cameraPos = { x: 0, y: 1.7, z: 0 };
    const forward = { x: 0, y: 0, z: 1 };
    const closeObj = { ...HARBOR_PROTOCOL_MAP.objects[0], id: 'test_close', position: [0, 1, 5] as [number, number, number] };
    const midObj = { ...HARBOR_PROTOCOL_MAP.objects[0], id: 'test_mid', position: [0, 1, 30] as [number, number, number] };
    const farObj = { ...HARBOR_PROTOCOL_MAP.objects[0], id: 'test_far', position: [0, 1, 70] as [number, number, number] };

    expect(evaluateObjectVisibility(cameraPos, forward, 90, 1.78, closeObj, occluders, video).lodLevel).toBe('high');
    expect(evaluateObjectVisibility(cameraPos, forward, 90, 1.78, midObj, occluders, video).lodLevel).toBe('medium');
    expect(evaluateObjectVisibility(cameraPos, forward, 90, 1.78, farObj, occluders, video).lodLevel).toBe('low');
  });

  it('disabling frustum culling leaves offscreen geometry visible', () => {
    const noFrustum: VideoSettings = { ...video, frustumCulling: false, smartOcclusionCulling: false };
    const cameraPos = { x: 0, y: 1.7, z: -40 };
    const forward = { x: 0, y: 0, z: 1 };
    const template = HARBOR_PROTOCOL_MAP.objects.find((o) => o.id === 'mid_center_block')!;
    const behindObj = { ...template, id: 'synthetic_behind_2', position: [-6, 1.8, -52] as [number, number, number] };

    const decision = evaluateObjectVisibility(cameraPos, forward, 90, 1.78, behindObj, occluders, noFrustum);
    expect(decision.visible).toBe(true);
  });
});

describe('Gameplay-critical player visibility rules', () => {
  it('ALWAYS renders an enemy with true line of sight, regardless of distance settings', () => {
    const restrictive: VideoSettings = {
      ...video,
      playerVisibilityDistance: 50,
      objectVisibilityDistance: 'Near',
      smartOcclusionCulling: true
    };
    const cameraPos = { x: 0, y: 1.66, z: -40 };
    const forward = { x: 0, y: 0, z: 1 };
    const enemyPos = { x: 0, y: 0, z: -10 }; // clear sightline up the open lane

    const result = evaluatePlayerVisibility(cameraPos, forward, enemyPos, true, occluders, restrictive);
    expect(result.visible).toBe(true);
    expect(result.hasLineOfSight).toBe(true);
  });

  it('reports line of sight correctly for a visible enemy', () => {
    const cameraPos = { x: 0, y: 1.66, z: -40 };
    const forward = { x: 0, y: 0, z: 1 };
    const result = evaluatePlayerVisibility(cameraPos, forward, { x: 0, y: 0, z: -12 }, true, occluders, video);
    expect(result.hasLineOfSight).toBe(true);
  });

  it('reports blocked line of sight through the mid divider', () => {
    const cameraPos = { x: -14, y: 1.66, z: -22 };
    const forward = { x: 0, y: 0, z: 1 };
    const result = evaluatePlayerVisibility(cameraPos, forward, { x: -14, y: 0, z: 4 }, true, occluders, video);
    expect(result.hasLineOfSight).toBe(false);
  });

  it('may skip a mesh that is both wall-occluded and outside the rear of the camera', () => {
    const cameraPos = { x: 0, y: 1.66, z: 40 };
    const forward = { x: 0, y: 0, z: -1 }; // facing -Z, so +Z is behind the player
    // Enemy is sealed beyond the south perimeter wall and far behind the camera plane
    const result = evaluatePlayerVisibility(cameraPos, forward, { x: 0, y: 0, z: 56 }, true, occluders, video);
    expect(result.visible).toBe(false);
  });

  it('keeps an occluded player visible when they are in front of the camera', () => {
    const cameraPos = { x: -14, y: 1.66, z: -20 };
    const forward = { x: 0, y: 0, z: 1 };
    const result = evaluatePlayerVisibility(cameraPos, forward, { x: -14, y: 0, z: 0 }, true, occluders, video);
    // Wall-occluded but in front → still rendered so that cover peeks and wallbangs read correctly.
    expect(result.visible).toBe(true);
  });
});

describe('Proving grounds training map integrity', () => {
  it('contains spawn points, buy zones, and a bomb site for testing', () => {
    const types = PROVING_GROUNDS_MAP.objects.map((o) => o.type);
    expect(types).toContain('spawn_sentinel');
    expect(types).toContain('spawn_vortex');
    expect(types).toContain('buy_zone');
    expect(types).toContain('bomb_site_a');
    expect(types).toContain('ramp');
  });
});

describe('Official map integrity', () => {
  it('every map declares spawns, bounds, and at least 8 objects', () => {
    for (const map of [HARBOR_PROTOCOL_MAP, PROVING_GROUNDS_MAP]) {
      expect(map.objects.length).toBeGreaterThanOrEqual(8);
      expect(map.objects.some((o) => o.type === 'spawn_sentinel')).toBe(true);
      expect(map.objects.some((o) => o.type === 'spawn_vortex')).toBe(true);
      expect(map.bounds.max[0]).toBeGreaterThan(map.bounds.min[0]);
    }
  });

  it('every map declares supported modes and callouts', () => {
    for (const map of [HARBOR_PROTOCOL_MAP, PROVING_GROUNDS_MAP]) {
      expect(map.supportedModes.length).toBeGreaterThan(0);
      expect(map.callouts.length).toBeGreaterThan(0);
    }
  });
});
