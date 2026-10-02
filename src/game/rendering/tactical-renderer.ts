/**
 * Tactical 2D compatibility renderer.
 *
 * three.js r163+ is WebGL2-only, so a device with no WebGL2 context cannot run
 * the 3D engine even if it can run WebGL1. Rather than showing a dead canvas
 * or faking 3D, this renderer presents the *real* match state as a rotating
 * top-down tactical view drawn on a 2D canvas: the actual map geometry from the
 * authored `GameMapDefinition`, live line-of-sight occlusion, team positions,
 * the bomb, and the player's view cone.
 *
 * It is a genuine renderer driven by the same simulation as the 3D path, not a
 * static image — the view rotates with the mouse, occlusion updates as players
 * move, and everything is drawn from live state.
 */

import type { GameMapDefinition, MapObjectDef } from '../../shared/types';

export interface TacticalActor {
  id: string;
  x: number;
  z: number;
  yaw: number;
  team: 'SENTINEL' | 'VORTEX' | 'NEUTRAL';
  isLocal: boolean;
  alive: boolean;
  crouching: boolean;
  health: number;
  hasLineOfSight: boolean;
  label: string;
}

export interface TacticalObjective {
  kind: 'bomb' | 'siteA' | 'siteB' | 'buyZone' | 'spawn';
  x: number;
  z: number;
  radius: number;
  active: boolean;
}

export interface TacticalScene {
  map: GameMapDefinition;
  actors: TacticalActor[];
  objectives: TacticalObjective[];
  /** Extra world-space markers, e.g. grenades or dead operators. */
  markers: Array<{ x: number; z: number; color: string; size: number }>;
  timeSec: number;
}

interface Footprint {
  x: number;
  z: number;
  hw: number;
  hd: number;
  depth: number;
  color: string;
  blocksVision: boolean;
}

const TEAM_COLOR = {
  SENTINEL: '#22d3ee',
  VORTEX: '#f97316',
  NEUTRAL: '#94a3b8'
} as const;

