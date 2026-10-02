import { create } from 'zustand';
import {
  BotDifficulty,
  CustomGameConfig,
  GameMapDefinition,
  GameModeId,
  KillFeedEntry,
  MatchPlayerStats,
  RegionId,
  ReplayEvent,
  ReplayRecord,
  TeamId,
  UserRole,
  Vector3D
} from '../../shared/types';
import { EQUIPMENT_SPECS, WEAPON_SPECS } from '../../shared/weapons';
import { OFFICIAL_MAPS } from '../maps/officialMaps';

export type MainMenuTab = 'PLAY' | 'PROFILE' | 'WORKSHOP' | 'MAP_EDITOR' | 'SETTINGS' | 'COMMUNITY' | 'REPLAYS';

export interface BuyPreset {
  id: string;
  name: string;
  primaryWeaponId: string | null;
  secondaryWeaponId: string | null;
  armorType: 'none' | 'kevlar_vest' | 'kevlar_helmet';
  defuseKit: boolean;
  grenades: string[];
}

export interface WorkshopMapEntry {
  id: string;
  slug: string;
  title: string;
  creator: string;
  version: string;
  description: string;
  supportedModes: GameModeId[];
  downloads: number;
  subscriptions: number;
  plays: number;
  rating: number;
  ratingCount: number;
  isSubscribed: boolean;
  isFavorite: boolean;
  updatedAt: string;
  changelog: string[];
  mapData: GameMapDefinition;
}

export interface FriendEntry {
  id: string;
  name: string;
  status: 'In Match' | 'Online - Lobby' | 'In Workshop' | 'Offline';
  premierRating: number;
  rank: string;
  avatarColor: string;
}

export interface PartyMember {
  id: string;
  name: string;
  isLeader: boolean;
  ready: boolean;
  premierRating: number;
  ping: number;
}

export interface InventorySkinItem {
  id: string;
  weaponId: string;
  weaponName: string;
  skinName: string;
  rarity: 'Standard' | 'Tactical' | 'SpecOps' | 'Classified' | 'Prototype' | 'Apex';
  wearFloat: number;
  statTrackKills: number;
  accentColor: string;
  equippedSentinel: boolean;
  equippedVortex: boolean;
}

export interface MatchSummaryRecord {
  id: string;
  date: string;
  mode: GameModeId;
  mapId: string;
  mapName: string;
  sentinelScore: number;
  vortexScore: number;
  playerTeam: TeamId;
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hsPercent: number;
  utilityDamage: number;
  clutches: number;
  mvps: number;
  ratingDelta: number;
  scoreboard: MatchPlayerStats[];
}

export interface RegionStatus {
  id: RegionId;
  name: string;
  city: string;
  pingMs: number;
  status: 'Optimal' | 'Good' | 'High Latency';
  loadPercent: number;
}

export const REGION_SERVERS: RegionStatus[] = [
  { id: 'EU', name: 'Europe Central', city: 'Frankfurt, DE', pingMs: 18, status: 'Optimal', loadPercent: 62 },
  { id: 'NA', name: 'North America East', city: 'Ashburn, US', pingMs: 74, status: 'Good', loadPercent: 58 },
  { id: 'SA', name: 'South America', city: 'São Paulo, BR', pingMs: 142, status: 'High Latency', loadPercent: 41 },
  { id: 'Asia', name: 'Asia Pacific', city: 'Singapore, SG', pingMs: 156, status: 'High Latency', loadPercent: 71 },
  { id: 'Oceania', name: 'Oceania', city: 'Sydney, AU', pingMs: 210, status: 'High Latency', loadPercent: 34 },
  { id: 'Middle East', name: 'Middle East', city: 'Dubai, AE', pingMs: 88, status: 'Good', loadPercent: 47 },
  { id: 'Africa', name: 'Africa South', city: 'Johannesburg, ZA', pingMs: 138, status: 'High Latency', loadPercent: 29 }
];

