import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  DEFAULT_VIDEO_SETTINGS,
  DEFAULT_MOUSE_SETTINGS,
  DEFAULT_CROSSHAIR_SETTINGS,
  calculateCmPer360,
  calculateEffectiveDpi,
  convertSensitivityScale,
  getObjectDistanceCutoffMeters,
  getPlayerDistanceCutoffMeters,
  useSettingsStore,
  type BindableAction,
  type VideoSettings
} from '../src/game/settings/settingsStore';

// Minimal localStorage shim for the Node test environment
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear()
});
vi.stubGlobal('window', { localStorage: globalThis.localStorage, devicePixelRatio: 1 });

describe('Settings store defaults', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('loads sane default video settings', () => {
    const video = useSettingsStore.getState().video;
    expect(video.fov).toBeGreaterThanOrEqual(68);
    expect(video.fov).toBeLessThanOrEqual(110);
    expect(video.frustumCulling).toBe(true);
    expect(video.smartOcclusionCulling).toBe(true);
    expect(video.portalVisibilityCulling).toBe(true);
    expect(video.lodEnabled).toBe(true);
  });

  it('defaults to raw mouse input with acceleration disabled', () => {
    const mouse = useSettingsStore.getState().mouse;
    expect(mouse.rawInput).toBe(true);
    expect(mouse.mouseAcceleration).toBe(false);
    expect(mouse.invertY).toBe(false);
  });

  it('binds every expected action out of the box', () => {
    const binds = useSettingsStore.getState().keybinds;
    const expected: BindableAction[] = [
      'forward',
      'backward',
      'left',
      'right',
      'jump',
      'crouch',
      'walk',
      'fire',
      'reload',
      'interact',
      'buyMenu',
      'scoreboard',
      'consoleToggle'
    ];
    for (const action of expected) {
      expect(binds[action]).toBeTruthy();
    }
  });

  it('matches the documented default WASD/jump/crouch bindings', () => {
    expect(DEFAULT_KEYBINDS.forward).toBe('KeyW');
    expect(DEFAULT_KEYBINDS.left).toBe('KeyA');
    expect(DEFAULT_KEYBINDS.backward).toBe('KeyS');
    expect(DEFAULT_KEYBINDS.right).toBe('KeyD');
    expect(DEFAULT_KEYBINDS.jump).toBe('Space');
    expect(DEFAULT_KEYBINDS.crouch).toBe('ControlLeft');
    expect(DEFAULT_KEYBINDS.walk).toBe('ShiftLeft');
    expect(DEFAULT_KEYBINDS.interact).toBe('KeyE');
    expect(DEFAULT_KEYBINDS.reload).toBe('KeyR');
    expect(DEFAULT_KEYBINDS.buyMenu).toBe('KeyB');
  });
});

describe('Keybinding management', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetKeybinds();
  });

  it('jump is independently rebindable', () => {
    useSettingsStore.getState().setKeybind('jump', 'KeyV');
    expect(useSettingsStore.getState().keybinds.jump).toBe('KeyV');
    expect(useSettingsStore.getState().keybinds.forward).toBe('KeyW');
  });

  it('supports binding actions to mouse buttons and the wheel', () => {
    useSettingsStore.getState().setKeybind('jump', 'WheelDown');
    expect(useSettingsStore.getState().keybinds.jump).toBe('WheelDown');
    useSettingsStore.getState().setKeybind('meleeWeapon', 'Mouse4');
    expect(useSettingsStore.getState().keybinds.meleeWeapon).toBe('Mouse4');
  });

  it('permits duplicate bindings (surfaced as warnings in the UI, not blocked)', () => {
    useSettingsStore.getState().setKeybind('crouch', 'KeyW');
    const binds = useSettingsStore.getState().keybinds;
    expect(binds.crouch).toBe('KeyW');
    expect(binds.forward).toBe('KeyW');
  });

  it('reset restores every default binding', () => {
    useSettingsStore.getState().setKeybind('jump', 'KeyV');
    useSettingsStore.getState().setKeybind('fire', 'KeyQ');
    useSettingsStore.getState().resetKeybinds();
    const binds = useSettingsStore.getState().keybinds;
    expect(binds.jump).toBe(DEFAULT_KEYBINDS.jump);
    expect(binds.fire).toBe(DEFAULT_KEYBINDS.fire);
  });
});

