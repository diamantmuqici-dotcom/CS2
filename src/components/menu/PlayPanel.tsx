import React, { useEffect, useState } from 'react';
import {
  Swords,
  Crown,
  Users,
  Zap,
  Bomb,
  Target,
  Undo2,
  Crosshair as CrosshairIcon,
  Settings2,
  Blocks,
  Globe,
  Wifi,
  Shield,
  Loader2
} from 'lucide-react';
import { GameModeId, RegionId } from '../../shared/types';
import { REGION_SERVERS, useGamePlatformStore } from '../../game/core/gameStateStore';
import { OFFICIAL_MAPS } from '../../game/maps/officialMaps';
import { getModeConfig } from '../../game/modes/roundLogic';
import { Panel, Button, StatChip, Tabs } from '../ui/primitives';
import { soundEngine } from '../../game/audio/soundEngine';

const MODE_ICONS: Record<GameModeId, React.ReactNode> = {
  Competitive: <Swords className="h-5 w-5" />,
  Premier: <Crown className="h-5 w-5" />,
  Wingman: <Users className="h-5 w-5" />,
  Rush: <Zap className="h-5 w-5" />,
  Casual: <Globe className="h-5 w-5" />,
  Deathmatch: <Target className="h-5 w-5" />,
  Retakes: <Undo2 className="h-5 w-5" />,
  Practice: <CrosshairIcon className="h-5 w-5" />,
  Custom: <Settings2 className="h-5 w-5" />
};

const MODE_ORDER: GameModeId[] = [
  'Competitive',
  'Premier',
  'Wingman',
  'Rush',
  'Casual',
  'Deathmatch',
  'Retakes',
  'Practice',
  'Custom'
];