export const DEFAULT_BUY_PRESETS: BuyPreset[] = [
  {
    id: 'preset_rifle_full',
    name: 'Full Buy (Rifle + Heavy Armor + Utility)',
    primaryWeaponId: 'vanguard_m4s',
    secondaryWeaponId: 'vp9_tactical',
    armorType: 'kevlar_helmet',
    defuseKit: true,
    grenades: ['smoke_grenade', 'flash_grenade', 'he_grenade']
  },
  {
    id: 'preset_eco',
    name: 'Eco Force (Viper-P250 + Light Vest)',
    primaryWeaponId: null,
    secondaryWeaponId: 'viper_p250',
    armorType: 'kevlar_vest',
    defuseKit: false,
    grenades: ['flash_grenade']
  },
  {
    id: 'preset_anti_eco',
    name: 'Anti-Eco SMG (Vector-9 + Heavy Armor)',
    primaryWeaponId: 'vector_9',
    secondaryWeaponId: null,
    armorType: 'kevlar_helmet',
    defuseKit: true,
    grenades: ['smoke_grenade', 'flash_grenade']
  },
  {
    id: 'preset_sniper',
    name: 'AWM Marksman (Monolith .338 + Talon .50)',
    primaryWeaponId: 'monolith_awm',
    secondaryWeaponId: 'talon_50',
    armorType: 'kevlar_helmet',
    defuseKit: true,
    grenades: ['smoke_grenade', 'flash_grenade']
  },
  {
    id: 'preset_utility',
    name: 'Full Tactical Utility Pack',
    primaryWeaponId: null,
    secondaryWeaponId: null,
    armorType: 'none',
    defuseKit: true,
    grenades: ['smoke_grenade', 'flash_grenade', 'he_grenade', 'incendiary_grenade']
  }
];

export interface ActiveMatchState {
  isRunning: boolean;
  isPaused: boolean;
  mode: GameModeId;
  mapId: string;
  region: RegionId;
  playerTeam: 'SENTINEL' | 'VORTEX';
  roundNumber: number;
  maxRounds: number;
  phase: 'BUY_PHASE' | 'LIVE_ROUND' | 'BOMB_PLANTED' | 'ROUND_END' | 'MATCH_END';
  phaseTimerSec: number;
  sentinelScore: number;
  vortexScore: number;
  sentinelLossStreak: number;
  vortexLossStreak: number;
  bombPlanted: boolean;
  bombSite: 'A' | 'B' | null;
  bombPosition: Vector3D | null;
  bombDefuseProgress: number; // 0 to 1
  bombPlantProgress: number; // 0 to 1
  customConfig: CustomGameConfig;
  practiceOptions: {
    infiniteAmmo: boolean;
    showGrenadeTrajectory: boolean;
    showHitboxes: boolean;
    botsFrozen: boolean;
    recoilTargetActive: boolean;
  };
}

export interface GamePlatformStore {
  // Navigation & UI
  activeTab: MainMenuTab;
  setActiveTab: (tab: MainMenuTab) => void;
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean) => void;
  consoleLogs: string[];
  appendConsoleLog: (line: string) => void;

  // Player Profile & Authority
  profile: {
    id: string;
    username: string;
    role: UserRole;
    level: number;
    xp: number;
    competitiveRank: string;
    premierRating: number;
    wins: number;
    losses: number;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    totalDamage: number;
    utilityDamage: number;
    clutches: number;
    entryKills: number;
    playtimeHours: number;
  };

  // Matchmaking & Premier Pick/Ban
  selectedMode: GameModeId;
  setSelectedMode: (mode: GameModeId) => void;
  selectedMapId: string;
  setSelectedMapId: (mapId: string) => void;
  selectedRegion: RegionId;
  setSelectedRegion: (region: RegionId) => void;
  queueState: {
    active: boolean;
    elapsedSec: number;
    estimatedSec: number;
    statusText: string;
  };
  premierVeto: {
    active: boolean;
    bannedMaps: string[];
    pickedMap: string | null;
    step: number;
  };
  startQueue: () => void;
  cancelQueue: () => void;
  banPremierMap: (mapId: string) => void;

  // Active Match & Gameplay
  match: ActiveMatchState;
  customConfig: CustomGameConfig;
  updateCustomConfig: (patch: Partial<CustomGameConfig>) => void;
  startMatch: (mode?: GameModeId, mapId?: string, team?: 'SENTINEL' | 'VORTEX') => void;
  leaveMatch: () => void;
  lastMatchResult: MatchSummaryRecord | null;
  clearLastMatchResult: () => void;
  recordCompletedMatch: (summary: MatchSummaryRecord, replay?: ReplayRecord) => void;

  // Buy Presets & Inventory
  buyPresets: BuyPreset[];
  saveBuyPreset: (preset: BuyPreset) => void;
  inventory: InventorySkinItem[];
  equipSkin: (skinId: string, team: 'SENTINEL' | 'VORTEX') => void;

  // Workshop & Custom Maps
  customMaps: Record<string, GameMapDefinition>;
  workshopMaps: WorkshopMapEntry[];
  publishWorkshopMap: (mapDef: GameMapDefinition, changelogNote?: string) => { ok: boolean; message: string };
  toggleSubscribeWorkshopMap: (id: string) => void;
  toggleFavoriteWorkshopMap: (id: string) => void;
  rateWorkshopMap: (id: string, stars: number) => void;
  deleteWorkshopMap: (id: string) => void;

  // Community: Friends, Party, Reports
  friends: FriendEntry[];
  party: PartyMember[];
  inviteFriendToParty: (friendId: string) => void;
  kickFromParty: (memberId: string) => void;
  togglePartyReady: () => void;

  // Match History & Replays
  matchHistory: MatchSummaryRecord[];
  replays: ReplayRecord[];
  activeReplay: ReplayRecord | null;
  setActiveReplay: (replay: ReplayRecord | null) => void;
}

