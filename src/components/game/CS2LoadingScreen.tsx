import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, Crosshair, Wifi, Layers } from 'lucide-react';
import { GameModeId } from '../../shared/types';
import { OFFICIAL_MAPS } from '../../game/maps/officialMaps';
import { useVacNetStore } from '../../shared/vacnet';

const CS2_MAP_ALIASES: Record<string, { csName: string; code: string; location: string }> = {
  harbor_protocol: { csName: 'MIRAGE // HARBOR PROTOCOL', code: 'de_mirage_cs2', location: 'Moroccan Sector / Dockyard' },
  citadel_spire: { csName: 'DUST II // CITADEL SPIRE', code: 'de_dust2_cs2', location: 'Solaris Arid Sector' },
  foundry_wing: { csName: 'INFERNO // FOUNDRY CORE', code: 'de_inferno_cs2', location: 'Smelting Refinery Wing' },
  proving_grounds: { csName: 'OVERPASS // PROVING GROUNDS', code: 'de_overpass_cs2', location: 'Tactical Evaluation Facility' }
};

const LOADING_STAGES = [
  'CONNECTING TO CS2 AUTHORITATIVE SUB-TICK SERVER...',
  'VERIFYING VACNET 3.0 HARDWARE ID (HWID) & IP SIGNATURE...',
  'COMPILING CS:GO SOURCE-1 HIGH-FPS CLASSIC SHADERS...',
  'BUILDING BSP / AABB OCCLUSION PORTALS & HITBOXES...',
  'SYNCHRONIZING 128-HZ SUB-TICK TIMESTAMPS — READY!'
];

