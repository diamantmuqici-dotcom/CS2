/**
 * Compatibility match simulation.
 *
 * Runs a real, playable match using the SAME shared game modules as the 3D
 * engine — `physicsEngine` for movement and collision, `weapons` for the
 * damage model, `roundLogic` for round/economy rules and `officialMaps` for
 * the authored maps. Only the presentation differs: positions are drawn by
 * `TacticalRenderer` on a 2D canvas instead of by three.js.
 *
 * This exists so a machine with no WebGL2 context still gets a functional
 * game rather than an error page.
 */

import { Vector3D, GameModeId, TeamId, GameMapDefinition } from '../../shared/types';
import { WEAPON_SPECS, calculateWeaponDamage } from '../../shared/weapons';
import type { WeaponSpec } from '../../shared/types';
import {
  buildMapAABBs,
  hasLineOfSight,
  stepPlayerPhysics,
  type AABB,
  type MovementInput,
  type PlayerPhysicsState
} from '../physics/physicsEngine';
import { checkMatchComplete, evaluateRoundEnd, getModeConfig, calculateRoundPayout } from '../modes/roundLogic';
import { getMapById } from '../maps/officialMaps';
import { TacticalRenderer, type TacticalActor, type TacticalObjective, type TacticalScene } from '../rendering/tactical-renderer';
import { MatchResultPayload } from './gameEngine';

interface CompatPlayer {
  id: string;
  name: string;
  team: TeamId;
  isLocal: boolean;
  physics: PlayerPhysicsState;
  health: number;
  armor: number;
  hasHelmet: boolean;
  alive: boolean;
  weapon: WeaponSpec;
  reserveAmmo: number;
  clip: number;
  kills: number;
  deaths: number;
  money: number;
  yaw: number;
  lastShotAt: number;
  diedAt: number;
  hasLosToLocal: boolean;
}

export interface CompatHud {
  health: number;
  armor: number;
  ammo: number;
  reserve: number;
  money: number;
  weaponName: string;
  roundTimeSec: number;
  bombTimeSec: number | null;
  phase: string;
  sentinelScore: number;
  vortexScore: number;
  alive: { sentinel: number; vortex: number };
  killFeed: Array<{ killer: string; victim: string; weapon: string; timeSec: number }>;
  announcement: string | null;
  callout: string;
  contextLost: boolean;
}

const FIXED_STEP = 1 / 60;
const TICK_RADIUS = 0.5;

export class CompatibilityMatch {
  private renderer = new TacticalRenderer();
  private aabbs: AABB[] = [];
  private players: CompatPlayer[] = [];
  private objectives: TacticalObjective[] = [];
  private markers: TacticalScene['markers'] = [];

  private map!: GameMapDefinition;
  private mode: GameModeId = 'Competitive';
  private maxRounds = 24;

  private sentinelScore = 0;
  private vortexScore = 0;
  private roundTimeSec = 115;
  private bombTimeSec: number | null = null;
  private bombPlanted = false;
  private phaseLabel = 'BUY PHASE';
  private announcement: string | null = null;
  private announcementUntil = 0;
  private killFeed: CompatHud['killFeed'] = [];

  private accumulator = 0;
  private lastFrameTime = 0;
  private running = false;
  private rafId = 0;
  private elapsedSec = 0;