const DEFAULT_CUSTOM_CONFIG: CustomGameConfig = {
  teamSize: 5,
  roundTimeSec: 115,
  buyTimeSec: 15,
  bombTimerSec: 40,
  startingMoney: 800,
  maxRounds: 24,
  friendlyFire: false,
  infiniteAmmo: false,
  respawnEnabled: false,
  weaponRestriction: 'All',
  botCount: 9,
  botDifficulty: 'Normal',
  gravityMultiplier: 1.0,
  moveSpeedMultiplier: 1.0,
  allowSprint: false,
  serverTickRate: 64,
  mapId: 'harbor_protocol'
};

const INITIAL_WORKSHOP_MAPS: WorkshopMapEntry[] = [
  {
    id: 'ws_harbor_night',
    slug: 'harbor-protocol-night-ops',
    title: 'Harbor Protocol: Night Ops',
    creator: 'Kestrel_VFX',
    version: '1.3.2',
    description:
      'Low-visibility nocturnal variant of Harbor Protocol with high-contrast sodium floodlights and reworked Mid Catwalk cover.',
    supportedModes: ['Competitive', 'Wingman', 'Deathmatch', 'Retakes', 'Practice'],
    downloads: 18420,
    subscriptions: 12910,
    plays: 49200,
    rating: 4.9,
    ratingCount: 842,
    isSubscribed: true,
    isFavorite: true,
    updatedAt: '2026-09-28',
    changelog: [
      'v1.3.2: Adjusted Site A container penetration resistance and improved portal occlusion bounds.',
      'v1.2.0: Added Retakes spawn points and B Canal sound zone.'
    ],
    mapData: {
      ...OFFICIAL_MAPS.harbor_protocol,
      id: 'ws_harbor_night',
      name: 'Harbor Protocol: Night Ops',
      author: 'Kestrel_VFX',
      skyColor: '#04070d',
      fogColor: '#090f1c'
    }
  },
  {
    id: 'ws_aim_duel_arena',
    slug: 'vanguard-1v1-aim-arena',
    title: 'Apex 1v1 Aim & Prefire Arena',
    creator: 'Nexus_Aim',
    version: '2.1.0',
    description:
      'Symmetrical multi-elevation rifle and sniper duel arena engineered for warmup, headshot tracking, and counter-strafe drills.',
    supportedModes: ['Deathmatch', 'Wingman', 'Practice', 'Custom'],
    downloads: 31200,
    subscriptions: 24500,
    plays: 88300,
    rating: 4.85,
    ratingCount: 1420,
    isSubscribed: true,
    isFavorite: false,
    updatedAt: '2026-09-30',
    changelog: [
      'v2.1.0: Added headshot-height plywood wallbang partitions.',
      'v2.0.0: Optimized draw calls to < 25 for 500+ FPS on midrange GPUs.'
    ],
    mapData: {
      ...OFFICIAL_MAPS.foundry_wing,
      id: 'ws_aim_duel_arena',
      name: 'Apex 1v1 Aim Arena',
      author: 'Nexus_Aim'
    }
  },
  {
    id: 'ws_citadel_retake',
    slug: 'citadel-spire-executes',
    title: 'Citadel Spire: Utility Executes',
    creator: 'Operative_Zero',
    version: '1.1.0',
    description:
      'Tactical execute & retake training configuration of Citadel Spire with marked grenade lineup beacons.',
    supportedModes: ['Retakes', 'Practice', 'Competitive'],
    downloads: 9640,
    subscriptions: 6180,
    plays: 19400,
    rating: 4.75,
    ratingCount: 390,
    isSubscribed: false,
    isFavorite: false,
    updatedAt: '2026-09-19',
    changelog: ['v1.1.0: Added A-Site Server Core post-plant positions.'],
    mapData: {
      ...OFFICIAL_MAPS.citadel_spire,
      id: 'ws_citadel_retake',
      name: 'Citadel Spire: Utility Executes',
      author: 'Operative_Zero'
    }
  }
];

