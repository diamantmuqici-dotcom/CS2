import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Crosshair as CrosshairIcon, Zap, ShieldCheck, Activity, AlertTriangle, WifiOff } from 'lucide-react';
import { VanguardEngine, HudState, MatchResultPayload } from '../../game/core/gameEngine';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { useSettingsStore, getObjectDistanceCutoffMeters } from '../../game/settings/settingsStore';
import { inputManager } from '../../game/input/inputManager';
import { networkClient } from '../../game/network/networkClient';
import { soundEngine } from '../../game/audio/soundEngine';
import { CrosshairReticle } from '../../game/ui/CrosshairReticle';
import { RadarMinimap } from '../../game/ui/RadarMinimap';
import { BuyMenuOverlay } from '../../game/ui/BuyMenuOverlay';
import { ScoreboardOverlay } from '../../game/ui/ScoreboardOverlay';
import { TelemetryOverlay } from '../../game/ui/TelemetryOverlay';
import { detectSurfaceCapability } from '../../game/rendering/capabilities';
import { MatchPlayerStats, WeaponSpec } from '../../shared/types';
import { WEAPON_SPECS } from '../../shared/weapons';

interface GameViewProps {
  onExit: () => void;
  onMatchComplete: (result: MatchResultPayload, scoreboard: MatchPlayerStats[]) => void;
}