  private yaw = 0;
  private input: MovementInput = {
    forward: 0,
    right: 0,
    jumpPressed: false,
    crouchHeld: false,
    walkHeld: false,
    sprintHeld: false,
    yaw: 0
  };
  private firing = false;
  private keys = new Set<string>();
  private onFrame: ((hud: CompatHud) => void) | null = null;
  private onComplete: ((result: MatchResultPayload) => void) | null = null;
  private roundIndex = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    mode: GameModeId,
    mapId: string,
    playerTeam: TeamId,
    customMaps: Record<string, GameMapDefinition> = {}
  ) {
    this.mode = mode;
    this.map = getMapById(mapId, customMaps);
    this.aabbs = buildMapAABBs(this.map);
    const cfg = getModeConfig(mode);
    this.maxRounds = cfg.maxRounds;
    this.roundTimeSec = mode === 'Deathmatch' ? 600 : mode === 'Practice' ? 3600 : cfg.roundTimeSec;
    this.spawnTeams(playerTeam, cfg.teamSize);
    this.buildObjectives();
  }

  /** True when a 2D drawing surface is available for this canvas. */
  static isSupported(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const probe = document.createElement('canvas');
      return !!probe.getContext('2d');
    } catch {
      return false;
    }
  }

  setFrameCallback(cb: (hud: CompatHud) => void): void {
    this.onFrame = cb;
  }

  setCompleteCallback(cb: (result: MatchResultPayload) => void): void {
    this.onComplete = cb;
  }

  private spawnTeams(playerTeam: TeamId, teamSize: number): void {
    const spawnA = this.map.objects.filter((o) => o.type === 'spawn_sentinel');
    const spawnB = this.map.objects.filter((o) => o.type === 'spawn_vortex');

    const make = (id: string, name: string, team: TeamId, isLocal: boolean, slot: number): CompatPlayer => {
      const spawns = team === 'SENTINEL' ? spawnA : spawnB;
      const spawn = spawns.length > 0 ? spawns[slot % spawns.length] : null;
      const px = spawn ? spawn.position[0] : 0;
      const pz = spawn ? spawn.position[2] : 0;
      const weapon = WEAPON_SPECS['vanguard_m4a'] ?? Object.values(WEAPON_SPECS)[0];
      return {
        id,
        name,
        team,
        isLocal,
        physics: {
          position: { x: px, y: 0, z: pz } as Vector3D,
          velocity: { x: 0, y: 0, z: 0 } as Vector3D,
          grounded: true,
          crouching: false,
          walking: false,
          sprinting: false,
          onLadder: false,
          inWater: false,
          eyeHeight: 1.66,
          groundSurface: 'concrete'
        },
        health: 100,
        armor: 100,
        hasHelmet: true,
        alive: true,
        weapon,
        reserveAmmo: weapon.magazineSize * 3,
        clip: weapon.magazineSize,
        kills: 0,
        deaths: 0,
        money: 800,
        yaw: team === 'SENTINEL' ? 0 : Math.PI,
        lastShotAt: -99,
        diedAt: -99,
        hasLosToLocal: false
      };
    };

    this.players = [make('local_player', 'YOU', playerTeam, true, 0)];
    for (let i = 1; i < teamSize; i++) {
      this.players.push(make(`ally_${i}`, `SENTINEL-${i}`, playerTeam, false, i));
    }
    const enemyTeam: TeamId = playerTeam === 'SENTINEL' ? 'VORTEX' : 'SENTINEL';
    for (let i = 0; i < teamSize; i++) {
      this.players.push(make(`enemy_${i}`, `${enemyTeam}-${i + 1}`, enemyTeam, false, i));
    }

    // Face the team at the other spawn.
    this.yaw = playerTeam === 'SENTINEL' ? 0 : Math.PI;
  }

  private buildObjectives(): void {
    this.objectives = this.map.objects
      .filter((o) => ['bomb_site_a', 'bomb_site_b', 'buy_zone', 'spawn_sentinel', 'spawn_vortex'].includes(o.type))
      .map((o) => ({
        kind:
          o.type === 'bomb_site_a'
            ? ('siteA' as const)
            : o.type === 'bomb_site_b'
              ? ('siteB' as const)
              : o.type === 'buy_zone'
                ? ('buyZone' as const)
                : ('spawn' as const),
        x: o.position[0],
        z: o.position[2],
        radius: Math.max(o.size[0], o.size[2]) / 2,
        active: o.type.startsWith('bomb_site') || o.type === 'buy_zone'
      }));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.attachInput();
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.detachInput();
  }

  dispose(): void {
    this.stop();
    this.renderer.detach();
  }

  private attachInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  private detachInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onBlur = () => {
    this.keys.clear();
    this.firing = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyR') this.reload();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.firing = true;
  };

  private onMouseUp = () => {
    this.firing = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    // Mouse deltas are consumed once per displayed frame, matching the 3D
    // engine's input model.
    this.yaw -= e.movementX * 0.0022;
    this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  };

  private readInput(): MovementInput {
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const right = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    return {
      forward: fwd,
      right,
      jumpPressed: this.keys.has('Space'),
      crouchHeld: this.keys.has('ControlLeft') || this.keys.has('KeyC'),
      walkHeld: this.keys.has('ShiftLeft') && !this.keys.has('Space'),
      sprintHeld: this.keys.has('ShiftLeft'),
      yaw: this.yaw
    };
  }

  private frame(): void {
    const now = performance.now();
    // Clamp so a backgrounded tab does not fast-forward the whole match.
    const delta = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (document.visibilityState === 'hidden') return;

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < 5) {
      this.tick(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps++;
    }

    this.draw();
  }

  private tick(dt: number): void {
    this.elapsedSec += dt;
    this.input = this.readInput();

    const local = this.players[0];
    if (local.alive) {
      local.yaw = this.yaw;
      local.physics = stepPlayerPhysics(local.physics, this.input, this.aabbs, dt, {
        weaponSpeedMultiplier: 1,
        gravityMultiplier: 1,
        moveSpeedMultiplier: 1,
        allowSprint: true
      });
    }

    for (const p of this.players) {
      if (!p.alive || p.isLocal) continue;
      this.tickBot(p, dt);
    }

    this.updateLos();
    if (local.alive && this.firing) this.tryFire(local);

    this.updateRound(dt);
  }

  private tickBot(bot: CompatPlayer, dt: number): void {
    // Face the nearest living enemy, walk toward them, fire when in sight.
    const enemies = this.players.filter((p) => p.alive && p.team !== bot.team);
    let nearest: CompatPlayer | null = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = dist2D(bot.physics.position, e.physics.position);
      if (d < bestDist) {
        bestDist = d;
        nearest = e;
      }
    }

    if (!nearest) return;
    const dx = nearest.physics.position.x - bot.physics.position.x;
    const dz = nearest.physics.position.z - bot.physics.position.z;
    const targetYaw = Math.atan2(dx, dz);
    // Turn rate limit keeps bots from snapping.
    const delta = ((targetYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    bot.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, delta));

    const los = this.hasLos(bot, nearest);
    const advance = los ? 0 : 1;
    const strafe = Math.sin(this.elapsedSec * 0.8 + bot.physics.position.x) * 0.35;
    bot.physics = stepPlayerPhysics(
      bot.physics,
      {
        forward: advance,
        right: los ? strafe : 0,
        jumpPressed: false,
        crouchHeld: false,
        walkHeld: false,
        sprintHeld: false,
        yaw: bot.yaw
      },
      this.aabbs,
      dt,
      { weaponSpeedMultiplier: 1, gravityMultiplier: 1, moveSpeedMultiplier: 1, allowSprint: true }
    );

    // Reaction delay + imperfect aim, so bots are beatable and not instant-kill.
    if (los && bestDist < 70 && this.elapsedSec - bot.lastShotAt > 0.35 + Math.random() * 0.5) {
      const aimError = (Math.random() - 0.5) * 0.22;
      if (Math.abs(delta + aimError) < 0.09) {
        bot.lastShotAt = this.elapsedSec;
        this.resolveShot(bot, nearest, bestDist);
      }
    }
  }

  private updateLos(): void {
    const local = this.players[0];
    for (const p of this.players) {
      if (!p.alive || p === local) continue;
      p.hasLosToLocal = local.alive ? this.hasLos(local, p) : false;
    }
  }

  private hasLos(a: CompatPlayer, b: CompatPlayer): boolean {
    return hasLineOfSight(
      { x: a.physics.position.x, y: a.physics.position.y + 1.5, z: a.physics.position.z },
      { x: b.physics.position.x, y: b.physics.position.y + 1.2, z: b.physics.position.z },
      this.aabbs
    );
  }

  private tryFire(shooter: CompatPlayer): void {
    const interval = 60 / shooter.weapon.fireRateRpm / 1000;
    if (this.elapsedSec - shooter.lastShotAt < interval) return;
    shooter.lastShotAt = this.elapsedSec;

    if (shooter.clip <= 0) {
      this.reload();
      return;
    }
    shooter.clip--;

    // Fire along the facing vector; hit the first enemy capsule it meets.
    const dirX = Math.sin(shooter.yaw);
    const dirZ = Math.cos(shooter.yaw);
    const origin = { x: shooter.physics.position.x, y: shooter.physics.position.y + 1.5, z: shooter.physics.position.z };

    let best: { player: CompatPlayer; t: number } | null = null;
    for (const target of this.players) {
      if (!target.alive || target.team === shooter.team) continue;
      const rel = {
        x: target.physics.position.x - origin.x,
        y: target.physics.position.y + 1.0 - origin.y,
        z: target.physics.position.z - origin.z
      };
      const along = rel.x * dirX + rel.z * dirZ;
      if (along <= 0) continue;
      const perpX = rel.x - dirX * along;
      const perpZ = rel.z - dirZ * along;
      if (Math.hypot(perpX, perpZ) > TICK_RADIUS) continue;
      // Wall between shooter and target stops the bullet.
      if (!this.hasLos(shooter, target)) continue;
      if (!best || along < best.t) best = { player: target, t: along };
    }

    if (best) {
      this.applyHit(shooter, best.player, best.t);
    }
  }

  private resolveShot(shooter: CompatPlayer, target: CompatPlayer, distance: number): void {
    if (shooter.clip <= 0) {
      this.reload();
      return;
    }
    shooter.clip--;
    // Bots have the same falloff model but land a "body" hit.
    const roll = Math.random();
    const group = roll < 0.12 ? 'head' : roll < 0.45 ? 'chest' : roll < 0.7 ? 'stomach' : 'leg';
    this.applyHit(shooter, target, distance, group);
  }

  private applyHit(
    shooter: CompatPlayer,
    target: CompatPlayer,
    distance: number,
    forcedGroup?: 'head' | 'chest' | 'stomach' | 'leg'
  ): void {
    const group =
      forcedGroup ??
      (['head', 'chest', 'stomach', 'leg'] as const)[Math.floor(Math.random() * 4)];

    const result = calculateWeaponDamage({
      weapon: shooter.weapon,
      distanceMeters: distance,
      hitGroup: group,
      targetArmor: target.armor,
      targetHasHelmet: target.hasHelmet
    });

    target.health -= result.healthDamage;
    target.armor = Math.max(0, target.armor - result.armorDamage);

    this.markers.push({
      x: target.physics.position.x,
      z: target.physics.position.z,
      color: group === 'head' ? '#facc15' : '#ef4444',
      size: 6
    });

    if (target.health <= 0) {
      target.alive = false;
      target.deaths++;
      target.diedAt = this.elapsedSec;
      shooter.kills++;
      this.pushKillFeed(shooter.name, target.name, shooter.weapon.name);
      if (shooter.isLocal) this.announce(`${target.name} eliminated`);
    }
  }

  private pushKillFeed(killer: string, victim: string, weapon: string): void {
    this.killFeed.unshift({ killer, victim, weapon, timeSec: this.elapsedSec });
    if (this.killFeed.length > 5) this.killFeed.pop();
  }

  private reload(): void {
    const local = this.players[0];
    if (local.clip >= local.weapon.magazineSize) return;
    const needed = local.weapon.magazineSize - local.clip;
    const take = Math.min(needed, local.reserveAmmo);
    local.clip += take;
    local.reserveAmmo -= take;
  }

  private updateRound(dt: number): void {
    this.markers = this.markers.filter(() => Math.random() > 0.08);

    if (this.mode === 'Deathmatch' || this.mode === 'Practice') {
      this.phaseLabel = this.mode === 'Practice' ? 'PRACTICE' : 'FREE-FOR-ALL';
      // Respawn so the mode stays playable.
      for (const p of this.players) {
        if (!p.alive && this.elapsedSec - p.diedAt > 5) {
          p.alive = true;
          p.health = 100;
          p.armor = 100;
          p.clip = p.weapon.magazineSize;
        }
      }
      if (this.mode === 'Deathmatch') {
        this.roundTimeSec = Math.max(0, this.roundTimeSec - dt);
        if (this.roundTimeSec <= 0) {
          this.finish('DRAW');
        }
      }
      return;
    }

    this.roundTimeSec = Math.max(0, this.roundTimeSec - dt);
    if (this.bombPlanted && this.bombTimeSec !== null) {
      this.bombTimeSec = Math.max(0, this.bombTimeSec - dt);
    }

    const sentinelAlive = this.players.filter((p) => p.alive && p.team === 'SENTINEL').length;
    const vortexAlive = this.players.filter((p) => p.alive && p.team === 'VORTEX').length;

    const resolution = evaluateRoundEnd({
      mode: this.mode,
      sentinelAlive,
      vortexAlive,
      bombPlanted: this.bombPlanted,
      bombTimerSec: this.bombTimeSec ?? 0,
      roundTimeRemainingSec: this.roundTimeSec,
      bombDefused: false
    });

    if (resolution.ended && resolution.winner) {
      this.endRound(resolution.winner);
    }
  }

  private endRound(winner: TeamId): void {
    const loser: TeamId = winner === 'SENTINEL' ? 'VORTEX' : 'SENTINEL';
    if (winner === 'SENTINEL') this.sentinelScore++;
    else this.vortexScore++;

    this.roundIndex++;
    this.announce(
      winner === 'SENTINEL' ? 'SENTINEL WINS THE ROUND' : 'VORTEX WINS THE ROUND'
    );

    const lossStreaks = new Map<TeamId, number>();
    for (const p of this.players) {
      const payout = calculateRoundPayout({
        mode: this.mode,
        wonRound: p.team === winner,
        lossStreak: lossStreaks.get(p.team) ?? 0,
        bombPlantedByThisTeam: this.bombPlanted,
        isAttacker: p.team === 'VORTEX',
        killReward: 0
      });
      p.money = Math.max(0, p.money + payout.reward);
      if (p.team !== winner) lossStreaks.set(p.team, payout.newLossStreak);
    }
    void loser;

    const complete = checkMatchComplete(
      this.sentinelScore,
      this.vortexScore,
      this.maxRounds,
      this.mode === 'Wingman',
      getModeConfig(this.mode).overtime
    );
    if (complete.complete) {
      this.finish(complete.winner ?? 'DRAW');
      return;
    }

    this.bombPlanted = false;
    this.bombTimeSec = null;
    this.spawnTeams(this.players[0].team, Math.max(2, this.players.filter((p) => p.team === this.players[0].team).length));
    const cfg = getModeConfig(this.mode);
    this.roundTimeSec = cfg.roundTimeSec;
    this.phaseLabel = `ROUND ${this.roundIndex + 1}`;
  }

  private finish(winner: TeamId | 'DRAW'): void {
    this.running = false;
    this.onComplete?.({
      sentinelScore: this.sentinelScore,
      vortexScore: this.vortexScore,
      winner,
      rounds: this.roundIndex
    });
  }

  private announce(text: string): void {
    this.announcement = text;
    this.announcementUntil = this.elapsedSec + 3;
  }

  private draw(): void {
    if (!this.renderer.attach(this.canvas)) return;
    this.renderer.resize(Math.min(2, window.devicePixelRatio || 1));

    const local = this.players[0];
    const actors: TacticalActor[] = this.players.map((p) => ({
      id: p.id,
      x: p.physics.position.x,
      z: p.physics.position.z,
      yaw: p.isLocal ? this.yaw : p.yaw,
      team: p.team === 'VORTEX' ? 'VORTEX' : 'SENTINEL',
      isLocal: p.isLocal,
      alive: p.alive,
      crouching: p.physics.crouching,
      health: p.health,
      hasLineOfSight: p.isLocal ? true : p.hasLosToLocal,
      label: p.isLocal ? 'YOU' : p.name
    }));

    const scene: TacticalScene = {
      map: this.map,
      actors,
      objectives: this.objectives,
      markers: this.markers,
      timeSec: this.elapsedSec
    };

    this.renderer.render(scene, this.yaw, local.physics.position.x, local.physics.position.z, 0.9);

    if (this.announcement && this.elapsedSec < this.announcementUntil) {
      this.drawAnnouncement();
    }

    this.onFrame?.(this.buildHud());
  }

  private drawAnnouncement(): void {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.announcement) return;
    const size = Math.max(16, Math.round(canvas.height * 0.035));
    ctx.save();
    ctx.font = `800 ${size}px ui-monospace, SFMono-Regular, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,12,17,0.72)';
    const w = ctx.measureText(this.announcement).width + 40;
    ctx.fillRect(canvas.width / 2 - w / 2, canvas.height * 0.16 - size, w, size * 1.8);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(this.announcement, canvas.width / 2, canvas.height * 0.16);
    ctx.restore();
  }

  private buildHud(): CompatHud {
    const local = this.players[0];
    return {
      health: Math.max(0, Math.round(local.health)),
      armor: Math.max(0, Math.round(local.armor)),
      ammo: local.clip,
      reserve: local.reserveAmmo,
      money: local.money,
      weaponName: local.weapon.name,
      roundTimeSec: Math.ceil(this.roundTimeSec),
      bombTimeSec: this.bombPlanted ? this.bombTimeSec : null,
      phase: this.phaseLabel,
      sentinelScore: this.sentinelScore,
      vortexScore: this.vortexScore,
      alive: {
        sentinel: this.players.filter((p) => p.alive && p.team === 'SENTINEL').length,
        vortex: this.players.filter((p) => p.alive && p.team === 'VORTEX').length
      },
      killFeed: this.killFeed,
      announcement: this.elapsedSec < this.announcementUntil ? this.announcement : null,
      callout: this.currentCallout(local.physics.position),
      contextLost: false
    };
  }

  private currentCallout(pos: Vector3D): string {
    let best = 'Tactical Sector';
    let bestDist = Infinity;
    for (const c of this.map.callouts) {
      const d = Math.hypot(pos.x - c.position[0], pos.z - c.position[2]);
      if (d < c.radius && d < bestDist) {
        bestDist = d;
        best = c.name;
      }
    }
    return best;
  }
}

function dist2D(a: Vector3D, b: Vector3D): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
