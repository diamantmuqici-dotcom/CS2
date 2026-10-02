import { describe, it, expect } from 'vitest';
import {
  WEAPON_SPECS,
  calculateWeaponDamage,
  getWeaponsByCategory,
  EQUIPMENT_SPECS
} from '../src/shared/weapons';
import {
  attemptFire,
  beginReload,
  buildHitboxes,
  computeCurrentSpread,
  createWeaponRuntime,
  raycastPlayerHitboxes,
  toggleScope,
  updateWeaponTimers
} from '../src/game/weapons/weaponSystem';

describe('Weapon roster integrity', () => {
  it('every weapon has a unique id matching its key', () => {
    for (const [key, spec] of Object.entries(WEAPON_SPECS)) {
      expect(spec.id).toBe(key);
    }
  });

  it('every weapon exposes required ballistics fields', () => {
    for (const spec of Object.values(WEAPON_SPECS)) {
      expect(spec.damage).toBeGreaterThanOrEqual(0);
      expect(spec.fireRateRpm).toBeGreaterThan(0);
      expect(spec.magazineSize).toBeGreaterThan(0);
      expect(spec.armorPenetration).toBeGreaterThan(0);
      expect(spec.armorPenetration).toBeLessThanOrEqual(1);
      expect(spec.recoilPattern.length).toBeGreaterThan(0);
      // Firearms reward headshots; melee and thrown grenades use flat multipliers.
      if (spec.category !== 'Grenades' && spec.category !== 'Melee') {
        expect(spec.headMultiplier).toBeGreaterThan(1);
      }
      expect(typeof spec.description).toBe('string');
      expect(spec.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('covers every required weapon category', () => {
    const categories = new Set(Object.values(WEAPON_SPECS).map((w) => w.category));
    ['Pistols', 'SMGs', 'Shotguns', 'Rifles', 'Snipers', 'MachineGuns', 'Melee', 'Grenades'].forEach((c) => {
      expect(categories.has(c as never)).toBe(true);
    });
  });

  it('exposes equipment specs with sensible pricing', () => {
    expect(EQUIPMENT_SPECS.length).toBeGreaterThanOrEqual(3);
    for (const eq of EQUIPMENT_SPECS) {
      expect(eq.price).toBeGreaterThan(0);
    }
  });

  it('filters weapons by category', () => {
    const rifles = getWeaponsByCategory('Rifles');
    expect(rifles.length).toBeGreaterThan(0);
    expect(rifles.every((r) => r.category === 'Rifles')).toBe(true);
  });
});

describe('Damage model', () => {
  const akSpec = WEAPON_SPECS.harbinger_47;

  it('rewards headshots over body shots', () => {
    const head = calculateWeaponDamage({
      weapon: akSpec,
      distanceMeters: 10,
      hitGroup: 'head',
      targetArmor: 0,
      targetHasHelmet: false
    });
    const body = calculateWeaponDamage({
      weapon: akSpec,
      distanceMeters: 10,
      hitGroup: 'chest',
      targetArmor: 0,
      targetHasHelmet: false
    });
    expect(head.healthDamage).toBeGreaterThan(body.healthDamage);
  });

  it('applies distance falloff monotonically', () => {
    const near = calculateWeaponDamage({ weapon: akSpec, distanceMeters: 5, hitGroup: 'chest', targetArmor: 0, targetHasHelmet: false });
    const far = calculateWeaponDamage({ weapon: akSpec, distanceMeters: 80, hitGroup: 'chest', targetArmor: 0, targetHasHelmet: false });
    expect(far.healthDamage).toBeLessThan(near.healthDamage);
  });

  it('armor reduces damage but never below 1', () => {
    const result = calculateWeaponDamage({
      weapon: WEAPON_SPECS.viper_p250,
      distanceMeters: 40,
      hitGroup: 'chest',
      targetArmor: 100,
      targetHasHelmet: true
    });
    expect(result.healthDamage).toBeGreaterThanOrEqual(1);
    expect(result.armorDamage).toBeGreaterThan(0);
  });

  it('grants no headshot armor benefit without a helmet', () => {
    const withHelmet = calculateWeaponDamage({
      weapon: WEAPON_SPECS.viper_p250,
      distanceMeters: 15,
      hitGroup: 'head',
      targetArmor: 100,
      targetHasHelmet: true
    });
    const withoutHelmet = calculateWeaponDamage({
      weapon: WEAPON_SPECS.viper_p250,
      distanceMeters: 15,
      hitGroup: 'head',
      targetArmor: 100,
      targetHasHelmet: false
    });
    expect(withoutHelmet.healthDamage).toBeGreaterThanOrEqual(withHelmet.healthDamage);
  });

  it('wall penetration reduces damage', () => {
    const clean = calculateWeaponDamage({ weapon: akSpec, distanceMeters: 10, hitGroup: 'chest', targetArmor: 0, targetHasHelmet: false });
    const wallbanged = calculateWeaponDamage({
      weapon: akSpec,
      distanceMeters: 10,
      hitGroup: 'chest',
      targetArmor: 0,
      targetHasHelmet: false,
      wallPenetrationLoss: 0.5
    });
    expect(wallbanged.healthDamage).toBeLessThan(clean.healthDamage);
  });

  it('swaps to knifing range at close quarters for melee', () => {
    const knife = WEAPON_SPECS.combat_blade;
    const result = calculateWeaponDamage({ weapon: knife, distanceMeters: 1, hitGroup: 'chest', targetArmor: 0, targetHasHelmet: false });
    expect(result.healthDamage).toBeGreaterThan(40);
  });
});

describe('Fire-rate gating and reloads', () => {
  it('blocks a second shot inside the minimum fire interval', () => {
    const spec = WEAPON_SPECS.harbinger_47;
    const runtime = createWeaponRuntime(spec.id, true);
    const first = attemptFire(runtime, spec, 0, 0.001);
    expect(first.fired).toBe(true);
    const second = attemptFire(runtime, spec, 0.01, 0.001);
    expect(second.fired).toBe(false);
  });

  it('allows the next shot after the interval elapses', () => {
    const spec = WEAPON_SPECS.harbinger_47;
    const runtime = createWeaponRuntime(spec.id, true);
    attemptFire(runtime, spec, 0, 0.001);
    const interval = 60 / spec.fireRateRpm;
    const second = attemptFire(runtime, spec, interval + 0.001, 0.001);
    expect(second.fired).toBe(true);
  });

  it('consumes exactly one round per shot', () => {
    const spec = WEAPON_SPECS.vanguard_m4a;
    const runtime = createWeaponRuntime(spec.id, true);
    const start = runtime.ammoInMag;
    attemptFire(runtime, spec, 0, 0.001);
    expect(runtime.ammoInMag).toBe(start - 1);
  });

  it('cannot fire with an empty magazine', () => {
    const spec = WEAPON_SPECS.vanguard_m4a;
    const runtime = createWeaponRuntime(spec.id, true);
    runtime.ammoInMag = 0;
    const result = attemptFire(runtime, spec, 5, 0.001);
    expect(result.fired).toBe(false);
  });

  it('refills the magazine after the reload timer completes', () => {
    const spec = WEAPON_SPECS.vanguard_m4a;
    const runtime = createWeaponRuntime(spec.id, true);
    runtime.ammoInMag = 5;
    const started = beginReload(runtime, spec);
    expect(started).toBe(true);
    expect(runtime.isReloading).toBe(true);
    updateWeaponTimers(runtime, spec, spec.reloadTimeSec + 0.01);
    expect(runtime.isReloading).toBe(false);
    expect(runtime.ammoInMag).toBe(spec.magazineSize);
  });

  it('refuses to reload at full magazine', () => {
    const spec = WEAPON_SPECS.vanguard_m4a;
    const runtime = createWeaponRuntime(spec.id, true);
    expect(beginReload(runtime, spec)).toBe(false);
  });

  it('refuses to reload melee and grenades', () => {
    const knife = createWeaponRuntime('combat_blade', true);
    expect(beginReload(knife, WEAPON_SPECS.combat_blade)).toBe(false);
    const smoke = createWeaponRuntime('smoke_grenade', true);
    expect(beginReload(smoke, WEAPON_SPECS.smoke_grenade)).toBe(false);
  });
});

describe('Scoping', () => {
  it('cycles through scope levels then unscopes', () => {
    const spec = WEAPON_SPECS.monolith_awm;
    const runtime = createWeaponRuntime(spec.id, true);
    expect(runtime.isScoped).toBe(false);

    toggleScope(runtime, spec);
    expect(runtime.isScoped).toBe(true);
    expect(runtime.scopeLevel).toBe(0);

    toggleScope(runtime, spec);
    expect(runtime.isScoped).toBe(true);
    expect(runtime.scopeLevel).toBe(1);

    toggleScope(runtime, spec);
    expect(runtime.isScoped).toBe(false);
  });

  it('cannot scope weapons without an optic', () => {
    const spec = WEAPON_SPECS.vector_9;
    const runtime = createWeaponRuntime(spec.id, true);
    expect(toggleScope(runtime, spec)).toBe(false);
  });
});

describe('Spread model', () => {
  it('crouching is more accurate than standing still which is better than moving', () => {
    const spec = WEAPON_SPECS.vanguard_m4a;
    const runtime = createWeaponRuntime(spec.id, true);
    const crouch = computeCurrentSpread(spec, runtime, { velocityXZ: 0, grounded: true, crouching: true, weaponSpeedMultiplier: 1 });
    const stand = computeCurrentSpread(spec, runtime, { velocityXZ: 0, grounded: true, crouching: false, weaponSpeedMultiplier: 1 });
    const moving = computeCurrentSpread(spec, runtime, { velocityXZ: 6, grounded: true, crouching: false, weaponSpeedMultiplier: 1 });
    const jumping = computeCurrentSpread(spec, runtime, { velocityXZ: 0, grounded: false, crouching: false, weaponSpeedMultiplier: 1 });

    expect(crouch).toBeLessThan(stand);
    expect(stand).toBeLessThan(moving);
    expect(moving).toBeLessThan(jumping);
  });

  it('scoped spread is tighter than unscoped', () => {
    const spec = WEAPON_SPECS.monolith_awm;
    const runtime = createWeaponRuntime(spec.id, true);
    const unscoped = computeCurrentSpread(spec, runtime, { velocityXZ: 0, grounded: true, crouching: false, weaponSpeedMultiplier: 1 });
    runtime.isScoped = true;
    const scoped = computeCurrentSpread(spec, runtime, { velocityXZ: 0, grounded: true, crouching: false, weaponSpeedMultiplier: 1 });
    expect(scoped).toBeLessThan(unscoped);
  });
});

describe('Hitbox raycasting', () => {
  it('detects a headshot aimed at head height', () => {
    const boxes = buildHitboxes({ x: 0, y: 0, z: 0 }, false);
    const origin = { x: 0, y: boxes.head.center.y, z: -6 };
    const dir = { x: 0, y: 0, z: 1 };
    const hit = raycastPlayerHitboxes(origin, dir, boxes, 50);
    expect(hit).not.toBeNull();
    expect(hit!.hitGroup).toBe('head');
  });

  it('detects a chest shot aimed at torso height', () => {
    const boxes = buildHitboxes({ x: 0, y: 0, z: 0 }, false);
    const origin = { x: 0, y: boxes.chest.center.y, z: -6 };
    const dir = { x: 0, y: 0, z: 1 };
    const hit = raycastPlayerHitboxes(origin, dir, boxes, 50);
    expect(hit).not.toBeNull();
    expect(hit!.hitGroup).toBe('chest');
  });

  it('returns null when the ray misses entirely', () => {
    const boxes = buildHitboxes({ x: 0, y: 0, z: 0 }, false);
    const origin = { x: 0, y: 30, z: -6 };
    const dir = { x: 0, y: 0, z: 1 };
    expect(raycastPlayerHitboxes(origin, dir, boxes, 50)).toBeNull();
  });

  it('crouching lowers the head hitbox', () => {
    const standing = buildHitboxes({ x: 0, y: 0, z: 0 }, false);
    const crouched = buildHitboxes({ x: 0, y: 0, z: 0 }, true);
    expect(crouched.head.center.y).toBeLessThan(standing.head.center.y);
  });
});
