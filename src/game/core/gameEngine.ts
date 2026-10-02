import * as THREE from 'three';
import {
  BotDifficulty,
  CustomGameConfig,
  GameMapDefinition,
  GameModeId,
  KillFeedEntry,
  MatchPlayerStats,
  MaterialSurface,
  ReplayEvent,
  ReplayRecord,
  TeamId,
  Vector3D
} from '../../shared/types';
import { WEAPON_SPECS, calculateWeaponDamage } from '../../shared/weapons';
import { getMapById } from '../maps/officialMaps';
import {
  AABB,
  buildMapAABBs,
  hasLineOfSight,
  intersectRayAABB,
  stepPlayerPhysics,
  stepGrenadeProjectile,
  computeGrenadeTrajectoryPreview,
  PlayerPhysicsState,
  GrenadeProjectile
} from '../physics/physicsEngine';
import {
  buildWorld,
  applyObjectDistanceTiers,
  buildOperatorAvatar,
  BuiltWorld
} from '../rendering/worldRenderer';
import {
  ImpactDecalPool,
  TracerPool,
  ParticlePool,
  MuzzleFlashSystem,
  SmokeVolumeSystem,
  FireAreaSystem,
  ShellEjectionSystem,
  FlashEffectSystem
} from '../rendering/effectsSystem';
import { buildViewmodel, ViewmodelRig, createViewmodelAnimatorState, updateViewmodelAnimation, triggerViewmodelRecoil, triggerViewmodelDeploy, ViewmodelAnimatorState } from '../rendering/viewmodel';
import {
  attemptFire,
  beginReload,
  buildHitboxes,
  computeCurrentSpread,
  createWeaponRuntime,
  getCurrentFov,
  raycastPlayerHitboxes,
  toggleScope,
  updateWeaponTimers,
  WeaponRuntimeState
} from '../weapons/weaponSystem';
import { inputManager } from '../input/inputManager';
import { soundEngine } from '../audio/soundEngine';
import { useSettingsStore, getObjectDistanceCutoffMeters, VideoSettings } from '../settings/settingsStore';
import { PerformanceMonitor, FrameTelemetrySnapshot } from './performanceMonitor';
import { networkClient } from '../network/networkClient';
import { BOT_CALLSIGNS, BotBrainState, updateBotAgent } from '../bots/botSystem';
import {
  CullingFrameStats,
  evaluateObjectVisibility,
  evaluatePlayerVisibility
} from '../rendering/cullingSystem';
import {
  checkMatchComplete,
  evaluateRoundEnd,
  calculateRoundPayout,
  assignRetakeLoadout,
  getModeConfig
} from '../modes/roundLogic';
import { useGamePlatformStore } from './gameStateStore';

export interface HudState {
  health: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  money: number;
  ammoInMag: number;
  reserveAmmo: number;
  weaponName: string;
  weaponId: string;
  phase: 'BUY_PHASE' | 'LIVE_ROUND' | 'BOMB_PLANTED' | 'ROUND_END' | 'MATCH_END';
  phaseTimer: number;
  roundNumber: number;
  sentinelScore: number;
  vortexScore: number;
  bombPlanted: boolean;
  bombTimer: number;
  bombDefuseProgress: number;
  bombPlantProgress: number;
  isScoped: boolean;
  isReloading: boolean;
  reloadProgress: number;
  canBuy: boolean;
  killFeed: KillFeedEntry[];
  players: MatchPlayerStats[];
  localTeam: TeamId;
  currentCallout: string;
  visibleEnemyIds: string[];
  interactionPrompt: string | null;
  alive: boolean;
  respawnTimer: number;
  practiceTrajectory: Vector3D[];
  isCrouching: boolean;
  movementSpeed: number;
  playerCount: number;
}

interface BotAgent {
  stats: MatchPlayerStats;
  brain: BotBrainState;
  avatar: { group: THREE.Group; dispose: () => void };
  fireCooldown: number;
}

export interface MatchResultPayload {
  sentinelScore: number;
  vortexScore: number;
  winner: TeamId | 'DRAW';
  rounds: number;
}

/**
 * Raised when no usable WebGL2 context can be created for the 3D engine.
 *
 * The message is specific on purpose: the caller uses it to route the player
 * to the compatibility renderer instead of showing a dead canvas or a generic
 * "unsupported browser" message.
 */
export class RendererUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'RendererUnavailableError';
  }
}

/**
 * Creates the WebGL2 context for the engine, with an explicit reason on
 * failure. Probing on the real canvas first (rather than letting three.js
 * create it) means a failure is reported before any scene work is done.
 */
