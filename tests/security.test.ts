import { describe, it, expect } from 'vitest';
import {
  validateWorkshopPackage,
  validateFireInterval,
  validateMovementStep,
  validateMovementBudget,
  createMovementBudget,
  validateViewAnglesAndSnap
} from '../src/shared/security';
import { HARBOR_PROTOCOL_MAP } from '../src/game/maps/officialMaps';

function validPackage(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(HARBOR_PROTOCOL_MAP));
}

describe('Workshop package validation', () => {
  it('accepts a well-formed official map package', () => {
    const result = validateWorkshopPackage(validPackage());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedMap).toBeDefined();
  });

  it('rejects malformed JSON strings', () => {
    const result = validateWorkshopPackage('{"name": "broken", ');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/JSON/i);
  });

  it('rejects non-object roots', () => {
    expect(validateWorkshopPackage('[]').valid).toBe(false);
    expect(validateWorkshopPackage('"just a string"').valid).toBe(false);
    expect(validateWorkshopPackage('42').valid).toBe(false);
  });

  it('rejects embedded <script> tags', () => {
    const pkg = validPackage();
    pkg.description = '<script>alert(document.cookie)</script>';
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Security violation/i);
  });

  it('rejects javascript: URIs', () => {
    const pkg = validPackage();
    pkg.subtitle = 'javascript:stealCreds()';
    expect(validateWorkshopPackage(pkg).valid).toBe(false);
  });

  it('rejects eval / Function constructor payloads', () => {
    const pkg = validPackage();
    pkg.description = 'eval(atob("cGF5bG9hZA=="))';
    expect(validateWorkshopPackage(pkg).valid).toBe(false);

    const pkg2 = validPackage();
    pkg2.description = 'new Function("return 1")()';
    expect(validateWorkshopPackage(pkg2).valid).toBe(false);
  });

  it('rejects prototype pollution attempts', () => {
    const pkg = validPackage();
    pkg.description = '__proto__ pollution attempt';
    expect(validateWorkshopPackage(pkg).valid).toBe(false);
  });

  it('rejects oversized packages', () => {
    const pkg = validPackage();
    pkg.description = 'x'.repeat(6 * 1024 * 1024);
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/size/i);
  });

  it('rejects packages with too many objects', () => {
    const pkg = validPackage();
    const template = (pkg.objects as Array<Record<string, unknown>>)[0];
    (pkg.objects as Array<Record<string, unknown>>) = Array.from({ length: 1600 }, (_, i) => ({
      ...template,
      id: `obj_${i}`,
      type: 'cube'
    }));
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/object count/i);
  });

  it('rejects unsupported object types', () => {
    const pkg = validPackage();
    (pkg.objects as Array<Record<string, unknown>>)[0].type = 'arbitrary_shader_module';
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unsupported type/i);
  });

  it('rejects disallowed materials', () => {
    const pkg = validPackage();
    (pkg.objects as Array<Record<string, unknown>>)[0].material = 'reflective_mirror_hack';
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
  });

  it('rejects out-of-bounds geometry positions', () => {
    const pkg = validPackage();
    (pkg.objects as Array<Record<string, unknown>>)[0].position = [99999, 0, 0];
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid hex colors', () => {
    const pkg = validPackage();
    (pkg.objects as Array<Record<string, unknown>>)[0].color = 'url(evil.png)';
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(false);
  });

  it('sanitizes accepted packages: strips unknown fields and clamps numeric ranges', () => {
    const pkg = validPackage();
    pkg.id = 'ws<>bad$$id';
    pkg.extraDangerousField = { nested: true };
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(true);
    expect(result.sanitizedMap!.id).not.toMatch(/[<>$]/);
    expect((result.sanitizedMap as unknown as Record<string, unknown>).extraDangerousField).toBeUndefined();
  });

  it('warns when spawn points are missing rather than failing hard', () => {
    const pkg = validPackage();
    (pkg.objects as Array<Record<string, unknown>>) = (pkg.objects as Array<Record<string, unknown>>).filter(
      (o) => o.type !== 'spawn_sentinel'
    );
    const result = validateWorkshopPackage(pkg);
    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/Sentinel spawn/i);
  });

  it('rejects packages missing the objects array entirely', () => {
    const pkg = validPackage();
    delete pkg.objects;
    expect(validateWorkshopPackage(pkg).valid).toBe(false);
  });
});