describe('Video settings and performance presets', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('COMPETITIVE preset disables latency-adding features and maxes FPS', () => {
    useSettingsStore.getState().applyPreset('COMPETITIVE');
    const v = useSettingsStore.getState().video;
    expect(v.vsync).toBe(false);
    expect(v.motionBlur).toBe(false);
    expect(v.depthOfField).toBe(false);
    expect(v.bloom).toBe(false);
    expect(v.postProcessing).toBe(false);
    expect(v.smartOcclusionCulling).toBe(true);
    expect(v.frustumCulling).toBe(true);
    expect(v.playerVisibilityDistance).toBe('Unlimited');
  });

  it('LOW_END_PC preset reduces render scale and disables shadows', () => {
    useSettingsStore.getState().applyPreset('LOW_END_PC');
    const v = useSettingsStore.getState().video;
    expect(v.renderScale).toBeLessThan(1);
    expect(v.shadowQuality).toBe('Off');
    expect(v.antiAliasing).toBe('Off');
  });

  it('ULTRA preset enables volumetric and post-processing effects', () => {
    useSettingsStore.getState().applyPreset('ULTRA');
    const v = useSettingsStore.getState().video;
    expect(v.volumetrics).toBe(true);
    expect(v.bloom).toBe(true);
    expect(v.postProcessing).toBe(true);
    expect(v.renderScale).toBeGreaterThanOrEqual(1);
  });

  it('switching presets resets every dependent field consistently', () => {
    useSettingsStore.getState().applyPreset('COMPETITIVE');
    useSettingsStore.getState().applyPreset('QUALITY');
    const v = useSettingsStore.getState().video;
    expect(v.preset).toBe('QUALITY');
    expect(v.shadowQuality).toBe('High');
    expect(v.modelQuality).toBe('High');
  });

  it('editing an individual setting marks the preset as CUSTOM', () => {
    useSettingsStore.getState().applyPreset('BALANCED');
    useSettingsStore.getState().updateVideo({ fov: 105 });
    const v = useSettingsStore.getState().video;
    expect(v.preset).toBe('CUSTOM');
    expect(v.fov).toBe(105);
  });
});

describe('Competitive optimization pass', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('reports every change it makes', () => {
    useSettingsStore.getState().updateVideo({ vsync: true, motionBlur: true, smartOcclusionCulling: false });
    const diffs = useSettingsStore.getState().applyCompetitiveOptimization();
    expect(diffs.length).toBeGreaterThan(0);
    for (const d of diffs) {
      expect(d.setting).toBeTruthy();
      expect(d.before).toBeDefined();
      expect(d.after).toBeDefined();
      expect(d.impact.length).toBeGreaterThan(5);
    }
  });

  it('actually applies the competitive profile', () => {
    useSettingsStore.getState().updateVideo({ vsync: true, smartOcclusionCulling: false });
    useSettingsStore.getState().applyCompetitiveOptimization();
    const v = useSettingsStore.getState().video;
    expect(v.vsync).toBe(false);
    expect(v.smartOcclusionCulling).toBe(true);
    expect(v.playerVisibilityDistance).toBe('Unlimited');
    expect(useSettingsStore.getState().mouse.rawInput).toBe(true);
    expect(useSettingsStore.getState().mouse.mouseAcceleration).toBe(false);
  });

  it('is idempotent: a second run reports no further changes beyond a verification note', () => {
    useSettingsStore.getState().applyCompetitiveOptimization();
    const secondRun = useSettingsStore.getState().applyCompetitiveOptimization();
    const onlyVerification =
      secondRun.length === 1 && secondRun[0].setting === 'Renderer Pipeline';
    expect(onlyVerification || secondRun.length === 0).toBe(true);
  });
});

