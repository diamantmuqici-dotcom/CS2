import { create } from 'zustand';
import { RegionId } from '../../shared/types';

export type PerformancePresetId =
  | 'COMPETITIVE'
  | 'BALANCED'
  | 'QUALITY'
  | 'ULTRA'
  | 'LOW_END_PC'
  | 'HIGH_END_PC'
  | 'STREAMING'
  | 'PRACTICE'
  | 'CUSTOM';

export type QualityTier = 'Low' | 'Medium' | 'High' | 'Ultra';
export type PlayerVisDistance = 50 | 100 | 150 | 200 | 300 | 500 | 'Unlimited';
export type ObjectVisPreset = 'Near' | 'Medium' | 'Far' | 'Ultra' | 'Custom';
export type TelemetryLevel = 'OFF' | 'MINIMAL' | 'FULL';
export type ColorblindMode = 'None' | 'Protanopia' | 'Deuteranopia' | 'Tritanopia';
export type CrosshairStyle = 'ClassicStatic' | 'ClassicDynamic' | 'DotOnly' | 'TShape' | 'CircleReticle';

export type BindableAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'jumpAlt'
  | 'crouch'
  | 'walk'
  | 'fire'
  | 'altFire'
  | 'reload'
  | 'interact'
  | 'primaryWeapon'
  | 'secondaryWeapon'
  | 'meleeWeapon'
  | 'grenadeCycle'
  | 'smokeGrenade'
  | 'flashGrenade'
  | 'heGrenade'
  | 'incendiaryGrenade'
  | 'dropWeapon'
  | 'inspectWeapon'
  | 'buyMenu'
  | 'scoreboard'
  | 'voicePushToTalk'
  | 'consoleToggle'
  | 'cullingDebugToggle';

export interface VideoSettings {
  preset: PerformancePresetId;
  resolutionPreset: '1280x720' | '1600x900' | '1920x1080' | '2560x1440' | 'Native';
  renderScale: number; // 0.5 to 1.5
  fov: number; // 68 to 110
  vsync: boolean;
  fpsCapPreset: '30' | '60' | '120' | '144' | '165' | '240' | '360' | 'Unlimited' | 'Custom';
  fpsCapCustom: number;
  playerVisibilityDistance: PlayerVisDistance;
  objectVisibilityDistance: ObjectVisPreset;
  customObjectDistanceMeters: number;
  frustumCulling: boolean;
  smartOcclusionCulling: boolean;
  portalVisibilityCulling: boolean;
  lodEnabled: boolean;
  instancingEnabled: boolean;
  showCullingDebug: boolean;
  telemetryMode: TelemetryLevel;
  textureQuality: QualityTier;
  modelQuality: QualityTier;
  shadowQuality: 'Off' | QualityTier;
  shadowDistance: number; // 15 to 150m
  lightingQuality: QualityTier;
  effectsQuality: QualityTier;
  particleQuality: QualityTier;
  particleLimit: number;
  ambientOcclusion: boolean;
  reflections: 'Off' | 'Low' | 'High';
  postProcessing: boolean;
  antiAliasing: 'Off' | 'FXAA' | 'MSAA';
  anisotropicFiltering: 1 | 2 | 4 | 8 | 16;
  foliageQuality: QualityTier;
  waterQuality: QualityTier;
  volumetrics: boolean;
  motionBlur: boolean;
  depthOfField: boolean;
  bloom: boolean;
  colorGrading: boolean;
  sharpening: number; // 0 to 1.0
  competitiveClarityBoost: boolean;
  headBob: boolean;
}

export interface MouseSettings {
  dpi: number;
  sensitivity: number;
  scopedSensitivity: number;
  adsSensitivity: number;
  zoomMultiplier: number;
  rawInput: boolean;
  mouseAcceleration: boolean;
  accelerationAmount: number;
  invertY: boolean;
  pistolSensMultiplier: number;
  rifleSensMultiplier: number;
  sniperSensMultiplier: number;
  jumpBehavior: 'HoldOrTap' | 'ScrollBhopFriendly' | 'StrictGrounded';
}

