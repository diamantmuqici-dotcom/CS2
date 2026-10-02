import React from 'react';
import { MatchPlayerStats, GameModeId } from '../../shared/types';
import { WEAPON_SPECS } from '../../shared/weapons';

interface ScoreboardOverlayProps {
  mode: GameModeId;
  mapName: string;
  roundNumber: number;
  maxRounds: number;
  sentinelScore: number;
  vortexScore: number;
  players: MatchPlayerStats[];
}

export const ScoreboardOverlay: React.FC<ScoreboardOverlayProps> = ({
  mode,
  mapName,
  roundNumber,
  maxRounds,
  sentinelScore,
  vortexScore,
  players
}) => {
  const sentinels = players.filter((p) => p.team === 'SENTINEL').sort((a, b) => b.score - a.score);
  const vortex = players.filter((p) => p.team === 'VORTEX').sort((a, b) => b.score - a.score);

  const renderTeamTable = (teamName: string, accent: string, score: number, list: MatchPlayerStats[]) => (
    <div className="mb-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/90">
      <div className={`flex items-center justify-between px-4 py-2.5 ${accent}`}>
        <div className="text-sm font-black uppercase tracking-wider text-white">{teamName}</div>
        <div className="font-mono text-xl font-black text-white">{score}</div>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/60 font-mono text-[10px] uppercase text-slate-400">
          <tr>
            <th className="px-3 py-2">OPERATIVE</th>
            <th className="px-2 py-2">STATUS</th>
            <th className="px-2 py-2">LOADOUT</th>
            <th className="px-2 py-2 text-right">$</th>
            <th className="px-2 py-2 text-right">K</th>
            <th className="px-2 py-2 text-right">A</th>
            <th className="px-2 py-2 text-right">D</th>
            <th className="px-2 py-2 text-right">ADR</th>
            <th className="px-2 py-2 text-right">HS%</th>
            <th className="px-2 py-2 text-right">UD</th>
            <th className="px-2 py-2 text-right">MVP</th>
            <th className="px-3 py-2 text-right">PING</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70 font-mono">
          {list.map((pl) => {
            const adr = Math.round(pl.damageDealt / Math.max(1, roundNumber));
            const hsPct = pl.kills > 0 ? Math.round((pl.headshots / pl.kills) * 100) : 0;
            return (
              <tr
                key={pl.id}
                className={`${
                  pl.id === 'local_player' ? 'bg-cyan-500/15 text-white font-bold' : 'text-slate-200'
                } ${!pl.alive ? 'opacity-60' : ''}`}
              >
                <td className="px-3 py-2 font-sans font-semibold">
                  {pl.name}{' '}
                  {pl.isBot && (
                    <span className="ml-1 rounded bg-slate-800 px-1 py-0.5 text-[9px] text-slate-400">
                      BOT
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {pl.alive ? (
                    <span className="text-emerald-400">{pl.health} HP</span>
                  ) : (
                    <span className="text-red-400">KIA</span>
                  )}
                </td>
                <td className="px-2 py-2 text-slate-300">
                  {WEAPON_SPECS[pl.currentWeapon]?.name || pl.currentWeapon}
                </td>
                <td className="px-2 py-2 text-right text-emerald-400">${pl.money}</td>
                <td className="px-2 py-2 text-right font-bold">{pl.kills}</td>
                <td className="px-2 py-2 text-right">{pl.assists}</td>
                <td className="px-2 py-2 text-right">{pl.deaths}</td>
                <td className="px-2 py-2 text-right text-cyan-300">{adr}</td>
                <td className="px-2 py-2 text-right">{hsPct}%</td>
                <td className="px-2 py-2 text-right">{pl.utilityDamage}</td>
                <td className="px-2 py-2 text-right text-amber-400">★ {pl.mvps}</td>
                <td className="px-3 py-2 text-right text-slate-400">{pl.ping}ms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-6 backdrop-blur-xs">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-[#0b1017]/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-widest text-cyan-400">
              {mode} // {mapName}
            </div>
            <h3 className="text-lg font-black text-white">
              ROUND {roundNumber} OF {maxRounds} — AUTHORITATIVE TELEMETRY
            </h3>
          </div>
          <div className="font-mono text-xs text-slate-400">SERVER: 64-TICK AUTHORITATIVE</div>
        </div>

        {renderTeamTable('SENTINEL FORCE (DEFENDERS)', 'bg-cyan-950/80 border-b border-cyan-500/40', sentinelScore, sentinels)}
        {renderTeamTable('VORTEX SYNDICATE (ATTACKERS)', 'bg-amber-950/80 border-b border-amber-500/40', vortexScore, vortex)}
      </div>
    </div>
  );
};
