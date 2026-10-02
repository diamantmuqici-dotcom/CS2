import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Swords,
  User,
  Blocks,
  Hammer,
  Settings as SettingsIcon,
  Users,
  Video,
  Terminal,
  Shield,
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle
} from 'lucide-react';
import { useGamePlatformStore, MainMenuTab, REGION_SERVERS } from './game/core/gameStateStore';
import { useSettingsStore } from './game/settings/settingsStore';
import { PlayPanel } from './components/menu/PlayPanel';
import { ProfilePanel } from './components/menu/ProfilePanel';
import { SettingsPanel } from './components/menu/SettingsPanel';
import { CommunityPanel } from './components/menu/CommunityPanel';
import { MatchResultView } from './components/game/MatchResultView';
import { CommandConsole } from './components/ui/CommandConsole';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PanelSpinner } from './components/ui/PanelSpinner';

// Code splitting: heavy 3D-dependent panels and the live game view are only
// fetched when the player actually navigates to them. Three.js stays out of the
// launcher's critical path entirely.
const WorkshopPanel = lazy(() =>
  import('./components/menu/WorkshopPanel').then((m) => ({ default: m.WorkshopPanel }))
);
const MapEditorPanel = lazy(() =>
  import('./components/menu/MapEditorPanel').then((m) => ({ default: m.MapEditorPanel }))
);
const ReplayPanel = lazy(() =>
  import('./components/menu/ReplayPanel').then((m) => ({ default: m.ReplayPanel }))
);
const GameView = lazy(() =>
  import('./components/game/GameView').then((m) => ({ default: m.GameView }))
);
import { detectSurfaceCapability } from './game/rendering/capabilities';
import { soundEngine } from './game/audio/soundEngine';
import { networkClient } from './game/network/networkClient';
import { MatchResultPayload } from './game/core/gameEngine';
import { MatchPlayerStats } from './shared/types';

type AppPhase = 'MENU' | 'IN_GAME' | 'POST_MATCH';