export interface CrosshairSettings {
  style: CrosshairStyle;
  size: number; // 1 to 20
  thickness: number; // 1 to 8
  gap: number; // -4 to 15
  outline: boolean;
  outlineThickness: number; // 1 to 3
  opacity: number; // 0.1 to 1.0
  color: string;
  centerDot: boolean;
  centerDotSize: number;
  dynamicMovement: boolean;
  dynamicFiring: boolean;
  recoilFeedback: boolean;
}

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  weaponVolume: number;
  footstepBoost: number;
  voiceVolume: number;
  uiVolume: number;
  spatialHrtf: boolean;
  soundOcclusion: boolean;
  competitiveAudioProfile: boolean;
  muteWhenUnfocused: boolean;
}

export interface GameplayHudSettings {
  language: 'en-US' | 'de-DE' | 'es-ES' | 'fr-FR' | 'pt-BR' | 'ja-JP';
  hudOpacity: number;
  radarSize: number;
  radarZoom: number;
  radarRotate: boolean;
  damageIndicators: boolean;
  killFeedEnabled: boolean;
  teammateEquipmentOverhead: boolean;
  enemyNameOnAim: boolean;
  interactionPrompts: boolean;
  subtitles: boolean;
  colorblindMode: ColorblindMode;
  uiScale: number;
  textScale: number;
  highContrastHud: boolean;
  reducedMotion: boolean;
  flashbangDarkMode: boolean; // Accessibility screen flash reduction
  visualAudioRadarRing: boolean;
}

export interface NetworkSettings {
  preferredRegion: RegionId;
  maxAcceptablePingMs: number;
  interpolationDelayMs: number;
  clientSidePrediction: boolean;
  serverReconciliation: boolean;
  lagCompensation: boolean;
  packetRateHz: 64 | 128;
  simulateLatencyMs: number;
  simulatePacketLossPercent: number;
}

export interface OptimizationDiffItem {
  setting: string;
  before: string;
  after: string;
  impact: string;
}

export const DEFAULT_KEYBINDS: Record<BindableAction, string> = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  jumpAlt: 'WheelDown',
  crouch: 'ControlLeft',
  walk: 'ShiftLeft',
  fire: 'Mouse0',
  altFire: 'Mouse2',
  reload: 'KeyR',
  interact: 'KeyE',
  primaryWeapon: 'Digit1',
  secondaryWeapon: 'Digit2',
  meleeWeapon: 'Digit3',
  grenadeCycle: 'Digit4',
  smokeGrenade: 'KeyX',
  flashGrenade: 'KeyC',
  heGrenade: 'KeyV',
  incendiaryGrenade: 'KeyZ',
  dropWeapon: 'KeyG',
  inspectWeapon: 'KeyF',
  buyMenu: 'KeyB',
  scoreboard: 'Tab',
  voicePushToTalk: 'KeyK',
  consoleToggle: 'Backquote',
  cullingDebugToggle: 'F3'
};

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  preset: 'BALANCED',
  resolutionPreset: 'Native',
  renderScale: 1.0,
  fov: 90,
  vsync: false,
  fpsCapPreset: '240',
  fpsCapCustom: 240,
  playerVisibilityDistance: 'Unlimited',
  objectVisibilityDistance: 'Far',
  customObjectDistanceMeters: 90,
  frustumCulling: true,
  smartOcclusionCulling: true,
  portalVisibilityCulling: true,
  lodEnabled: true,
  instancingEnabled: true,
  showCullingDebug: false,
  telemetryMode: 'MINIMAL',
  textureQuality: 'High',
  modelQuality: 'High',
  shadowQuality: 'Medium',
  shadowDistance: 55,
  lightingQuality: 'High',
  effectsQuality: 'Medium',
  particleQuality: 'Medium',
  particleLimit: 120,
  ambientOcclusion: true,
  reflections: 'Low',
  postProcessing: true,
  antiAliasing: 'MSAA',
  anisotropicFiltering: 8,
  foliageQuality: 'Medium',
  waterQuality: 'Medium',
  volumetrics: false,
  motionBlur: false,
  depthOfField: false,
  bloom: false,
  colorGrading: true,
  sharpening: 0.5,
  competitiveClarityBoost: true,
  headBob: false
};