export const PlayPanel: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const {
    selectedMode,
    setSelectedMode,
    selectedMapId,
    setSelectedMapId,
    selectedRegion,
    setSelectedRegion,
    queueState,
    startQueue,
    cancelQueue,
    premierVeto,
    banPremierMap,
    customConfig,
    updateCustomConfig,
    workshopMaps
  } = useGamePlatformStore();

  const [subTab, setSubTab] = useState<'MODES' | 'MAPS' | 'REGIONS' | 'CUSTOM'>('MODES');
  const [queueElapsed, setQueueElapsed] = useState(0);

  useEffect(() => {
    if (!queueState.active) {
      setQueueElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setQueueElapsed((e) => e + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, [queueState.active]);

  // Simulated matchmaking: after ~2.5s of queue, launch the match.
  useEffect(() => {
    if (!queueState.active) return;
    const timeout = setTimeout(() => {
      soundEngine.playUiSound('matchFound');
      onLaunch();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [queueState.active, onLaunch]);

  const allMaps = [
    ...Object.values(OFFICIAL_MAPS).map((m) => ({
      id: m.id,
      name: m.name,
      subtitle: m.subtitle,
      author: m.author,
      modes: m.supportedModes,
      version: m.version,
      isWorkshop: false
    })),
    ...workshopMaps.map((w) => ({
      id: w.id,
      name: w.title,
      subtitle: `Community Workshop // ${w.creator}`,
      author: w.creator,
      modes: w.supportedModes,
      version: w.version,
      isWorkshop: true
    }))
  ];

  const modeCfg = getModeConfig(selectedMode);

  if (premierVeto.active) {
    return (
      <Panel
        title="PREMIER MAP VETO PHASE"
        subtitle={`Ban maps until one remains. Ban ${premierVeto.step} of 3.`}
      >
        <div className="mb-4 rounded border border-amber-600/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          <Crown className="mr-2 inline h-4 w-4" />
          Premier uses a competitive veto sequence. Each team bans a map; the final remaining map is played.
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {allMaps.slice(0, 8).map((map) => {
            const banned = premierVeto.bannedMaps.includes(map.id);
            return (
              <button
                key={map.id}
                disabled={banned}
                onClick={() => banPremierMap(map.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  banned
                    ? 'border-red-800 bg-red-950/30 opacity-50'
                    : 'border-tac-border bg-tac-panel2 hover:border-cyan-600/70'
                }`}
              >
                <div className="text-sm font-bold text-white">{map.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{map.author}</div>
                {banned && <div className="mt-1 text-[10px] font-bold uppercase text-red-400">BANNED</div>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={cancelQueue}>
            CANCEL VETO
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Panel
          title="SELECT GAME MODE"
          subtitle={modeCfg.description}
          actions={
            <Tabs
              tabs={[
                { id: 'MODES', label: 'Modes' },
                { id: 'MAPS', label: 'Maps' },
                { id: 'REGIONS', label: 'Regions' },
                { id: 'CUSTOM', label: 'Custom Rules' }
              ]}
              active={subTab}
              onChange={(id) => {
                soundEngine.playUiSound('click');
                setSubTab(id as typeof subTab);
              }}
            />
          }
        >
          {subTab === 'MODES' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MODE_ORDER.map((mode) => {
                const cfg = getModeConfig(mode);
                const isActive = selectedMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      soundEngine.playUiSound('click');
                      setSelectedMode(mode);
                    }}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                      isActive
                        ? 'border-cyan-500/70 bg-cyan-950/30 ring-1 ring-cyan-600/30'
                        : 'border-tac-border bg-tac-panel2/70 hover:border-slate-600 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>{MODE_ICONS[mode]}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">{mode}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {cfg.teamSize}v{cfg.teamSize} · {cfg.scoring}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-slate-400">{cfg.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {subTab === 'MAPS' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {allMaps.map((map) => {
                const supported = map.modes.includes(selectedMode);
                const isActive = selectedMapId === map.id;
                return (
                  <button
                    key={map.id}
                    disabled={!supported}
                    onClick={() => {
                      soundEngine.playUiSound('click');
                      setSelectedMapId(map.id);
                    }}
                    className={`flex flex-col rounded-lg border p-3 text-left transition ${
                      isActive
                        ? 'border-cyan-500/70 bg-cyan-950/30'
                        : supported
                        ? 'border-tac-border bg-tac-panel2/70 hover:border-slate-600'
                        : 'cursor-not-allowed border-tac-border/50 bg-slate-950/40 opacity-45'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{map.name}</span>
                      {map.isWorkshop && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                          WORKSHOP
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 text-[10px] text-slate-400">{map.subtitle}</span>
                    <span className="mt-1.5 font-mono text-[10px] text-slate-500">
                      v{map.version} · {map.modes.length} modes
                    </span>
                    {!supported && (
                      <span className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                        Not supported in {selectedMode}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {subTab === 'REGIONS' && (
            <div className="space-y-2">
              <div className="rounded border border-cyan-800/50 bg-cyan-950/25 p-2.5 text-[11px] text-cyan-200">
                <Wifi className="mr-1.5 inline h-3.5 w-3.5" />
                Recommended:{' '}
                <strong>
                  {REGION_SERVERS.reduce((best, r) => (r.pingMs < best.pingMs ? r : best), REGION_SERVERS[0]).name}
                </strong>{' '}
                — automatically selected for lowest measured latency. Manual override always available.
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {REGION_SERVERS.map((region) => (
                  <button
                    key={region.id}
                    onClick={() => {
                      soundEngine.playUiSound('click');
                      setSelectedRegion(region.id as RegionId);
                    }}
                    className={`rounded-lg border p-3 text-left transition ${
                      selectedRegion === region.id
                        ? 'border-cyan-500/70 bg-cyan-950/30'
                        : 'border-tac-border bg-tac-panel2/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{region.name}</span>
                      <span
                        className={`font-mono text-xs font-bold ${
                          region.status === 'Optimal'
                            ? 'text-emerald-400'
                            : region.status === 'Good'
                            ? 'text-amber-400'
                            : 'text-red-400'
                        }`}
                      >
                        {region.pingMs}ms
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{region.city}</div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-cyan-500"
                        style={{ width: `${region.loadPercent}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                      Server load {region.loadPercent}% · {region.status}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {subTab === 'CUSTOM' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['teamSize', 'Team Size', 1, 10, 1],
                  ['roundTimeSec', 'Round Time (s)', 30, 300, 5],
                  ['buyTimeSec', 'Buy Time (s)', 0, 60, 1],
                  ['bombTimerSec', 'Bomb Timer (s)', 15, 90, 1],
                  ['startingMoney', 'Starting Money', 0, 16000, 100],
                  ['maxRounds', 'Max Rounds', 4, 40, 1],
                  ['botCount', 'Bot Count', 0, 18, 1],
                  ['customObjectDistance', 'Ignored', 0, 0, 1]
                ] as Array<[string, string, number, number, number]>
              )
                .filter(([key]) => key !== 'customObjectDistance')
                .map(([key, label, min, max, step]) => (
                  <div
                    key={key}
                    className="rounded border border-tac-border bg-tac-panel2/60 px-3 py-2"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{label}</span>
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {String((customConfig as unknown as Record<string, number>)[key])}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={(customConfig as unknown as Record<string, number>)[key]}
                      onChange={(e) =>
                        updateCustomConfig({
                          [key]: Number(e.target.value)
                        } as never)
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
                    />
                  </div>
                ))}

              <div className="col-span-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ['friendlyFire', 'Friendly Fire'],
                    ['infiniteAmmo', 'Infinite Ammo'],
                    ['respawnEnabled', 'Respawn Enabled'],
                    ['allowSprint', 'Sprint Enabled']
                  ] as Array<[string, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() =>
                      updateCustomConfig({
                        [key]: !(customConfig as unknown as Record<string, boolean>)[key]
                      } as never)
                    }
                    className={`flex items-center justify-between rounded border px-3 py-2 text-xs font-bold transition ${
                      (customConfig as unknown as Record<string, boolean>)[key]
                        ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                        : 'border-tac-border bg-tac-panel2/60 text-slate-400'
                    }`}
                  >
                    {label}
                    <span>{(customConfig as unknown as Record<string, boolean>)[key] ? 'ON' : 'OFF'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Deployment sidebar */}
      <div className="space-y-3">
        <Panel title="DEPLOYMENT SUMMARY">
          <div className="space-y-2">
            <StatChip label="GAME MODE" value={selectedMode} accent="text-cyan-400" sub={modeCfg.scoring} />
            <div className="grid grid-cols-2 gap-2">
              <StatChip
                label="TEAM SIZE"
                value={`${modeCfg.teamSize}v${modeCfg.teamSize}`}
                accent="text-white"
              />
              <StatChip label="ROUND TIMER" value={`${modeCfg.roundTimeSec}s`} accent="text-white" />
              <StatChip label="BUY PHASE" value={`${modeCfg.buyTimeSec}s`} accent="text-white" />
              <StatChip label="BOMB TIMER" value={`${modeCfg.bombTimerSec}s`} accent="text-white" />
            </div>
            <StatChip
              label="REGION"
              value={selectedRegion}
              accent="text-emerald-400"
              sub={REGION_SERVERS.find((r) => r.id === selectedRegion)?.city}
            />
            <StatChip
              label="MAP"
              value={allMaps.find((m) => m.id === selectedMapId)?.name || 'Harbor Protocol'}
              accent="text-amber-400"
              sub={`v${allMaps.find((m) => m.id === selectedMapId)?.version || '1.0.0'}`}
            />
          </div>

          <div className="mt-4 space-y-2">
            {queueState.active ? (
              <>
                <div className="flex items-center justify-center gap-2 rounded border border-cyan-700/60 bg-cyan-950/40 px-3 py-2.5 text-xs font-bold text-cyan-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  SEARCHING — {queueElapsed.toFixed(1)}s
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-cyan-500 transition-all"
                    style={{ width: `${Math.min(100, (queueElapsed / 2.5) * 100)}%` }}
                  />
                </div>
                <Button variant="danger" className="w-full" onClick={cancelQueue}>
                  CANCEL QUEUE
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  soundEngine.playUiSound('click');
                  startQueue();
                }}
              >
                <Swords className="h-4 w-4" />
                {selectedMode === 'Premier' ? 'START PREMIER VETO' : `ENTER ${selectedMode.toUpperCase()}`}
              </Button>
            )}

            {selectedMode === 'Practice' && (
              <Button variant="success" className="w-full" onClick={onLaunch}>
                <Bomb className="h-4 w-4" />
                LAUNCH SANDBOX INSTANTLY
              </Button>
            )}
          </div>
        </Panel>

        <Panel title="SERVER AUTHORITY">
          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>
                Damage, economy, weapon ownership, and round results are validated by the authoritative
                server. Client claims are never trusted.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Blocks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span>
                Anti-cheat validation runs on movement speed, fire cadence, view angles, and aim-snap
                telemetry per tick.
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};