const NAV_ITEMS: Array<{ id: MainMenuTab; label: string; icon: React.ReactNode }> = [
  { id: 'PLAY', label: 'PLAY', icon: <Swords className="h-4 w-4" /> },
  { id: 'PROFILE', label: 'PROFILE', icon: <User className="h-4 w-4" /> },
  { id: 'WORKSHOP', label: 'WORKSHOP', icon: <Blocks className="h-4 w-4" /> },
  { id: 'MAP_EDITOR', label: 'MAP EDITOR', icon: <Hammer className="h-4 w-4" /> },
  { id: 'SETTINGS', label: 'SETTINGS', icon: <SettingsIcon className="h-4 w-4" /> },
  { id: 'COMMUNITY', label: 'COMMUNITY', icon: <Users className="h-4 w-4" /> },
  { id: 'REPLAYS', label: 'REPLAYS', icon: <Video className="h-4 w-4" /> }
];

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('MENU');
  const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null);
  const [finalScoreboard, setFinalScoreboard] = useState<MatchPlayerStats[]>([]);
  const [networkOnline, setNetworkOnline] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const {
    activeTab,
    setActiveTab,
    profile,
    selectedMode,
    selectedRegion,
    consoleLogs,
    appendConsoleLog,
    startMatch,
    leaveMatch,
    recordCompletedMatch,
    match,
    setSelectedMapId,
    setSelectedMode
  } = useGamePlatformStore();

  const video = useSettingsStore((s) => s.video);
  const gameplay = useSettingsStore((s) => s.gameplay);
  const updateVideo = useSettingsStore((s) => s.updateVideo);
  const caps = useMemo(() => detectSurfaceCapability(), []);

  // Network heartbeat for the launcher status pill
  useEffect(() => {
    networkClient.connect();
    const check = () => {
      fetch('/api/health')
        .then((r) => r.json())
        .then((data) => {
          setNetworkOnline(true);
          appendConsoleLog(
            `[NETWORK] Authoritative server ONLINE — tick ${data.currentTick} @ ${data.tickRate}Hz, ${data.connectedClients} client(s), anti-cheat ${data.antiCheatActive ? 'ACTIVE' : 'INACTIVE'}`
          );
        })
        .catch(() => {
          setNetworkOnline(false);
        });
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global console hotkey
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const kb = useSettingsStore.getState().keybinds;
      if (e.code === kb.consoleToggle && phase === 'MENU') {
        e.preventDefault();
        setConsoleOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [phase]);

  const launchMatch = useCallback(
    (modeOverride?: Parameters<typeof startMatch>[0], mapOverride?: string) => {
      const mode = modeOverride || selectedMode;
      startMatch(mode, mapOverride);
      appendConsoleLog(`[MATCH] Launching ${mode} on ${mapOverride || useGamePlatformStore.getState().selectedMapId}`);
      setPhase('IN_GAME');
    },
    [selectedMode, startMatch, appendConsoleLog]
  );

  const handleMatchComplete = useCallback((result: MatchResultPayload, scoreboard: MatchPlayerStats[]) => {
    setFinalScoreboard(scoreboard);
    setMatchResult(result);
    setPhase('POST_MATCH');
  }, []);

  const handleExitMatch = useCallback(() => {
    leaveMatch();
    setPhase('MENU');
  }, [leaveMatch]);

  const handleReturnFromResult = useCallback(() => {
    const result = matchResult;
    if (result) {
      const won = result.winner === 'SENTINEL';
      const summary = {
        id: `match_${Date.now()}`,
        date: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        mode: match.mode,
        mapId: match.mapId,
        mapName: useGamePlatformStore.getState().customMaps[match.mapId]?.name ||
          ({
            harbor_protocol: 'Harbor Protocol',
            citadel_spire: 'Citadel Spire',
            foundry_wing: 'Foundry Core',
            proving_grounds: 'Apex Proving Grounds'
          } as Record<string, string>)[match.mapId] ||
          match.mapId,
        sentinelScore: result.sentinelScore,
        vortexScore: result.vortexScore,
        playerTeam: match.playerTeam,
        result: (result.winner === 'DRAW' ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT') as 'VICTORY' | 'DEFEAT' | 'DRAW',
        kills: finalScoreboard.find((p) => p.id === 'local_player')?.kills ?? 0,
        deaths: finalScoreboard.find((p) => p.id === 'local_player')?.deaths ?? 0,
        assists: finalScoreboard.find((p) => p.id === 'local_player')?.assists ?? 0,
        adr:
          finalScoreboard.find((p) => p.id === 'local_player') !== undefined
            ? (finalScoreboard.find((p) => p.id === 'local_player')!.damageDealt) / Math.max(1, result.rounds)
            : 0,
        hsPercent: (() => {
          const me = finalScoreboard.find((p) => p.id === 'local_player');
          return me && me.kills > 0 ? (me.headshots / me.kills) * 100 : 0;
        })(),
        utilityDamage: finalScoreboard.find((p) => p.id === 'local_player')?.utilityDamage ?? 0,
        clutches: finalScoreboard.find((p) => p.id === 'local_player')?.clutches ?? 0,
        mvps: finalScoreboard.find((p) => p.id === 'local_player')?.mvps ?? 0,
        ratingDelta: (result.winner === 'SENTINEL' ? 220 : result.winner === 'DRAW' ? 40 : -190) +
          Math.round(((finalScoreboard.find((p) => p.id === 'local_player')?.kills ?? 0) - (finalScoreboard.find((p) => p.id === 'local_player')?.deaths ?? 0)) * 4),
        scoreboard: finalScoreboard
      };
      recordCompletedMatch(summary);
      appendConsoleLog(
        `[MATCH] Recorded result: ${summary.result} ${result.sentinelScore}-${result.vortexScore} (session delta ${summary.ratingDelta >= 0 ? '+' : ''}${summary.ratingDelta} PR)`
      );
    }
    setMatchResult(null);
    setPhase('MENU');
  }, [matchResult, match.mode, match.mapId, match.playerTeam, finalScoreboard, recordCompletedMatch, appendConsoleLog]);

  // ---------------------------------------------------------------------------
  // IN-GAME
  // ---------------------------------------------------------------------------
  if (phase === 'IN_GAME') {
    return (
      <ErrorBoundary onReset={() => setPhase('MENU')} context="Live Match">
        <Suspense fallback={<PanelSpinner label="LOADING TACTICAL RENDERER…" fullscreen />}>
          <GameView onExit={handleExitMatch} onMatchComplete={handleMatchComplete} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (phase === 'POST_MATCH' && matchResult) {
    return (
      <MatchResultView
        result={matchResult}
        mode={match.mode}
        mapName={
          useGamePlatformStore.getState().customMaps[match.mapId]?.name ||
          ({
            harbor_protocol: 'Harbor Protocol',
            citadel_spire: 'Citadel Spire',
            foundry_wing: 'Foundry Core',
            proving_grounds: 'Apex Proving Grounds'
          } as Record<string, string>)[match.mapId] ||
          match.mapId
        }
        playerTeam={match.playerTeam}
        scoreboard={finalScoreboard}
        onContinue={handleReturnFromResult}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // LAUNCHER
  // ---------------------------------------------------------------------------
  return (
    <ErrorBoundary onReset={() => window.location.reload()} context="Main Menu">
      <div
        className="relative min-h-screen bg-tac-bg text-slate-100"
        style={{
          fontSize: `${gameplay.textScale}rem`,
          zoom: gameplay.uiScale !== 1 ? gameplay.uiScale : undefined
        }}
      >
        {/* Animated tactical backdrop (disabled with reduced motion) */}
        {!gameplay.reducedMotion && (
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.13]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)',
                backgroundSize: '48px 48px'
              }}
            />
            <div
              className="absolute -left-1/4 top-0 h-[60vh] w-[60vw] rounded-full opacity-[0.09] blur-3xl"
              style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)' }}
            />
            <div
              className="absolute -right-1/4 bottom-0 h-[60vh] w-[60vw] rounded-full opacity-[0.08] blur-3xl"
              style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)' }}
            />
          </div>
        )}

        {/* Top command bar */}
        <header className="relative z-20 border-b border-tac-border bg-tac-panel/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-lg shadow-cyan-950/50">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-white">
                  VANGUARD <span className="text-cyan-400">PROTOCOL</span>
                </div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                  Competitive Tactical FPS Platform · Engine v2.4.0
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] font-bold ${
                  networkOnline
                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                    : 'border-red-700/60 bg-red-950/40 text-red-300'
                }`}
              >
                {networkOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {networkOnline ? 'AUTHORITATIVE SERVER ONLINE' : 'SERVER UNREACHABLE — LOCAL AUTHORITY'}
              </div>

              <div className="flex items-center gap-1.5 rounded border border-tac-border bg-tac-panel2 px-2.5 py-1 font-mono text-[10px] text-slate-300">
                <Activity className="h-3 w-3 text-cyan-400" />
                {selectedRegion} · {REGION_SERVERS.find((r) => r.id === selectedRegion)?.pingMs}ms
              </div>

              <div className="flex items-center gap-1.5 rounded border border-tac-border bg-tac-panel2 px-2.5 py-1 font-mono text-[10px] text-slate-300">
                <span className="text-amber-400">★</span> PR {profile.premierRating.toLocaleString()}
              </div>

              <div className="flex items-center gap-2 rounded border border-tac-border bg-tac-panel2 px-2.5 py-1">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #0e7490)' }}
                >
                  {profile.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-[11px] font-bold text-white">{profile.username}</div>
                  <div className="font-mono text-[9px] text-slate-500">LVL {profile.level} · {profile.role}</div>
                </div>
              </div>

              <button
                onClick={() => setConsoleOpen((v) => !v)}
                className="rounded border border-tac-border bg-tac-panel2 p-2 text-slate-400 transition hover:border-cyan-600 hover:text-cyan-300"
                title="Developer Console (`)"
              >
                <Terminal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Browser compatibility banner */}
        {caps.unsupportedReason && (
          <div className="relative z-20 border-b border-amber-800/60 bg-amber-950/40">
            <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-5 py-2 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{caps.unsupportedReason}</span>
            </div>
          </div>
        )}

        <div className="relative z-10 mx-auto flex max-w-[1800px] gap-5 px-5 py-5">
          {/* Sidebar navigation */}
          <nav className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-5 space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onMouseEnter={() => soundEngine.playUiSound('hover')}
                  onClick={() => {
                    soundEngine.playUiSound('click');
                    setActiveTab(item.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded px-3.5 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.14em] transition ${
                    activeTab === item.id
                      ? 'bg-cyan-600/15 text-cyan-300 ring-1 ring-inset ring-cyan-700/50'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}

              <div className="mt-4 rounded border border-tac-border bg-tac-panel/60 p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  QUICK ACTIONS
                </div>
                <div className="mt-2 space-y-1.5">
                  <button
                    onClick={() => {
                      setSelectedMode('Practice');
                      setSelectedMapId('proving_grounds');
                      launchMatch('Practice', 'proving_grounds');
                    }}
                    className="w-full rounded border border-emerald-700/50 bg-emerald-950/30 px-2.5 py-1.5 text-left text-[10px] font-bold text-emerald-300 hover:bg-emerald-900/40"
                  >
                    Enter Practice Range
                  </button>
                  <button
                    onClick={() => {
                      setSelectedMode('Deathmatch');
                      setSelectedMapId('harbor_protocol');
                      launchMatch('Deathmatch', 'harbor_protocol');
                    }}
                    className="w-full rounded border border-tac-border bg-tac-panel2 px-2.5 py-1.5 text-left text-[10px] font-bold text-slate-300 hover:border-cyan-600"
                  >
                    Quick Deathmatch
                  </button>
                </div>
              </div>

              <button
                onClick={() => setConsoleOpen((v) => !v)}
                className="mt-3 flex w-full items-center gap-2 rounded border border-tac-border bg-tac-panel/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-cyan-300"
              >
                <Terminal className="h-3.5 w-3.5" /> CONSOLE <span className="ml-auto font-mono">`</span>
              </button>

              <div className="mt-3 rounded border border-tac-border bg-tac-panel/60 p-3 font-mono text-[9px] leading-relaxed text-slate-500">
                <div>RENDERER: WebGL2</div>
                <div>CULLING: FRUSTUM + SOLID + PORTAL</div>
                <div>TELEMETRY: {video.telemetryMode}</div>
                <div>VIS DIST: {String(video.playerVisibilityDistance)}</div>
                <div>FPS CAP: {video.fpsCapPreset}</div>
              </div>
            </div>
          </nav>

          {/* Mobile navigation */}
          <div className="mb-3 flex w-full flex-wrap gap-1.5 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`rounded px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                  activeTab === item.id ? 'bg-cyan-600/20 text-cyan-300' : 'bg-tac-panel text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <main className="min-w-0 flex-1">
            <Suspense fallback={<PanelSpinner label="LOADING MODULE…" />}>
              {activeTab === 'PLAY' && <PlayPanel onLaunch={() => launchMatch()} />}
              {activeTab === 'PROFILE' && <ProfilePanel />}
              {activeTab === 'WORKSHOP' && <WorkshopPanel onTestMap={(id) => launchMatch('Practice', id)} />}
              {activeTab === 'MAP_EDITOR' && <MapEditorPanel onTestMap={(id) => launchMatch('Practice', id)} />}
              {activeTab === 'SETTINGS' && <SettingsPanel />}
              {activeTab === 'COMMUNITY' && <CommunityPanel />}
              {activeTab === 'REPLAYS' && <ReplayPanel />}
            </Suspense>
          </main>
        </div>

        <footer className="relative z-10 border-t border-tac-border bg-tac-panel/60 px-5 py-3">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-600">
            <span>
              Vanguard Protocol is an original, independently developed tactical FPS platform. Not affiliated with
              or endorsed by any existing commercial title.
            </span>
            <span className="flex items-center gap-3">
              <span>SCHEMA v1</span>
              <span>·</span>
              <span>{consoleLogs.length} LOG ENTRIES</span>
            </span>
          </div>
        </footer>

        {consoleOpen && <CommandConsole onClose={() => setConsoleOpen(false)} />}
      </div>
    </ErrorBoundary>
  );
};