export const DEFAULT_MOUSE_SETTINGS: MouseSettings = {
  dpi: 800,
  sensitivity: 1.15,
  scopedSensitivity: 1.0,
  adsSensitivity: 0.95,
  zoomMultiplier: 1.0,
  rawInput: true,
  mouseAcceleration: false,
  accelerationAmount: 1.05,
  invertY: false,
  pistolSensMultiplier: 1.0,
  rifleSensMultiplier: 1.0,
  sniperSensMultiplier: 1.0,
  jumpBehavior: 'ScrollBhopFriendly'
};

export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  style: 'ClassicStatic',
  size: 6,
  thickness: 2,
  gap: 3,
  outline: true,
  outlineThickness: 1,
  opacity: 0.95,
  color: '#22d3ee',
  centerDot: false,
  centerDotSize: 2,
  dynamicMovement: false,
  dynamicFiring: true,
  recoilFeedback: false
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.85,
  sfxVolume: 0.9,
  weaponVolume: 0.8,
  footstepBoost: 1.25,
  voiceVolume: 0.85,
  uiVolume: 0.7,
  spatialHrtf: true,
  soundOcclusion: true,
  competitiveAudioProfile: true,
  muteWhenUnfocused: false
};

export const DEFAULT_GAMEPLAY_SETTINGS: GameplayHudSettings = {
  language: 'en-US',
  hudOpacity: 0.95,
  radarSize: 190,
  radarZoom: 1.0,
  radarRotate: true,
  damageIndicators: true,
  killFeedEnabled: true,
  teammateEquipmentOverhead: true,
  enemyNameOnAim: true,
  interactionPrompts: true,
  subtitles: false,
  colorblindMode: 'None',
  uiScale: 1.0,
  textScale: 1.0,
  highContrastHud: false,
  reducedMotion: false,
  flashbangDarkMode: false,
  visualAudioRadarRing: true
};

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  preferredRegion: 'EU',
  maxAcceptablePingMs: 65,
  interpolationDelayMs: 15.6,
  clientSidePrediction: true,
  serverReconciliation: true,
  lagCompensation: true,
  packetRateHz: 64,
  simulateLatencyMs: 18,
  simulatePacketLossPercent: 0
};

export interface SettingsStoreState {
  schemaVersion: number;
  video: VideoSettings;
  mouse: MouseSettings;
  keybinds: Record<BindableAction, string>;
  crosshair: CrosshairSettings;
  audio: AudioSettings;
  gameplay: GameplayHudSettings;
  network: NetworkSettings;
  lastOptimizationDiff: OptimizationDiffItem[];

  updateVideo: (patch: Partial<VideoSettings>) => void;
  updateMouse: (patch: Partial<MouseSettings>) => void;
  updateCrosshair: (patch: Partial<CrosshairSettings>) => void;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  updateGameplay: (patch: Partial<GameplayHudSettings>) => void;
  updateNetwork: (patch: Partial<NetworkSettings>) => void;
  setKeybind: (action: BindableAction, code: string) => void;
  resetKeybinds: () => void;
  applyPreset: (preset: PerformancePresetId) => void;
  applyCompetitiveOptimization: () => OptimizationDiffItem[];
  resetAllSettings: () => void;
  exportCategoryJson: (category: 'all' | 'video' | 'controls' | 'audio' | 'crosshair' | 'gameplay' | 'network') => string;
  importCategoryJson: (jsonStr: string) => { ok: boolean; message: string };
}

