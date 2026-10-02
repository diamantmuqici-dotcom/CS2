/**
 * Compatibility match view.
 *
 * Used when the device cannot provide a WebGL2 context, which is what the
 * three.js engine requires. Instead of refusing to play, the match runs on the
 * same simulation modules with the 2D tactical renderer, and the HUD, score,
 * kill feed and round flow are all real.
 *
 * The banner is explicit that this is 2D compatibility rendering — it never
 * pretends to be the 3D view.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LogOut, Radar } from 'lucide-react';
import { CompatibilityMatch, type CompatHud } from '../../game/core/compatibilityMatch';
import { rendererManager } from '../../game/rendering/renderer-manager';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import type { MatchResultPayload } from '../../game/core/gameEngine';
import type { MatchPlayerStats } from '../../shared/types';

export const CompatibilityGameView: React.FC<{
  onExit: () => void;
  /** The compatibility match has no per-player statboard, so the scoreboard
   *  argument is not produced; the launcher handles an empty list. */
  onMatchComplete: (result: MatchResultPayload, scoreboard: MatchPlayerStats[]) => void;
}> = ({ onExit, onMatchComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const matchRef = useRef<CompatibilityMatch | null>(null);
  const [hud, setHud] = useState<CompatHud | null>(null);
  const [error, setError] = useState<string | null>(null);

  const match = useGamePlatformStore((s) => s.match);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!CompatibilityMatch.isSupported()) {
      // Level 4: no 2D surface either. The DOM interface stays usable and the
      // reason is stated rather than showing a blank screen.
      setError(
        'This browser does not provide a 2D canvas context either, so no match view can be drawn. The launcher and all settings remain fully usable.'
      );
      return;
    }

    let instance: CompatibilityMatch;
    try {
      instance = new CompatibilityMatch(
        canvas,
        match.mode,
        match.mapId,
        match.playerTeam,
        useGamePlatformStore.getState().customMaps
      );
    } catch (err) {
      setError(
        `The compatibility match could not be created: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    matchRef.current = instance;
    instance.setFrameCallback(setHud);
    instance.setCompleteCallback((result) => onMatchComplete(result, []));

    const detachWatch = rendererManager.attachContextWatch(canvas);
    instance.start();

    return () => {
      detachWatch();
      instance.dispose();
      matchRef.current = null;
    };
    // onMatchComplete is stable from App; re-running on every render would
    // tear down a live match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selection = rendererManager.getSelection();

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tac-bg px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">No rendering surface</h2>
        <p className="max-w-md text-[12px] leading-relaxed text-slate-400">{error}</p>
        <button
          onClick={onExit}
          className="flex items-center gap-2 rounded border border-cyan-700 bg-cyan-950/40 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300"
        >
          <LogOut className="h-3.5 w-3.5" /> Back to launcher
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />

      {/* Compatibility-mode banner — honest about what is being rendered. */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border border-amber-700/70 bg-amber-950/90 px-3 py-1 text-center">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Compatibility mode — 2D tactical renderer
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-amber-200/80">
          {selection.rationale}
        </div>
      </div>

      {/* Exit */}
      <button
        onClick={onExit}
        className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded border border-tac-border bg-tac-panel/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-cyan-600 hover:text-cyan-300"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>

      {/* Score */}
      {hud && (
        <div className="absolute left-1/2 top-14 z-20 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded border border-tac-border bg-tac-panel/85 px-5 py-1.5 font-mono text-sm font-bold backdrop-blur-sm">
            <span className="text-cyan-400">SENTINEL {hud.sentinelScore}</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">{hud.phase}</span>
            <span className="text-orange-400">{hud.vortexScore} VORTEX</span>
          </div>
          <div className="mt-1 text-center font-mono text-[11px] text-slate-300">
            {formatClock(hud.roundTimeSec)}
            {hud.bombTimeSec !== null && (
              <span className="ml-3 text-red-400">BOMB {Math.ceil(hud.bombTimeSec)}</span>
            )}
          </div>
        </div>
      )}

      {/* Crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="h-4 w-4 opacity-70">
          <div className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-cyan-300" />
          <div className="absolute bottom-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-cyan-300" />
          <div className="absolute left-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-cyan-300" />
          <div className="absolute right-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-cyan-300" />
        </div>
      </div>

      {/* Kill feed */}
      {hud && hud.killFeed.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-14 z-20 space-y-1">
          {hud.killFeed.map((k, i) => (
            <div
              key={i}
              className="rounded border border-tac-border bg-tac-panel/85 px-2 py-0.5 text-right font-mono text-[10px] backdrop-blur-sm"
            >
              <span className="text-cyan-300">{k.killer}</span>
              <span className="mx-1 text-slate-500">▸</span>
              <span className="text-orange-300">{k.victim}</span>
              <span className="ml-1.5 text-slate-500">{k.weapon}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom HUD */}
      {hud && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4">
          <div className="rounded border border-tac-border bg-tac-panel/85 px-3 py-2 font-mono backdrop-blur-sm">
            <div className="text-[9px] uppercase tracking-widest text-slate-500">
              <Radar className="mr-1 inline h-3 w-3" />
              {hud.callout}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-300">
              SENTINEL {hud.alive.sentinel} · VORTEX {hud.alive.vortex}
            </div>
          </div>

          <div className="rounded border border-tac-border bg-tac-panel/85 px-4 py-2 font-mono backdrop-blur-sm">
            <div className="text-[9px] uppercase tracking-widest text-slate-500">{hud.weaponName}</div>
            <div className="text-lg font-bold text-white">
              {hud.ammo}
              <span className="text-[11px] text-slate-500"> / {hud.reserve}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="rounded border border-tac-border bg-tac-panel/85 px-3 py-2 text-center font-mono backdrop-blur-sm">
              <div className="text-[9px] uppercase tracking-widest text-slate-500">Health</div>
              <div className={`text-base font-bold ${hud.health > 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                {hud.health}
              </div>
            </div>
            <div className="rounded border border-tac-border bg-tac-panel/85 px-3 py-2 text-center font-mono backdrop-blur-sm">
              <div className="text-[9px] uppercase tracking-widest text-slate-500">Armor</div>
              <div className="text-base font-bold text-cyan-400">{hud.armor}</div>
            </div>
            <div className="rounded border border-tac-border bg-tac-panel/85 px-3 py-2 text-center font-mono backdrop-blur-sm">
              <div className="text-[9px] uppercase tracking-widest text-slate-500">Credits</div>
              <div className="text-base font-bold text-amber-400">${hud.money}</div>
            </div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded border border-tac-border bg-tac-panel/70 px-3 py-1 font-mono text-[9px] text-slate-500">
        <span className="text-cyan-400">WASD</span> move ·{' '}
        <span className="text-cyan-400">MOUSE</span> aim · <span className="text-cyan-400">LMB</span> fire ·{' '}
        <span className="text-cyan-400">R</span> reload · <span className="text-cyan-400">SHIFT</span> walk ·{' '}
        <span className="text-cyan-400">CTRL</span> crouch · <span className="text-cyan-400">ESC</span> exit
      </div>

      {hud?.announcement && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 z-20 -translate-x-1/2 rounded border border-cyan-800 bg-tac-panel/90 px-4 py-1.5 font-mono text-[12px] font-bold uppercase tracking-widest text-cyan-300">
          {hud.announcement}
        </div>
      )}
    </div>
  );
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
