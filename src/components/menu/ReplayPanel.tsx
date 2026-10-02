import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, Pause, SkipBack, SkipForward, Video, Users, Bomb, Camera, Eye, Layers } from 'lucide-react';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { OFFICIAL_MAPS } from '../../game/maps/officialMaps';
import { Panel, Button, StatChip, Tabs } from '../ui/primitives';
import { buildWorld } from '../../game/rendering/worldRenderer';
import { buildOperatorAvatar } from '../../game/rendering/worldRenderer';
import { ReplayRecord } from '../../shared/types';
import { soundEngine } from '../../game/audio/soundEngine';
import { rendererManager } from '../../game/rendering/renderer-manager';

type CameraMode = 'FREE' | 'FIRST_PERSON' | 'THIRD_PERSON';
type PlayerView = 'AUTO' | string;

export const ReplayPanel: React.FC = () => {
  const { replays } = useGamePlatformStore();
  const [selectedId, setSelectedId] = useState<string | null>(replays[0]?.id ?? null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('FREE');
  const [viewPlayer, setViewPlayer] = useState<PlayerView>('AUTO');
  const [playing, setPlaying] = useState(false);
  const [timeSec, setTimeSec] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showEvents, setShowEvents] = useState(true);
  const [viewportError, setViewportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    actors: Map<string, { group: THREE.Group; dispose: () => void }>;
    worldRoot: THREE.Object3D | null;
    disposeWorld: (() => void) | null;
    targetCamPos: THREE.Vector3;
    targetCamLook: THREE.Vector3;
  } | null>(null);

  const replay = replays.find((r) => r.id === selectedId) || replays[0] || null;
  const map = replay ? OFFICIAL_MAPS[replay.mapId] || OFFICIAL_MAPS.harbor_protocol : OFFICIAL_MAPS.harbor_protocol;

  const snapshots = useMemo(
    () => (replay ? replay.events.filter((e) => e.type === 'snapshot') : []),
    [replay]
  );
  const keyEvents = useMemo(
    () => (replay ? replay.events.filter((e) => e.type !== 'snapshot') : []),
    [replay]
  );

  const duration = replay?.durationSec || 1;
  const currentSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null;
    let best = snapshots[0];
    for (const s of snapshots) {
      if (s.timeSec <= timeSec) best = s;
      else break;
    }
    return best;
  }, [snapshots, timeSec]);

  // -------------------------------------------------------------------------
  // Replay viewport
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // The replay theatre is 3D-only. Without a WebGL2 context there is nothing
    // to render, so the panel says so instead of throwing inside three.js and
    // taking the whole launcher down with an ErrorBoundary.
    const selection = rendererManager.getSelection();
    if (!selection.supports3D) {
      setViewportError(
        selection.domOnly
          ? 'This browser provides no rendering context at all.'
          : `The replay theatre needs a WebGL2 context. ${selection.rationale}`
      );
      return;
    }
    setViewportError(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    } catch (err) {
      setViewportError(
        `The 3D replay viewport could not start: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.skyColor);
    scene.fog = new THREE.Fog(new THREE.Color(map.fogColor), 30, 180);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(26, 20, 26);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(new THREE.Color(map.ambientColor), new THREE.Color(0x0a0f18), 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
    sun.position.set(map.sunDirection[0], map.sunDirection[1], map.sunDirection[2]);
    scene.add(sun);

    refs.current = {
      renderer,
      scene,
      camera,
      actors: new Map(),
      worldRoot: null,
      disposeWorld: null,
      targetCamPos: new THREE.Vector3(26, 20, 26),
      targetCamLook: new THREE.Vector3(0, 0, 0)
    };

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const ref = refs.current;
      if (ref) {
        ref.camera.position.lerp(ref.targetCamPos, 0.12);
        const lookTarget = ref.targetCamLook;
        ref.camera.lookAt(lookTarget);
        renderer.render(ref.scene, ref.camera);
      }
    };
    animate();

    const onResize = () => {
      if (!containerRef.current || !refs.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      refs.current.renderer.setSize(w, h, false);
      refs.current.camera.aspect = w / Math.max(1, h);
      refs.current.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      const ref = refs.current;
      if (ref) {
        for (const actor of ref.actors.values()) {
          ref.scene.remove(actor.group);
          actor.dispose();
        }
        ref.disposeWorld?.();
        renderer.dispose();
      }
      refs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild world when map changes
  useEffect(() => {
    const ref = refs.current;
    if (!ref) return;
    if (ref.worldRoot) {
      ref.scene.remove(ref.worldRoot);
      ref.disposeWorld?.();
    }
    const world = buildWorld(map);
    ref.scene.add(world.root);
    ref.worldRoot = world.root;
    ref.disposeWorld = () => world.dispose();
    ref.scene.background = new THREE.Color(map.skyColor);
    if (ref.scene.fog instanceof THREE.Fog) {
      ref.scene.fog.color = new THREE.Color(map.fogColor);
    }

    // Clear actors (roster changes across replays)
    for (const actor of ref.actors.values()) {
      ref.scene.remove(actor.group);
      actor.dispose();
    }
    ref.actors.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

  // Apply snapshot to actors
  useEffect(() => {
    const ref = refs.current;
    if (!ref || !currentSnapshot?.actors) return;

    const seen = new Set<string>();
    for (const actor of currentSnapshot.actors) {
      seen.add(actor.id);
      let entry = ref.actors.get(actor.id);
      if (!entry) {
        const avatar = buildOperatorAvatar(actor.team === 'VORTEX' ? 'VORTEX' : 'SENTINEL');
        ref.scene.add(avatar.group);
        entry = avatar;
        ref.actors.set(actor.id, entry);
      }
      entry.group.position.set(actor.pos[0], actor.pos[1], actor.pos[2]);
      entry.group.rotation.y = actor.yaw;
      entry.group.visible = actor.hp > 0;
    }

    for (const [id, entry] of ref.actors.entries()) {
      if (!seen.has(id)) entry.group.visible = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnapshot]);

  // Camera targeting
  useEffect(() => {
    const ref = refs.current;
    if (!ref || !currentSnapshot?.actors) return;

    let target = currentSnapshot.actors.find((a) => a.hp > 0) || currentSnapshot.actors[0];
    if (viewPlayer !== 'AUTO') {
      target = currentSnapshot.actors.find((a) => a.id === viewPlayer) || target;
    }
    if (!target) return;

    const [x, y, z] = target.pos;
    if (cameraMode === 'FIRST_PERSON') {
      ref.targetCamPos.set(x, y + 1.66, z);
      const fx = -Math.sin(target.yaw) * Math.cos(target.pitch);
      const fy = Math.sin(target.pitch);
      const fz = -Math.cos(target.yaw) * Math.cos(target.pitch);
      ref.targetCamLook.set(x + fx * 12, y + 1.66 + fy * 12, z + fz * 12);
    } else if (cameraMode === 'THIRD_PERSON') {
      const bx = x + Math.sin(target.yaw) * 4.5;
      const bz = z + Math.cos(target.yaw) * 4.5;
      ref.targetCamPos.set(bx, y + 2.9, bz);
      ref.targetCamLook.set(x, y + 1.3, z);
    }
  }, [currentSnapshot, cameraMode, viewPlayer]);

  // Playback clock
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      setTimeSec((t) => {
        const next = t + dt * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, duration]);

  if (!replay) {
    return (
      <Panel title="REPLAY THEATRE">
        <div className="p-6 text-center text-xs text-slate-500">
          No replays recorded yet. Complete a match to generate a compact event-stream replay.
        </div>
      </Panel>
    );
  }

  const activeEvents = keyEvents.filter((e) => Math.abs(e.timeSec - timeSec) < 1.4);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <div className="space-y-3">
        <Panel
          title="REPLAY THEATRE"
          subtitle={`${replay.title} · ${replay.events.length} events · stored as a compact tick stream, not video`}
          actions={
            <Tabs
              tabs={[
                { id: 'FREE', label: 'Free Camera' },
                { id: 'FIRST_PERSON', label: 'First Person' },
                { id: 'THIRD_PERSON', label: 'Third Person' }
              ]}
              active={cameraMode}
              onChange={(id) => {
                soundEngine.playUiSound('click');
                setCameraMode(id as CameraMode);
              }}
            />
          }
        >
          <div
            ref={containerRef}
            className="relative h-[420px] w-full overflow-hidden rounded border border-tac-border bg-slate-950"
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {/* 3D viewport unavailable — explain why and keep the panel usable. */}
            {viewportError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/92 p-6 text-center">
                <Video className="h-8 w-8 text-amber-400" />
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                  Replay theatre unavailable
                </div>
                <p className="max-w-md text-[11px] leading-relaxed text-slate-400">{viewportError}</p>
                <p className="max-w-md text-[10px] leading-relaxed text-slate-600">
                  The replay library below still lists every stored match, its score and its event
                  timeline. Match playback needs a WebGL2 context.
                </p>
              </div>
            )}

            {/* Overlay HUD */}
            <div className="pointer-events-none absolute left-3 top-3 space-y-1 font-mono text-[10px]">
              <div className="rounded bg-slate-950/85 px-2 py-1 text-cyan-300">
                {map.name} · {replay.mode} · ROUND {currentSnapshot?.round ?? 1}
              </div>
              <div className="rounded bg-slate-950/85 px-2 py-1 text-slate-300">
                {cameraMode.replace(/_/g, ' ')} · {speed}x
              </div>
            </div>

            {showEvents && activeEvents.length > 0 && (
              <div className="pointer-events-none absolute bottom-3 left-3 space-y-1">
                {activeEvents.map((e, i) => (
                  <div
                    key={i}
                    className={`rounded border px-2.5 py-1 text-[10px] font-bold ${
                      e.type === 'kill'
                        ? 'border-red-700/60 bg-red-950/80 text-red-200'
                        : e.type === 'bomb_planted'
                        ? 'border-amber-700/60 bg-amber-950/80 text-amber-200'
                        : 'border-slate-700 bg-slate-950/85 text-slate-300'
                    }`}
                  >
                    {e.type === 'kill' && (
                      <>
                        {String((e.payload as { killer?: string })?.killer)} eliminated{' '}
                        {String((e.payload as { victim?: string })?.victim)} with{' '}
                        {String((e.payload as { weapon?: string })?.weapon)}
                        {(e.payload as { headshot?: boolean })?.headshot ? ' [HEADSHOT]' : ''}
                      </>
                    )}
                    {e.type === 'bomb_planted' && (
                      <>
                        PULSE BOMB PLANTED at Site {String((e.payload as { site?: string })?.site)}
                      </>
                    )}
                    {e.type === 'bomb_defused' && <>BOMB DEFUSED by {String((e.payload as { defuser?: string })?.defuser)}</>}
                    {e.type === 'round_end' && (
                      <>
                        ROUND {e.round} → {String((e.payload as { winner?: string })?.winner)} (
                        {String((e.payload as { reason?: string })?.reason || '').replace(/_/g, ' ')})
                      </>
                    )}
                    {e.type === 'round_start' && <>ROUND {e.round} STARTED</>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transport controls */}
          <div className="mt-3 rounded border border-tac-border bg-tac-panel2/60 p-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTimeSec(0)}
                className="rounded border border-tac-border p-1.5 text-slate-300 hover:border-cyan-600"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setPlaying((p) => !p);
                  soundEngine.playUiSound('click');
                }}
                className="rounded bg-cyan-600 p-2 text-white hover:bg-cyan-500"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setTimeSec(Math.min(duration, timeSec + 2))}
                className="rounded border border-tac-border p-1.5 text-slate-300 hover:border-cyan-600"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>

              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={timeSec}
                onChange={(e) => {
                  setTimeSec(Number(e.target.value));
                  setPlaying(false);
                }}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
              />

              <span className="w-24 shrink-0 text-right font-mono text-[11px] text-slate-300">
                {timeSec.toFixed(1)} / {duration.toFixed(1)}s
              </span>

              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="rounded border border-tac-border bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
              >
                {[0.25, 0.5, 1, 2, 4].map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </div>

            {/* Per-round quick jump */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from(new Set(keyEvents.filter((e) => e.type === 'round_end').map((e) => e.round))).map((r) => {
                const roundStart = snapshots.find((s) => s.round === r);
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setTimeSec(roundStart?.timeSec ?? 0);
                      setPlaying(false);
                    }}
                    className="rounded border border-tac-border bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-300 hover:border-cyan-600"
                  >
                    ROUND {r}
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>

      {/* Side rail */}
      <div className="space-y-3">
        <Panel title="REPLAY LIBRARY">
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {replays.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedId(r.id);
                  setTimeSec(0);
                  setPlaying(false);
                  soundEngine.playUiSound('click');
                }}
                className={`w-full rounded border p-2.5 text-left transition ${
                  r.id === replay.id
                    ? 'border-cyan-500/70 bg-cyan-950/25'
                    : 'border-tac-border bg-tac-panel2/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Video className="h-3 w-3 shrink-0 text-cyan-400" />
                  <span className="truncate text-[11px] font-bold text-white">{r.title}</span>
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">{r.date}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="MATCH SUMMARY">
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="MODE" value={replay.mode} accent="text-cyan-400" />
            <StatChip label="TICK RATE" value={`${replay.tickRate} Hz`} accent="text-white" />
            <StatChip label="ROUNDS" value={replay.rounds} accent="text-white" />
            <StatChip
              label="WINNER"
              value={replay.winner}
              accent={replay.winner === 'SENTINEL' ? 'text-cyan-400' : replay.winner === 'VORTEX' ? 'text-amber-400' : 'text-slate-400'}
            />
            <StatChip label="SENTINEL" value={replay.sentinelScore} accent="text-cyan-400" />
            <StatChip label="VORTEX" value={replay.vortexScore} accent="text-amber-400" />
          </div>
        </Panel>

        <Panel title="SPECTATOR TARGET">
          <select
            value={viewPlayer}
            onChange={(e) => {
              setViewPlayer(e.target.value);
              soundEngine.playUiSound('click');
            }}
            className="w-full rounded border border-tac-border bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
          >
            <option value="AUTO">Automatic (follow action)</option>
            {currentSnapshot?.actors?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.team}) — {a.hp} HP
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setShowEvents((v) => !v)}
              className={`flex-1 rounded border px-2.5 py-1.5 text-[10px] font-bold ${
                showEvents ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 text-slate-400'
              }`}
            >
              <Layers className="mr-1 inline h-3 w-3" /> EVENT MARKERS
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setCameraMode('FREE')}
              className={`rounded border px-1.5 py-1.5 text-[9px] font-bold ${cameraMode === 'FREE' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-500'}`}
            >
              <Camera className="mx-auto h-3 w-3" /> FREE
            </button>
            <button
              onClick={() => setCameraMode('FIRST_PERSON')}
              className={`rounded border px-1.5 py-1.5 text-[9px] font-bold ${cameraMode === 'FIRST_PERSON' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-500'}`}
            >
              <Eye className="mx-auto h-3 w-3" /> 1ST
            </button>
            <button
              onClick={() => setCameraMode('THIRD_PERSON')}
              className={`rounded border px-1.5 py-1.5 text-[9px] font-bold ${cameraMode === 'THIRD_PERSON' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-500'}`}
            >
              <Users className="mx-auto h-3 w-3" /> 3RD
            </button>
          </div>
        </Panel>

        <Panel title="KILL & OBJECTIVE TIMELINE">
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {keyEvents.map((e, i) => (
              <button
                key={i}
                onClick={() => {
                  setTimeSec(Math.max(0, e.timeSec - 2));
                  setPlaying(false);
                }}
                className="flex w-full items-center gap-2 rounded border border-tac-border bg-slate-900/60 px-2 py-1.5 text-left text-[10px] text-slate-300 hover:border-cyan-600"
              >
                <span className="font-mono text-slate-500">{e.timeSec.toFixed(1)}s</span>
                {e.type === 'kill' && (
                  <>
                    <Bomb className="h-3 w-3 text-red-400" />
                    <span className="truncate">
                      {String((e.payload as { killer?: string })?.killer)} →{' '}
                      {String((e.payload as { victim?: string })?.victim)}
                    </span>
                  </>
                )}
                {e.type === 'bomb_planted' && (
                  <>
                    <Bomb className="h-3 w-3 text-amber-400" />
                    <span>Site {String((e.payload as { site?: string })?.site)} plant</span>
                  </>
                )}
                {e.type === 'round_end' && (
                  <>
                    <Layers className="h-3 w-3 text-cyan-400" />
                    <span>
                      Round {e.round} → {String((e.payload as { winner?: string })?.winner)}
                    </span>
                  </>
                )}
                {e.type === 'bomb_defused' && (
                  <>
                    <Layers className="h-3 w-3 text-emerald-400" />
                    <span>Defused</span>
                  </>
                )}
              </button>
            ))}
            {keyEvents.length === 0 && (
              <div className="text-[10px] text-slate-500">No discrete events recorded in this replay.</div>
            )}
          </div>
        </Panel>

        <Panel title="ARCHITECTURE NOTE">
          <p className="text-[10px] leading-relaxed text-slate-400">
            Replays store compact world snapshots at 4 Hz plus every discrete gameplay event (kills, plants,
            defuses, round transitions). A 30-minute match costs roughly 1–3 MB of JSON instead of hundreds of
            megabytes of video, and replays are re-simulated client-side on a deterministic tick timeline.
            Server-written event streams are checksummed so a tampered replay is detected on load.
          </p>
        </Panel>
      </div>
    </div>
  );
};