const INITIAL_INVENTORY: InventorySkinItem[] = [
  {
    id: 'skin_1',
    weaponId: 'harbinger_47',
    weaponName: 'Harbinger-47',
    skinName: 'Solaris Obsidian',
    rarity: 'Apex',
    wearFloat: 0.0124,
    statTrackKills: 1428,
    accentColor: '#f59e0b',
    equippedSentinel: false,
    equippedVortex: true
  },
  {
    id: 'skin_2',
    weaponId: 'vanguard_m4s',
    weaponName: 'Vanguard-M4S',
    skinName: 'Cryo-Protocol Zero',
    rarity: 'Classified',
    wearFloat: 0.0281,
    statTrackKills: 1190,
    accentColor: '#06b6d4',
    equippedSentinel: true,
    equippedVortex: false
  },
  {
    id: 'skin_3',
    weaponId: 'monolith_awm',
    weaponName: 'Monolith-AWM .338',
    skinName: 'Hyperion Valence',
    rarity: 'Apex',
    wearFloat: 0.0089,
    statTrackKills: 864,
    accentColor: '#ef4444',
    equippedSentinel: true,
    equippedVortex: true
  },
  {
    id: 'skin_4',
    weaponId: 'talon_50',
    weaponName: 'Talon .50 Heavy',
    skinName: 'Cobalt forged',
    rarity: 'SpecOps',
    wearFloat: 0.045,
    statTrackKills: 512,
    accentColor: '#38bdf8',
    equippedSentinel: true,
    equippedVortex: true
  },
  {
    id: 'skin_5',
    weaponId: 'combat_blade',
    weaponName: 'Karambit MK-IV',
    skinName: 'Phase Shift Emerald',
    rarity: 'Apex',
    wearFloat: 0.0042,
    statTrackKills: 215,
    accentColor: '#10b981',
    equippedSentinel: true,
    equippedVortex: true
  },
  {
    id: 'skin_6',
    weaponId: 'vp9_tactical',
    weaponName: 'VP-9 Tactical',
    skinName: 'Aegis Carbon',
    rarity: 'Tactical',
    wearFloat: 0.061,
    statTrackKills: 349,
    accentColor: '#22d3ee',
    equippedSentinel: true,
    equippedVortex: false
  }
];

const INITIAL_MATCH_HISTORY: MatchSummaryRecord[] = [
  {
    id: 'match_hist_1',
    date: '2026-10-02 09:15 UTC',
    mode: 'Premier',
    mapId: 'harbor_protocol',
    mapName: 'Harbor Protocol',
    sentinelScore: 13,
    vortexScore: 10,
    playerTeam: 'SENTINEL',
    result: 'VICTORY',
    kills: 26,
    deaths: 14,
    assists: 7,
    adr: 108.4,
    hsPercent: 57.7,
    utilityDamage: 245,
    clutches: 2,
    mvps: 5,
    ratingDelta: 265,
    scoreboard: []
  },
  {
    id: 'match_hist_2',
    date: '2026-10-01 22:40 UTC',
    mode: 'Competitive',
    mapId: 'citadel_spire',
    mapName: 'Citadel Spire',
    sentinelScore: 13,
    vortexScore: 8,
    playerTeam: 'VORTEX',
    result: 'VICTORY',
    kills: 22,
    deaths: 13,
    assists: 5,
    adr: 98.2,
    hsPercent: 50.0,
    utilityDamage: 180,
    clutches: 1,
    mvps: 4,
    ratingDelta: 210,
    scoreboard: []
  },
  {
    id: 'match_hist_3',
    date: '2026-10-01 19:05 UTC',
    mode: 'Wingman',
    mapId: 'foundry_wing',
    mapName: 'Foundry Core',
    sentinelScore: 9,
    vortexScore: 6,
    playerTeam: 'SENTINEL',
    result: 'VICTORY',
    kills: 14,
    deaths: 7,
    assists: 4,
    adr: 116.0,
    hsPercent: 64.3,
    utilityDamage: 130,
    clutches: 2,
    mvps: 4,
    ratingDelta: 145,
    scoreboard: []
  }
];

