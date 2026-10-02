import { describe, it, expect } from 'vitest';
import {
  buildMapAABBs,
  computeGrenadeTrajectoryPreview,
  hasLineOfSight,
  stepGrenadeProjectile,
  stepPlayerPhysics,
  type PlayerPhysicsState
} from '../src/game/physics/physicsEngine';
import { HARBOR_PROTOCOL_MAP, PROVING_GROUNDS_MAP } from '../src/game/maps/officialMaps';

const BASE_STATE: PlayerPhysicsState = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  crouching: false,
  walking: false,
  sprinting: false,
  onLadder: false,
  inWater: false,
  eyeHeight: 1.66,
  groundSurface: 'concrete'
};

const PHYSICS_OPTIONS = {
  weaponSpeedMultiplier: 1,
  gravityMultiplier: 1,
  moveSpeedMultiplier: 1,
  allowSprint: false
};

describe('Player movement physics', () => {
  const aabbs = buildMapAABBs(HARBOR_PROTOCOL_MAP);

  const OPEN_LANE = { x: 0, y: 0, z: 0 };

  it('accelerates forward from rest', () => {
    let state = { ...BASE_STATE, position: { ...OPEN_LANE } };
    for (let i = 0; i < 30; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeGreaterThan(4.0);
  });

  it('reaches but does not exceed the maximum run speed', () => {
    let state = { ...BASE_STATE, position: { ...OPEN_LANE } };
    for (let i = 0; i < 40; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    expect(speed).toBeLessThanOrEqual(7.0);
    expect(speed).toBeGreaterThan(6.0);
  });

  it('decelerates to a stop when input is released (friction)', () => {
    let state = { ...BASE_STATE, position: { ...OPEN_LANE }, velocity: { x: 0, y: 0, z: -6.5 } };
    for (let i = 0; i < 180; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 0, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeLessThan(0.25);
  });

  it('crouching reduces maximum speed relative to standing', () => {
    const runTo = (crouch: boolean) => {
      let state = { ...BASE_STATE, position: { ...OPEN_LANE } };
      for (let i = 0; i < 40; i++) {
        state = stepPlayerPhysics(
          state,
          { forward: 1, right: 0, jumpPressed: false, crouchHeld: crouch, walkHeld: false, sprintHeld: false, yaw: 0 },
          aabbs,
          1 / 64,
          PHYSICS_OPTIONS
        );
      }
      return Math.hypot(state.velocity.x, state.velocity.z);
    };
    expect(runTo(true)).toBeLessThan(runTo(false));
  });

  it('walking reduces maximum speed relative to running', () => {
    const walkTo = (walk: boolean) => {
      let state = { ...BASE_STATE, position: { ...OPEN_LANE } };
      for (let i = 0; i < 40; i++) {
        state = stepPlayerPhysics(
          state,
          { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: walk, sprintHeld: false, yaw: 0 },
          aabbs,
          1 / 64,
          PHYSICS_OPTIONS
        );
      }
      return Math.hypot(state.velocity.x, state.velocity.z);
    };
    expect(walkTo(true)).toBeLessThan(walkTo(false));
  });

  it('jumping produces upward velocity and leaves the ground', () => {
    const state = stepPlayerPhysics(
      { ...BASE_STATE, position: { ...OPEN_LANE } },
      { forward: 0, right: 0, jumpPressed: true, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
      aabbs,
      1 / 128,
      PHYSICS_OPTIONS
    );
    expect(state.velocity.y).toBeGreaterThan(5);
    expect(state.grounded).toBe(false);
  });

  it('gravity pulls a falling player back to the ground', () => {
    let state: PlayerPhysicsState = {
      ...BASE_STATE,
      position: { x: 0, y: 6, z: -30 },
      grounded: false,
      velocity: { x: 0, y: 0, z: 0 }
    };
    for (let i = 0; i < 400; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 0, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
      if (state.grounded) break;
    }
    expect(state.grounded).toBe(true);
    expect(state.position.y).toBeLessThan(0.5);
  });

  it('smoothly interpolates eye height when crouching', () => {
    let state = { ...BASE_STATE, position: { ...OPEN_LANE } };
    const startEye = state.eyeHeight;
    for (let i = 0; i < 60; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 0, right: 0, jumpPressed: false, crouchHeld: true, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    expect(state.eyeHeight).toBeLessThan(startEye);
    expect(state.eyeHeight).toBeGreaterThan(1.0);
  });

  it('cannot tunnel through a perimeter wall at high speed', () => {
    let state: PlayerPhysicsState = {
      ...BASE_STATE,
      position: { x: 0, y: 0, z: -50 },
      velocity: { x: 0, y: 0, z: -60 }
    };
    for (let i = 0; i < 240; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    // North perimeter wall sits at z = -55; the player must remain inside it.
    expect(state.position.z).toBeGreaterThan(-56);
  });
});

describe('Ramp / stairs traversal', () => {
  const aabbs = buildMapAABBs(PROVING_GROUNDS_MAP);

  it('climbs the KZ ramp and continues onto the elevated platform', () => {
    let state: PlayerPhysicsState = {
      ...BASE_STATE,
      position: { x: 30, y: 0, z: 22 }
    };
    let peakY = 0;
    let heightOnPlatform: number | null = null;
    for (let i = 0; i < 220; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
      peakY = Math.max(peakY, state.position.y);
      // While standing over the elevated platform footprint (z 5.5–10.5)
      if (state.position.z > 6 && state.position.z < 10.4) {
        heightOnPlatform = state.position.y;
      }
    }
    // The ramp rises ~2m; the player must not fall through it at any point.
    expect(peakY).toBeGreaterThan(1.5);
    // Having crossed the ramp the player should have been standing on the elevated platform.
    expect(heightOnPlatform).not.toBeNull();
    expect(heightOnPlatform!).toBeGreaterThan(1.0);
    // And should have left the platform heading further into the level rather than being stuck.
    expect(state.position.z).toBeLessThan(5.5);
  });

  it('walks back down the ramp without falling through the level', () => {
    let state: PlayerPhysicsState = {
      ...BASE_STATE,
      position: { x: 30, y: 2.2, z: 8 }
    };
    for (let i = 0; i < 220; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: Math.PI },
        aabbs,
        1 / 64,
        PHYSICS_OPTIONS
      );
    }
    expect(state.position.y).toBeLessThan(2.3);
    expect(state.position.y).toBeGreaterThanOrEqual(0);
    expect(state.position.z).toBeGreaterThan(12);
  });
});

describe('Line of sight & occlusion queries', () => {
  const aabbs = buildMapAABBs(HARBOR_PROTOCOL_MAP);

  it('reports unobstructed line of sight across open ground', () => {
    const los = hasLineOfSight({ x: 0, y: 1.6, z: -40 }, { x: 0, y: 1.6, z: -30 }, aabbs);
    expect(los).toBe(true);
  });

  it('reports blocked line of sight through the mid divider wall', () => {
    const los = hasLineOfSight({ x: -14, y: 1.6, z: -20 }, { x: -14, y: 1.6, z: -2 }, aabbs);
    expect(los).toBe(false);
  });

  it('reports blocked line of sight through perimeter walls', () => {
    const los = hasLineOfSight({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: -200 }, aabbs);
    expect(los).toBe(false);
  });

  it('treats active smoke volumes as vision blockers', () => {
    const smoke = [{ x: 0, y: 0.5, z: -35 }];
    const los = hasLineOfSight({ x: 0, y: 1.6, z: -40 }, { x: 0, y: 1.6, z: -28 }, aabbs, smoke);
    expect(los).toBe(false);
  });
});

describe('Grenade projectile physics', () => {
  const aabbs = buildMapAABBs(PROVING_GROUNDS_MAP);

  it('follows a gravity arc and eventually detonates', () => {
    const grenade = {
      id: 'g1',
      ownerId: 'p1',
      type: 'he' as const,
      position: { x: 0, y: 1.6, z: 20 },
      velocity: { x: 0, y: 4, z: -14 },
      fuseRemainingSec: 1.6,
      bounces: 0,
      detonated: false
    };

    let detonated = false;
    for (let i = 0; i < 600 && !detonated; i++) {
      const res = stepGrenadeProjectile(grenade, aabbs, 1 / 120);
      if (res.detonated) detonated = true;
    }
    expect(detonated).toBe(true);
  });

  it('bounces off the ground rather than passing through', () => {
    const grenade = {
      id: 'g2',
      ownerId: 'p1',
      type: 'he' as const,
      position: { x: 0, y: 3, z: 20 },
      velocity: { x: 0, y: -8, z: 0 },
      fuseRemainingSec: 5,
      bounces: 0,
      detonated: false
    };
    let bounced = false;
    for (let i = 0; i < 200 && !bounced; i++) {
      const res = stepGrenadeProjectile(grenade, aabbs, 1 / 120);
      if (res.bounced) bounced = true;
      expect(grenade.position.y).toBeGreaterThanOrEqual(0);
    }
    expect(bounced).toBe(true);
  });

  it('ignites incendiary grenades on first ground contact', () => {
    const grenade = {
      id: 'g3',
      ownerId: 'p1',
      type: 'incendiary' as const,
      position: { x: 0, y: 2, z: 20 },
      velocity: { x: 0, y: -6, z: 0 },
      fuseRemainingSec: 6,
      bounces: 0,
      detonated: false
    };
    let detonated = false;
    for (let i = 0; i < 200 && !detonated; i++) {
      const res = stepGrenadeProjectile(grenade, aabbs, 1 / 120);
      if (res.detonated) detonated = true;
    }
    expect(detonated).toBe(true);
  });

  it('produces a trajectory preview with multiple sample points', () => {
    const points = computeGrenadeTrajectoryPreview(
      { x: 0, y: 1.6, z: 20 },
      { x: 0, y: 5, z: -14 },
      aabbs,
      40,
      0.04
    );
    expect(points.length).toBeGreaterThan(5);
    expect(points[0]).toEqual({ x: 0, y: 1.6, z: 20 });
  });
});