export const GameView: React.FC<GameViewProps> = ({ onExit, onMatchComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VanguardEngine | null>(null);

  const match = useGamePlatformStore((s) => s.match);
  const customConfig = useGamePlatformStore((s) => s.customConfig);
  const buyPresets = useGamePlatformStore((s) => s.buyPresets);
  const video = useSettingsStore((s) => s.video);
  const crosshair = useSettingsStore((s) => s.crosshair);
  const gameplay = useSettingsStore((s) => s.gameplay);
  const mouse = useSettingsStore((s) => s.mouse);
  const updateGameplay = useSettingsStore((s) => s.updateGameplay);

  const [hud, setHud] = useState<HudState | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [showBuyMenu, setShowBuyMenu] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showPracticePanel, setShowPracticePanel] = useState(false);
  const [roundEnd, setRoundEnd] = useState<{ winner: string | null; reason: string } | null>(null);
  const [buyToast, setBuyToast] = useState<string | null>(null);
  const [damageFlash, setDamageFlash] = useState(0);
  const [practiceOpts, setPracticeOpts] = useState({
    infiniteAmmo: true,
    showGrenadeTrajectory: true,
    showHitboxes: false,
    botsFrozen: false,
    recoilTargetActive: true
  });
  const [initError, setInitError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const caps = useMemo(() => detectSurfaceCapability(), []);

  // ---------------------------------------------------------------------------
  // Engine bootstrap
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    if (engineRef.current) return;

    let engine: VanguardEngine | null = null;
    try {
      engine = new VanguardEngine(canvasRef.current, containerRef.current);
      const createdEngine = engine;
      createdEngine.setMatchEndCallback((result) => {
        onMatchComplete(result, createdEngine.getPlayers());
      });
      createdEngine.initialize(match.mode, match.mapId, match.playerTeam);
      createdEngine.onContextLostState((lost) => setContextLost(lost));
      engineRef.current = createdEngine;
    } catch (e) {
      setInitError((e as Error).message || 'Failed to initialize the 3D renderer.');
      return;
    }

    inputManager.attachCanvas(canvasRef.current);
    inputManager.onPointerLockChange = (locked) => {
      setPointerLocked(locked);
      if (!locked) setShowScoreboard(false);
    };
    inputManager.onEscapeRequested = () => {
      setShowBuyMenu(false);
      setShowPracticePanel(false);
      if (document.pointerLockElement) inputManager.exitPointerLock();
    };

    if (match.mode === 'Practice') setShowPracticePanel(true);

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
    // Engine is intentionally created once per match instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // HUD polling loop — decoupled from the render loop to keep React out of frame time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let rafId = 0;
    let last = 0;
    const poll = (t: number) => {
      rafId = requestAnimationFrame(poll);
      if (t - last < 50) return; // 20 Hz HUD refresh
      last = t;
      const engine = engineRef.current;
      if (!engine) return;
      setHud(engine.getHudState());
      setDisconnected(engine.isDisconnected());
      const roundInfo = engine.getRoundEndInfo();
      if (roundInfo.winner) {
        setRoundEnd({ winner: roundInfo.winner, reason: roundInfo.reason });
      } else {
        setRoundEnd(null);
      }
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Damage indicator flash
  const lastHealthRef = useRef(100);
  useEffect(() => {
    if (!hud) return;
    if (hud.health < lastHealthRef.current) {
      setDamageFlash(1);
      const t = setTimeout(() => setDamageFlash(0), 220);
      lastHealthRef.current = hud.health;
      return () => clearTimeout(t);
    }
    lastHealthRef.current = hud.health;
  }, [hud?.health]);

  // ---------------------------------------------------------------------------
  // Global key handling for menu-level overlays
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return;
      const kb = useSettingsStore.getState().keybinds;
      if (e.code === kb.buyMenu) {
        e.preventDefault();
        setShowBuyMenu((v) => {
          const next = !v;
          if (next) inputManager.exitPointerLock();
          else inputManager.requestPointerLock();
          return next;
        });
      }
      if (e.code === kb.scoreboard) {
        e.preventDefault();
        setShowScoreboard(true);
      }
      if (e.code === kb.cullingDebugToggle) {
        e.preventDefault();
        updateGameplay({});
        const v = useSettingsStore.getState().video;
        useSettingsStore.getState().updateVideo({ showCullingDebug: !v.showCullingDebug, telemetryMode: !v.showCullingDebug ? 'FULL' : v.telemetryMode });
      }
      if (e.code === 'KeyP' && match.mode === 'Practice') {
        setShowPracticePanel((v) => !v);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const kb = useSettingsStore.getState().keybinds;
      if (e.code === kb.scoreboard) setShowScoreboard(false);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [match.mode, updateGameplay]);

  // Window / container resize → keep the drawing buffer and camera aspect in sync
  useEffect(() => {
    const onResize = () => engineRef.current?.handleResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Settings that change the render pipeline are applied live during a match
  useEffect(() => {
    engineRef.current?.handleResize();
  }, [video.renderScale, video.resolutionPreset]);

  const requestLock = useCallback(() => {
    soundEngine.playUiSound('click');
    inputManager.requestPointerLock();
  }, []);

  const handleBuyWeapon = useCallback((weaponId: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    const res = engine.purchaseWeapon(weaponId);
    soundEngine.playUiSound(res.ok ? 'buy' : 'error');
    setBuyToast(res.message);
    setTimeout(() => setBuyToast(null), 2200);
  }, []);

  const handleBuyEquipment = useCallback((equipId: 'kevlar_vest' | 'kevlar_helmet' | 'defuse_kit') => {
    const engine = engineRef.current;
    if (!engine) return;
    const res = engine.purchaseEquipment(equipId);
    soundEngine.playUiSound(res.ok ? 'buy' : 'error');
    setBuyToast(res.message);
    setTimeout(() => setBuyToast(null), 2200);
  }, []);

  const handleApplyPreset = useCallback((preset: import('../../game/core/gameStateStore').BuyPreset) => {
    const engine = engineRef.current;
    if (!engine) return;
    const res = engine.applyBuyPreset(preset);
    soundEngine.playUiSound(res.ok ? 'buy' : 'error');
    setBuyToast(res.message);
    setTimeout(() => setBuyToast(null), 2600);
  }, []);

  const togglePractice = useCallback((key: keyof typeof practiceOpts) => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !practiceOpts[key];
    setPracticeOpts((prev) => ({ ...prev, [key]: next }));
    engine.setPracticeOption(key as 'infiniteAmmo' | 'showGrenadeTrajectory' | 'showHitboxes' | 'botsFrozen' | 'recoilTargetActive', next);
  }, [practiceOpts]);

  const currentWeaponSpec: WeaponSpec | undefined = hud ? WEAPON_SPECS[hud.weaponId] : undefined;

  if (initError) {
    const isMapFailure = initError.includes('MAP_LOAD_FAILURE');
    // A renderer failure is recoverable: the same match can run on the 2D
    // compatibility renderer, so the player is offered that instead of being
    // stranded on an error screen.
    const isRendererFailure = !isMapFailure;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-tac-bg p-8 text-center">
        <AlertTriangle className="mb-4 h-14 w-14 text-amber-400" />
        <h1 className="mb-2 text-2xl font-black text-white">
          {isMapFailure ? 'MAP LOADING FAILURE' : '3D RENDERER FAILED TO INITIALIZE'}
        </h1>
        <p className="mb-2 max-w-xl text-sm leading-relaxed text-slate-400">
          {isMapFailure
            ? `${initError.replace('MAP_LOAD_FAILURE: ', '')}
               The workshop package may be corrupted, empty, or authored for an unsupported format version.
               Return to the launcher and select a different map, or re-validate the package in the Workshop tab.`
            : initError}
        </p>
        {isRendererFailure && (
          <p className="mb-6 max-w-xl text-[12px] leading-relaxed text-slate-500">
            Vanguard Protocol ships a compatibility renderer that runs the same match on a 2D tactical
            view. The score, rounds, economy and bots are all identical — only the view differs.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {isRendererFailure && (
            <button
              onClick={() => {
                useSettingsStore.getState().updateVideo({ rendererOverride: 'Compatibility2D' });
                onExit();
                // The launcher re-enters on the next launch; reload is not needed
                // because the match is started by the player.
              }}
              className="rounded bg-cyan-600 px-6 py-2.5 font-bold text-white hover:bg-cyan-500"
            >
              CONTINUE IN COMPATIBILITY MODE
            </button>
          )}
          <button
            onClick={onExit}
            className={`rounded px-6 py-2.5 font-bold ${
              isRendererFailure
                ? 'border border-tac-border bg-tac-panel2 text-slate-200 hover:border-cyan-600'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
          >
            RETURN TO MAIN MENU
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded border border-tac-border bg-tac-panel2 px-6 py-2.5 font-bold text-slate-200 hover:border-cyan-600"
          >
            RELOAD APPLICATION
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-black select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Graphics context recovery notice. The engine suppresses rendering
          while lost and rebuilds its GPU resources on `restored`, so this
          is informational rather than terminal. */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded border border-amber-700/70 bg-tac-panel/95 px-6 py-4 text-center">
            <div className="mb-1 text-[12px] font-black uppercase tracking-[0.2em] text-amber-300">
              Graphics context lost
            </div>
            <div className="text-[11px] text-slate-400">
              The graphics driver reset the GPU. Recovering automatically…
            </div>
          </div>
        </div>
      )}

      {/* Damage / Hit Direction Overlay */}
      {damageFlash > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'radial-gradient(circle, transparent 42%, rgba(220,38,38,0.42) 100%)',
            opacity: damageFlash
          }}
        />
      )}

      {/* Crosshair */}
      {hud && hud.alive && !showBuyMenu && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <CrosshairReticle
            settings={crosshair}
            movementSpeed={hud.movementSpeed}
            isFiring={false}
            isScoped={hud.isScoped}
          />
        </div>
      )}

      {/* Practice grenade trajectory preview */}
      {hud && hud.practiceTrajectory.length > 1 && (
        <TrajectoryOverlay points={hud.practiceTrajectory} engine={engineRef.current} />
      )}

      {/* =================== TOP BAR =================== */}
      {hud && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between p-4">
          {/* Scoreboard */}
          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/85 shadow-xl">
            <div className="flex flex-col items-center border-r border-slate-800 px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">SENTINEL</span>
              <span className="font-mono text-2xl font-black text-white">{hud.sentinelScore}</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">VORTEX</span>
              <span className="font-mono text-2xl font-black text-white">{hud.vortexScore}</span>
            </div>
            <div className="flex flex-col items-center justify-center border-l border-slate-800 bg-slate-900/70 px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {hud.phase === 'BUY_PHASE' ? 'BUY PHASE' : hud.bombPlanted ? 'BOMB LIVE' : `ROUND ${hud.roundNumber}`}
              </span>
              <span className={`font-mono text-2xl font-black ${hud.phaseTimer < 10 ? 'text-red-400' : 'text-white'}`}>
                {Math.floor(hud.phaseTimer / 60)}:{String(Math.floor(hud.phaseTimer) % 60).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Bomb timer */}
          {hud.bombPlanted && (
            <div className="flex flex-col items-center rounded-lg border-2 border-red-500/70 bg-red-950/70 px-6 py-2 shadow-2xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-300">
                PULSE BOMB ARMED
              </span>
              <span className="font-mono text-3xl font-black text-red-400 animate-pulse">
                {hud.bombTimer.toFixed(1)}s
              </span>
              {hud.bombDefuseProgress > 0 && (
                <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-red-900">
                  <div className="h-full bg-cyan-400" style={{ width: `${hud.bombDefuseProgress * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Kill Feed */}
          {gameplay.killFeedEnabled && (
            <div className="flex w-80 flex-col items-end gap-1">
              {hud.killFeed.slice(-5).map((kf) => (
                <div
                  key={kf.id}
                  className="flex items-center gap-2 rounded border border-slate-700/80 bg-slate-950/85 px-2.5 py-1 text-[11px] font-semibold shadow-lg"
                >
                  <span className={kf.killerTeam === 'SENTINEL' ? 'text-cyan-400' : 'text-amber-400'}>
                    {kf.killerName}
                  </span>
                  <span className="text-slate-400">[{kf.weaponName}]</span>
                  {kf.isHeadshot && <CrosshairIcon className="h-3 w-3 text-red-400" />}
                  {kf.isWallbang && <Zap className="h-3 w-3 text-purple-400" />}
                  <span className={kf.victimTeam === 'SENTINEL' ? 'text-cyan-400' : 'text-amber-400'}>
                    {kf.victimName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================== TELEMETRY =================== */}
      {hud && engineRef.current && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ top: gameplay.radarSize + 56, left: 16 }}
        >
          <TelemetryOverlay
            mode={video.telemetryMode}
            showCullingDebug={video.showCullingDebug}
            frame={engineRef.current.getFrameSnapshot()}
            culling={engineRef.current.getCullingStats()}
            net={networkClient.telemetry}
          />
        </div>
      )}

      {/* =================== LIVE RADAR =================== */}
      {hud && engineRef.current && (
        <LiveRadar hud={hud} engine={engineRef.current} size={gameplay.radarSize} zoom={gameplay.radarZoom} rotate={gameplay.radarRotate} showDebug={video.showCullingDebug} />
      )}

      {/* =================== BOTTOM HUD =================== */}
      {hud && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex items-end justify-between p-5">
          {/* Health / Armor */}
          <div className="flex items-end gap-3">
            <div className="min-w-[150px] rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2.5 shadow-xl">
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-4xl font-black ${hud.health > 40 ? 'text-white' : 'text-red-400'}`}>
                  {hud.health}
                </span>
                <span className="text-xs font-bold uppercase text-slate-400">HP</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full ${hud.health > 40 ? 'bg-emerald-400' : 'bg-red-500'}`}
                  style={{ width: `${hud.health}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2.5 shadow-xl">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-5 w-5 ${hud.armor > 0 ? 'text-cyan-400' : 'text-slate-600'}`} />
                <span className="font-mono text-2xl font-black text-white">{hud.armor}</span>
                {hud.hasHelmet && <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">HELMET</span>}
              </div>
            </div>

            {hud.hasDefuseKit && (
              <div className="rounded-lg border border-emerald-600/60 bg-emerald-950/70 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 shadow-xl">
                DEFUSE KIT
              </div>
            )}
          </div>

          {/* Center: interaction prompt + round end */}
          <div className="flex flex-col items-center gap-2">
            {hud.interactionPrompt && (
              <div className="rounded border border-amber-500/60 bg-amber-950/80 px-4 py-2 text-xs font-bold tracking-wide text-amber-200 shadow-xl">
                {hud.interactionPrompt}
              </div>
            )}
            {roundEnd?.winner && (
              <div
                className={`rounded-lg border-2 px-8 py-3 shadow-2xl ${
                  roundEnd.winner === 'SENTINEL'
                    ? 'border-cyan-500/70 bg-cyan-950/85'
                    : 'border-amber-500/70 bg-amber-950/85'
                }`}
              >
                <div className="text-center">
                  <div className="text-lg font-black uppercase tracking-widest text-white">
                    {roundEnd.winner} WINS THE ROUND
                  </div>
                  <div className="text-[11px] font-semibold text-slate-300">{roundEnd.reason.replace(/_/g, ' ')}</div>
                </div>
              </div>
            )}
            {!hud.alive && (
              <div className="rounded-lg border border-red-800 bg-red-950/80 px-6 py-3 text-center shadow-2xl">
                <div className="text-sm font-black uppercase tracking-widest text-red-300">ELIMINATED</div>
                <div className="text-[11px] text-slate-300">
                  {engineRef.current?.deathCause ? `Killed by ${engineRef.current.deathCause}` : 'Awaiting next round'}
                </div>
                {hud.respawnTimer > 0 && hud.respawnTimer < 20 && (
                  <div className="mt-1 font-mono text-xs text-white">Respawn in {hud.respawnTimer.toFixed(1)}s</div>
                )}
              </div>
            )}
          </div>

          {/* Ammo / Money */}
          <div className="flex items-end gap-3">
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2.5 text-right shadow-xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">FUNDS</div>
              <div className="font-mono text-xl font-black text-emerald-400">${hud.money}</div>
            </div>
            <div className="min-w-[170px] rounded-lg border border-slate-700/80 bg-slate-950/85 px-4 py-2.5 text-right shadow-xl">
              <div className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {hud.weaponName}
                {currentWeaponSpec?.suppressed ? ' (SUPPRESSED)' : ''}
              </div>
              <div className="flex items-baseline justify-end gap-2">
                <span className={`font-mono text-3xl font-black ${hud.ammoInMag > 0 ? 'text-white' : 'text-red-400'}`}>
                  {hud.ammoInMag}
                </span>
                <span className="font-mono text-lg font-bold text-slate-500">
                  / {hud.reserveAmmo > 9000 ? '∞' : hud.reserveAmmo}
                </span>
              </div>
              {hud.isReloading && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-cyan-400 transition-none" style={{ width: `${hud.reloadProgress * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================== POINTER LOCK PROMPT =================== */}
      {!pointerLocked && !showBuyMenu && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#0c1118]/95 p-8 text-center shadow-2xl">
            <Activity className="mx-auto mb-3 h-10 w-10 text-cyan-400" />
            <h2 className="text-xl font-black tracking-wide text-white">
              {match.mode} — {engineRef.current?.getMapName()}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {caps.pointerLock
                ? 'Click below to capture raw mouse input and enter tactical gameplay.'
                : 'Pointer Lock is unavailable in this browser; mouse look will be limited.'}
            </p>

            <button
              onClick={requestLock}
              className="mt-6 w-full rounded-lg bg-cyan-600 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-cyan-500"
            >
              ENTER MATCH
            </button>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">WASD</div>Move
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">MOUSE</div>Aim / Fire
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">B</div>Buy Menu
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">TAB</div>Scoreboard
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">R</div>Reload
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">G</div>Drop / Objective
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">F3</div>Occlusion Debug
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-2 text-left">
                <div className="font-bold text-slate-300">ESC</div>Release Mouse
              </div>
            </div>

            <button
              onClick={onExit}
              className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-red-400"
            >
              ABANDON MATCH
            </button>
          </div>
        </div>
      )}

      {/* =================== BUY MENU =================== */}
      {showBuyMenu && hud && (
        <BuyMenuOverlay
          team={hud.localTeam === 'SENTINEL' ? 'SENTINEL' : 'VORTEX'}
          money={hud.money}
          armor={hud.armor}
          hasHelmet={hud.hasHelmet}
          hasDefuseKit={hud.hasDefuseKit}
          ownedWeapons={[]}
          ownedGrenades={[]}
          onBuyWeapon={handleBuyWeapon}
          onBuyEquipment={handleBuyEquipment}
          onApplyPreset={handleApplyPreset}
          onClose={() => {
            setShowBuyMenu(false);
            inputManager.requestPointerLock();
          }}
        />
      )}

      {/* =================== SCOREBOARD =================== */}
      {showScoreboard && hud && (
        <ScoreboardOverlay
          mode={match.mode}
          mapName={engineRef.current?.getMapName() || ''}
          roundNumber={hud.roundNumber}
          maxRounds={match.maxRounds}
          sentinelScore={hud.sentinelScore}
          vortexScore={hud.vortexScore}
          players={hud.players}
        />
      )}

      {/* =================== PRACTICE PANEL =================== */}
      {showPracticePanel && (
        <div className="absolute right-4 top-56 z-40 w-64 rounded-lg border border-slate-700 bg-slate-950/95 p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-cyan-400">PRACTICE SANDBOX [P]</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            {(
              [
                ['infiniteAmmo', 'Infinite Ammo'],
                ['showGrenadeTrajectory', 'Grenade Trajectory'],
                ['botsFrozen', 'Freeze Bots'],
                ['recoilTargetActive', 'Recoil Feedback']
              ] as Array<[keyof typeof practiceOpts, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => togglePractice(key)}
                className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 font-bold transition ${
                  practiceOpts[key]
                    ? 'border-cyan-500/60 bg-cyan-950/50 text-cyan-300'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400'
                }`}
              >
                {label}
                <span>{practiceOpts[key] ? 'ON' : 'OFF'}</span>
              </button>
            ))}
            <button
              onClick={() => engineRef.current?.refillAmmo()}
              className="mt-2 w-full rounded border border-emerald-600/60 bg-emerald-950/50 px-2.5 py-1.5 font-bold text-emerald-300 hover:bg-emerald-900/50"
            >
              REFILL AMMO / HP / MONEY
            </button>
          </div>
        </div>
      )}

      {/* =================== TOASTS =================== */}
      {buyToast && (
        <div className="pointer-events-none absolute bottom-32 left-1/2 z-50 -translate-x-1/2 rounded border border-cyan-600/70 bg-slate-950/95 px-5 py-2 text-xs font-bold text-cyan-200 shadow-2xl">
          {buyToast}
        </div>
      )}

      {/* =================== CULLING DEBUG LEGEND =================== */}
      {video.showCullingDebug && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded border border-slate-700 bg-slate-950/92 px-4 py-2 font-mono text-[10px] text-slate-300">
          <span className="mr-3 font-bold text-emerald-400">■ VISIBLE</span>
          <span className="mr-3 font-bold text-red-400">■ BEHIND CAMERA</span>
          <span className="mr-3 font-bold text-purple-400">■ OCCLUDED BY WALL</span>
          <span className="font-bold text-amber-400">■ OUTSIDE FRUSTUM / DISTANCE</span>
        </div>
      )}

      {/* =================== CONNECTION LOST =================== */}
      {disconnected && (
        <div className="absolute inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b-2 border-red-700 bg-red-950/95 px-4 py-2.5">
          <WifiOff className="h-4 w-4 shrink-0 text-red-400" />
          <div className="text-[11px] font-bold uppercase tracking-widest text-red-200">
            CONNECTION LOST — SERVER UNREACHABLE
          </div>
          <div className="text-[10px] text-red-300/80">
            Gameplay continues on a local authoritative simulation. Damage, economy and round results will not be
            submitted for rating until the connection is restored.
          </div>
          <button
            onClick={() => engineRef.current?.attemptReconnect()}
            className="ml-2 shrink-0 rounded border border-red-500/70 bg-red-900/60 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-100 hover:bg-red-800"
          >
            RECONNECT NOW
          </button>
        </div>
      )}

      {/* Unsupported hardware banner */}
      {caps.unsupportedReason && (
        <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded border border-amber-600/70 bg-amber-950/90 px-5 py-2 text-center text-[11px] font-semibold text-amber-200">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          {caps.unsupportedReason}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live radar wrapper — reads authoritative positions + rotates the footprint
// ---------------------------------------------------------------------------
const LiveRadar: React.FC<{
  hud: HudState;
  engine: VanguardEngine;
  size: number;
  zoom: number;
  rotate: boolean;
  showDebug: boolean;
}> = ({ hud, engine, size, zoom, rotate, showDebug }) => {
  const local = hud.players.find((p) => p.id === 'local_player');
  if (!local) return null;

  return (
    <div className="absolute z-30" style={{ top: 16, left: 16 }}>
      <RadarMinimap
        map={engine.getMap()}
        localPos={local.position}
        localYaw={local.yaw}
        localTeam={hud.localTeam}
        players={hud.players}
        visibleEnemyIds={new Set(hud.visibleEnemyIds)}
        bombPlanted={hud.bombPlanted}
        bombPosition={null}
        size={size}
        zoom={zoom}
        rotate={rotate}
        currentCallout={hud.currentCallout}
        showCullingDebug={showDebug}
        cullingDecisions={engine.getCullingDecisions()}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Trajectory preview overlay for practice mode
// ---------------------------------------------------------------------------
const TrajectoryOverlay: React.FC<{ points: Array<{ x: number; y: number; z: number }>; engine: VanguardEngine | null }> = ({
  engine
}) => {
  const [projected, setProjected] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (!engine) return;
    let rafId = 0;
    let lastUpdate = 0;
    const v = new THREE.Vector3();

    const tick = (t: number) => {
      rafId = requestAnimationFrame(tick);
      if (t - lastUpdate < 33) return; // 30 Hz overlay refresh
      lastUpdate = t;

      const camera = (engine as unknown as { camera: THREE.PerspectiveCamera }).camera;
      if (!camera) return;
      const livePoints = engine.getTrainingTrajectory();
      if (livePoints.length === 0) {
        if (projected.length > 0) setProjected([]);
        return;
      }
      const out: Array<{ x: number; y: number }> = [];
      for (const p of livePoints) {
        v.set(p.x, p.y, p.z).project(camera);
        if (v.z > -1 && v.z < 1) {
          out.push({
            x: (v.x * 0.5 + 0.5) * window.innerWidth,
            y: (-v.y * 0.5 + 0.5) * window.innerHeight
          });
        }
      }
      setProjected(out);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
      {projected.map((p, i) =>
        i > 0 ? (
          <line
            key={i}
            x1={projected[i - 1].x}
            y1={projected[i - 1].y}
            x2={p.x}
            y2={p.y}
            stroke={i === projected.length - 1 ? '#ef4444' : '#22d3ee'}
            strokeWidth={i === projected.length - 1 ? 3 : 1.6}
            strokeDasharray={i === projected.length - 1 ? undefined : '3,3'}
          />
        ) : null
      )}
    </svg>
  );
};