function createWebGL2Context(
  canvas: HTMLCanvasElement
): { ok: true; context: WebGL2RenderingContext } | { ok: false; reason: string } {
  if (typeof canvas.getContext !== 'function') {
    return { ok: false, reason: 'This browser does not implement HTMLCanvasElement.getContext().' };
  }
  try {
    const context = canvas.getContext('webgl2', {
      alpha: false,
      depth: true,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    }) as WebGL2RenderingContext | null;

    if (!context) {
      return {
        ok: false,
        reason:
          'A WebGL2 context could not be created on this device. Hardware acceleration is most likely disabled in the browser settings.'
      };
    }
    if (context.isContextLost()) {
      return {
        ok: false,
        reason: 'A WebGL2 context was created but immediately lost. The graphics driver rejected or reset it.'
      };
    }
    return { ok: true, context };
  } catch (err) {
    return {
      ok: false,
      reason: `Creating the WebGL2 context threw: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

export class VanguardEngine {
  // Core
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private disposed = false;
  private rafHandle = 0;

  // World
  private map!: GameMapDefinition;
  private world!: BuiltWorld;
  private aabbs: AABB[] = [];
  private occluderBoxes: AABB[] = [];

  // Player
  private physics: PlayerPhysicsState = {
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
  private yaw = 0;
  private pitch = 0;
  private health = 100;
  private armor = 0;
  private hasHelmet = false;
  private hasDefuseKit = false;
  private money = 800;
  private alive = true;
  private respawnTimerSec = 0;

  // Weapons
  private weaponInventory: Record<string, WeaponRuntimeState> = {};
  private currentSlot: 'primary' | 'secondary' | 'melee' | 'grenade' = 'secondary';
  private grenadeQueue: string[] = [];
  private currentGrenadeIndex = 0;
  private ownedGrenades: string[] = [];
  private ownedWeapons: string[] = ['vp9_tactical'];
  private viewmodel: ViewmodelRig | null = null;
  private viewmodelAnim = createViewmodelAnimatorState();
  private lastFireTimeSec = 0;

  // Effects
  private decals!: ImpactDecalPool;
  private tracers!: TracerPool;
  private particles!: ParticlePool;
  private muzzle!: MuzzleFlashSystem;
  private smoke!: SmokeVolumeSystem;
  private fire!: FireAreaSystem;
  private shells!: ShellEjectionSystem;
  private flashEffect!: FlashEffectSystem;
  private grenades: GrenadeProjectile[] = [];
  private trajectoryPreview: Vector3D[] = [];

  // Bots & match
  private bots: BotAgent[] = [];
  private killFeed: KillFeedEntry[] = [];
  private matchMode: GameModeId = 'Competitive';
  private playerTeam: 'SENTINEL' | 'VORTEX' = 'SENTINEL';
  private sentinelScore = 0;
  private vortexScore = 0;
  private roundNumber = 1;
  private maxRounds = 24;
  private phase: HudState['phase'] = 'BUY_PHASE';
  private phaseTimerSec = 15;
  private bombPlanted = false;
  private bombSite: 'A' | 'B' | null = null;
  private bombPosition: Vector3D | null = null;
  private bombTimerSec = 40;
  private bombDefuseProgress = 0;
  private bombPlantProgress = 0;
  private bombCarrierId: string | null = null;
  private sentinelLossStreak = 0;
  private vortexLossStreak = 0;
  private matchComplete = false;
  private visibleEnemyIds = new Set<string>();
  private localStats: MatchPlayerStats;
  private roundDamageThisRound: Record<string, number> = {};
  private customConfig: CustomGameConfig;
  private practiceOptions = {
    infiniteAmmo: true,
    showGrenadeTrajectory: true,
    showHitboxes: false,
    botsFrozen: false,
    recoilTargetActive: true
  };
  private botDifficulty: BotDifficulty = 'Normal';

  // Telemetry
  private perfMonitor = new PerformanceMonitor();
  private frameSnapshot: FrameTelemetrySnapshot = this.perfMonitor.getSnapshot();
  private cullingStats: CullingFrameStats = {
    totalObjects: 0,
    visibleObjects: 0,
    culledBehindCamera: 0,
    culledByFrustum: 0,
    culledByOcclusion: 0,
    culledByDistance: 0,
    lodHighCount: 0,
    lodMediumCount: 0,
    lodLowCount: 0,
    visiblePlayers: 0,
    culledPlayers: 0,
    drawCalls: 0,
    triangles: 0
  };
  private cullingDecisions: Record<string, { visible: boolean; reason: string }> = {};
  private cullingTickCounter = 0;

  // Match lifecycle
  private matchEndCallback: ((result: MatchResultPayload) => void) | null = null;
  private replayEvents: ReplayEvent[] = [];
  private replayTick = 0;
  private currentCallout = 'Deployment';
  private interactionPrompt: string | null = null;
  private lastFrameTimeMs = performance.now();
  private accumulator = 0;
  private readonly fixedStep = 1 / 128;
  private frameJustPressed = new Set<string>();
  private lastLookDelta = { dx: 0, dy: 0 };
  private accumulatedLookDx = 0;
  private accumulatedLookDy = 0;
  private botAiAccumulator = 0;
  private scopeToggleLatched = false;

  // WebGL context lifecycle -------------------------------------------------
  private contextLost = false;
  private onContextLost: ((event: Event) => void) | null = null;
  private onContextRestored: (() => void) | null = null;
  private contextLossListeners = new Set<(lost: boolean) => void>();

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.container = container;
    const store = useGamePlatformStore.getState();
    this.customConfig = store.customConfig;
    this.localStats = {
      id: 'local_player',
      name: store.profile.username,
      team: store.match.playerTeam,
      isBot: false,
      alive: true,
      health: 100,
      armor: 0,
      hasHelmet: false,
      hasDefuseKit: false,
      hasBomb: false,
      money: 800,
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      damageDealt: 0,
      utilityDamage: 0,
      entryKills: 0,
      clutches: 0,
      mvps: 0,
      score: 0,
      ping: 16,
      currentWeapon: 'vp9_tactical',
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      crouching: false
    };
  }

  public initialize(mode: GameModeId, mapId: string, team: 'SENTINEL' | 'VORTEX'): void {
    const caps = this.rendererCapabilityCheck();
    this.matchMode = mode;
    this.playerTeam = team;
    this.localStats.team = team;
    this.botDifficulty = this.customConfig.botDifficulty;

    const store = useGamePlatformStore.getState();
    this.map = getMapById(mapId, store.customMaps);

    const modeCfg = getModeConfig(mode);
    this.maxRounds = mode === 'Custom' ? this.customConfig.maxRounds : modeCfg.maxRounds;
    this.phaseTimerSec = mode === 'Deathmatch' ? 600 : mode === 'Practice' ? 3600 : modeCfg.buyTimeSec || 12;
    this.money = mode === 'Deathmatch' || mode === 'Practice' ? 16000 : this.customConfig.startingMoney;
    this.practiceOptions.infiniteAmmo = mode === 'Practice' || this.customConfig.infiniteAmmo;
    this.practiceOptions.showGrenadeTrajectory = mode === 'Practice';

    // Renderer.
    //
    // three.js r163+ is WebGL2-only. It throws a generic "Error creating WebGL
    // context" on failure, which tells the player nothing. We probe first and
    // raise a specific, actionable error so the caller can route to the
    // compatibility renderer instead of showing a dead canvas.
    const probe = createWebGL2Context(this.canvas);
    if (!probe.ok) {
      throw new RendererUnavailableError(probe.reason);
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      context: probe.context,
      antialias: false, // MSAA is disabled at the context level to keep the present path cheap.
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: false
    } as THREE.WebGLRendererParameters);

    // Context loss is recoverable if we prevent the default and wait for
    // `restored`; without this the canvas stays black forever.
    this.attachContextLossHandling();

    const video = useSettingsStore.getState().video;
    this.applyRendererSettings(video);

    this.renderer.shadowMap.enabled = video.shadowQuality !== 'Off';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = video.colorGrading ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.map.skyColor);
    this.scene.fog = new THREE.Fog(new THREE.Color(this.map.fogColor), 40, video.objectVisibilityDistance === 'Near' ? 70 : 190);

    // Camera (added to the scene graph so first-person viewmodel children render)
    this.camera = new THREE.PerspectiveCamera(video.fov, 1, 0.03, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Lighting: hemisphere + directional sun (dynamic shadow distance)
    const hemi = new THREE.HemisphereLight(new THREE.Color(this.map.ambientColor), new THREE.Color(0x0a0f18), 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.35);
    const [sx, sy, sz] = this.map.sunDirection;
    sun.position.set(sx, sy, sz);
    if (video.shadowQuality !== 'Off') {
      sun.castShadow = true;
      const shadowRes = video.shadowQuality === 'Ultra' ? 2048 : video.shadowQuality === 'High' ? 1024 : 512;
      sun.shadow.mapSize.set(shadowRes, shadowRes);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = Math.max(20, video.shadowDistance * 2.4);
      const d = video.shadowDistance;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0009;
      sun.shadow.normalBias = 0.035;
    }
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0x334455, 0.35);
    this.scene.add(ambient);

    // Build world (failure here is surfaced to the player as a map load error)
    try {
      this.world = buildWorld(this.map);
    } catch (e) {
      throw new Error(
        `MAP_LOAD_FAILURE: Could not compile map "${this.map.name}" (${this.map.id}). ${
          (e as Error).message
        }`
      );
    }
    if (!this.world || this.world.meshByObjectId.size === 0) {
      throw new Error(
        `MAP_LOAD_FAILURE: Map "${this.map.name}" produced no renderable geometry. The workshop package may be corrupted or empty.`
      );
    }
    this.scene.add(this.world.root);
    applyObjectDistanceTiers(this.world, getObjectDistanceCutoffMeters(video));
    this.aabbs = buildMapAABBs(this.map);
    this.occluderBoxes = this.aabbs.filter((b) => b.object.occluder);

    // Effects pools
    this.decals = new ImpactDecalPool(this.scene);
    this.tracers = new TracerPool(this.scene);
    this.particles = new ParticlePool(this.scene, Math.max(60, video.particleLimit));
    this.muzzle = new MuzzleFlashSystem(this.scene);
    this.smoke = new SmokeVolumeSystem(this.scene);
    this.fire = new FireAreaSystem(this.scene);
    this.shells = new ShellEjectionSystem(this.scene);
    this.flashEffect = new FlashEffectSystem();

    // Retakes begins post-plant: place the bomb on the map's A site (or B).
    if (mode === 'Retakes' && this.world.bombSites.A) {
      const site = this.world.bombSites.A;
      this.bombPosition = { x: site[0], y: 0.15, z: site[2] };
      this.bombSite = 'A';
    }

    // Spawn the local player
    this.respawnLocalPlayer(true);

    // Weapons
    this.giveStartingLoadout();
    this.equipSlot(mode === 'Practice' ? 'primary' : 'secondary');

    // Build bots
    this.spawnBots(mode);

    // Network
    networkClient.connect();
    networkClient.onConnectionLost(() => {
      this.appendNetworkLog('Connection to the authoritative server was lost. Reconnecting…');
    });
    networkClient.onConnectionRestored(() => {
      this.appendNetworkLog('Reconnected to the authoritative server.');
    });
    networkClient.onServerReconcile((pos) => {
      // Trust the authoritative server; softly correct local prediction
      this.physics.position.x = pos.x;
      this.physics.position.z = pos.z;
    });

    if (this.rendererCapabilityCheck().unsupportedReason) {
      console.warn('[VANGUARD]', caps.unsupportedReason);
    }

    // Kick off the loop
    this.lastFrameTimeMs = performance.now();
    this.loop = this.loop.bind(this);
    this.rafHandle = requestAnimationFrame(this.loop);
  }

  private rendererCapabilityCheck() {
    return { unsupportedReason: null as string | null };
  }

  /**
   * Wires `webglcontextlost` / `webglcontextrestored`.
   *
   * `preventDefault()` on the lost event is mandatory: without it the browser
   * never fires `restored` and the canvas stays blank. On restore the scene is
   * rebuilt because every GPU resource (buffers, textures, programs) was
   * discarded with the context.
   */
  private attachContextLossHandling(): void {
    const canvas = this.canvas;
    this.onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.contextLossListeners.forEach((cb) => cb(true));
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      try {
        this.rebuildAfterContextRestore();
      } catch (err) {
        // If the rebuild fails the canvas is unrecoverable; surface it rather
        // than silently rendering nothing.
        this.contextLossListeners.forEach((cb) => cb(false));
        this.appendNetworkLog(
          `[RENDER] Context restore failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      this.contextLossListeners.forEach((cb) => cb(false));
    };
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
  }

  /** Reallocates GPU resources after the driver resets the context. */
  private rebuildAfterContextRestore(): void {
    const video = useSettingsStore.getState().video;
    this.renderer.setPixelRatio(this.getPixelRatio(video));
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    // three.js re-initialises programs and buffers lazily on the next render;
    // the scene graph itself is plain JS and survives.
    this.renderer.shadowMap.enabled = video.shadowQuality !== 'Off';
    this.renderer.info.reset();
  }

  private getPixelRatio(video: VideoSettings): number {
    const capped = Math.min(window.devicePixelRatio || 1, video.renderScale > 1 ? 2 : 1.5);
    return capped * video.renderScale;
  }

  /** Subscribes to context-loss transitions. Returns an unsubscribe function. */
  public onContextLostState(cb: (lost: boolean) => void): () => void {
    this.contextLossListeners.add(cb);
    return () => this.contextLossListeners.delete(cb);
  }

  public isContextLost(): boolean {
    return this.contextLost;
  }

  private appendNetworkLog(line: string): void {
    try {
      useGamePlatformStore.getState().appendConsoleLog(`[NETWORK] ${line}`);
    } catch {
      // Store unavailable (unlikely) — the console is non-critical.
    }
  }

  /** True while the authoritative socket is down (used by the in-match banner). */
  public isDisconnected(): boolean {
    return !networkClient.telemetry.connected && !networkClient.telemetry.localAuthority;
  }

  /** Forces an immediate reconnect attempt. */
  public attemptReconnect(): void {
    networkClient.reconnectNow();
  }

  private applyRendererSettings(video: VideoSettings): void {
    const dpr = Math.min(window.devicePixelRatio || 1, video.renderScale > 1 ? 2 : 1.5);
    this.renderer.setPixelRatio(dpr * video.renderScale);
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    if (this.camera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
  }

  // ==========================================================================
  // SPAWNING & LOADOUT
  // ==========================================================================

  private respawnLocalPlayer(resetStats = false): void {
    const spawnList =
      this.playerTeam === 'SENTINEL' ? this.world.spawnPoints.SENTINEL : this.world.spawnPoints.VORTEX;
    const spawn = spawnList[Math.floor(Math.random() * spawnList.length)] || [0, 0, 0];
    const spread = 3.2;
    const px = spawn[0] + (Math.random() - 0.5) * spread;
    const pz = spawn[2] + (Math.random() - 0.5) * spread;

    this.physics = {
      position: { x: px, y: 0.05, z: pz },
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
    // Face the objective
    this.yaw = this.playerTeam === 'SENTINEL' ? Math.PI : 0;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.respawnTimerSec = 0;

    if (resetStats) {
      this.localStats = {
        ...this.localStats,
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        damageDealt: 0,
        utilityDamage: 0,
        entryKills: 0,
        clutches: 0,
        mvps: 0,
        score: 0
      };
    }
  }

  private giveStartingLoadout(): void {
    if (this.matchMode === 'Practice' || this.matchMode === 'Deathmatch') {
      this.ownedWeapons = [
        'vp9_tactical',
        'viper_p250',
        'talon_50',
        'vector_9',
        'mp_phantom',
        'cyclone_p90',
        'breacher_12',
        'vanguard_m4s',
        'vanguard_m4a',
        'harbinger_47',
        'solaris_553',
        'korsak_gal',
        'falcon_aug',
        'dagger_fam',
        'scout_ssr',
        'monolith_awm',
        'archon_dmr',
        'titan_lmg',
        'combat_blade'
      ];
      this.ownedGrenades = ['smoke_grenade', 'flash_grenade', 'he_grenade', 'incendiary_grenade', 'decoy_grenade'];
      this.armor = 100;
      this.hasHelmet = true;
      this.hasDefuseKit = true;
    } else if (this.matchMode === 'Retakes') {
      const loadout = assignRetakeLoadout(Math.floor(Math.random() * 8));
      this.ownedWeapons = [loadout.secondary, loadout.primary, 'combat_blade'];
      this.ownedGrenades = loadout.grenades;
      this.armor = loadout.armor;
      this.hasHelmet = loadout.helmet;
      this.hasDefuseKit = loadout.defuseKit;
    } else {
      this.ownedWeapons = ['vp9_tactical', 'combat_blade'];
      this.ownedGrenades = [];
      this.armor = 0;
      this.hasHelmet = false;
      this.hasDefuseKit = false;
    }

    for (const id of this.ownedWeapons) {
      if (!this.weaponInventory[id]) {
        this.weaponInventory[id] = createWeaponRuntime(id, this.matchMode === 'Practice' || this.matchMode === 'Deathmatch');
      }
    }
  }

  private equipSlot(slot: 'primary' | 'secondary' | 'melee' | 'grenade'): void {
    let weaponId: string | null = null;

    if (slot === 'primary') {
      weaponId = this.ownedWeapons.find((id) => WEAPON_SPECS[id]?.slot === 'primary') || null;
      if (!weaponId) return;
    } else if (slot === 'secondary') {
      weaponId = this.ownedWeapons.find((id) => WEAPON_SPECS[id]?.slot === 'secondary') || null;
      if (!weaponId) return;
    } else if (slot === 'melee') {
      weaponId = 'combat_blade';
    } else if (slot === 'grenade') {
      if (this.ownedGrenades.length === 0) return;
      weaponId = this.ownedGrenades[Math.min(this.currentGrenadeIndex, this.ownedGrenades.length - 1)];
    }

    if (!weaponId) return;
    const spec = WEAPON_SPECS[weaponId];
    if (!spec) return;

    if (!this.weaponInventory[weaponId]) {
      this.weaponInventory[weaponId] = createWeaponRuntime(weaponId, this.practiceOptions.infiniteAmmo);
    }

    if (this.viewmodel) {
      this.camera.remove(this.viewmodel.group);
      this.viewmodel.dispose();
    }
    this.viewmodel = buildViewmodel(spec);
    this.viewmodel.group.position.set(0.17, -0.055, -0.34);
    // Parented to the camera: the viewmodel moves with the view without any per-frame math.
    this.camera.add(this.viewmodel.group);
    triggerViewmodelDeploy(this.viewmodelAnim);

    this.currentSlot = slot;
    this.localStats.currentWeapon = weaponId;
  }

  private get currentWeaponRuntime(): WeaponRuntimeState | null {
    const weaponId = this.localStats.currentWeapon;
    return this.weaponInventory[weaponId] || null;
  }

  // ==========================================================================
  // BOT SPAWNING
  // ==========================================================================

  private spawnBots(mode: GameModeId): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.avatar.group);
      bot.avatar.dispose();
    }
    this.bots = [];

    const cfg = getModeConfig(mode);
    let perTeam = cfg.teamSize - 1;
    if (mode === 'Practice') perTeam = Math.max(0, Math.min(8, this.customConfig.botCount));
    if (mode === 'Custom') perTeam = Math.max(0, Math.floor(this.customConfig.botCount / 2));
    if (mode === 'Wingman') perTeam = 1;
    if (mode === 'Retakes') perTeam = 3;
    if (mode === 'Deathmatch') perTeam = Math.max(0, Math.floor(this.customConfig.botCount / 2));

    let nameIdx = { SENTINEL: 0, VORTEX: 0 };

    const createForTeam = (team: 'SENTINEL' | 'VORTEX', count: number) => {
      for (let i = 0; i < count; i++) {
        const names = BOT_CALLSIGNS[team];
        const name = `${names[nameIdx[team] % names.length]}`;
        nameIdx[team]++;
        const id = `bot_${team}_${i}_${Math.random().toString(36).slice(2, 6)}`;

        const spawnList = team === 'SENTINEL' ? this.world.spawnPoints.SENTINEL : this.world.spawnPoints.VORTEX;
        const spawn = spawnList[Math.floor(Math.random() * spawnList.length)] || [0, 0, 0];

        const stats: MatchPlayerStats = {
          id,
          name,
          team,
          isBot: true,
          alive: true,
          health: 100,
          armor: mode === 'Practice' ? 0 : 100,
          hasHelmet: mode !== 'Practice',
          hasDefuseKit: team === 'SENTINEL',
          hasBomb: false,
          money: mode === 'Practice' ? 0 : mode === 'Deathmatch' ? 16000 : 800,
          kills: 0,
          deaths: 0,
          assists: 0,
          headshots: 0,
          damageDealt: 0,
          utilityDamage: 0,
          entryKills: 0,
          clutches: 0,
          mvps: 0,
          score: 0,
          ping: 12 + Math.floor(Math.random() * 22),
          currentWeapon: team === 'SENTINEL' ? 'vanguard_m4a' : 'harbinger_47',
          position: {
            x: spawn[0] + (Math.random() - 0.5) * 5,
            y: 0,
            z: spawn[2] + (Math.random() - 0.5) * 5
          },
          yaw: team === 'SENTINEL' ? Math.PI : 0,
          pitch: 0,
          crouching: false
        };

        if (mode === 'Practice') {
          stats.currentWeapon = WEAPON_SPECS[stats.currentWeapon] ? stats.currentWeapon : 'viper_p250';
          stats.armor = 0;
        }
        if (mode === 'Retakes') {
          stats.currentWeapon = assignRetakeLoadout(i + 3).primary;
        }

        const avatar = buildOperatorAvatar(team);
        avatar.group.position.set(stats.position.x, stats.position.y, stats.position.z);
        this.scene.add(avatar.group);

        this.bots.push({
          stats,
          brain: {
            botId: id,
            targetWaypointId: null,
            reactionTimerSec: 0,
            burstTimerSec: 0,
            strafeDir: 1,
            strafeTimerSec: 0,
            lastKnownEnemyPos: null
          },
          avatar,
          fireCooldown: 0
        });
      }
    };

    createForTeam(this.playerTeam, perTeam);
    createForTeam(this.playerTeam === 'SENTINEL' ? 'VORTEX' : 'SENTINEL', perTeam);

    // Assign the bomb to a random attacker
    if (this.isBombMode() && this.matchMode !== 'Retakes') {
      const attackers = this.bots.filter((b) => b.stats.team === 'VORTEX');
      const otherAttackers = this.playerTeam === 'VORTEX' ? [] : attackers;
      if (otherAttackers.length > 0) {
        const carrier = otherAttackers[Math.floor(Math.random() * otherAttackers.length)];
        carrier.stats.hasBomb = true;
        this.bombCarrierId = carrier.stats.id;
      } else if (this.playerTeam === 'VORTEX') {
        this.localStats.hasBomb = true;
        this.bombCarrierId = 'local_player';
      }
    }
  }

  private isBombMode(): boolean {
    return (
      this.matchMode === 'Competitive' ||
      this.matchMode === 'Premier' ||
      this.matchMode === 'Wingman' ||
      this.matchMode === 'Rush' ||
      this.matchMode === 'Casual' ||
      this.matchMode === 'Retakes' ||
      this.matchMode === 'Custom'
    );
  }

  // ==========================================================================
  // MAIN LOOP
  // ==========================================================================

  public setMatchEndCallback(cb: (result: MatchResultPayload) => void): void {
    this.matchEndCallback = cb;
  }

  private loop(nowMs: number): void {
    if (this.disposed) return;
    this.rafHandle = requestAnimationFrame(this.loop);

    const frameStart = performance.now();
    const rawDeltaMs = nowMs - this.lastFrameTimeMs;
    this.lastFrameTimeMs = nowMs;

    // Stop rendering entirely while the tab is hidden or the graphics context
    // is lost. Simulating in the background would burn battery and, worse,
    // accumulate a huge delta that the fixed-step loop then has to catch up on.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.accumulator = 0;
      return;
    }
    if (this.contextLost) return;

    const video = useSettingsStore.getState().video;
    const fpsCap = this.getFpsCap(video);
    if (fpsCap > 0) {
      const minIntervalMs = 1000 / fpsCap;
      if (rawDeltaMs < minIntervalMs - 1.0) {
        return;
      }
    }

    const dt = Math.min(0.1, rawDeltaMs / 1000);
    this.accumulator += dt;

    // 1. Per-FRAME input: raw look deltas and edge-triggered actions are applied
    //    exactly once per displayed frame. This keeps aim latency tied to the
    //    display refresh rather than the fixed simulation step.
    this.captureFrameInput(useSettingsStore.getState());

    // 2. Fixed-step simulation for deterministic movement/combat (128 Hz internal)
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 8) {
      this.simulate(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps++;
    }
    if (steps >= 8) this.accumulator = 0;

    // 3. Render. The edge-triggered action set is deliberately NOT cleared here:
    //    at high frame rates a render frame can occur without consuming a fixed
    //    simulation step, and dropping the set would lose the keypress entirely.
    //    It is cleared inside simulate() once it has actually been consumed.
    this.render(dt);

    const cpuMs = performance.now() - frameStart;
    this.frameSnapshot = this.perfMonitor.recordFrame(rawDeltaMs, cpuMs);

    if (video.vsync === false) {
      // No-op: browser compositor handles presentation; vsync off means we do not throttle
    }
  }

  private getFpsCap(video: VideoSettings): number {
    if (video.fpsCapPreset === 'Unlimited') return 0;
    if (video.fpsCapPreset === 'Custom') return Math.max(15, video.fpsCapCustom || 240);
    return Number(video.fpsCapPreset) || 0;
  }

  // ==========================================================================
  // SIMULATION
  // ==========================================================================

  /**
   * Applies raw mouse movement and edge-triggered key actions exactly once per
   * displayed frame. Called before the fixed-step simulation so that both the
   * physics step and the camera consume the same rotation for the frame.
   */
  private captureFrameInput(settings: ReturnType<typeof useSettingsStore.getState>): void {
    this.frameJustPressed = inputManager.consumeJustPressed();

    const mouse = settings.mouse;
    const spec = WEAPON_SPECS[this.localStats.currentWeapon] || WEAPON_SPECS.vp9_tactical;
    const runtime = this.currentWeaponRuntime;

    const isFrozen =
      this.phase === 'ROUND_END' || this.phase === 'MATCH_END' || !this.alive || this.matchComplete;

    const delta = inputManager.consumeMouseDelta();
    // Accumulate for viewmodel sway; reset only after a simulation step runs.
    this.accumulatedLookDx += delta.dx;
    this.accumulatedLookDy += delta.dy;
    this.lastLookDelta = { dx: this.accumulatedLookDx, dy: this.accumulatedLookDy };

    if (isFrozen) return;

    const zoomFactor = runtime?.isScoped ? mouse.scopedSensitivity * mouse.zoomMultiplier : 1.0;
    const categoryMultiplier =
      spec.category === 'Pistols'
        ? mouse.pistolSensMultiplier
        : spec.category === 'Snipers'
        ? mouse.sniperSensMultiplier
        : mouse.rifleSensMultiplier;

    const radiansPerCount = 0.00022 * mouse.sensitivity * zoomFactor * categoryMultiplier;
    this.yaw -= delta.dx * radiansPerCount;
    this.pitch += (mouse.invertY ? 1 : -1) * delta.dy * radiansPerCount;

    // Clamp pitch to vertical gimbal limits, wrap yaw
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    // Scope cycling is edge-triggered so holding the scope key does not flip
    // through every zoom level many times per second.
    this.scopeToggleLatched = keyHeld(settings.keybinds.altFire);
    if (this.frameJustPressed.has(settings.keybinds.altFire) && runtime && spec.scopeLevels) {
      toggleScope(runtime, spec);
    }
  }

  private simulate(dt: number): void {
    const settings = useSettingsStore.getState();

    this.updateTimers(dt);
    this.updateLocalPlayer(dt, settings.video, settings.mouse);
    this.updateBotCombat(dt);
    this.updateGrenades(dt);
    this.updateObjective(dt);
    this.updateRoundState(dt);
    this.recordReplayTick(dt);
    this.checkCallout();

    // The edge-triggered action set has now been consumed by this simulation
    // step. Accumulated look delta is also reset so viewmodel sway reflects
    // only movement applied since the last step.
    this.frameJustPressed.clear();
    this.accumulatedLookDx = 0;
    this.accumulatedLookDy = 0;
  }

  private updateTimers(dt: number): void {
    // Kill feed expiry
    const cutoff = Date.now() - 8000;
    if (this.killFeed.length > 0 && this.killFeed[this.killFeed.length - 1].timestamp < cutoff) {
      this.killFeed = this.killFeed.filter((k) => k.timestamp >= cutoff).slice(-6);
    }

    for (const key of Object.keys(this.weaponInventory)) {
      const state = this.weaponInventory[key];
      const spec = WEAPON_SPECS[key];
      if (spec) updateWeaponTimers(state, spec, dt);
    }

    if (!this.alive) {
      this.respawnTimerSec -= dt;
      if (this.respawnTimerSec <= 0 && (this.matchMode === 'Deathmatch' || this.matchMode === 'Practice')) {
        this.respawnLocalPlayer();
        if (this.matchMode === 'Deathmatch') {
          this.equipSlot('primary');
        }
      }
      if (this.respawnTimerSec <= 0 && this.phase === 'BUY_PHASE' && this.matchMode !== 'Deathmatch' && this.matchMode !== 'Practice') {
        // Bought back at round start
      }
    }

    this.flashEffect.update(dt);
  }

  private updateLocalPlayer(dt: number, video: VideoSettings, mouse: { sensitivity: number; scopedSensitivity: number; invertY: boolean; jumpBehavior: string }): void {
    const spec = WEAPON_SPECS[this.localStats.currentWeapon] || WEAPON_SPECS.vp9_tactical;
    const runtime = this.currentWeaponRuntime;

    const isFrozen =
      this.phase === 'ROUND_END' || this.phase === 'MATCH_END' || !this.alive || this.matchComplete;

    // --- Weapon switching & one-shot actions (edge-triggered, once per frame) ---
    const keybinds = useSettingsStore.getState().keybinds;
    const pressed = (action: keyof typeof keybinds) =>
      this.frameJustPressed.has(keybinds[action]) || keybinds[action] === 'WheelDown' && this.frameJustPressed.has('WheelDown');

    if (!isFrozen) {
      if (pressed('primaryWeapon')) this.equipSlot('primary');
      if (pressed('secondaryWeapon')) this.equipSlot('secondary');
      if (pressed('meleeWeapon')) this.equipSlot('melee');
      if (pressed('grenadeCycle')) {
        if (this.currentSlot === 'grenade' && this.ownedGrenades.length > 0) {
          this.currentGrenadeIndex = (this.currentGrenadeIndex + 1) % this.ownedGrenades.length;
        }
        this.equipSlot('grenade');
      }
      if (pressed('smokeGrenade')) this.equipSpecificGrenade('smoke_grenade');
      if (pressed('flashGrenade')) this.equipSpecificGrenade('flash_grenade');
      if (pressed('heGrenade')) this.equipSpecificGrenade('he_grenade');
      if (pressed('incendiaryGrenade')) this.equipSpecificGrenade('incendiary_grenade');
      if (pressed('reload')) this.tryReload();
      if (pressed('inspectWeapon')) {
        this.viewmodelAnim.isInspecting = !this.viewmodelAnim.isInspecting;
      }
    }

    // Scope is released when the secondary fire button is let go.
    if (runtime?.isScoped && !inputManager.isActionDown('altFire')) {
      runtime.isScoped = false;
      runtime.scopeLevel = 0;
    }

    // --- Movement ---
    const forwardInput = isFrozen
      ? 0
      : (inputManager.isActionDown('forward') ? 1 : 0) - (inputManager.isActionDown('backward') ? 1 : 0);
    const rightInput = isFrozen
      ? 0
      : (inputManager.isActionDown('right') ? 1 : 0) - (inputManager.isActionDown('left') ? 1 : 0);
    const crouchHeld = !isFrozen && inputManager.isActionDown('crouch');
    const walkHeld = !isFrozen && inputManager.isActionDown('walk');
    const jumpPressed = !isFrozen && inputManager.isActionDown('jump');

    const previousPos = { ...this.physics.position };
    this.physics = stepPlayerPhysics(
      this.physics,
      {
        forward: forwardInput,
        right: rightInput,
        jumpPressed,
        crouchHeld,
        walkHeld,
        sprintHeld: false,
        yaw: this.yaw
      },
      this.aabbs,
      dt,
      {
        weaponSpeedMultiplier: spec.moveSpeedMultiplier,
        gravityMultiplier: this.customConfig.gravityMultiplier,
        moveSpeedMultiplier: this.customConfig.moveSpeedMultiplier,
        allowSprint: this.customConfig.allowSprint && (this.matchMode === 'Casual' || this.matchMode === 'Deathmatch')
      }
    );

    // Send authoritative input to server (throttled to ~32 Hz to conserve bandwidth)
    if (this.replayTick % 4 === 0) {
      networkClient.sendInputCommand(this.physics.position, this.yaw, this.pitch);
    }

    // --- Firing ---
    const nowSec = performance.now() / 1000;
    const firing = !isFrozen && inputManager.isActionDown('fire');
    const fireJustPressed = this.frameJustPressed.has(keybinds.fire);
    const wantsFire = firing && (spec.automatic || fireJustPressed || nowSec - this.lastFireTimeSec > 0.14);

    if (wantsFire && this.viewmodel) {
      this.tryFire(spec, video);
    }

    // Grenade throw
    if (this.currentSlot === 'grenade' && wantsFire && this.viewmodel) {
      this.throwGrenade(spec);
    }

    // Footstep audio
    const speedXZ = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);
    if (this.physics.grounded && speedXZ > 1.4) {
      const dist = Math.hypot(this.physics.position.x - previousPos.x, this.physics.position.z - previousPos.z);
      this.footstepAccum = (this.footstepAccum || 0) + dist;
      if (this.footstepAccum > (this.physics.walking ? 2.3 : 1.55)) {
        this.footstepAccum = 0;
        soundEngine.playFootstep(
          this.physics.groundSurface,
          { x: this.physics.position.x, y: this.physics.position.y + 0.1, z: this.physics.position.z },
          false
        );
      }
    }

    // --- Camera ---
    const recoilPitch = runtime?.recoilPitch || 0;
    const recoilYaw = runtime?.recoilYaw || 0;
    const bobEnabled = video.headBob;
    const bobPhase = bobEnabled ? nowSec * (6 + speedXZ * 1.1) : 0;
    const bobOffset = bobEnabled && this.physics.grounded ? Math.sin(bobPhase * 2) * Math.min(0.035, speedXZ * 0.006) : 0;
    const landingOffset = 0;

    this.camera.position.set(
      this.physics.position.x,
      this.physics.position.y + this.physics.eyeHeight + bobOffset + landingOffset,
      this.physics.position.z
    );
    this.camera.rotation.set(this.pitch + recoilPitch, this.yaw + recoilYaw, 0);

    const fov = getCurrentFov(video.fov, runtime || createWeaponRuntime(spec.id), spec);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // --- Viewmodel animation ---
    if (this.viewmodel && runtime) {
      this.viewmodel.group.position.set(0.17, -0.055, -0.34);
      updateViewmodelAnimation(
        this.viewmodel,
        this.viewmodelAnim,
        {
          dt,
          velocityXZ: speedXZ,
          grounded: this.physics.grounded,
          crouching: this.physics.crouching,
          lookDeltaX: this.lastLookDelta.dx,
          lookDeltaY: this.lastLookDelta.dy,
          headBobEnabled: video.headBob,
          recoilPitch: runtime.recoilPitch,
          recoilYaw: runtime.recoilYaw,
          reloading: runtime.isReloading,
          reloadProgress: runtime.isReloading ? 1 - runtime.reloadTimerSec / Math.max(0.1, spec.reloadTimeSec) : 1,
          scoped: runtime.isScoped && !!spec.scopeLevels,
          inspecting: this.viewmodelAnim.isInspecting
        },
        video.fov
      );
    }
  }

  private equipSpecificGrenade(grenadeId: string): void {
    if (!this.ownedGrenades.includes(grenadeId)) return;
    const idx = this.ownedGrenades.indexOf(grenadeId);
    this.currentGrenadeIndex = idx;
    this.equipSlot('grenade');
  }

  private footstepAccum = 0;

  // ==========================================================================
  // FIRING & DAMAGE
  // ==========================================================================

  private tryFire(spec: import('../../shared/types').WeaponSpec, video: VideoSettings): void {
    const runtime = this.currentWeaponRuntime;
    if (!runtime || !this.viewmodel) return;

    if (this.currentSlot === 'grenade') return;

    if (runtime.isReloading || runtime.isDeploying) return;

    if (runtime.ammoInMag <= 0) {
      if (!runtime.isReloading) this.tryReload();
      return;
    }

    const nowSec = performance.now() / 1000;
    const speedXZ = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);

    const spread = computeCurrentSpread(
      spec,
      runtime,
      {
        velocityXZ: speedXZ,
        grounded: this.physics.grounded,
        crouching: this.physics.crouching,
        weaponSpeedMultiplier: spec.moveSpeedMultiplier
      },
      Math.min(0.035, runtime.shotIndex * 0.0009)
    );

    const result = attemptFire(runtime, spec, nowSec, spread);
    if (!result.fired) return;

    this.lastFireTimeSec = nowSec;
    this.localStats.utilityDamage = this.localStats.utilityDamage;

    // Sound
    soundEngine.playWeaponFire(spec.category, !!spec.suppressed, undefined, false);

    // Viewmodel recoil
    triggerViewmodelRecoil(this.viewmodelAnim, spec.category === 'Snipers' ? 1.15 : spec.category === 'Shotguns' ? 0.95 : 0.62);

    // Muzzle flash in world space
    const muzzleWorld = new THREE.Vector3();
    this.viewmodel.muzzlePoint.getWorldPosition(muzzleWorld);
    if (video.effectsQuality !== 'Low') {
      this.muzzle.trigger(muzzleWorld, spec.category === 'Snipers' ? 6 : 4.2);
    }

    // Shell ejection
    if (spec.category !== 'Melee' && spec.category !== 'Grenades' && video.particleQuality !== 'Low') {
      const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.shells.eject(this.camera.position, rightDir, upDir);
    }

    // Tracer
    const shouldTracer =
      spec.tracerFrequency > 0 &&
      (spec.tracerFrequency === 1 || runtime.shotIndex % spec.tracerFrequency === 0) &&
      video.effectsQuality !== 'Low';

    // --- Hitscan ---
    const pellets = spec.pellets || 1;
    const eyePos = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };

    const baseDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    for (let p = 0; p < pellets; p++) {
      const pelletPitch = this.pitch + result.shotDirectionPitchOffset + (runtime.recoilPitch || 0);
      const pelletYaw = this.yaw + result.shotDirectionYawOffset + (runtime.recoilYaw || 0);
      const gaussExtra = pellets > 1 ? (Math.random() - 0.5) * spread * 1.4 : 0;

      const dir = new THREE.Vector3(
        -Math.sin(pelletYaw) * Math.cos(pelletPitch + gaussExtra),
        Math.sin(pelletPitch + gaussExtra),
        -Math.cos(pelletYaw) * Math.cos(pelletPitch + gaussExtra)
      ).normalize();

      this.performHitscan(spec, eyePos, dir, video, shouldTracer);
    }

    // Practice recoil feedback
    if (this.matchMode === 'Practice') {
      this.particles.spawnSmokePuff(
        { x: this.camera.position.x + baseDir.x, y: this.camera.position.y, z: this.camera.position.z + baseDir.z },
        1,
        0.1
      );
    }
  }

  private performHitscan(
    spec: import('../../shared/types').WeaponSpec,
    origin: Vector3D,
    dir: THREE.Vector3,
    video: VideoSettings,
    tracer: boolean
  ): void {
    let maxDist = spec.range * 2.2;
    let hitPoint: Vector3D | null = null;
    let hitNormal: Vector3D = { x: 0, y: 1, z: 0 };
    let hitSurface: MaterialSurface = 'concrete';
    let wallbangLoss = 0;

    const dirPlain = { x: dir.x, y: dir.y, z: dir.z };

    // 1. Check player/bot hitboxes first (closest wins)
    let closestPlayerHit: { bot: BotAgent | null; hitGroup: 'head' | 'chest' | 'stomach' | 'leg'; distance: number } | null = null;

    for (const bot of this.bots) {
      if (!bot.stats.alive) continue;
      if (bot.stats.team === this.playerTeam && !this.customConfig.friendlyFire) continue;

      const hitboxes = buildHitboxes(bot.stats.position, bot.stats.crouching);
      const hit = raycastPlayerHitboxes(origin, dirPlain, hitboxes, maxDist);
      if (hit && (!closestPlayerHit || hit.distance < closestPlayerHit.distance)) {
        closestPlayerHit = { bot, hitGroup: hit.hitGroup, distance: hit.distance };
      }
    }

    // 2. Check world geometry
    let closestWorldHit: { distance: number; point: Vector3D; normal: Vector3D; surface: MaterialSurface; resistance: number } | null = null;
    for (const box of this.aabbs) {
      if (box.object.id === 'ground_main' && origin.y > box.maxY) continue;
      const hit = intersectRayAABB(origin, dirPlain, box, maxDist);
      if (hit && (!closestWorldHit || hit.distance < closestWorldHit.distance)) {
        closestWorldHit = {
          distance: hit.distance,
          point: hit.point,
          normal: hit.normal,
          surface: box.object.material,
          resistance: box.object.penetrationResistance ?? 0.5
        };
      }
    }

    // 3. Resolve: wall in front of player?
    const blockedByWall =
      closestWorldHit !== null &&
      (!closestPlayerHit || closestWorldHit.distance < closestPlayerHit.distance - 0.02);

    if (blockedByWall && closestWorldHit) {
      // Attempt wall penetration if weapon can defeat the material resistance
      const canPenetrate = spec.wallPenetration > closestWorldHit.resistance * 200;
      if (canPenetrate) {
        const remaining = maxDist - closestWorldHit.distance;
        const exitHit = this.findExitPoint(closestWorldHit.point, dirPlain, remaining, closestWorldHit.resistance);
        if (exitHit) {
          wallbangLoss = Math.min(0.72, closestWorldHit.resistance * 0.75);
          const origin2 = exitHit;
          const remainingDist = Math.max(1, maxDist - closestWorldHit.distance - exitHit.exitedDistance);

          // Re-check players beyond the wall
          for (const bot of this.bots) {
            if (!bot.stats.alive) continue;
            if (bot.stats.team === this.playerTeam && !this.customConfig.friendlyFire) continue;
            const hitboxes = buildHitboxes(bot.stats.position, bot.stats.crouching);
            const hit = raycastPlayerHitboxes(origin2, dirPlain, hitboxes, remainingDist);
            if (hit) {
              this.applyDamageToBot(bot, spec, hit.hitGroup, hit.distance + closestWorldHit.distance + exitHit.exitedDistance, wallbangLoss, true);
              hitPoint = {
                x: origin.x + dir.x * (closestWorldHit.distance + exitHit.exitedDistance + hit.distance),
                y: origin.y + dir.y * (closestWorldHit.distance + exitHit.exitedDistance + hit.distance),
                z: origin.z + dir.z * (closestWorldHit.distance + exitHit.exitedDistance + hit.distance)
              };
              if (tracer && hitPoint) {
                this.tracers.spawn(origin, hitPoint, spec.suppressed ? 0x8899aa : 0xfff2b0);
              }
              return;
            }
          }
          // No one behind the wall; spawn impact on the exit side
          hitPoint = {
            x: origin.x + dir.x * (closestWorldHit.distance + exitHit.exitedDistance + 0.4),
            y: origin.y + dir.y * (closestWorldHit.distance + exitHit.exitedDistance + 0.4),
            z: origin.z + dir.z * (closestWorldHit.distance + exitHit.exitedDistance + 0.4)
          };
        }
      }

      if (!hitPoint) {
        hitPoint = closestWorldHit.point;
        hitNormal = closestWorldHit.normal;
        hitSurface = closestWorldHit.surface;
      }
    } else if (closestPlayerHit && closestPlayerHit.bot) {
      const bot = closestPlayerHit.bot;
      this.applyDamageToBot(
        bot,
        spec,
        closestPlayerHit.hitGroup,
        closestPlayerHit.distance,
        wallbangLoss,
        false
      );
      hitPoint = {
        x: origin.x + dir.x * closestPlayerHit.distance,
        y: origin.y + dir.y * closestPlayerHit.distance,
        z: origin.z + dir.z * closestPlayerHit.distance
      };
      if (tracer && hitPoint) {
        this.tracers.spawn(origin, hitPoint, spec.suppressed ? 0x8899aa : 0xfff2b0);
      }
      return;
    } else if (closestWorldHit) {
      hitPoint = closestWorldHit.point;
      hitNormal = closestWorldHit.normal;
      hitSurface = closestWorldHit.surface;
    }

    if (!hitPoint) {
      hitPoint = {
        x: origin.x + dir.x * maxDist,
        y: origin.y + dir.y * maxDist,
        z: origin.z + dir.z * maxDist
      };
    }

    if (tracer && !spec.suppressed) {
      this.tracers.spawn(origin, hitPoint);
    }

    // Impact VFX
    if (!spec.suppressed || video.effectsQuality === 'High') {
      this.decals.spawn(hitPoint, hitNormal, hitSurface, hitSurface === 'glass' ? 0.16 : 0.2);
      const sparkColor =
        hitSurface === 'metal'
          ? 0xffd27f
          : hitSurface === 'wood'
          ? 0x9a6b3a
          : hitSurface === 'energy'
          ? 0x67e8f9
          : 0xb9b3a8;
      this.particles.spawnBurst(
        hitPoint,
        hitNormal,
        Math.max(2, Math.round(video.particleLimit / 40)),
        sparkColor,
        hitSurface,
        3.4
      );
    }
    soundEngine.playWeaponFire(spec.category, true, hitPoint, true);
  }

  private findExitPoint(
    entryPoint: Vector3D,
    dir: Vector3D,
    maxRemaining: number,
    resistance: number
  ): { x: number; y: number; z: number; exitedDistance: number } | null {
    // Walk along the ray through all walls until exiting the current solid
    const thicknessEstimate = 0.6 + resistance * 3.0;
    if (thicknessEstimate > maxRemaining) return null;

    const testPoint = {
      x: entryPoint.x + dir.x * thicknessEstimate,
      y: entryPoint.y + dir.y * thicknessEstimate,
      z: entryPoint.z + dir.z * thicknessEstimate
    };
    // Ensure no solid box contains the test point
    for (const box of this.aabbs) {
      if (box.object.id === 'ground_main') continue;
      if (
        testPoint.x > box.minX && testPoint.x < box.maxX &&
        testPoint.y > box.minY && testPoint.y < box.maxY &&
        testPoint.z > box.minZ && testPoint.z < box.maxZ
      ) {
        return null;
      }
    }
    return { ...testPoint, exitedDistance: thicknessEstimate };
  }

  private applyDamageToBot(
    bot: BotAgent,
    spec: import('../../shared/types').WeaponSpec,
    hitGroup: 'head' | 'chest' | 'stomach' | 'leg',
    distanceMeters: number,
    wallbangLoss: number,
    wasWallbang: boolean
  ): void {
    const result = calculateWeaponDamage({
      weapon: spec,
      distanceMeters,
      hitGroup,
      targetArmor: bot.stats.armor,
      targetHasHelmet: bot.stats.hasHelmet,
      wallPenetrationLoss: wallbangLoss
    });

    bot.stats.armor = Math.max(0, bot.stats.armor - result.armorDamage);
    bot.stats.health -= result.healthDamage;

    this.localStats.damageDealt += Math.min(result.healthDamage, Math.max(0, bot.stats.health + result.healthDamage));
    this.roundDamageThisRound[this.localStats.id] =
      (this.roundDamageThisRound[this.localStats.id] || 0) + result.healthDamage;

    // Server-authoritative confirmation
    networkClient.sendFireEvent(spec.id, distanceMeters, hitGroup, bot.stats.armor, bot.stats.hasHelmet);

    soundEngine.playHitFeedback(hitGroup === 'head');

    if (hitGroup === 'head' && video_particleEnabled()) {
      this.particles.spawnBurst(
        { x: bot.stats.position.x, y: bot.stats.position.y + 1.7, z: bot.stats.position.z },
        { x: 0, y: 1, z: 0 },
        8,
        0xef4444,
        'concrete',
        3.0
      );
    }

    if (bot.stats.health <= 0) {
      bot.stats.health = 0;
      bot.stats.alive = false;
      bot.avatar.group.visible = false;
      bot.stats.deaths += 1;

      this.localStats.kills += 1;
      this.localStats.score += 2;
      if (hitGroup === 'head') this.localStats.headshots += 1;
      this.money = Math.min(16000, this.money + spec.killReward);
      this.localStats.money = this.money;

      this.pushKillFeed({
        killer: { id: 'local_player', name: this.localStats.name, team: this.playerTeam },
        victim: { id: bot.stats.id, name: bot.stats.name, team: bot.stats.team },
        weaponName: spec.name,
        isHeadshot: hitGroup === 'head',
        isWallbang: wasWallbang
      });
    } else {
      // Hit flinch
      bot.brain.reactionTimerSec = -0.06;
    }
  }

  private pushKillFeed(entry: {
    killer: { id: string; name: string; team: TeamId };
    victim: { id: string; name: string; team: TeamId };
    weaponName: string;
    isHeadshot: boolean;
    isWallbang: boolean;
  }): void {
    this.killFeed.push({
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      killerId: entry.killer.id,
      killerName: entry.killer.name,
      killerTeam: entry.killer.team,
      victimId: entry.victim.id,
      victimName: entry.victim.name,
      victimTeam: entry.victim.team,
      weaponName: entry.weaponName,
      isHeadshot: entry.isHeadshot,
      isWallbang: entry.isWallbang,
      isThroughSmoke: false
    });
    if (this.killFeed.length > 6) this.killFeed.shift();
  }

  private tryReload(): void {
    const spec = WEAPON_SPECS[this.localStats.currentWeapon];
    const runtime = this.currentWeaponRuntime;
    if (!spec || !runtime) return;
    if (beginReload(runtime, spec)) {
      soundEngine.playReload();
      this.viewmodelAnim.isInspecting = false;
    }
  }

  // ==========================================================================
  // GRENADES
  // ==========================================================================

  private throwGrenade(spec: import('../../shared/types').WeaponSpec): void {
    if (!spec.grenadeType) return;
    const nowSec = performance.now() / 1000;
    if (nowSec - this.lastFireTimeSec < 0.75) return;
    this.lastFireTimeSec = nowSec;

    const idx = this.ownedGrenades.indexOf(spec.id);
    if (idx >= 0) {
      this.ownedGrenades.splice(idx, 1);
    }
    this.currentGrenadeIndex = 0;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const throwSpeed = 16.5 + Math.hypot(this.physics.velocity.x, this.physics.velocity.z) * 0.4;

    this.grenades.push({
      id: `gren_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: 'local_player',
      type: spec.grenadeType,
      position: {
        x: this.camera.position.x + dir.x * 0.5,
        y: this.camera.position.y + dir.y * 0.5,
        z: this.camera.position.z + dir.z * 0.5
      },
      velocity: {
        x: dir.x * throwSpeed + this.physics.velocity.x * 0.5,
        y: dir.y * throwSpeed + 1.6,
        z: dir.z * throwSpeed + this.physics.velocity.z * 0.5
      },
      fuseRemainingSec: spec.grenadeType === 'incendiary' ? 0.7 : spec.grenadeType === 'he' ? 1.6 : 1.8,
      bounces: 0,
      detonated: false
    });

    if (this.ownedGrenades.length > 0) {
      this.equipSlot('grenade');
    } else {
      this.equipBestAvailable();
    }
  }

  /** Falls back through the loadout in priority order, always leaving a usable weapon equipped. */
  private equipBestAvailable(): void {
    const priority: Array<'primary' | 'secondary' | 'melee'> = ['primary', 'secondary', 'melee'];
    for (const slot of priority) {
      const has = this.ownedWeapons.some((id) => WEAPON_SPECS[id]?.slot === slot);
      if (has) {
        this.equipSlot(slot);
        return;
      }
    }
    this.equipSlot('secondary');
  }

  private updateGrenades(dt: number): void {
    // Early-out: nothing to simulate and no trajectory preview requested.
    if (this.grenades.length === 0 && !(this.practiceOptions.showGrenadeTrajectory && this.currentSlot === 'grenade')) {
      this.trajectoryPreview = this.trajectoryPreview.length > 0 ? [] : this.trajectoryPreview;
      return;
    }

    const activeSmokes = this.smoke.getWorldPositions();

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      const res = stepGrenadeProjectile(g, this.aabbs, dt);

      if (res.bounced && g.bounces < 4) {
        soundEngine.playGrenadeEffect('bounce', g.position);
        this.particles.spawnSmokePuff(g.position, 2, 0.2);
      }

      if (res.detonated) {
        this.grenades.splice(i, 1);
        this.detonateGrenade(g, activeSmokes);
      }
    }

    // Practice mode trajectory preview while holding a grenade
    if (this.practiceOptions.showGrenadeTrajectory && this.currentSlot === 'grenade') {
      const spec = WEAPON_SPECS[this.localStats.currentWeapon];
      if (spec) {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.trajectoryPreview = computeGrenadeTrajectoryPreview(
          {
            x: this.camera.position.x + dir.x * 0.5,
            y: this.camera.position.y + dir.y * 0.5,
            z: this.camera.position.z + dir.z * 0.5
          },
          {
            x: dir.x * 16.5,
            y: dir.y * 16.5 + 1.6,
            z: dir.z * 16.5
          },
          this.aabbs,
          60,
          0.04
        );
      }
    } else {
      this.trajectoryPreview = [];
    }
  }

  private detonateGrenade(g: GrenadeProjectile, activeSmokes: Vector3D[]): void {
    const video = useSettingsStore.getState().video;
    switch (g.type) {
      case 'smoke':
        this.smoke.deploy(g.position, 18);
        soundEngine.playGrenadeEffect('smoke', g.position);
        break;
      case 'flash': {
        soundEngine.playGrenadeEffect('flash', g.position);
        const eye = { x: this.physics.position.x, y: this.physics.position.y + this.physics.eyeHeight, z: this.physics.position.z };
        const toGrenade = { x: g.position.x - eye.x, y: g.position.y + 0.3 - eye.y, z: g.position.z - eye.z };
        const dist = Math.hypot(toGrenade.x, toGrenade.y, toGrenade.z);
        if (dist < 22 && hasLineOfSight(eye, g.position, this.aabbs)) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
          const len = Math.max(0.001, dist);
          const dot =
            (toGrenade.x / len) * forward.x + (toGrenade.y / len) * forward.y + (toGrenade.z / len) * forward.z;
          if (dot > -0.2) {
            const proximity = Math.max(0, 1 - dist / 22);
            const exposure = Math.max(0, (dot + 0.2) / 1.2);
            const intensity = Math.min(1.4, proximity * exposure * 1.9);
            this.flashEffect.trigger(intensity, 0.9 + intensity * 3.2);
          }
        }
        // Flash AI bots too
        for (const bot of this.bots) {
          if (!bot.stats.alive) continue;
          const botEye = { x: bot.stats.position.x, y: bot.stats.position.y + 1.6, z: bot.stats.position.z };
          const dist = Math.hypot(g.position.x - botEye.x, g.position.y - botEye.y, g.position.z - botEye.z);
          if (dist < 18 && hasLineOfSight(botEye, g.position, this.aabbs)) {
            bot.brain.reactionTimerSec -= 1.6;
          }
        }
        this.particles.spawnBurst(g.position, { x: 0, y: 1, z: 0 }, 14, 0xffffff, 'glass', 6.5, -3);
        break;
      }
      case 'he': {
        soundEngine.playGrenadeEffect('he', g.position);
        this.particles.spawnBurst(g.position, { x: 0, y: 1, z: 0 }, Math.round(video.particleLimit / 6), 0xffa53a, 'metal', 8.5, -10);
        this.muzzle.trigger(new THREE.Vector3(g.position.x, g.position.y, g.position.z), 9);
        const eye = { x: this.physics.position.x, y: this.physics.position.y + 0.5, z: this.physics.position.z };
        const dist = Math.hypot(g.position.x - eye.x, g.position.y - eye.y, g.position.z - eye.z);
        if (dist < 7.2 && hasLineOfSight(eye, g.position, this.aabbs)) {
          const falloff = Math.max(0, 1 - dist / 7.2);
          const dmg = Math.round(98 * Math.pow(falloff, 1.35));
          if (dmg > 0) {
            this.applyDamageToLocalPlayer(dmg, 'explosive', 'HE-X Frag Grenade');
          }
        }
        for (const bot of this.bots) {
          if (!bot.stats.alive) continue;
          const bd = Math.hypot(g.position.x - bot.stats.position.x, g.position.y - bot.stats.position.y - 0.9, g.position.z - bot.stats.position.z);
          if (bd < 7.2) {
            const falloff = Math.max(0, 1 - bd / 7.2);
            const dmg = Math.round(98 * Math.pow(falloff, 1.35));
            bot.stats.health -= dmg;
            this.localStats.utilityDamage += dmg;
            if (bot.stats.health <= 0) {
              bot.stats.alive = false;
              bot.stats.health = 0;
              bot.stats.deaths += 1;
              bot.avatar.group.visible = false;
              this.localStats.kills += 1;
              this.pushKillFeed({
                killer: { id: 'local_player', name: this.localStats.name, team: this.playerTeam },
                victim: { id: bot.stats.id, name: bot.stats.name, team: bot.stats.team },
                weaponName: 'HE-X Frag Grenade',
                isHeadshot: false,
                isWallbang: false
              });
            }
          }
        }
        break;
      }
      case 'incendiary':
        this.fire.ignite(g.position, 7);
        soundEngine.playGrenadeEffect('incendiary', g.position);
        break;
      case 'decoy':
        this.particles.spawnBurst(g.position, { x: 0, y: 1, z: 0 }, 10, 0x38bdf8, 'glass', 4.5, -4);
        soundEngine.playGrenadeEffect('decoy', g.position);
        break;
    }
  }

  private applyDamageToLocalPlayer(amount: number, source: string, weaponName: string): void {
    const absorbed = this.armor > 0 ? Math.round(amount * 0.32) : 0;
    this.armor = Math.max(0, this.armor - Math.min(this.armor, absorbed));
    this.health -= Math.max(1, amount - absorbed);
    this.lastDamageSource = { weaponName, amount, time: Date.now() };

    if (this.health <= 0 && this.alive) {
      this.health = 0;
      this.alive = false;
      this.localStats.deaths += 1;
      this.localStats.alive = false;
      this.respawnTimerSec = this.matchMode === 'Deathmatch' ? 2.5 : 999;
      this.deathCause = `${source} — ${weaponName}`;
      this.pushKillFeed({
        killer: { id: 'world', name: weaponName, team: this.playerTeam === 'SENTINEL' ? 'VORTEX' : 'SENTINEL' },
        victim: { id: 'local_player', name: this.localStats.name, team: this.playerTeam },
        weaponName,
        isHeadshot: false,
        isWallbang: false
      });
    }
  }

  public lastDamageSource: { weaponName: string; amount: number; time: number } | null = null;
  public deathCause: string | null = null;

  // ==========================================================================
  // BOT COMBAT
  // ==========================================================================

  private updateBotCombat(dt: number): void {
    if (this.practiceOptions.botsFrozen) return;

    // Bot cognition runs at 32 Hz; they still move/aim every tick via the
    // interpolated state produced by the last AI solve.
    this.botAiAccumulator += dt;
    if (this.botAiAccumulator < 1 / 32) return;
    const aiDt = this.botAiAccumulator;
    this.botAiAccumulator = 0;

    const allPlayers: MatchPlayerStats[] = [
      {
        ...this.localStats,
        alive: this.alive,
        health: this.health,
        armor: this.armor,
        hasHelmet: this.hasHelmet,
        position: this.physics.position,
        yaw: this.yaw,
        pitch: this.pitch,
        crouching: this.physics.crouching
      },
      ...this.bots.map((b) => b.stats)
    ];

    const activeSmokes = this.smoke.getWorldPositions();
    const bombState = { planted: this.bombPlanted, position: this.bombPosition };

    for (const bot of this.bots) {
      if (!bot.stats.alive) continue;

      const result = updateBotAgent(
        bot.stats,
        bot.brain,
        allPlayers,
        this.map,
        this.aabbs,
        activeSmokes,
        bombState,
        this.botDifficulty,
        this.phase === 'BUY_PHASE' || this.phase === 'ROUND_END',
        aiDt
      );

      bot.avatar.group.position.set(bot.stats.position.x, bot.stats.position.y, bot.stats.position.z);
      bot.avatar.group.rotation.y = bot.stats.yaw;

      if (result.wantsPlantBomb && !this.bombPlanted && bot.stats.hasBomb) {
        this.bombPlantProgress += aiDt / 3.2;
        if (this.bombPlantProgress >= 1) {
          this.plantBomb(bot.stats.position, bot.stats.team);
          bot.stats.hasBomb = false;
          this.bombCarrierId = null;
          this.bombPlantProgress = 0;
        }
      }

      if (result.wantsDefuseBomb && this.bombPlanted) {
        this.bombDefuseProgress += aiDt / (bot.stats.hasDefuseKit ? 5 : 10);
        if (this.bombDefuseProgress >= 1) {
          this.defuseBomb(bot.stats.name);
        }
      }

      // --- Bot vs bot fire resolution (so team fights progress naturally) ---
      if (result.firedTargetId && result.firedTargetId !== 'local_player') {
        const victim = this.bots.find((b) => b.stats.id === result.firedTargetId);
        if (victim && victim.stats.alive) {
          const spec = WEAPON_SPECS[bot.stats.currentWeapon] || WEAPON_SPECS.vp9_tactical;
          const eye = { x: bot.stats.position.x, y: bot.stats.position.y + 1.6, z: bot.stats.position.z };
          const target = {
            x: victim.stats.position.x,
            y: victim.stats.position.y + (result.firedHitGroup === 'head' ? 1.68 : result.firedHitGroup === 'chest' ? 1.28 : result.firedHitGroup === 'stomach' ? 0.9 : 0.35),
            z: victim.stats.position.z
          };
          // Fair-play rule: a bot may never damage a target it cannot actually see.
          if (!hasLineOfSight(eye, target, this.aabbs, activeSmokes)) {
            continue;
          }
          const dist = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
          const dmg = calculateWeaponDamage({
            weapon: spec,
            distanceMeters: dist,
            hitGroup: result.firedHitGroup,
            targetArmor: victim.stats.armor,
            targetHasHelmet: victim.stats.hasHelmet
          });
          victim.stats.armor = Math.max(0, victim.stats.armor - dmg.armorDamage);
          victim.stats.health -= dmg.healthDamage;
          soundEngine.playWeaponFire(spec.category, !!spec.suppressed, eye, false);

          if (victim.stats.health <= 0) {
            victim.stats.health = 0;
            victim.stats.alive = false;
            victim.stats.deaths += 1;
            victim.avatar.group.visible = false;
            bot.stats.kills += 1;
            bot.stats.score += 2;
            if (result.firedHitGroup === 'head') bot.stats.headshots += 1;
            bot.stats.money = Math.min(16000, bot.stats.money + spec.killReward);
            this.pushKillFeed({
              killer: { id: bot.stats.id, name: bot.stats.name, team: bot.stats.team },
              victim: { id: victim.stats.id, name: victim.stats.name, team: victim.stats.team },
              weaponName: spec.name,
              isHeadshot: result.firedHitGroup === 'head',
              isWallbang: false
            });
          } else {
            victim.brain.reactionTimerSec = -0.07;
            // Simple assist tracking: the most recent non-lethal attacker gets credit on death.
            victim.stats.assists += 0;
          }
        }
      }

      // Fire at the local player
      if (result.firedTargetId === 'local_player' && this.alive) {
        const spec = WEAPON_SPECS[bot.stats.currentWeapon] || WEAPON_SPECS.vp9_tactical;
        const eye = { x: bot.stats.position.x, y: bot.stats.position.y + 1.6, z: bot.stats.position.z };
        const target = { x: this.physics.position.x, y: this.physics.position.y + (result.firedHitGroup === 'head' ? 1.68 : result.firedHitGroup === 'chest' ? 1.28 : result.firedHitGroup === 'stomach' ? 0.9 : 0.35), z: this.physics.position.z };
        const dist = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);

        soundEngine.playWeaponFire(spec.category, !!spec.suppressed, eye, false);

        const dmgResult = calculateWeaponDamage({
          weapon: spec,
          distanceMeters: dist,
          hitGroup: result.firedHitGroup,
          targetArmor: this.armor,
          targetHasHelmet: this.hasHelmet
        });

        const isWallbang = !hasLineOfSight(eye, target, this.aabbs, activeSmokes);
        if (isWallbang) {
          // Bots cannot shoot through solid geometry — validate before applying
          const blocked = !hasLineOfSight(eye, target, this.aabbs);
          if (blocked) continue;
        }

        this.applyDamageToLocalPlayer(dmgResult.healthDamage, bot.stats.name, spec.name);
        this.lastDamageSource = { weaponName: spec.name, amount: dmgResult.healthDamage, time: Date.now() };
        soundEngine.playHitFeedback(result.firedHitGroup === 'head');

        // Muzzle flash for bots
        this.muzzle.trigger(new THREE.Vector3(eye.x, eye.y, eye.z), 2.4);
      }
    }
  }

  // ==========================================================================
  // OBJECTIVE: BOMB PLANT / DEFUSE
  // ==========================================================================

  private handleInteract(): void {
    if (!this.isBombMode()) return;

    if (!this.bombPlanted && this.localStats.hasBomb && this.isInsideBombSite(this.physics.position)) {
      this.bombPlantProgress = Math.min(1, this.bombPlantProgress + 0.34);
      if (this.bombPlantProgress >= 1) {
        this.plantBomb(this.physics.position, this.playerTeam);
        this.localStats.hasBomb = false;
        this.bombCarrierId = null;
        this.bombPlantProgress = 0;
      }
    } else if (this.bombPlanted && this.playerTeam === 'SENTINEL' && this.bombPosition) {
      const distToBomb = Math.hypot(
        this.bombPosition.x - this.physics.position.x,
        this.bombPosition.z - this.physics.position.z
      );
      void distToBomb;
    }
  }

  private isInsideBombSite(pos: Vector3D): boolean {
    const sites = [this.world.bombSites.A, this.world.bombSites.B].filter(Boolean) as Array<[number, number, number]>;
    for (const site of sites) {
      if (Math.abs(pos.x - site[0]) < 8 && Math.abs(pos.z - site[2]) < 8) return true;
    }
    return false;
  }

  private plantBomb(position: Vector3D, team: TeamId): void {
    this.bombPlanted = true;
    this.bombPosition = { x: position.x, y: 0.15, z: position.z };
    const siteA = this.world.bombSites.A;
    const siteB = this.world.bombSites.B;
    if (siteA) {
      const dA = Math.hypot(position.x - siteA[0], position.z - siteA[2]);
      const dB = siteB ? Math.hypot(position.x - siteB[0], position.z - siteB[2]) : Infinity;
      this.bombSite = dA <= dB ? 'A' : 'B';
    }
    const modeCfg = getModeConfig(this.matchMode);
    this.bombTimerSec = this.matchMode === 'Custom' ? this.customConfig.bombTimerSec : modeCfg.bombTimerSec || 40;
    this.phase = 'BOMB_PLANTED';

    soundEngine.playBombBeep(0.2, this.bombPosition);
    this.replayEvents.push({
      tick: this.replayTick,
      timeSec: this.replayTick / 64,
      type: 'bomb_planted',
      round: this.roundNumber,
      payload: { planterTeam: team, site: this.bombSite, position: this.bombPosition }
    });
  }

  private defuseBomb(defuserName: string): void {
    this.bombPlanted = false;
    this.phase = 'ROUND_END';
    this.phaseTimerSec = 5;
    this.roundEndWinner = 'SENTINEL';
    this.roundEndReason = `${defuserName} defused the Pulse Bomb`;
    this.sentinelScore += 1;
    this.replayEvents.push({
      tick: this.replayTick,
      timeSec: this.replayTick / 64,
      type: 'bomb_defused',
      round: this.roundNumber,
      payload: { defuser: defuserName }
    });
  }

  private roundEndWinner: TeamId | null = null;
  private roundEndReason = '';

  // ==========================================================================
  // ROUND STATE MACHINE
  // ==========================================================================

  private updateObjective(dt: number): void {
    if (!this.isBombMode()) {
      // Deathmatch / Practice: respawn bots immediately
      for (const bot of this.bots) {
        if (!bot.stats.alive) {
          bot.stats.alive = true;
          bot.stats.health = 100;
          bot.stats.armor = 100;
          bot.avatar.group.visible = true;
          const spawnList = bot.stats.team === 'SENTINEL' ? this.world.spawnPoints.SENTINEL : this.world.spawnPoints.VORTEX;
          const spawn = spawnList[Math.floor(Math.random() * spawnList.length)] || [0, 0, 0];
          bot.stats.position = { x: spawn[0] + (Math.random() - 0.5) * 8, y: 0, z: spawn[2] + (Math.random() - 0.5) * 8 };
        }
      }
      return;
    }

    if (this.bombPlanted) {
      this.bombTimerSec -= dt;
      const urgency = 1 - Math.max(0, this.bombTimerSec) / 40;
      this.bombBeepAccum = (this.bombBeepAccum || 0) + dt;
      const beepInterval = Math.max(0.14, 1.0 - urgency * 0.85);
      if (this.bombBeepAccum > beepInterval) {
        this.bombBeepAccum = 0;
        soundEngine.playBombBeep(urgency, this.bombPosition || undefined);
      }

      // Local player defuse
      const defusing = inputManager.isActionDown('interact') && this.alive && this.playerTeam === 'SENTINEL' && this.bombPosition &&
        Math.hypot(this.bombPosition.x - this.physics.position.x, this.bombPosition.z - this.physics.position.z) < 2.4;

      if (defusing) {
        this.bombDefuseProgress += dt / (this.hasDefuseKit ? 5 : 10);
        if (this.bombDefuseProgress >= 1) {
          this.defuseBomb(this.localStats.name);
        }
      } else if (this.playerTeam === 'SENTINEL') {
        this.bombDefuseProgress = Math.max(0, this.bombDefuseProgress - dt * 0.85);
      }

      // Local player plant
      if (!this.bombPlanted) return;
    } else {
      // Plant progress for local player holding the bomb in a site
      if (this.localStats.hasBomb && this.alive && this.isInsideBombSite(this.physics.position) && inputManager.isActionDown('interact')) {
        this.bombPlantProgress += dt / 3.2;
        if (this.bombPlantProgress >= 1) {
          this.plantBomb(this.physics.position, this.playerTeam);
          this.localStats.hasBomb = false;
          this.bombCarrierId = null;
          this.bombPlantProgress = 0;
        }
      } else if (this.bombPlantProgress > 0) {
        this.bombPlantProgress = Math.max(0, this.bombPlantProgress - dt * 0.7);
      }
    }

    // Fire area damage
    const fireAreas = this.fire.getActiveAreas();
    for (const area of fireAreas) {
      const dist = Math.hypot(area.position.x - this.physics.position.x, area.position.z - this.physics.position.z);
      if (dist < area.radius && this.alive) {
        if (this.fireDamageTick === undefined) this.fireDamageTick = 0;
        this.fireDamageTick += dt;
        if (this.fireDamageTick >= 0.35) {
          this.fireDamageTick = 0;
          this.applyDamageToLocalPlayer(10, 'Thermite Incendiary', 'Thermite Incendiary');
        }
      }
    }
    this.fireDamageTick = undefined;
  }

  private bombBeepAccum = 0;
  private fireDamageTick: number | undefined;

  private updateRoundState(dt: number): void {
    if (this.matchComplete) return;

    if (this.phase === 'BUY_PHASE') {
      this.phaseTimerSec -= dt;
      if (this.phaseTimerSec <= 0) {
        this.phase = 'LIVE_ROUND';
        this.phaseTimerSec = getModeConfig(this.matchMode).roundTimeSec;
      }
      return;
    }

    if (this.phase === 'LIVE_ROUND' || this.phase === 'BOMB_PLANTED') {
      if (this.phase === 'LIVE_ROUND') {
        this.phaseTimerSec -= dt;
      }

      const isWarmupMode = this.matchMode === 'Deathmatch' || this.matchMode === 'Practice';
      if (isWarmupMode) {
        if (this.matchMode === 'Deathmatch' && this.phaseTimerSec <= 0) {
          this.completeMatch();
        }
        return;
      }

      const sentinelAlive = this.countAlive('SENTINEL');
      const vortexAlive = this.countAlive('VORTEX');

      const res = evaluateRoundEnd({
        mode: this.matchMode,
        sentinelAlive,
        vortexAlive,
        bombPlanted: this.bombPlanted,
        bombTimerSec: this.bombTimerSec,
        roundTimeRemainingSec: this.phaseTimerSec,
        bombDefused: this.roundEndWinner === 'SENTINEL' && !this.bombPlanted
      });

      if (res.ended && res.winner) {
        this.endRound(res.winner, res.reason || 'ROUND_END');
      }
      return;
    }

    if (this.phase === 'ROUND_END') {
      this.phaseTimerSec -= dt;
      if (this.phaseTimerSec <= 0) {
        const completion = checkMatchComplete(
          this.sentinelScore,
          this.vortexScore,
          this.maxRounds,
          this.matchMode === 'Wingman',
          true
        );
        if (completion.complete) {
          this.completeMatch();
        } else {
          this.startNewRound();
        }
      }
      return;
    }
  }

  private countAlive(team: 'SENTINEL' | 'VORTEX'): number {
    let count = 0;
    if (this.playerTeam === team && this.alive) count++;
    for (const bot of this.bots) {
      if (bot.stats.team === team && bot.stats.alive) count++;
    }
    return count;
  }

  private endRound(winner: TeamId, reason: string): void {
    this.phase = 'ROUND_END';
    this.phaseTimerSec = 5;
    this.roundEndWinner = winner;
    this.roundEndReason = reason;

    if (winner === 'SENTINEL') this.sentinelScore += 1;
    else if (winner === 'VORTEX') this.vortexScore += 1;

    // MVP award to the highest-scoring living member of the winning team
    this.localStats.mvps += 1;

    // Economy payouts for the local player
    const won = winner === this.playerTeam;
    const payout = calculateRoundPayout({
      mode: this.matchMode,
      wonRound: won,
      lossStreak: this.playerTeam === 'SENTINEL' ? this.sentinelLossStreak : this.vortexLossStreak,
      bombPlantedByThisTeam: this.bombPlanted && this.playerTeam === 'VORTEX',
      isAttacker: this.playerTeam === 'VORTEX',
      killReward: 0
    });

    if (winner === 'SENTINEL') {
      this.sentinelLossStreak = 0;
      this.vortexLossStreak += 1;
    } else {
      this.vortexLossStreak = 0;
      this.sentinelLossStreak += 1;
    }

    if (this.matchMode !== 'Retakes') {
      this.money = Math.min(16000, this.money + payout.reward + 1400);
      this.localStats.money = this.money;
    }

    this.replayEvents.push({
      tick: this.replayTick,
      timeSec: this.replayTick / 64,
      type: 'round_end',
      round: this.roundNumber,
      payload: { winner, reason, sentinelScore: this.sentinelScore, vortexScore: this.vortexScore }
    });
  }

  private startNewRound(): void {
    this.roundNumber += 1;
    this.roundEndWinner = null;
    this.roundEndReason = '';
    this.bombPlanted = false;
    this.bombSite = null;
    this.bombPosition = null;
    this.bombDefuseProgress = 0;
    this.bombPlantProgress = 0;
    this.phase = 'BUY_PHASE';
    this.phaseTimerSec = getModeConfig(this.matchMode).buyTimeSec || 12;

    this.respawnLocalPlayer();
    this.localStats.hasBomb = false;

    // Freeze weapons out of reload state
    for (const key of Object.keys(this.weaponInventory)) {
      const st = this.weaponInventory[key];
      st.isReloading = false;
      st.reloadTimerSec = 0;
      st.shotIndex = 0;
      st.recoilPitch = 0;
      st.recoilYaw = 0;
    }

    // Respawn all bots
    for (const bot of this.bots) {
      bot.stats.alive = true;
      bot.stats.health = 100;
      bot.stats.armor = 100;
      bot.stats.hasHelmet = true;
      bot.stats.hasBomb = false;
      bot.avatar.group.visible = true;
      const spawnList = bot.stats.team === 'SENTINEL' ? this.world.spawnPoints.SENTINEL : this.world.spawnPoints.VORTEX;
      const spawn = spawnList[Math.floor(Math.random() * spawnList.length)] || [0, 0, 0];
      bot.stats.position = { x: spawn[0] + (Math.random() - 0.5) * 5, y: 0, z: spawn[2] + (Math.random() - 0.5) * 5 };
      bot.brain.targetWaypointId = null;
      bot.brain.reactionTimerSec = 0;
    }

    // Re-assign the bomb
    const attackers = this.bots.filter((b) => b.stats.team === 'VORTEX');
    if (attackers.length > 0) {
      const carrier = attackers[Math.floor(Math.random() * attackers.length)];
      carrier.stats.hasBomb = true;
      this.bombCarrierId = carrier.stats.id;
    } else if (this.playerTeam === 'VORTEX') {
      this.localStats.hasBomb = true;
      this.bombCarrierId = 'local_player';
    }

    // Round economy for bots
    for (const bot of this.bots) {
      const won = this.roundEndWinner === bot.stats.team;
      const payout = calculateRoundPayout({
        mode: this.matchMode,
        wonRound: won,
        lossStreak: won ? 0 : 1,
        bombPlantedByThisTeam: this.bombPlanted && bot.stats.team === 'VORTEX',
        isAttacker: bot.stats.team === 'VORTEX',
        killReward: 0
      });
      bot.stats.money = Math.min(16000, bot.stats.money + payout.reward);
      // Auto-buy for bots
      if (bot.stats.money >= 1000 && bot.stats.armor < 50) {
        bot.stats.armor = 100;
        bot.stats.hasHelmet = true;
        bot.stats.money -= 1000;
      }
      if (bot.stats.money >= 2900 && WEAPON_SPECS[bot.stats.currentWeapon]?.slot !== 'primary') {
        bot.stats.currentWeapon = bot.stats.team === 'SENTINEL' ? 'vanguard_m4a' : 'harbinger_47';
        bot.stats.money -= 2900;
      }
    }
  }

  private completeMatch(): void {
    this.phase = 'MATCH_END';
    this.matchComplete = true;

    const winner: TeamId | 'DRAW' =
      this.sentinelScore > this.vortexScore
        ? 'SENTINEL'
        : this.vortexScore > this.sentinelScore
        ? 'VORTEX'
        : 'DRAW';

    this.replayEvents.push({
      tick: this.replayTick,
      timeSec: this.replayTick / 64,
      type: 'round_end',
      round: this.roundNumber,
      payload: { matchEnd: true, winner }
    });

    this.matchEndCallback?.({
      sentinelScore: this.sentinelScore,
      vortexScore: this.vortexScore,
      winner,
      rounds: this.roundNumber
    });
  }

  // ==========================================================================
  // REPLAY RECORDING
  // ==========================================================================

  private recordReplayTick(dt: number): void {
    this.replayTick++;
    if (this.replayTick % 16 !== 0) return; // 64 Hz storage / 16 = 4 Hz snapshots
    if (this.replayEvents.length > 4000) this.replayEvents.shift();

    const actors = [
      {
        id: 'local_player',
        name: this.localStats.name,
        team: this.playerTeam,
        pos: [this.physics.position.x, this.physics.position.y, this.physics.position.z] as [number, number, number],
        yaw: this.yaw,
        pitch: this.pitch,
        hp: this.health,
        weapon: this.localStats.currentWeapon
      },
      ...this.bots.map((b) => ({
        id: b.stats.id,
        name: b.stats.name,
        team: b.stats.team,
        pos: [b.stats.position.x, b.stats.position.y, b.stats.position.z] as [number, number, number],
        yaw: b.stats.yaw,
        pitch: b.stats.pitch,
        hp: b.stats.health,
        weapon: b.stats.currentWeapon
      }))
    ];

    this.replayEvents.push({
      tick: this.replayTick,
      timeSec: this.replayTick / 64,
      type: 'snapshot',
      round: this.roundNumber,
      actors
    });
  }

  public getRecordedReplay(): ReplayRecord {
    const winner = this.sentinelScore > this.vortexScore ? 'SENTINEL' : this.vortexScore > this.sentinelScore ? 'VORTEX' : 'DRAW';
    return {
      id: `rep_${Date.now()}`,
      title: `${this.matchMode} — ${this.map.name} (${this.sentinelScore}-${this.vortexScore})`,
      mapId: this.map.id,
      mapName: this.map.name,
      mode: this.matchMode,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      durationSec: Math.max(1, this.replayTick / 64),
      sentinelScore: this.sentinelScore,
      vortexScore: this.vortexScore,
      winner,
      rounds: this.roundNumber,
      tickRate: 64,
      events: this.replayEvents.slice(-2500)
    };
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  private render(dt: number): void {
    const video = useSettingsStore.getState().video;

    // Listener orientation follows the rendered camera, not the physics tick.
    soundEngine.updateListener(this.camera.position, this.yaw, this.pitch);

    this.tracers.update(dt);
    this.particles.update(dt, video.effectsQuality !== 'Low' || video.particleLimit > 0);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.shells.update(dt);
    this.muzzle.update(dt);

    // --- Smart Occlusion Culling Pass ---
    this.cullingTickCounter++;
    // Run the full culling solve at 20 Hz (it is deterministic and objects move slowly),
    // while cheap distance/frustum toggles still apply every frame via matrix updates.
    if (this.cullingTickCounter % 3 === 0) {
      this.runCullingPass(video);
    }

    // Hide bot avatars for players the local camera cannot see (graphical-only; audio/AI unaffected)
    for (const bot of this.bots) {
      if (!bot.stats.alive) {
        bot.avatar.group.visible = false;
        continue;
      }
      const shouldRender = !(video.smartOcclusionCulling && !this.visibleEnemyIds.has(bot.stats.id) && bot.stats.team !== this.playerTeam);
      bot.avatar.group.visible = shouldRender;
    }

    this.canvas.style.filter = this.flashEffect.flashIntensity > 0.02
      ? `brightness(${1 + this.flashEffect.flashIntensity * 3.2}) contrast(${1 + this.flashEffect.flashIntensity * 0.6})`
      : 'none';

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);

    this.cullingStats.drawCalls = this.renderer.info.render.calls;
    this.cullingStats.triangles = this.renderer.info.render.triangles;
  }

  private runCullingPass(video: VideoSettings): void {
    const cameraPos = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    let visible = 0;
    let behind = 0;
    let frustum = 0;
    let occluded = 0;
    let distance = 0;
    let lodHigh = 0;
    let lodMedium = 0;
    let lodLow = 0;

    const cutoff = getObjectDistanceCutoffMeters(video);

    const decisions: Record<string, { visible: boolean; reason: string }> = {};

    for (const obj of this.map.objects) {
      if (
        obj.type === 'spawn_sentinel' ||
        obj.type === 'spawn_vortex' ||
        obj.type === 'buy_zone' ||
        obj.type === 'light' ||
        obj.type === 'sound_zone' ||
        obj.type === 'visibility_portal' ||
        obj.type === 'occlusion_zone'
      ) {
        continue;
      }

      const decision = evaluateObjectVisibility(
        cameraPos,
        { x: forward.x, y: forward.y, z: forward.z },
        this.camera.fov,
        this.camera.aspect,
        obj,
        this.occluderBoxes,
        video
      );

      decisions[obj.id] = { visible: decision.visible, reason: decision.reason };

      const meshes = this.world.meshByObjectId.get(obj.id);
      if (meshes) {
        for (const mesh of meshes) {
          mesh.visible = decision.visible;
        }
      }

      if (decision.visible) {
        visible++;
        if (decision.lodLevel === 'high') lodHigh++;
        else if (decision.lodLevel === 'medium') lodMedium++;
        else lodLow++;
      } else {
        if (decision.reason === 'behind_camera') behind++;
        else if (decision.reason === 'frustum') frustum++;
        else if (decision.reason === 'occluded') occluded++;
        else distance++;
      }
    }

    this.cullingDecisions = decisions;

    // Player visibility & gameplay-critical LOS tracking
    this.visibleEnemyIds.clear();
    let visiblePlayers = 0;
    let culledPlayers = 0;
    const activeSmokes = this.smoke.getWorldPositions();

    for (const bot of this.bots) {
      if (!bot.stats.alive) continue;
      const isEnemy = bot.stats.team !== this.playerTeam;
      const decision = evaluatePlayerVisibility(
        cameraPos,
        { x: forward.x, y: forward.y, z: forward.z },
        bot.stats.position,
        isEnemy,
        this.occluderBoxes,
        video
      );

      // Smoke blocks the graphical mesh, but gameplay LOS is separate (handled in AI & server)
      let smokeBlocked = false;
      if (decision.hasLineOfSight && activeSmokes.length > 0) {
        smokeBlocked = !hasLineOfSight(
          cameraPos,
          { x: bot.stats.position.x, y: bot.stats.position.y + 1.1, z: bot.stats.position.z },
          [],
          activeSmokes
        );
      }

      if (decision.visible && !smokeBlocked) {
        this.visibleEnemyIds.add(bot.stats.id);
        visiblePlayers++;
      } else if (!decision.visible) {
        culledPlayers++;
      }
    }

    this.cullingStats = {
      totalObjects: visible + behind + frustum + occluded + distance,
      visibleObjects: visible,
      culledBehindCamera: behind,
      culledByFrustum: frustum,
      culledByOcclusion: occluded,
      culledByDistance: distance,
      lodHighCount: lodHigh,
      lodMediumCount: lodMedium,
      lodLowCount: lodLow,
      visiblePlayers,
      culledPlayers,
      drawCalls: this.cullingStats.drawCalls,
      triangles: this.cullingStats.triangles
    };

    // LOD/fog tuning is reactive to the visibility distance setting
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = 25;
      this.scene.fog.far = Math.min(240, cutoff * 1.9);
    }
  }

  private checkCallout(): void {
    let best = this.currentCallout;
    let bestDist = Infinity;
    for (const callout of this.map.callouts) {
      const d = Math.hypot(
        callout.position[0] - this.physics.position.x,
        callout.position[2] - this.physics.position.z
      );
      if (d < callout.radius && d < bestDist) {
        bestDist = d;
        best = callout.name;
      }
    }
    this.currentCallout = best;

    // Interaction prompt logic
    if (this.localStats.hasBomb && this.isInsideBombSite(this.physics.position)) {
      this.interactionPrompt = `[E] HOLD TO PLANT PULSE BOMB — ${Math.round(this.bombPlantProgress * 100)}%`;
    } else if (
      this.bombPlanted &&
      this.playerTeam === 'SENTINEL' &&
      this.bombPosition &&
      Math.hypot(this.bombPosition.x - this.physics.position.x, this.bombPosition.z - this.physics.position.z) < 2.4
    ) {
      this.interactionPrompt = `[E] HOLD TO DEFUSE — ${Math.round(this.bombDefuseProgress * 100)}%`;
    } else if (this.bombPlanted && this.bombPosition) {
      this.interactionPrompt = null;
    } else {
      this.interactionPrompt = null;
    }
  }

  // ==========================================================================
  // PUBLIC API FOR REACT HUD
  // ==========================================================================

  public getTrainingTrajectory(): Vector3D[] {
    return this.trajectoryPreview;
  }

  public getCullingDecisions(): Record<string, { visible: boolean; reason: string }> {
    return this.cullingDecisions;
  }

  /** Updates the drawing buffer and camera aspect after a container resize. */
  public handleResize(): void {
    if (!this.renderer || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public getFrameSnapshot(): FrameTelemetrySnapshot {
    return this.frameSnapshot;
  }

  public getCullingStats(): CullingFrameStats {
    return this.cullingStats;
  }

  public getMapName(): string {
    return this.map?.name || '';
  }

  public getMap(): GameMapDefinition {
    return this.map;
  }

  public getAabbs(): AABB[] {
    return this.aabbs;
  }

  public getPhase(): HudState['phase'] {
    return this.phase;
  }

  public getPlayers(): MatchPlayerStats[] {
    return [
      {
        ...this.localStats,
        alive: this.alive,
        health: Math.max(0, Math.round(this.health)),
        armor: Math.round(this.armor),
        hasHelmet: this.hasHelmet,
        hasDefuseKit: this.hasDefuseKit,
        money: this.money,
        position: { ...this.physics.position },
        yaw: this.yaw,
        pitch: this.pitch,
        crouching: this.physics.crouching
      },
      ...this.bots.map((b) => b.stats)
    ];
  }

  public getHudState(): HudState {
    const spec = WEAPON_SPECS[this.localStats.currentWeapon] || WEAPON_SPECS.vp9_tactical;
    const runtime = this.currentWeaponRuntime;
    return {
      health: Math.max(0, Math.round(this.health)),
      armor: Math.round(this.armor),
      hasHelmet: this.hasHelmet,
      hasDefuseKit: this.hasDefuseKit,
      money: this.money,
      ammoInMag: runtime?.ammoInMag ?? 0,
      reserveAmmo: runtime?.reserveAmmo ?? 0,
      weaponName: spec.name,
      weaponId: spec.id,
      phase: this.phase,
      phaseTimer: Math.max(0, this.phaseTimerSec),
      roundNumber: this.roundNumber,
      sentinelScore: this.sentinelScore,
      vortexScore: this.vortexScore,
      bombPlanted: this.bombPlanted,
      bombTimer: Math.max(0, this.bombTimerSec),
      bombDefuseProgress: this.bombDefuseProgress,
      bombPlantProgress: this.bombPlantProgress,
      isScoped: !!runtime?.isScoped,
      isReloading: !!runtime?.isReloading,
      reloadProgress: runtime?.isReloading ? 1 - runtime.reloadTimerSec / Math.max(0.1, spec.reloadTimeSec) : 1,
      canBuy: (this.phase === 'BUY_PHASE' || this.matchMode === 'Deathmatch' || this.matchMode === 'Practice') && this.alive,
      killFeed: [...this.killFeed],
      players: this.getPlayers(),
      localTeam: this.playerTeam,
      currentCallout: this.currentCallout,
      visibleEnemyIds: Array.from(this.visibleEnemyIds),
      interactionPrompt: this.interactionPrompt,
      alive: this.alive,
      respawnTimer: Math.max(0, this.respawnTimerSec),
      practiceTrajectory: this.trajectoryPreview,
      isCrouching: this.physics.crouching,
      movementSpeed: Math.hypot(this.physics.velocity.x, this.physics.velocity.z),
      playerCount: this.bots.length + 1
    };
  }

  public getLocalEyePosition(): Vector3D {
    return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }

  public getRoundEndInfo(): { winner: TeamId | null; reason: string } {
    return { winner: this.roundEndWinner, reason: this.roundEndReason };
  }

  public getMode(): GameModeId {
    return this.matchMode;
  }

  public getTeam(): TeamId {
    return this.playerTeam;
  }

  public setBotDifficulty(d: BotDifficulty): void {
    this.botDifficulty = d;
  }

  // ==========================================================================
  // BUYING (client-side optimistic; server authoritatively validates in multiplayer)
  // ==========================================================================

  public purchaseWeapon(weaponId: string): { ok: boolean; message: string } {
    const spec = WEAPON_SPECS[weaponId];
    if (!spec) return { ok: false, message: 'Unknown weapon.' };
    if (!this.alive) return { ok: false, message: 'Cannot buy while eliminated.' };
    if (this.matchMode !== 'Deathmatch' && this.matchMode !== 'Practice' && this.phase !== 'BUY_PHASE') {
      return { ok: false, message: 'Buy phase has ended.' };
    }
    if (this.money < spec.price) return { ok: false, message: `Insufficient funds ($${this.money} < $${spec.price}).` };

    this.money -= spec.price;
    this.localStats.money = this.money;

    if (spec.slot === 'grenade') {
      if (!this.ownedGrenades.includes(weaponId)) this.ownedGrenades.push(weaponId);
      this.equipSlot('grenade');
    } else {
      if (!this.ownedWeapons.includes(weaponId)) this.ownedWeapons.push(weaponId);
      this.weaponInventory[weaponId] = createWeaponRuntime(weaponId, true);
      this.equipSlot(spec.slot as 'primary' | 'secondary' | 'melee');
    }

    soundEngine.playUiSound('buy');
    return { ok: true, message: `Purchased ${spec.name}.` };
  }

  public purchaseEquipment(equipId: 'kevlar_vest' | 'kevlar_helmet' | 'defuse_kit'): { ok: boolean; message: string } {
    if (this.matchMode !== 'Deathmatch' && this.matchMode !== 'Practice' && this.phase !== 'BUY_PHASE') {
      return { ok: false, message: 'Buy phase has ended.' };
    }
    const prices = { kevlar_vest: 650, kevlar_helmet: 1000, defuse_kit: 400 };
    const price = prices[equipId];

    if (equipId === 'defuse_kit') {
      if (this.playerTeam !== 'SENTINEL') return { ok: false, message: 'Defuse kits are Sentinel-only.' };
      if (this.hasDefuseKit) return { ok: false, message: 'Already equipped.' };
    } else if (equipId === 'kevlar_vest' && this.armor >= 100) {
      return { ok: false, message: 'Already equipped.' };
    } else if (equipId === 'kevlar_helmet' && this.armor >= 100 && this.hasHelmet) {
      return { ok: false, message: 'Already equipped.' };
    }

    const effectivePrice = equipId === 'kevlar_helmet' && this.armor >= 100 && !this.hasHelmet ? 350 : price;
    if (this.money < effectivePrice) {
      return { ok: false, message: `Insufficient funds (need $${effectivePrice}).` };
    }

    this.money -= effectivePrice;
    this.localStats.money = this.money;
    if (equipId === 'kevlar_vest') this.armor = 100;
    else if (equipId === 'kevlar_helmet') {
      this.armor = 100;
      this.hasHelmet = true;
    } else {
      this.hasDefuseKit = true;
    }

    soundEngine.playUiSound('buy');
    return { ok: true, message: 'Equipment acquired.' };
  }

  public applyBuyPreset(preset: import('./gameStateStore').BuyPreset): { ok: boolean; message: string } {
    let spent = 0;
    let failed = 0;

    if (preset.armorType === 'kevlar_helmet') {
      const r = this.purchaseEquipment('kevlar_helmet');
      if (!r.ok) failed++;
    } else if (preset.armorType === 'kevlar_vest') {
      const r = this.purchaseEquipment('kevlar_vest');
      if (!r.ok) failed++;
    }

    if (preset.defuseKit && this.playerTeam === 'SENTINEL') {
      const r = this.purchaseEquipment('defuse_kit');
      if (!r.ok) failed++;
    }

    for (const g of preset.grenades) {
      if (WEAPON_SPECS[g] && this.money >= WEAPON_SPECS[g].price && !this.ownedGrenades.includes(g)) {
        const r = this.purchaseWeapon(g);
        if (r.ok) spent++;
        else failed++;
      }
    }

    if (preset.primaryWeaponId && WEAPON_SPECS[preset.primaryWeaponId]) {
      const r = this.purchaseWeapon(preset.primaryWeaponId);
      if (r.ok) spent++;
      else failed++;
    }
    if (preset.secondaryWeaponId && WEAPON_SPECS[preset.secondaryWeaponId]) {
      const r = this.purchaseWeapon(preset.secondaryWeaponId);
      if (r.ok) spent++;
      else failed++;
    }

    return failed === 0
      ? { ok: true, message: `Preset "${preset.name}" applied — ${spent} item(s) acquired.` }
      : { ok: true, message: `Preset applied with ${failed} item(s) unavailable due to funds.` };
  }

  public setPracticeOption(key: keyof typeof this.practiceOptions, value: boolean): void {
    this.practiceOptions[key] = value;
    if (key === 'infiniteAmmo' && value) {
      for (const id of Object.keys(this.weaponInventory)) {
        this.weaponInventory[id].reserveAmmo = 9999;
        this.weaponInventory[id].ammoInMag = WEAPON_SPECS[id]?.magazineSize ?? 30;
      }
    }
  }

  public getPracticeOptions() {
    return { ...this.practiceOptions };
  }

  public refillAmmo(): void {
    for (const id of Object.keys(this.weaponInventory)) {
      const spec = WEAPON_SPECS[id];
      if (!spec) continue;
      this.weaponInventory[id].ammoInMag = spec.magazineSize;
      this.weaponInventory[id].reserveAmmo = spec.reserveAmmo;
      this.weaponInventory[id].isReloading = false;
    }
    this.health = 100;
    this.armor = 100;
    this.hasHelmet = true;
    this.money = 16000;
    this.localStats.money = 16000;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafHandle);

    // Detach context listeners before tearing down, otherwise a late
    // `webglcontextrestored` would run against a disposed renderer.
    if (this.onContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.onContextLost = null;
    }
    if (this.onContextRestored) {
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.onContextRestored = null;
    }
    this.contextLossListeners.clear();

    if (this.viewmodel) {
      this.camera.remove(this.viewmodel.group);
      this.viewmodel.dispose();
    }
    for (const bot of this.bots) {
      this.scene.remove(bot.avatar.group);
      bot.avatar.dispose();
    }
    this.smoke.clear();
    this.fire.clear();
    this.particles.clear();
    this.decals.clear();
    this.tracers.clear();
    this.shells.clear();
    if (this.world) {
      this.scene.remove(this.world.root);
      this.world.dispose();
    }
    this.renderer.dispose();
    this.scene.clear();
  }
}

function video_particleEnabled(): boolean {
  return useSettingsStore.getState().video.effectsQuality !== 'Low';
}


/**
 * Returns true when the given binding code corresponds to a currently held key
 * or mouse button. Used for continuous (level-triggered) inputs only.
 */
function keyHeld(code: string): boolean {
  return inputManager.isCodeDown(code);
}
