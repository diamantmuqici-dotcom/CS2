import React from 'react';
import { GameMapDefinition, MatchPlayerStats, TeamId, Vector3D } from '../../shared/types';

export interface CullingDecisionEntry {
  visible: boolean;
  reason: string;
}

interface RadarMinimapProps {
  map: GameMapDefinition;
  localPos: Vector3D;
  localYaw: number;
  localTeam: TeamId;
  players: MatchPlayerStats[];
  visibleEnemyIds: Set<string>;
  bombPlanted: boolean;
  bombPosition: Vector3D | null;
  size: number;
  zoom: number;
  rotate: boolean;
  currentCallout: string;
  showCullingDebug?: boolean;
  cullingDecisions?: Record<string, CullingDecisionEntry>;
}

export const RadarMinimap: React.FC<RadarMinimapProps> = ({
  map,
  localPos,
  localYaw,
  localTeam,
  players,
  visibleEnemyIds,
  bombPlanted,
  bombPosition,
  size,
  zoom,
  rotate,
  currentCallout,
  showCullingDebug = false,
  cullingDecisions = {}
}) => {
  const scale = (size / 115) * zoom;
  const half = size / 2;

  const worldToRadar = (wx: number, wz: number): { x: number; y: number } => {
    const dx = (wx - localPos.x) * scale;
    const dz = (wz - localPos.z) * scale;
    if (!rotate) {
      return { x: half + dx, y: half + dz };
    }
    const cos = Math.cos(localYaw);
    const sin = Math.sin(localYaw);
    return {
      x: half + (dx * cos - dz * sin),
      y: half + (dx * sin + dz * cos)
    };
  };

  return (
    <div className="select-none">
      <div
        className="relative overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/90 shadow-xl"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <svg width={size} height={size} className="block">
          {/* Radar Grid Rings */}
          <circle cx={half} cy={half} r={half * 0.45} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
          <circle cx={half} cy={half} r={half * 0.82} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />

          {/* Camera FOV Cone */}
          <polygon
            points={`${half},${half} ${half - 42},${half - 78} ${half + 42},${half - 78}`}
            fill="rgba(6, 182, 212, 0.11)"
            stroke="rgba(6, 182, 212, 0.28)"
            strokeWidth="1"
            transform={!rotate ? `rotate(${(-localYaw * 180) / Math.PI}, ${half}, ${half})` : undefined}
          />

          {/* Map Geometry footprints */}
          {map.objects.map((obj) => {
            if (obj.id === 'ground_main') return null;
            const p = worldToRadar(obj.position[0], obj.position[2]);
            const w = Math.max(3, obj.size[0] * scale);
            const h = Math.max(3, obj.size[2] * scale);

            let fill = 'rgba(71, 85, 105, 0.55)';
            let stroke = 'rgba(148, 163, 184, 0.3)';

            if (obj.type === 'bomb_site_a' || obj.type === 'bomb_site_b') {
              fill = 'rgba(239, 68, 68, 0.25)';
              stroke = '#ef4444';
            } else if (showCullingDebug && cullingDecisions[obj.id]) {
              const dec = cullingDecisions[obj.id];
              if (dec.visible) {
                fill = 'rgba(16, 185, 129, 0.65)';
                stroke = '#10b981';
              } else if (dec.reason === 'behind_camera') {
                fill = 'rgba(239, 68, 68, 0.35)';
                stroke = '#ef4444';
              } else if (dec.reason === 'occluded') {
                fill = 'rgba(168, 85, 247, 0.45)';
                stroke = '#a855f7';
              } else {
                fill = 'rgba(245, 158, 11, 0.3)';
                stroke = '#f59e0b';
              }
            }

            return (
              <g key={obj.id}>
                <rect
                  x={p.x - w / 2}
                  y={p.y - h / 2}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="1"
                />
                {(obj.type === 'bomb_site_a' || obj.type === 'bomb_site_b') && (
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fill="#f87171"
                    fontSize="11"
                    fontWeight="800"
                  >
                    {obj.type === 'bomb_site_a' ? 'A' : 'B'}
                  </text>
                )}
              </g>
            );
          })}

          {/* Planted Bomb Icon */}
          {bombPlanted && bombPosition && (
            <g>
              {(() => {
                const bp = worldToRadar(bombPosition.x, bombPosition.z);
                return (
                  <>
                    <circle cx={bp.x} cy={bp.y} r={7} fill="rgba(239,68,68,0.4)" />
                    <circle cx={bp.x} cy={bp.y} r={3.5} fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                  </>
                );
              })()}
            </g>
          )}

          {/* Teammates & LOS-Visible Enemies */}
          {players.map((pl) => {
            if (!pl.alive || pl.id === 'local_player') return null;
            const isTeammate = pl.team === localTeam;
            if (!isTeammate && !visibleEnemyIds.has(pl.id)) return null;

            const pt = worldToRadar(pl.position.x, pl.position.z);
            return (
              <circle
                key={pl.id}
                cx={pt.x}
                cy={pt.y}
                r={4.2}
                fill={isTeammate ? '#06b6d4' : '#ef4444'}
                stroke="#090c10"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Local Player Center Indicator */}
          <circle cx={half} cy={half} r={4.8} fill="#ffffff" stroke="#06b6d4" strokeWidth="2" />
        </svg>

        {/* Top Bar Callout Label */}
        <div className="absolute left-2 right-2 top-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
          <span className="rounded bg-slate-900/90 px-1.5 py-0.5 text-cyan-400 border border-cyan-500/30">
            {currentCallout}
          </span>
          {showCullingDebug && (
            <span className="rounded bg-emerald-950/90 px-1.5 py-0.5 text-emerald-400 border border-emerald-500/40">
              CULLING MAP
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