const INITIAL_REPLAYS: ReplayRecord[] = [
  {
    id: 'rep_demo_1',
    title: 'Premier Championship Final — Harbor Protocol (13-10)',
    mapId: 'harbor_protocol',
    mapName: 'Harbor Protocol',
    mode: 'Premier',
    date: '2026-10-02 09:15 UTC',
    durationSec: 32,
    sentinelScore: 13,
    vortexScore: 10,
    winner: 'SENTINEL',
    rounds: 3,
    tickRate: 64,
    events: Array.from({ length: 65 }, (_, idx) => {
      const t = idx * 0.5;
      const round = t < 11 ? 1 : t < 22 ? 2 : 3;
      const phaseAngle = t * 0.45;
      return {
        tick: idx * 32,
        timeSec: t,
        type: idx === 16 || idx === 38 || idx === 58 ? 'kill' : idx === 25 ? 'bomb_planted' : 'snapshot',
        round,
        actors: [
          {
            id: 'p_zero',
            name: 'Operative_Zero',
            team: 'SENTINEL',
            pos: [-18 + Math.sin(phaseAngle) * 10, 0, -16 + Math.cos(phaseAngle) * 8],
            yaw: phaseAngle,
            pitch: 0,
            hp: 100,
            weapon: 'vanguard_m4s'
          },
          {
            id: 'p_valk',
            name: 'Valkyrie_99',
            team: 'SENTINEL',
            pos: [16 + Math.cos(phaseAngle) * 6, 0, -18 + Math.sin(phaseAngle) * 7],
            yaw: -phaseAngle,
            pitch: 0,
            hp: 85,
            weapon: 'monolith_awm'
          },
          {
            id: 'p_havoc',
            name: 'Havoc',
            team: 'VORTEX',
            pos: [-24 + Math.cos(phaseAngle) * 8, 0, 10 - (t % 10) * 2.2],
            yaw: 0.2,
            pitch: 0,
            hp: idx > 38 && round === 2 ? 0 : 100,
            weapon: 'harbinger_47'
          },
          {
            id: 'p_wraith',
            name: 'Wraith',
            team: 'VORTEX',
            pos: [22 - Math.sin(phaseAngle) * 7, 0, 12 - (t % 10) * 2.4],
            yaw: -0.3,
            pitch: 0,
            hp: idx > 58 ? 0 : 90,
            weapon: 'solaris_553'
          }
        ],
        payload:
          idx === 16
            ? { killer: 'Operative_Zero', victim: 'Havoc', weapon: 'Vanguard-M4S', headshot: true }
            : idx === 25
            ? { planter: 'Wraith', site: 'A' }
            : idx === 38
            ? { killer: 'Valkyrie_99', victim: 'Havoc', weapon: 'Monolith-AWM .338', headshot: false }
            : idx === 58
            ? { killer: 'Operative_Zero', victim: 'Wraith', weapon: 'Karambit MK-IV', headshot: false }
            : undefined
      };
    })
  }
];