describe('Visibility distance helpers', () => {
  it('maps the object visibility presets to sensible cutoffs', () => {
    const base = DEFAULT_VIDEO_SETTINGS;
    expect(getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Near' })).toBeLessThan(
      getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Medium' })
    );
    expect(getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Medium' })).toBeLessThan(
      getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Far' })
    );
    expect(getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Far' })).toBeLessThan(
      getObjectDistanceCutoffMeters({ ...base, objectVisibilityDistance: 'Ultra' })
    );
  });

  it('honours the custom object distance value', () => {
    const video: VideoSettings = {
      ...DEFAULT_VIDEO_SETTINGS,
      objectVisibilityDistance: 'Custom',
      customObjectDistanceMeters: 137
    };
    expect(getObjectDistanceCutoffMeters(video)).toBe(137);
  });

  it('treats Unlimited player distance as effectively infinite', () => {
    const video: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS, playerVisibilityDistance: 'Unlimited' };
    expect(getPlayerDistanceCutoffMeters(video)).toBeGreaterThan(1000);
  });

  it('maps explicit player distances to their numeric values', () => {
    [50, 100, 150, 200, 300, 500].forEach((d) => {
      expect(getPlayerDistanceCutoffMeters({ ...DEFAULT_VIDEO_SETTINGS, playerVisibilityDistance: d as never })).toBe(d);
    });
  });
});

describe('Crosshair configuration', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('validates the color format on update', () => {
    useSettingsStore.getState().updateCrosshair({ color: '#ff00aa' });
    expect(useSettingsStore.getState().crosshair.color).toBe('#ff00aa');
  });

  it('persists size, gap, thickness, and dot independently', () => {
    useSettingsStore.getState().updateCrosshair({ size: 9, gap: -2, thickness: 3, centerDot: true });
    const c = useSettingsStore.getState().crosshair;
    expect(c.size).toBe(9);
    expect(c.gap).toBe(-2);
    expect(c.thickness).toBe(3);
    expect(c.centerDot).toBe(true);
  });

  it('supports dynamic movement and firing toggles', () => {
    useSettingsStore.getState().updateCrosshair({ dynamicMovement: true, dynamicFiring: false });
    const c = useSettingsStore.getState().crosshair;
    expect(c.dynamicMovement).toBe(true);
    expect(c.dynamicFiring).toBe(false);
  });

  it('has a coherent default configuration', () => {
    expect(DEFAULT_CROSSHAIR_SETTINGS.style).toBeTruthy();
    expect(DEFAULT_CROSSHAIR_SETTINGS.opacity).toBeGreaterThan(0);
    expect(DEFAULT_CROSSHAIR_SETTINGS.opacity).toBeLessThanOrEqual(1);
  });
});

describe('Sensitivity mathematics', () => {
  it('computes effective DPI as DPI × sensitivity', () => {
    expect(calculateEffectiveDpi(800, 1.5)).toBe(1200);
    expect(calculateEffectiveDpi(1600, 0.5)).toBe(800);
  });

  it('computes a plausible cm/360 for a common competitive setup', () => {
    // 800 DPI @ 1.0 sensitivity on a 0.022° yaw scale → ~51.4 cm/360
    const cm360 = calculateCmPer360(800, 1.0);
    expect(cm360).toBeGreaterThan(45);
    expect(cm360).toBeLessThan(58);
  });

  it('halving sensitivity doubles cm/360', () => {
    const base = calculateCmPer360(800, 2.0);
    const halved = calculateCmPer360(800, 1.0);
    expect(halved).toBeCloseTo(base * 2, 1);
  });

  it('returns 0 for a degenerate zero-configuration', () => {
    expect(calculateCmPer360(0, 0)).toBe(0);
  });

  it('converts between engine scales consistently', () => {
    expect(convertSensitivityScale(2.0, 'Vanguard')).toBe(2.0);
    const valorant = convertSensitivityScale(3.181818, 'Valorant');
    expect(valorant).toBeCloseTo(1.0, 2);
    const ow = convertSensitivityScale(1.0, 'Overwatch');
    expect(ow).toBeCloseTo(3.33, 1);
  });

  it('scoped cm/360 scales with the scoped multiplier', () => {
    const hip = calculateCmPer360(800, 1.0);
    const scoped = calculateCmPer360(800, 1.0 * 0.75);
    expect(scoped).toBeGreaterThan(hip);
  });
});