const STORAGE_KEY = 'vanguard_protocol_settings_v1';

function loadPersistedSettings(): Partial<SettingsStoreState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePersistedSettings(state: Partial<SettingsStoreState>) {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      schemaVersion: 1,
      video: state.video,
      mouse: state.mouse,
      keybinds: state.keybinds,
      crosshair: state.crosshair,
      audio: state.audio,
      gameplay: state.gameplay,
      network: state.network
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

const persisted = loadPersistedSettings();

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  schemaVersion: 1,
  video: { ...DEFAULT_VIDEO_SETTINGS, ...(persisted.video || {}) },
  mouse: { ...DEFAULT_MOUSE_SETTINGS, ...(persisted.mouse || {}) },
  keybinds: { ...DEFAULT_KEYBINDS, ...(persisted.keybinds || {}) },
  crosshair: { ...DEFAULT_CROSSHAIR_SETTINGS, ...(persisted.crosshair || {}) },
  audio: { ...DEFAULT_AUDIO_SETTINGS, ...(persisted.audio || {}) },
  gameplay: { ...DEFAULT_GAMEPLAY_SETTINGS, ...(persisted.gameplay || {}) },
  network: { ...DEFAULT_NETWORK_SETTINGS, ...(persisted.network || {}) },
  lastOptimizationDiff: [],

  updateVideo: (patch) =>
    set((state) => {
      const next = { ...state.video, ...patch, preset: patch.preset ?? ('CUSTOM' as PerformancePresetId) };
      savePersistedSettings({ ...state, video: next });
      return { video: next };
    }),

  updateMouse: (patch) =>
    set((state) => {
      const next = { ...state.mouse, ...patch };
      savePersistedSettings({ ...state, mouse: next });
      return { mouse: next };
    }),

  updateCrosshair: (patch) =>
    set((state) => {
      const next = { ...state.crosshair, ...patch };
      savePersistedSettings({ ...state, crosshair: next });
      return { crosshair: next };
    }),

  updateAudio: (patch) =>
    set((state) => {
      const next = { ...state.audio, ...patch };
      savePersistedSettings({ ...state, audio: next });
      return { audio: next };
    }),

  updateGameplay: (patch) =>
    set((state) => {
      const next = { ...state.gameplay, ...patch };
      savePersistedSettings({ ...state, gameplay: next });
      return { gameplay: next };
    }),

  updateNetwork: (patch) =>
    set((state) => {
      const next = { ...state.network, ...patch };
      savePersistedSettings({ ...state, network: next });
      return { network: next };
    }),

  setKeybind: (action, code) =>
    set((state) => {
      const next = { ...state.keybinds, [action]: code };
      savePersistedSettings({ ...state, keybinds: next });
      return { keybinds: next };
    }),

  resetKeybinds: () =>
    set((state) => {
      savePersistedSettings({ ...state, keybinds: DEFAULT_KEYBINDS });
      return { keybinds: { ...DEFAULT_KEYBINDS } };
    }),

  applyPreset: (preset) =>
    set((state) => {
      let nextVideo = { ...state.video, preset };
      if (preset === 'COMPETITIVE') {
        nextVideo = {
          ...nextVideo,
          preset: 'COMPETITIVE',
          renderScale: 1.0,
          vsync: false,
          fpsCapPreset: '360',
          playerVisibilityDistance: 'Unlimited',
          objectVisibilityDistance: 'Medium',
          frustumCulling: true,
          smartOcclusionCulling: true,
          portalVisibilityCulling: true,
          lodEnabled: true,
          instancingEnabled: true,
          textureQuality: 'Medium',
          modelQuality: 'Low',
          shadowQuality: 'Low',
          shadowDistance: 35,
          lightingQuality: 'Low',
          effectsQuality: 'Low',
          particleQuality: 'Low',
          particleLimit: 50,
          ambientOcclusion: false,
          reflections: 'Off',
          postProcessing: false,
          antiAliasing: 'FXAA',
          volumetrics: false,
          motionBlur: false,
          depthOfField: false,
          bloom: false,
          sharpening: 0.75,
          competitiveClarityBoost: true,
          headBob: false
        };
      } else if (preset === 'BALANCED') {
        nextVideo = { ...DEFAULT_VIDEO_SETTINGS, preset: 'BALANCED' };
      } else if (preset === 'QUALITY') {
        nextVideo = {
          ...DEFAULT_VIDEO_SETTINGS,
          preset: 'QUALITY',
          renderScale: 1.0,
          objectVisibilityDistance: 'Far',
          textureQuality: 'High',
          modelQuality: 'High',
          shadowQuality: 'High',
          shadowDistance: 80,
          lightingQuality: 'High',
          effectsQuality: 'High',
          particleQuality: 'High',
          particleLimit: 200,
          ambientOcclusion: true,
          reflections: 'High',
          postProcessing: true,
          bloom: true
        };
      } else if (preset === 'ULTRA' || preset === 'HIGH_END_PC') {
        nextVideo = {
          ...DEFAULT_VIDEO_SETTINGS,
          preset,
          renderScale: 1.25,
          fpsCapPreset: 'Unlimited',
          objectVisibilityDistance: 'Ultra',
          textureQuality: 'Ultra',
          modelQuality: 'Ultra',
          shadowQuality: 'Ultra',
          shadowDistance: 120,
          lightingQuality: 'Ultra',
          effectsQuality: 'Ultra',
          particleQuality: 'Ultra',
          particleLimit: 350,
          ambientOcclusion: true,
          reflections: 'High',
          postProcessing: true,
          anisotropicFiltering: 16,
          volumetrics: true,
          bloom: true
        };
      } else if (preset === 'LOW_END_PC') {
        nextVideo = {
          ...DEFAULT_VIDEO_SETTINGS,
          preset: 'LOW_END_PC',
          renderScale: 0.75,
          fpsCapPreset: '144',
          objectVisibilityDistance: 'Near',
          textureQuality: 'Low',
          modelQuality: 'Low',
          shadowQuality: 'Off',
          shadowDistance: 15,
          lightingQuality: 'Low',
          effectsQuality: 'Low',
          particleQuality: 'Low',
          particleLimit: 30,
          ambientOcclusion: false,
          reflections: 'Off',
          postProcessing: false,
          antiAliasing: 'Off'
        };
      } else if (preset === 'STREAMING') {
        nextVideo = {
          ...DEFAULT_VIDEO_SETTINGS,
          preset: 'STREAMING',
          renderScale: 1.0,
          fpsCapPreset: '144',
          shadowQuality: 'Medium',
          effectsQuality: 'Medium',
          colorGrading: true,
          sharpening: 0.65
        };
      } else if (preset === 'PRACTICE') {
        nextVideo = {
          ...DEFAULT_VIDEO_SETTINGS,
          preset: 'PRACTICE',
          telemetryMode: 'FULL',
          objectVisibilityDistance: 'Ultra',
          fpsCapPreset: 'Unlimited'
        };
      }
      savePersistedSettings({ ...state, video: nextVideo });
      return { video: nextVideo };
    }),

  applyCompetitiveOptimization: () => {
    const state = get();
    const diffs: OptimizationDiffItem[] = [];
    const recordDiff = (setting: string, beforeVal: unknown, afterVal: unknown, impact: string) => {
      if (String(beforeVal) !== String(afterVal)) {
        diffs.push({
          setting,
          before: String(beforeVal),
          after: String(afterVal),
          impact
        });
      }
    };

    recordDiff('VSync', state.video.vsync, false, '-12ms Input Latency & Uncapped Frame Delivery');
    recordDiff('Smart Occlusion ("Behind Me")', state.video.smartOcclusionCulling, true, '-38% GPU Draw Calls in Corridors');
    recordDiff('Frustum & Portal Culling', state.video.portalVisibilityCulling, true, 'Eliminates Off-Screen Interior Geometry');
    recordDiff('Motion Blur & Depth of Field', state.video.motionBlur || state.video.depthOfField, false, 'Zero Smearing During Fast Flicks');
    recordDiff('Post-Processing & Bloom', state.video.bloom, false, '+18% Fragment Shader Headroom');
    recordDiff('Shadow Quality', state.video.shadowQuality, 'Low', 'Preserves Player Silhouette Shadows at Minimal GPU Cost');
    recordDiff('Particle Limit', state.video.particleLimit, 50, 'Prevents Grenade/Smoke FPS Drops');
    recordDiff('Player Visibility Distance', state.video.playerVisibilityDistance, 'Unlimited', '100% Competitive Sightline Integrity');
    recordDiff('Object Detail Distance', state.video.objectVisibilityDistance, 'Medium', 'Culls Distant Non-Critical Props Beyond 65m');
    recordDiff('Raw Mouse Input', state.mouse.rawInput, true, '1:1 Unfiltered Hardware Sensor Poll');
    recordDiff('Mouse Acceleration', state.mouse.mouseAcceleration, false, 'Deterministic Muscle-Memory Aim');
    recordDiff('Competitive Clarity & Sharpening', state.video.sharpening, 0.8, 'Enhanced Target Contrast Against Map Surfaces');

    if (diffs.length === 0) {
      diffs.push({
        setting: 'Renderer Pipeline',
        before: 'Competitive',
        after: 'Competitive Verified',
        impact: 'All competitive low-latency optimizations already active.'
      });
    }

    const nextVideo: VideoSettings = {
      ...state.video,
      preset: 'COMPETITIVE',
      vsync: false,
      fpsCapPreset: '360',
      playerVisibilityDistance: 'Unlimited',
      objectVisibilityDistance: 'Medium',
      frustumCulling: true,
      smartOcclusionCulling: true,
      portalVisibilityCulling: true,
      lodEnabled: true,
      instancingEnabled: true,
      shadowQuality: 'Low',
      shadowDistance: 40,
      effectsQuality: 'Low',
      particleQuality: 'Low',
      particleLimit: 50,
      ambientOcclusion: false,
      reflections: 'Off',
      postProcessing: false,
      volumetrics: false,
      motionBlur: false,
      depthOfField: false,
      bloom: false,
      sharpening: 0.8,
      competitiveClarityBoost: true,
      headBob: false
    };

    const nextMouse: MouseSettings = {
      ...state.mouse,
      rawInput: true,
      mouseAcceleration: false
    };

    set({
      video: nextVideo,
      mouse: nextMouse,
      lastOptimizationDiff: diffs
    });
    savePersistedSettings({ ...state, video: nextVideo, mouse: nextMouse });
    return diffs;
  },

  resetAllSettings: () => {
    const fresh = {
      video: { ...DEFAULT_VIDEO_SETTINGS },
      mouse: { ...DEFAULT_MOUSE_SETTINGS },
      keybinds: { ...DEFAULT_KEYBINDS },
      crosshair: { ...DEFAULT_CROSSHAIR_SETTINGS },
      audio: { ...DEFAULT_AUDIO_SETTINGS },
      gameplay: { ...DEFAULT_GAMEPLAY_SETTINGS },
      network: { ...DEFAULT_NETWORK_SETTINGS },
      lastOptimizationDiff: []
    };
    set(fresh);
    savePersistedSettings(fresh);
  },

  exportCategoryJson: (category) => {
    const s = get();
    const base = { schemaVersion: s.schemaVersion, exportedAt: new Date().toISOString() };
    if (category === 'video') return JSON.stringify({ ...base, category: 'video.json', video: s.video }, null, 2);
    if (category === 'controls') return JSON.stringify({ ...base, category: 'controls.json', mouse: s.mouse, keybinds: s.keybinds }, null, 2);
    if (category === 'audio') return JSON.stringify({ ...base, category: 'audio.json', audio: s.audio }, null, 2);
    if (category === 'crosshair') return JSON.stringify({ ...base, category: 'crosshair.json', crosshair: s.crosshair }, null, 2);
    if (category === 'gameplay') return JSON.stringify({ ...base, category: 'gameplay.json', gameplay: s.gameplay }, null, 2);
    if (category === 'network') return JSON.stringify({ ...base, category: 'network.json', network: s.network }, null, 2);
    return JSON.stringify(
      {
        ...base,
        category: 'vanguard_config_bundle.json',
        video: s.video,
        mouse: s.mouse,
        keybinds: s.keybinds,
        crosshair: s.crosshair,
        audio: s.audio,
        gameplay: s.gameplay,
        network: s.network
      },
      null,
      2
    );
  },

  importCategoryJson: (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { ok: false, message: 'Invalid JSON structure.' };
      }
      if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > 1) {
        return { ok: false, message: `Unsupported config schema version: ${parsed.schemaVersion}` };
      }
      const state = get();
      const nextState = {
        video: parsed.video ? { ...state.video, ...parsed.video } : state.video,
        mouse: parsed.mouse ? { ...state.mouse, ...parsed.mouse } : state.mouse,
        keybinds: parsed.keybinds ? { ...state.keybinds, ...parsed.keybinds } : state.keybinds,
        crosshair: parsed.crosshair ? { ...state.crosshair, ...parsed.crosshair } : state.crosshair,
        audio: parsed.audio ? { ...state.audio, ...parsed.audio } : state.audio,
        gameplay: parsed.gameplay ? { ...state.gameplay, ...parsed.gameplay } : state.gameplay,
        network: parsed.network ? { ...state.network, ...parsed.network } : state.network
      };
      set(nextState);
      savePersistedSettings(nextState);
      return { ok: true, message: `Successfully imported configuration (${parsed.category || 'bundle'}).` };
    } catch (e) {
      return { ok: false, message: `Failed to parse config JSON: ${(e as Error).message}` };
    }
  }
}));