export const CS2LoadingScreen: React.FC<{
  mode: GameModeId;
  mapId: string;
  onComplete?: () => void;
}> = ({ mode, mapId, onComplete }) => {
  const [progress, setProgress] = useState(18);
  const [stageIdx, setStageIdx] = useState(0);
  const currentAccount = useVacNetStore((s) => s.currentAccount);
  const mapDef = OFFICIAL_MAPS[mapId] || OFFICIAL_MAPS.harbor_protocol;
  const alias = CS2_MAP_ALIASES[mapId] || {
    csName: mapDef.name.toUpperCase(),
    code: `de_${mapId}`,
    location: mapDef.subtitle
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(100, prev + 22);
        const nextStage = Math.min(LOADING_STAGES.length - 1, Math.floor((next / 100) * LOADING_STAGES.length));
        setStageIdx(nextStage);
        if (next >= 100 && onComplete) {
          window.clearInterval(interval);
          window.setTimeout(onComplete, 180);
        }
        return next;
      });
    }, 170);
    return () => window.clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-between bg-[#090b0e] text-white font-bold select-none overflow-hidden">
      {/* Background atmospheric CS:GO / CS2 tactical grid & radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 72% 40%, rgba(227, 163, 59, 0.25), transparent 55%), radial-gradient(circle at 20% 75%, rgba(56, 189, 248, 0.14), transparent 50%)'
        }}
      />

      {/* Top Bar — Authentic CS2 Loading Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between border-b-2 border-[#2a2f34] bg-[#101418]/95 px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-14 items-center justify-center bg-[#e3a33b] text-lg font-black tracking-tighter text-black shadow-lg -skew-x-12">
            <span className="skew-x-12">CS2</span>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-[#e3a33b]">
              <span>COUNTER-STRIKE 2</span>
              <span>//</span>
              <span>{mode.toUpperCase()} MODE</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-wide text-white sm:text-3xl">
              {alias.csName}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs font-black">
          <div className="flex items-center gap-1.5 rounded border border-emerald-500/60 bg-emerald-950/50 px-3 py-1.5 text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            VACNET 3.0 // VAC LIVE ACTIVE
          </div>
          <div className="flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-950/40 px-3 py-1.5 text-amber-300">
            <Wifi className="h-4 w-4" />
            SUB-TICK 64/128 HZ
          </div>
          <div className="flex items-center gap-1.5 rounded border border-cyan-500/60 bg-cyan-950/40 px-3 py-1.5 text-cyan-300">
            <Cpu className="h-4 w-4" />
            CS:GO FAST GRAPHICS PIPELINE
          </div>
        </div>
      </header>

      {/* Center Content — Map Blueprint + Callouts + Sub-Tick / VacNet Info */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-8 px-8 py-6 lg:grid-cols-12">
        {/* Left 5 Cols: Tactical Radar Map Blueprint */}
        <div className="lg:col-span-5 flex flex-col items-center rounded-xl border-2 border-[#2a2f34] bg-[#111519]/95 p-5 shadow-2xl">
          <div className="mb-3 flex w-full items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
            <span>TACTICAL RADAR OVERVIEW</span>
            <span className="font-mono text-[#e3a33b]">{alias.code}</span>
          </div>

          <div className="relative flex h-64 w-64 items-center justify-center rounded-lg border border-slate-700 bg-[#0b0e12]">
            <svg viewBox="-60 -60 120 120" className="h-full w-full p-2">
              <rect x="-56" y="-56" width="112" height="112" fill="none" stroke="#1e293b" strokeWidth="1" />
              <line x1="-56" y1="0" x2="56" y2="0" stroke="#1e293b" strokeWidth="0.6" strokeDasharray="2,2" />
              <line x1="0" y1="-56" x2="0" y2="56" stroke="#1e293b" strokeWidth="0.6" strokeDasharray="2,2" />
              {mapDef.objects
                .filter((o) => o.type === 'wall' || o.type === 'cube' || o.type === 'cover')
                .slice(0, 45)
                .map((o) => (
                  <rect
                    key={o.id}
                    x={o.position[0] - o.size[0] / 2}
                    y={o.position[2] - o.size[2] / 2}
                    width={o.size[0]}
                    height={o.size[2]}
                    fill="#334155"
                    stroke="#64748b"
                    strokeWidth="0.4"
                  />
                ))}
              {/* Bomb Sites & Spawns */}
              <circle cx="-26" cy="-14" r="6" fill="rgba(239,68,68,0.28)" stroke="#ef4444" strokeWidth="1.2" />
              <text x="-26" y="-12" textAnchor="middle" fill="#fca5a5" fontSize="6" fontWeight="900">
                A
              </text>
              <circle cx="26" cy="-14" r="6" fill="rgba(239,68,68,0.28)" stroke="#ef4444" strokeWidth="1.2" />
              <text x="26" y="-12" textAnchor="middle" fill="#fca5a5" fontSize="6" fontWeight="900">
                B
              </text>
              <circle cx="0" cy="-42" r="5" fill="rgba(56,189,248,0.3)" stroke="#38bdf8" strokeWidth="1.2" />
              <text x="0" y="-40" textAnchor="middle" fill="#bae6fd" fontSize="4.5" fontWeight="900">
                CT
              </text>
              <circle cx="0" cy="42" r="5" fill="rgba(245,158,11,0.3)" stroke="#f59e0b" strokeWidth="1.2" />
              <text x="0" y="44" textAnchor="middle" fill="#fde68a" fontSize="4.5" fontWeight="900">
                T
              </text>
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {mapDef.callouts.map((c) => (
              <span
                key={c.name}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-black text-slate-200"
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>

        {/* Right 7 Cols: Match Rules, Sub-Tick Architecture & VacNet Verification */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border-2 border-[#2a2f34] bg-[#111519]/95 p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#e3a33b]">
              WHAT YOU SEE IS WHAT YOU GET — CS2 SUB-TICK ARCHITECTURE
            </div>
            <h2 className="mt-1 text-xl font-black uppercase text-white">
              {mapDef.description}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-slate-800 bg-black/50 p-3">
                <div className="flex items-center gap-1.5 font-black uppercase text-amber-300">
                  <Crosshair className="h-4 w-4" /> SUB-TICK SHOOTING & COUNTER-STRAFE
                </div>
                <p className="mt-1 font-bold text-slate-300">
                  Moving, shooting, and throwing are evaluated at the exact sub-tick millisecond between ticks. Tap
                  opposite strafe keys (A/D) to counter-strafe for instant first-shot accuracy.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-black/50 p-3">
                <div className="flex items-center gap-1.5 font-black uppercase text-cyan-300">
                  <Layers className="h-4 w-4" /> CS:GO CLASSIC GRAPHICS OPTIMIZATION
                </div>
                <p className="mt-1 font-bold text-slate-300">
                  Uses CS:GO Source-1 high-visibility shader pipeline with smart frustum/occlusion culling for
                  maximum FPS on Low-End and Mid-End PCs.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-emerald-800/70 bg-emerald-950/30 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black uppercase text-emerald-300">
                  VACNET 3.0 // VAC LIVE HARDWARE & IP HANDSHAKE
                </span>
                <span className="font-mono text-[11px] font-black text-white">
                  {currentAccount.accountName} · {currentAccount.steamId}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] font-bold text-slate-300">
                HWID: {currentAccount.hwid} | IP: {currentAccount.ipAddress} | 24H VAC LIVE PROTECTION ENABLED
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <footer className="relative z-10 border-t-2 border-[#2a2f34] bg-[#101418]/95 px-8 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider">
            <span className="font-mono text-[#e3a33b]">{LOADING_STAGES[stageIdx]}</span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-white">{progress}%</span>
              {onComplete && (
                <button
                  onClick={onComplete}
                  className="rounded border border-[#e3a33b] bg-[#e3a33b]/20 px-3 py-1 text-[10px] font-black uppercase text-[#f0ba54] hover:bg-[#e3a33b]/35"
                >
                  ENTER MATCH NOW
                </button>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-[#e3a33b] to-[#f0ba54] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