describe('Anti-cheat: movement validation', () => {
  it('accepts legitimate maximum-speed movement', () => {
    const violation = validateMovementStep(
      { x: 0, y: 0, z: 0 },
      { x: 6.5, y: 0, z: 0 },
      1.0,
      12.5
    );
    expect(violation).toBeNull();
  });

  it('flags teleport-style horizontal movement', () => {
    const violation = validateMovementStep(
      { x: 0, y: 0, z: 0 },
      { x: 90, y: 0, z: 0 },
      1.0,
      12.5
    );
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('IMPOSSIBLE_MOVEMENT_SPEED');
    expect(violation!.severity).toBe('critical');
  });

  it('ignores invalid delta times rather than producing false positives', () => {
    expect(validateMovementStep({ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, 0, 12.5)).toBeNull();
    expect(validateMovementStep({ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, 5, 12.5)).toBeNull();
  });

  it('tolerates bunched/jittered legitimate packets via the movement budget', () => {
    const budget = createMovementBudget();
    let pos = { x: 0, y: 0, z: 0 };
    // Simulate a 32 Hz client whose packets arrive in bursts: 8 legitimate packets
    // delivered with near-zero measured arrival deltas.
    for (let i = 0; i < 8; i++) {
      const next = { x: pos.x + 0.2, y: 0, z: pos.z - 0.1 };
      const violation = validateMovementBudget(pos, next, 0.001, budget);
      expect(violation).toBeNull();
      pos = next;
    }
  });

  it('still catches genuine sustained speed abuse through the budget system', () => {
    const budget = createMovementBudget();
    let pos = { x: 0, y: 0, z: 0 };
    let flagged = false;
    for (let i = 0; i < 30 && !flagged; i++) {
      const next = { x: pos.x + 12, y: 0, z: pos.z };
      if (validateMovementBudget(pos, next, 0.001, budget)) flagged = true;
      pos = next;
    }
    expect(flagged).toBe(true);
  });

  it('catches an instantaneous teleport on the first validated movement packet', () => {
    const budget = createMovementBudget();
    const violation = validateMovementBudget({ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 200 }, 0.001, budget);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('IMPOSSIBLE_MOVEMENT_SPEED');
    expect(violation!.severity).toBe('critical');
  });
});

describe('Anti-cheat: fire-rate validation', () => {
  it('accepts the first shot of a match', () => {
    expect(validateFireInterval('harbinger_47', 0, 1000)).toBeNull();
  });

  it('accepts shots spaced at the weapon fire rate', () => {
    const spec = 60 / 600;
    expect(validateFireInterval('harbinger_47', 1000, 1000 + spec * 1000 + 10)).toBeNull();
  });

  it('flags rapid-fire abuse beyond jitter tolerance', () => {
    const violation = validateFireInterval('harbinger_47', 1000, 1005);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('IMPOSSIBLE_FIRE_RATE');
  });

  it('flags shots from an unknown weapon id', () => {
    const violation = validateFireInterval('totally_fake_gun', 0, 1000);
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('critical');
  });

  it('does not false-positive on very fast legitimate weapons', () => {
    // Cyclone-P90 fires at 857 RPM → ~70ms between shots
    // 857 RPM → ~70ms between shots; the 18% jitter floor is ~57ms
    expect(validateFireInterval('cyclone_p90', 1000, 1071)).toBeNull();
    expect(validateFireInterval('cyclone_p90', 1000, 1060)).toBeNull();
    expect(validateFireInterval('cyclone_p90', 1000, 1010)).not.toBeNull();
  });
});

describe('Anti-cheat: view angle validation', () => {
  it('accepts finite in-range angles', () => {
    expect(validateViewAnglesAndSnap(0, 0, 0.5, 0.3, 0.016, false)).toBeNull();
  });

  it('rejects non-finite angles', () => {
    const violation = validateViewAnglesAndSnap(0, 0, Number.NaN, 0, 0.016, false);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('INVALID_VIEW_ANGLES');
  });

  it('rejects pitch beyond the vertical gimbal limit', () => {
    const violation = validateViewAnglesAndSnap(0, 0, 0, Math.PI, 0.016, false);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('INVALID_VIEW_ANGLES');
  });

  it('flags an instant 180° snap that immediately lands a headshot', () => {
    const violation = validateViewAnglesAndSnap(0, 0, Math.PI, 0, 0.01, true);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('ABNORMAL_AIM_SNAP');
  });

  it('does not flag a wide snap when no headshot resulted', () => {
    expect(validateViewAnglesAndSnap(0, 0, Math.PI, 0, 0.01, false)).toBeNull();
  });

  it('does not flag fast but human-achievable flicks', () => {
    expect(validateViewAnglesAndSnap(0, 0, (35 * Math.PI) / 180, 0, 0.01, true)).toBeNull();
  });
});