// Sensitivity mathematics helpers (Section 18)
export function calculateEffectiveDpi(dpi: number, sensitivity: number): number {
  return Math.round(dpi * sensitivity);
}

// Standard Source/Tactical yaw scale: 0.022 degrees per count
export function calculateCmPer360(dpi: number, sensitivity: number, mYaw = 0.022): number {
  const effective = dpi * sensitivity * mYaw;
  if (effective <= 0) return 0;
  const inchesPer360 = 360 / effective;
  return Number((inchesPer360 * 2.54).toFixed(2));
}

export function convertSensitivityScale(
  vanguardSens: number,
  targetGame: 'Vanguard' | 'Valorant' | 'Overwatch' | 'Apex'
): number {
  if (targetGame === 'Vanguard' || targetGame === 'Apex') return Number(vanguardSens.toFixed(3));
  if (targetGame === 'Valorant') return Number((vanguardSens / 3.181818).toFixed(3));
  if (targetGame === 'Overwatch') return Number((vanguardSens * 3.333333).toFixed(2));
  return vanguardSens;
}

export function getObjectDistanceCutoffMeters(video: VideoSettings): number {
  if (video.objectVisibilityDistance === 'Near') return 35;
  if (video.objectVisibilityDistance === 'Medium') return 65;
  if (video.objectVisibilityDistance === 'Far') return 110;
  if (video.objectVisibilityDistance === 'Ultra') return 250;
  return Math.max(20, video.customObjectDistanceMeters || 90);
}

export function getPlayerDistanceCutoffMeters(video: VideoSettings): number {
  if (video.playerVisibilityDistance === 'Unlimited') return 10000;
  return Number(video.playerVisibilityDistance);
}