export const useGamePlatformStore = create<GamePlatformStore>((set, get) => ({
  activeTab: 'PLAY',
  setActiveTab: (tab) => set({ activeTab: tab }),
  consoleOpen: false,
  setConsoleOpen: (open) => set({ consoleOpen: open }),
  consoleLogs: [
    '[VANGUARD ENGINE v2.4.0] Initialized WebGL2/Three.js Competitive Renderer',
    '[SMART OCCLUSION] Frustum + Rear-Hemisphere + Solid-Wall Ray Occluder + 3-Tier LOD Active',
    '[NETWORK] Authoritative 64-Tick WebSocket Sync Ready (Type "help" for console commands)'
  ],
  appendConsoleLog: (line) =>
    set((state) => ({ consoleLogs: [...state.consoleLogs.slice(-120), line] })),

  profile: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'Operative_Zero',
    role: 'Admin',
    level: 42,
    xp: 184500,
    competitiveRank: 'Apex Sovereign',
    premierRating: 21450,
    wins: 148,
    losses: 62,
    kills: 3840,
    deaths: 2410,
    assists: 985,
    headshots: 2074,
    totalDamage: 412500,
    utilityDamage: 34200,
    clutches: 49,
    entryKills: 412,
    playtimeHours: 342
  },

  selectedMode: 'Competitive',
  setSelectedMode: (mode) => {
    const defaultMap =
      mode === 'Wingman'
        ? 'foundry_wing'
        : mode === 'Practice'
        ? 'proving_grounds'
        : get().selectedMapId;
    set({ selectedMode: mode, selectedMapId: defaultMap });
  },
  selectedMapId: 'harbor_protocol',
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),
  selectedRegion: 'EU',
  setSelectedRegion: (region) => set({ selectedRegion: region }),

  queueState: {
    active: false,
    elapsedSec: 0,
    estimatedSec: 4,
    statusText: 'Idle'
  },
  premierVeto: {
    active: false,
    bannedMaps: [],
    pickedMap: null,
    step: 0
  },

  startQueue: () => {
    const { selectedMode } = get();
    if (selectedMode === 'Premier') {
      set({
        premierVeto: {
          active: true,
          bannedMaps: [],
          pickedMap: null,
          step: 1
        }
      });
      return;
    }
    set({
      queueState: {
        active: true,
        elapsedSec: 0,
        estimatedSec: 3,
        statusText: `Searching ${selectedMode} Servers in ${get().selectedRegion}...`
      }
    });
  },

  cancelQueue: () =>
    set({
      queueState: { active: false, elapsedSec: 0, estimatedSec: 3, statusText: 'Idle' },
      premierVeto: { active: false, bannedMaps: [], pickedMap: null, step: 0 }
    }),

  banPremierMap: (mapId) => {
    const { premierVeto } = get();
    if (premierVeto.bannedMaps.includes(mapId)) return;
    const allMaps = ['harbor_protocol', 'citadel_spire', 'foundry_wing', 'ws_harbor_night'];
    const nextBanned = [...premierVeto.bannedMaps, mapId];
    const remaining = allMaps.filter((m) => !nextBanned.includes(m));

    if (remaining.length <= 1) {
      const picked = remaining[0] || 'harbor_protocol';
      set({
        selectedMapId: picked,
        premierVeto: { active: false, bannedMaps: nextBanned, pickedMap: picked, step: 4 }
      });
      get().startMatch('Premier', picked, 'SENTINEL');
    } else {
      set({
        premierVeto: {
          ...premierVeto,
          bannedMaps: nextBanned,
          step: premierVeto.step + 1
        }
      });
    }
  },

  customConfig: { ...DEFAULT_CUSTOM_CONFIG },
  updateCustomConfig: (patch) =>
    set((state) => ({ customConfig: { ...state.customConfig, ...patch } })),

  match: {
    isRunning: false,
    isPaused: false,
    mode: 'Competitive',
    mapId: 'harbor_protocol',
    region: 'EU',
    playerTeam: 'SENTINEL',
    roundNumber: 1,
    maxRounds: 24,
    phase: 'BUY_PHASE',
    phaseTimerSec: 15,
    sentinelScore: 0,
    vortexScore: 0,
    sentinelLossStreak: 0,
    vortexLossStreak: 0,
    bombPlanted: false,
    bombSite: null,
    bombPosition: null,
    bombDefuseProgress: 0,
    bombPlantProgress: 0,
    customConfig: { ...DEFAULT_CUSTOM_CONFIG },
    practiceOptions: {
      infiniteAmmo: true,
      showGrenadeTrajectory: true,
      showHitboxes: false,
      botsFrozen: false,
      recoilTargetActive: true
    }
  },

  startMatch: (modeOverride, mapOverride, teamOverride) => {
    const state = get();
    const mode = modeOverride || state.selectedMode;
    const mapId = mapOverride || (mode === 'Custom' ? state.customConfig.mapId : state.selectedMapId);
    const playerTeam = teamOverride || 'SENTINEL';

    const maxRounds =
      mode === 'Wingman'
        ? 16
        : mode === 'Retakes' || mode === 'Rush'
        ? 12
        : mode === 'Casual'
        ? 15
        : mode === 'Custom'
        ? state.customConfig.maxRounds
        : 24;

    const initialPhase =
      mode === 'Retakes'
        ? 'BOMB_PLANTED'
        : mode === 'Deathmatch' || mode === 'Practice'
        ? 'LIVE_ROUND'
        : 'BUY_PHASE';

    const initialTimer =
      mode === 'Retakes'
        ? 40
        : mode === 'Deathmatch'
        ? 600
        : mode === 'Practice'
        ? 3600
        : mode === 'Custom'
        ? state.customConfig.buyTimeSec
        : 12;

    set({
      queueState: { active: false, elapsedSec: 0, estimatedSec: 3, statusText: 'Idle' },
      // Retain the completed veto record (which maps were banned / picked) for the match report.
      premierVeto: {
        active: false,
        bannedMaps: state.premierVeto.bannedMaps,
        pickedMap: state.premierVeto.pickedMap,
        step: state.premierVeto.step
      },
      match: {
        isRunning: true,
        isPaused: false,
        mode,
        mapId,
        region: state.selectedRegion,
        playerTeam,
        roundNumber: 1,
        maxRounds,
        phase: initialPhase,
        phaseTimerSec: initialTimer,
        sentinelScore: 0,
        vortexScore: 0,
        sentinelLossStreak: 0,
        vortexLossStreak: 0,
        bombPlanted: mode === 'Retakes',
        bombSite: mode === 'Retakes' ? 'A' : null,
        bombPosition: mode === 'Retakes' ? { x: -28, y: 0.2, z: -18 } : null,
        bombDefuseProgress: 0,
        bombPlantProgress: 0,
        customConfig: { ...state.customConfig },
        practiceOptions: {
          infiniteAmmo: mode === 'Practice' || (mode === 'Custom' && state.customConfig.infiniteAmmo),
          showGrenadeTrajectory: mode === 'Practice',
          showHitboxes: false,
          botsFrozen: false,
          recoilTargetActive: mode === 'Practice'
        }
      }
    });
  },

  leaveMatch: () =>
    set((state) => ({
      match: { ...state.match, isRunning: false, isPaused: false }
    })),

  lastMatchResult: null,
  clearLastMatchResult: () => set({ lastMatchResult: null }),

  recordCompletedMatch: (summary, replay) =>
    set((state) => ({
      lastMatchResult: summary,
      matchHistory: [summary, ...state.matchHistory],
      replays: replay ? [replay, ...state.replays] : state.replays,
      profile: {
        ...state.profile,
        wins: summary.result === 'VICTORY' ? state.profile.wins + 1 : state.profile.wins,
        losses: summary.result === 'DEFEAT' ? state.profile.losses + 1 : state.profile.losses,
        kills: state.profile.kills + summary.kills,
        deaths: state.profile.deaths + summary.deaths,
        assists: state.profile.assists + summary.assists,
        premierRating: Math.max(1000, state.profile.premierRating + summary.ratingDelta),
        xp: state.profile.xp + 1250
      }
    })),

  buyPresets: [...DEFAULT_BUY_PRESETS],
  saveBuyPreset: (preset) =>
    set((state) => {
      const exists = state.buyPresets.some((p) => p.id === preset.id);
      return {
        buyPresets: exists
          ? state.buyPresets.map((p) => (p.id === preset.id ? preset : p))
          : [...state.buyPresets, preset]
      };
    }),

  inventory: [...INITIAL_INVENTORY],
  equipSkin: (skinId, team) =>
    set((state) => {
      const target = state.inventory.find((i) => i.id === skinId);
      if (!target) return {};
      return {
        inventory: state.inventory.map((item) => {
          if (item.weaponId !== target.weaponId) return item;
          if (team === 'SENTINEL') return { ...item, equippedSentinel: item.id === skinId };
          return { ...item, equippedVortex: item.id === skinId };
        })
      };
    }),

  customMaps: {
    ws_harbor_night: INITIAL_WORKSHOP_MAPS[0].mapData,
    ws_aim_duel_arena: INITIAL_WORKSHOP_MAPS[1].mapData,
    ws_citadel_retake: INITIAL_WORKSHOP_MAPS[2].mapData
  },
  workshopMaps: [...INITIAL_WORKSHOP_MAPS],

  publishWorkshopMap: (mapDef, changelogNote = 'Published via Browser Map Editor') => {
    const state = get();
    const id = mapDef.id.startsWith('ws_') ? mapDef.id : `ws_${mapDef.id}`;
    const updatedMap: GameMapDefinition = { ...mapDef, id };
    const existing = state.workshopMaps.find((w) => w.id === id);

    const entry: WorkshopMapEntry = existing
      ? {
          ...existing,
          title: updatedMap.name,
          version: updatedMap.version,
          description: updatedMap.description,
          supportedModes: updatedMap.supportedModes,
          updatedAt: new Date().toISOString().slice(0, 10),
          changelog: [`v${updatedMap.version}: ${changelogNote}`, ...existing.changelog],
          mapData: updatedMap
        }
      : {
          id,
          slug: updatedMap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: updatedMap.name,
          creator: state.profile.username,
          version: updatedMap.version || '1.0.0',
          description: updatedMap.description || 'Original tactical map created in Vanguard Map Studio.',
          supportedModes: updatedMap.supportedModes,
          downloads: 1,
          subscriptions: 1,
          plays: 1,
          rating: 5.0,
          ratingCount: 1,
          isSubscribed: true,
          isFavorite: true,
          updatedAt: new Date().toISOString().slice(0, 10),
          changelog: [`v${updatedMap.version || '1.0.0'}: ${changelogNote}`],
          mapData: updatedMap
        };

    set({
      customMaps: { ...state.customMaps, [id]: updatedMap },
      workshopMaps: existing
        ? state.workshopMaps.map((w) => (w.id === id ? entry : w))
        : [entry, ...state.workshopMaps]
    });

    return { ok: true, message: `Published "${updatedMap.name}" (${id}) to Workshop!` };
  },

  toggleSubscribeWorkshopMap: (id) =>
    set((state) => ({
      workshopMaps: state.workshopMaps.map((w) =>
        w.id === id
          ? {
              ...w,
              isSubscribed: !w.isSubscribed,
              subscriptions: w.isSubscribed ? w.subscriptions - 1 : w.subscriptions + 1
            }
          : w
      )
    })),

  toggleFavoriteWorkshopMap: (id) =>
    set((state) => ({
      workshopMaps: state.workshopMaps.map((w) =>
        w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
      )
    })),

  rateWorkshopMap: (id, stars) =>
    set((state) => ({
      workshopMaps: state.workshopMaps.map((w) => {
        if (w.id !== id) return w;
        const nextCount = w.ratingCount + 1;
        const nextAvg = Number(((w.rating * w.ratingCount + stars) / nextCount).toFixed(2));
        return { ...w, rating: nextAvg, ratingCount: nextCount };
      })
    })),

  deleteWorkshopMap: (id) =>
    set((state) => ({
      workshopMaps: state.workshopMaps.filter((w) => w.id !== id)
    })),

  friends: [
    { id: 'f1', name: 'Valkyrie_99', status: 'Online - Lobby', premierRating: 20110, rank: 'Obsidian Elite', avatarColor: '#06b6d4' },
    { id: 'f2', name: 'Kestrel_VFX', status: 'In Workshop', premierRating: 18920, rank: 'Diamond Vanguard I', avatarColor: '#f59e0b' },
    { id: 'f3', name: 'Nexus_Aim', status: 'In Match', premierRating: 16400, rank: 'Platinum Striker III', avatarColor: '#10b981' },
    { id: 'f4', name: 'Cipher_64', status: 'Online - Lobby', premierRating: 19350, rank: 'Diamond Vanguard II', avatarColor: '#a855f7' }
  ],

  party: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Operative_Zero',
      isLeader: true,
      ready: true,
      premierRating: 21450,
      ping: 18
    }
  ],

  inviteFriendToParty: (friendId) =>
    set((state) => {
      const friend = state.friends.find((f) => f.id === friendId);
      if (!friend || state.party.some((p) => p.id === friend.id) || state.party.length >= 5) return {};
      return {
        party: [
          ...state.party,
          {
            id: friend.id,
            name: friend.name,
            isLeader: false,
            ready: true,
            premierRating: friend.premierRating,
            ping: 22
          }
        ]
      };
    }),

  kickFromParty: (memberId) =>
    set((state) => ({
      party: state.party.filter((p) => p.id !== memberId || p.isLeader)
    })),

  togglePartyReady: () =>
    set((state) => ({
      party: state.party.map((p) => (p.isLeader ? { ...p, ready: !p.ready } : p))
    })),

  matchHistory: [...INITIAL_MATCH_HISTORY],
  replays: [...INITIAL_REPLAYS],
  activeReplay: null,
  setActiveReplay: (replay) => set({ activeReplay: replay })
}));