describe('Config export / import', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('exports a versioned video config bundle', () => {
    const json = useSettingsStore.getState().exportCategoryJson('video');
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.category).toBe('video.json');
    expect(parsed.video).toBeDefined();
  });

  it('exports all documented config categories', () => {
    const categories = ['video', 'controls', 'audio', 'crosshair', 'gameplay', 'network', 'all'] as const;
    for (const cat of categories) {
      const parsed = JSON.parse(useSettingsStore.getState().exportCategoryJson(cat));
      expect(parsed.schemaVersion).toBe(1);
    }
  });

  it('round-trips a video configuration export → import', () => {
    useSettingsStore.getState().updateVideo({ fov: 104, renderScale: 0.8 });
    const exported = useSettingsStore.getState().exportCategoryJson('video');

    useSettingsStore.getState().resetAllSettings();
    expect(useSettingsStore.getState().video.fov).not.toBe(104);

    const result = useSettingsStore.getState().importCategoryJson(exported);
    expect(result.ok).toBe(true);
    expect(useSettingsStore.getState().video.fov).toBe(104);
    expect(useSettingsStore.getState().video.renderScale).toBe(0.8);
  });

  it('rejects malformed JSON with a clear error message', () => {
    const result = useSettingsStore.getState().importCategoryJson('{not json');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/parse/i);
  });

  it('rejects a newer schema version instead of corrupting settings', () => {
    const future = JSON.stringify({ schemaVersion: 99, category: 'video.json', video: { fov: 100 } });
    const result = useSettingsStore.getState().importCategoryJson(future);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/schema/i);
  });

  it('rejects non-object payloads', () => {
    expect(useSettingsStore.getState().importCategoryJson('"a string"').ok).toBe(false);
    expect(useSettingsStore.getState().importCategoryJson('null').ok).toBe(false);
  });
});

describe('Network defaults', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('enables client prediction, reconciliation, and lag compensation by default', () => {
    const net = useSettingsStore.getState().network;
    expect(net.clientSidePrediction).toBe(true);
    expect(net.serverReconciliation).toBe(true);
    expect(net.lagCompensation).toBe(true);
  });

  it('uses a 64-tick packet rate by default', () => {
    expect(useSettingsStore.getState().network.packetRateHz).toBe(64);
  });

  it('defaults interpolation to one 64-tick interval', () => {
    expect(useSettingsStore.getState().network.interpolationDelayMs).toBeCloseTo(15.6, 1);
  });
});

describe('Accessibility defaults', () => {
  beforeEach(() => {
    store.clear();
    useSettingsStore.getState().resetAllSettings();
  });

  it('defaults to no colorblind filter and no reduced motion', () => {
    const g = useSettingsStore.getState().gameplay;
    expect(g.colorblindMode).toBe('None');
    expect(g.reducedMotion).toBe(false);
  });

  it('exposes UI and text scaling', () => {
    useSettingsStore.getState().updateGameplay({ uiScale: 1.25, textScale: 1.3 });
    expect(useSettingsStore.getState().gameplay.uiScale).toBe(1.25);
    expect(useSettingsStore.getState().gameplay.textScale).toBe(1.3);
  });

  it('supports every colorblind preset', () => {
    const modes = ['None', 'Protanopia', 'Deuteranopia', 'Tritanopia'] as const;
    for (const m of modes) {
      useSettingsStore.getState().updateGameplay({ colorblindMode: m });
      expect(useSettingsStore.getState().gameplay.colorblindMode).toBe(m);
    }
  });
});

describe('Mouse defaults', () => {
  it('uses sensible competitive defaults', () => {
    expect(DEFAULT_MOUSE_SETTINGS.sensitivity).toBeGreaterThan(0);
    expect(DEFAULT_MOUSE_SETTINGS.sensitivity).toBeLessThan(4);
    expect(DEFAULT_MOUSE_SETTINGS.dpi).toBeGreaterThanOrEqual(400);
  });
});
