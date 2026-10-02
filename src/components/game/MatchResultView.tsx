import React, { useMemo } from 'react';
import { Trophy, Skull, Target, Crosshair, Flame, Handshake, TrendingUp, TrendingDown, Award } from 'lucide-react';
import { MatchPlayerStats, GameModeId, TeamId } from '../../shared/types';
import { WEAPON_SPECS } from '../../shared/weapons';
import { MatchResultPayload } from '../../game/core/gameEngine';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { Button, StatChip } from '../ui/primitives';

interface MatchResultViewProps {
  result: MatchResultPayload;
  mode: GameModeId;
  mapName: string;
  playerTeam: TeamId;
  scoreboard: MatchPlayerStats[];
  onContinue: () => void;
}

export const MatchResultView: React.FC<MatchResultViewProps> = ({
  result,
  mode,
  mapName,
  playerTeam,
  scoreboard,
  onContinue
}) => {
  const { profile } = useGamePlatformStore();

  const localPlayer = useMemo(
    () =>
      scoreboard.find((p) => p.id === 'local_player') || {
        id: 'local_player',
        name: profile.username,
        team: playerTeam,
        isBot: false,
        alive: false,
        health: 0,
        armor: 0,
        hasHelmet: false,
        hasDefuseKit: false,
        hasBomb: false,
        money: 0,
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
      },
    [scoreboard, profile.username, playerTeam]
  );

  const won = result.winner === playerTeam;
  const drew = result.winner === 'DRAW';
  const rounds = Math.max(1, result.rounds);

  const adr = localPlayer.damageDealt / rounds;
  const hsPercent = localPlayer.kills > 0 ? (localPlayer.headshots / localPlayer.kills) * 100 : 0;
  const ratingDelta = (won ? 220 : drew ? 40 : -190) + (localPlayer.kills - localPlayer.deaths) * 4;

  const kd = localPlayer.deaths > 0 ? localPlayer.kills / localPlayer.deaths : localPlayer.kills;

  const matchRating = useMemo(() => {
    const kdComponent = Math.min(2.2, Math.max(0.3, kd));
    const adrComponent = Math.min(1.6, Math.max(0.4, adr / 80));
    const hsComponent = Math.min(1.4, Math.max(0.6, 0.65 + hsPercent / 160));
    return Number((((kdComponent + adrComponent) * hsComponent) / 2).toFixed(2));
  }, [kd, adr, hsPercent]);

  return (
    <div className="min-h-screen bg-tac-bg p-5 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Result banner */}
        <div
          className={`relative overflow-hidden rounded-xl border-2 p-8 text-center ${
            won
              ? 'border-emerald-600/70 bg-gradient-to-b from-emerald-950/60 to-tac-panel'
              : drew
              ? 'border-slate-600/70 bg-gradient-to-b from-slate-800/60 to-tac-panel'
              : 'border-red-700/70 bg-gradient-to-b from-red-950/60 to-tac-panel'
          }`}
        >
          {won ? (
            <Trophy className="mx-auto mb-3 h-14 w-14 text-amber-400" />
          ) : drew ? (
            <Handshake className="mx-auto mb-3 h-14 w-14 text-slate-400" />
          ) : (
            <Skull className="mx-auto mb-3 h-14 w-14 text-red-400" />
          )}
          <h1
            className={`text-4xl font-black uppercase tracking-[0.2em] ${
              won ? 'text-emerald-400' : drew ? 'text-slate-300' : 'text-red-400'
            }`}
          >
            {won ? 'VICTORY' : drew ? 'DRAW' : 'DEFEAT'}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-4 font-mono text-3xl font-black text-white">
            <span className="text-cyan-400">{result.sentinelScore}</span>
            <span className="text-slate-600">—</span>
            <span className="text-amber-400">{result.vortexScore}</span>
          </div>
          <div className="mt-2 text-xs uppercase tracking-widest text-slate-400">
            {mode} · {mapName} · {result.rounds} rounds
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-tac-border bg-slate-950/70 px-5 py-2">
            {ratingDelta >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Premier Rating</span>
            <span className={`font-mono text-base font-black ${ratingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ratingDelta >= 0 ? '+' : ''}
              {ratingDelta}
            </span>
          </div>
        </div>

        {/* Personal performance */}
        <div className="rounded-lg border border-tac-border bg-tac-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-cyan-400" />
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-400">
              PERSONAL PERFORMANCE — {profile.username}
            </h2>
            <span className="ml-auto rounded bg-slate-800 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-300">
              MATCH RATING {matchRating.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <StatChip label="KILLS" value={localPlayer.kills} accent="text-emerald-400" sub={`K/D ${kd.toFixed(2)}`} />
            <StatChip label="DEATHS" value={localPlayer.deaths} accent="text-red-400" />
            <StatChip label="ASSISTS" value={localPlayer.assists} accent="text-white" />
            <StatChip label="ADR" value={adr.toFixed(1)} accent="text-cyan-400" sub="damage per round" />
            <StatChip label="HS%" value={`${hsPercent.toFixed(1)}%`} accent="text-amber-400" sub={`${localPlayer.headshots} headshots`} />
            <StatChip label="UTILITY DMG" value={localPlayer.utilityDamage} accent="text-orange-400" />
            <StatChip label="ENTRY KILLS" value={localPlayer.entryKills} accent="text-fuchsia-400" />
            <StatChip label="CLUTCHES" value={localPlayer.clutches} accent="text-purple-400" />
            <StatChip label="MVPs" value={localPlayer.mvps} accent="text-amber-400" />
            <StatChip label="SCORE" value={localPlayer.score} accent="text-white" />
            <StatChip label="TOTAL DAMAGE" value={localPlayer.damageDealt} accent="text-cyan-400" />
            <StatChip label="BEST WEAPON" value={WEAPON_SPECS[localPlayer.currentWeapon]?.code || '—'} accent="text-slate-200" />
          </div>
        </div>

        {/* Full scoreboard */}
        <div className="rounded-lg border border-tac-border bg-tac-panel p-4">
          <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-400">
            DETAILED SCOREBOARD — AUTHORITATIVE RECORD
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tac-border bg-slate-900/60 font-mono uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">OPERATIVE</th>
                  <th className="px-3 py-2">TEAM</th>
                  <th className="px-3 py-2 text-right">K</th>
                  <th className="px-3 py-2 text-right">D</th>
                  <th className="px-3 py-2 text-right">A</th>
                  <th className="px-3 py-2 text-right">DMG</th>
                  <th className="px-3 py-2 text-right">ADR</th>
                  <th className="px-3 py-2 text-right">HS%</th>
                  <th className="px-3 py-2 text-right">UD</th>
                  <th className="px-3 py-2 text-right">MVP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[...scoreboard]
                  .sort((a, b) => b.score - a.score || b.kills - a.kills)
                  .map((p) => {
                    const isLocal = p.id === 'local_player';
                    const pAdr = p.damageDealt / rounds;
                    const pHs = p.kills > 0 ? (p.headshots / p.kills) * 100 : 0;
                    return (
                      <tr
                        key={p.id}
                        className={
                          isLocal
                            ? 'bg-cyan-950/25 font-bold text-cyan-100'
                            : p.team === 'SENTINEL'
                            ? 'bg-slate-950/40 text-slate-200'
                            : 'bg-amber-950/10 text-slate-200'
                        }
                      >
                        <td className="px-3 py-2">
                          {p.name}
                          {p.isBot && (
                            <span className="ml-1.5 rounded bg-slate-800 px-1 py-0.5 text-[9px] text-slate-400">
                              BOT
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">{p.team}</td>
                        <td className="px-3 py-2 text-right font-bold">{p.kills}</td>
                        <td className="px-3 py-2 text-right">{p.deaths}</td>
                        <td className="px-3 py-2 text-right">{p.assists}</td>
                        <td className="px-3 py-2 text-right">{p.damageDealt}</td>
                        <td className="px-3 py-2 text-right text-cyan-300">{pAdr.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right text-amber-300">{pHs.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{p.utilityDamage}</td>
                        <td className="px-3 py-2 text-right text-amber-400">★ {p.mvps}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded border border-tac-border bg-slate-900/50 p-2.5 text-[10px] leading-relaxed text-slate-500">
            <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" />
            All statistics above originate from the authoritative server's simulation record. The client cannot
            submit or modify kills, damage, economy, or match results; any discrepancy is resolved in favour of
            the server.
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pb-6">
          <Button variant="primary" size="lg" onClick={onContinue}>
            <Target className="h-4 w-4" /> RETURN TO COMMAND CENTRE
          </Button>
          <Button variant="secondary" size="lg" onClick={onContinue}>
            <Flame className="h-4 w-4" /> VIEW MATCH HISTORY
          </Button>
        </div>
      </div>
    </div>
  );
};
