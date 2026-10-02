export type TeamId = 'SENTINEL' | 'VORTEX' | 'SPECTATOR';

export type GameModeId =
  | 'Competitive'
  | 'Premier'
  | 'Wingman'
  | 'Rush'
  | 'Casual'
  | 'Deathmatch'
  | 'Retakes'
  | 'Practice'
  | 'Custom';

export type RegionId = 'EU' | 'NA' | 'SA' | 'Asia' | 'Oceania' | 'Middle East' | 'Africa';

export type UserRole = 'User' | 'Creator' | 'Moderator' | 'Admin';

export type BotDifficulty = 'Easy' | 'Normal' | 'Hard' | 'Expert';

export type WeaponCategory =
  | 'Pistols'
  | 'SMGs'
  | 'Shotguns'
  | 'Rifles'
  | 'Snipers'
  | 'MachineGuns'
  | 'Melee'
  | 'Grenades'
  | 'Equipment';

export type WeaponSlot = 'primary' | 'secondary' | 'melee' | 'grenade' | 'objective';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface WeaponSpec {
  id: string;
  name: string;
  code: string;
  category: WeaponCategory;
  slot: WeaponSlot;
  team: 'SENTINEL' | 'VORTEX' | 'BOTH';
  price: number;
  killReward: number;
  damage: number;
  pellets?: number;
  range: number;
  rangeModifier: number; // Damage retention per 15m (e.g. 0.96)
  armorPenetration: number; // 0.0 to 1.0
  wallPenetration: number; // 0 to 300
  fireRateRpm: number;
  automatic: boolean;
  magazineSize: number;
  reserveAmmo: number;
  reloadTimeSec: number;
  moveSpeedMultiplier: number; // 1.0 = 250 u/s knife speed
  accuracyStanding: number; // base spread in radians
  accuracyCrouching: number;
  accuracyMoving: number;
  accuracyJumping: number;
  accuracyScoped?: number;
  recoilVertical: number;
  recoilHorizontal: number;
  recoilRecoveryRate: number;
  recoilPattern: Array<[number, number]>; // [pitchDelta, yawDelta] per shot
  headMultiplier: number;
  chestMultiplier: number;
  stomachMultiplier: number;
  legMultiplier: number;
  scopeLevels?: number[]; // FOV values when scoped, e.g. [40, 15]
  suppressed?: boolean;
  tracerFrequency: number; // 0 = none, 1 = every shot, 2 = every 2nd shot
  grenadeType?: 'smoke' | 'flash' | 'he' | 'incendiary' | 'decoy';
  description: string;
  accentColor: string;
}

export type MapObjectType =
  | 'floor'
  | 'wall'
  | 'cube'
  | 'ramp'
  | 'stairs'
  | 'cylinder'
  | 'doorway'
  | 'window'
  | 'prop'
  | 'cover'
  | 'ladder'
  | 'water'
  | 'spawn_sentinel'
  | 'spawn_vortex'
  | 'buy_zone'
  | 'bomb_site_a'
  | 'bomb_site_b'
  | 'objective_zone'
  | 'occlusion_zone'
  | 'visibility_portal'
  | 'sound_zone'
  | 'light';

export type MaterialSurface = 'concrete' | 'metal' | 'wood' | 'tile' | 'sand' | 'glass' | 'water' | 'energy';

export type LodTier = 'always' | 'near' | 'medium' | 'far';

export interface MapObjectDef {
  id: string;
  name: string;
  type: MapObjectType;
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  material: MaterialSurface;
  collidable: boolean;
  occluder: boolean; // Blocks vision in Smart Occlusion system
  lodTier: LodTier; // Used for progressive streaming & object distance culling
  roomId?: string; // Used for portal/room visibility culling
  layer?: string;
  groupId?: string;
  penetrationResistance?: number; // 0.0 (thin wood) to 1.0 (solid reinforced wall)
}

export interface MapPortalDef {
  id: string;
  fromRoom: string;
  toRoom: string;
  position: [number, number, number];
  size: [number, number, number];
}

export interface MapWaypoint {
  id: string;
  position: [number, number, number];
  connections: string[];
  tag?: 'siteA' | 'siteB' | 'mid' | 'sentinelSpawn' | 'vortexSpawn' | 'cover';
}

export interface GameMapDefinition {
  id: string;
  name: string;
  subtitle: string;
  author: string;
  version: string;
  description: string;
  supportedModes: GameModeId[];
  ambientColor: string;
  skyColor: string;
  fogColor: string;
  sunDirection: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  objects: MapObjectDef[];
  portals: MapPortalDef[];
  waypoints: MapWaypoint[];
  callouts: Array<{ name: string; position: [number, number, number]; radius: number }>;
}

export interface CustomGameConfig {
  teamSize: number;
  roundTimeSec: number;
  buyTimeSec: number;
  bombTimerSec: number;
  startingMoney: number;
  maxRounds: number;
  friendlyFire: boolean;
  infiniteAmmo: boolean;
  respawnEnabled: boolean;
  weaponRestriction: 'All' | 'PistolsOnly' | 'SnipersOnly' | 'RiflesOnly';
  botCount: number;
  botDifficulty: BotDifficulty;
  gravityMultiplier: number;
  moveSpeedMultiplier: number;
  allowSprint: boolean;
  serverTickRate: 64 | 128;
  mapId: string;
}

export interface KillFeedEntry {
  id: string;
  timestamp: number;
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weaponName: string;
  isHeadshot: boolean;
  isWallbang: boolean;
  isThroughSmoke: boolean;
}

export interface MatchPlayerStats {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  alive: boolean;
  health: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  hasBomb: boolean;
  money: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damageDealt: number;
  utilityDamage: number;
  entryKills: number;
  clutches: number;
  mvps: number;
  score: number;
  ping: number;
  currentWeapon: string;
  position: Vector3D;
  yaw: number;
  pitch: number;
  crouching: boolean;
}

export interface ReplayEvent {
  tick: number;
  timeSec: number;
  type: 'snapshot' | 'kill' | 'fire' | 'grenade' | 'bomb_planted' | 'bomb_defused' | ' bomb_exploded' | 'round_start' | 'round_end';
  round: number;
  actors?: Array<{
    id: string;
    name: string;
    team: TeamId;
    pos: [number, number, number];
    yaw: number;
    pitch: number;
    hp: number;
    weapon: string;
  }>;
  payload?: Record<string, unknown>;
}

export interface ReplayRecord {
  id: string;
  title: string;
  mapId: string;
  mapName: string;
  mode: GameModeId;
  date: string;
  durationSec: number;
  sentinelScore: number;
  vortexScore: number;
  winner: 'SENTINEL' | 'VORTEX' | 'DRAW';
  rounds: number;
  tickRate: number;
  events: ReplayEvent[];
}