export class TacticalRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private footprints: Footprint[] = [];
  private mapId = '';

  /** Cached geometry for the current map so a rebuild only happens on map change. */
  private buildFootprints(map: GameMapDefinition): void {
    if (map.id === this.mapId && this.footprints.length > 0) return;
    this.mapId = map.id;

    this.footprints = map.objects
      .filter((o) => o.type !== 'water' && o.type !== 'ladder' && o.size[0] > 0 && o.size[2] > 0)
      .map((o) => ({
        x: o.position[0],
        z: o.position[2],
        hw: o.size[0] / 2,
        hd: o.size[2] / 2,
        depth: o.size[1],
        color: o.color,
        blocksVision: o.occluder
      }));
  }

  attach(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    try {
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    } catch {
      this.ctx = null;
    }
    return this.ctx !== null;
  }

  detach(): void {
    this.ctx = null;
    this.canvas = null;
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  /** Resizes the backing store. Returns the applied pixel ratio. */
  resize(pixelRatio: number): number {
    const canvas = this.canvas;
    if (!canvas) return 1;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const bw = Math.max(1, Math.round(w * pixelRatio));
    const bh = Math.max(1, Math.round(h * pixelRatio));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    return pixelRatio;
  }

  render(scene: TacticalScene, cameraYaw: number, centerX: number, centerZ: number, zoom: number): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    this.buildFootprints(scene.map);

    const w = canvas.width;
    const h = canvas.height;
    const scale = zoom * (canvas.height / 900);

    // World -> screen: rotate the world by -cameraYaw around the camera focus.
    const cos = Math.cos(-cameraYaw);
    const sin = Math.sin(-cameraYaw);
    const toScreen = (wx: number, wz: number): [number, number] => {
      const dx = wx - centerX;
      const dz = wz - centerZ;
      return [(dx * cos - dz * sin) * scale + w / 2, (dx * sin + dz * cos) * scale + h / 2];
    };

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = scene.map.ambientColor;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(ctx, w, h, scale);
    this.drawFootprints(ctx, toScreen, scale, cameraYaw);
    this.drawObjectives(ctx, scene, toScreen, scale);
    this.drawMarkers(ctx, scene, toScreen, scale);
    this.drawActors(ctx, scene, toScreen, scale);
    this.drawCompass(ctx, w, h, cameraYaw);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number): void {
    const step = 100 * scale;
    if (step < 8) return;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = w / 2 % step;
    const oy = h / 2 % step;
    for (let x = ox; x < w; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = oy; y < h; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  private drawFootprints(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, z: number) => [number, number],
    scale: number,
    cameraYaw: number
  ): void {
    // Painter's algorithm in camera space: sort by depth along the view
    // direction so near geometry is painted last and overlaps correctly.
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const sorted = this.footprints
      .map((fp) => ({ fp, depth: fp.x * fx + fp.z * fz }))
      .sort((a, b) => a.depth - b.depth);

    for (const { fp } of sorted) {
      const [sx, sz] = toScreen(fp.x, fp.z);
      const hw = fp.hw * scale;
      const hd = fp.hd * scale;
      if (sx + hw < 0 || sx - hw > ctx.canvas.width || sz + hd < 0 || sz - hd > ctx.canvas.height) {
        continue;
      }

      // Offset the "side" face slightly to imply height, so the plan view reads
      // as a 3D volume rather than a flat floor plan.
      const lift = Math.min(10, fp.depth * scale * 0.06);
      ctx.fillStyle = shade(fp.color, 0.55);
      ctx.fillRect(sx - hw, sz - hd + lift, hw * 2, hd * 2);
      ctx.fillStyle = shade(fp.color, 0.95);
      ctx.fillRect(sx - hw, sz - hd, hw * 2, hd * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - hw, sz - hd, hw * 2, hd * 2);
    }
  }

  private drawObjectives(
    ctx: CanvasRenderingContext2D,
    scene: TacticalScene,
    toScreen: (x: number, z: number) => [number, number],
    scale: number
  ): void {
    for (const obj of scene.objectives) {
      const [sx, sz] = toScreen(obj.x, obj.z);
      const r = Math.max(6, obj.radius * scale);
      ctx.save();
      if (obj.kind === 'bomb') {
        ctx.fillStyle = obj.active ? '#ef4444' : 'rgba(239,68,68,0.25)';
        ctx.beginPath();
        ctx.arc(sx, sz, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (obj.kind === 'siteA' || obj.kind === 'siteB') {
        ctx.strokeStyle = obj.active ? 'rgba(248,113,113,0.9)' : 'rgba(248,113,113,0.3)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sz, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(248,113,113,0.10)';
        ctx.fill();
        ctx.fillStyle = 'rgba(248,113,113,0.85)';
        ctx.font = `600 ${Math.max(10, 13)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(obj.kind === 'siteA' ? 'A' : 'B', sx, sz + 4);
      } else {
        ctx.strokeStyle = obj.active ? 'rgba(34,211,238,0.55)' : 'rgba(34,211,238,0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - r, sz - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  }

  private drawMarkers(
    ctx: CanvasRenderingContext2D,
    scene: TacticalScene,
    toScreen: (x: number, z: number) => [number, number],
    scale: number
  ): void {
    for (const m of scene.markers) {
      const [sx, sz] = toScreen(m.x, m.z);
      ctx.fillStyle = m.color;
      const s = Math.max(1.5, m.size * scale * 0.05);
      ctx.fillRect(sx - s, sz - s, s * 2, s * 2);
    }
  }

  private drawActors(
    ctx: CanvasRenderingContext2D,
    scene: TacticalScene,
    toScreen: (x: number, z: number) => [number, number],
    scale: number
  ): void {
    for (const actor of scene.actors) {
      const [sx, sz] = toScreen(actor.x, actor.z);
      if (!actor.alive) continue;

      const color = TEAM_COLOR[actor.team];
      const r = actor.isLocal ? 7 : 5.5;

      // View cone.
      const coneLen = 26 * scale;
      const half = Math.PI / 7;
      const facing = actor.yaw;
      ctx.beginPath();
      ctx.moveTo(sx, sz);
      // Screen angle: world yaw is measured around +Y with -Z forward.
      const base = Math.atan2(Math.cos(facing), Math.sin(facing));
      ctx.arc(sx, sz, coneLen, -base - half, -base + half);
      ctx.closePath();
      const grad = ctx.createRadialGradient(sx, sz, 0, sx, sz, coneLen);
      const visible = actor.hasLineOfSight;
      grad.addColorStop(0, hexToRgba(color, actor.isLocal ? 0.4 : visible ? 0.3 : 0.12));
      grad.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = grad;
      ctx.fill();

      // Body.
      ctx.beginPath();
      ctx.arc(sx, sz, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0b0f14';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Facing pip.
      ctx.beginPath();
      const fx = sx + Math.sin(base) * (r + 5);
      const fy = sz - Math.cos(base) * (r + 5);
      ctx.moveTo(sx, sz);
      ctx.lineTo(fx, fy);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (!actor.hasLineOfSight && !actor.isLocal) {
        ctx.fillStyle = 'rgba(148,163,184,0.75)';
        ctx.font = '600 9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', sx, sz - r - 5);
      }

      if (actor.isLocal) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sz, r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '700 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(actor.label, sx, sz + r + 18);
      }
    }
  }

  private drawCompass(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    yaw: number
  ): void {
    const cx = w / 2;
    const cy = 58;
    const radius = 44;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // North is -Z in the map convention.
    const northAngle = -Math.PI / 2 - yaw;
    const nx = cx + Math.cos(northAngle) * radius;
    const ny = cy + Math.sin(northAngle) * radius;
    ctx.fillStyle = '#f87171';
    ctx.font = '800 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.fillText('W', cx - radius - 9, cy);
    ctx.fillText('E', cx + radius + 9, cy);
    ctx.fillText('S', cx, cy + radius + 11);
    ctx.restore();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(148,163,184,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(hex: string, factor: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(100,116,139,${factor})`;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = clamp(parseInt(m[1], 16));
  const g = clamp(parseInt(m[2], 16));
  const b = clamp(parseInt(m[3], 16));
  return `rgb(${r},${g},${b})`;
}

export { TEAM_COLOR };
export type { MapObjectDef };
