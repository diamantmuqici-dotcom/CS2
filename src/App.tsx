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
  AlertTriangle,
  MonitorCog,
  Stethoscope
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
import { GraphicsPanel } from './components/ui/GraphicsPanel';
import { DiagnosticsPanel } from './components/ui/DiagnosticsPanel';
import { DebugOverlay, isDebugEnabled } from './components/ui/DebugOverlay';
import { LocalLinkButton } from './components/ui/LocalLinkButton';

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
// Only fetched when no WebGL2 context exists, so the 3D engine and three.js
// stay out of the download entirely on machines that cannot use them.
const CompatibilityGameView = lazy(() =>
  import('./components/game/CompatibilityGameView').then((m) => ({ default: m.CompatibilityGameView }))
);
import { rendererManager } from './game/rendering/renderer-manager';
import { apiUrl, isBackendExpected, getDeployBase } from './shared/runtime';
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
  { id: 'GRAPHICS', label: 'GRAPHICS', icon: <MonitorCog className="h-4 w-4" /> },
  { id: 'DIAGNOSTICS', label: 'DIAGNOSTICS', icon: <Stethoscope className="h-4 w-4" /> },
  { id: 'COMMUNITY', label: 'COMMUNITY', icon: <Users className="h-4 w-4" /> },
  { id: 'REPLAYS', label: 'REPLAYS', icon: <Video className="h-4 w-4" /> }
];

const AppShell: React.FC = () => {
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
  // All GPU/browser detection goes through one manager, never scattered probes.
  const renderer = useMemo(() => rendererManager.getSelection(), []);
  const caps = renderer.capabilities;

  // Network heartbeat for the launcher status pill.
  //
  // On a static host (GitHub Pages) there is no API at all, so the request is
  // made against the deployment base and a miss is reported as "static host"
  // rather than as a server outage. The URL is resolved relative to the page,
  // so this works from /CS2/ as well as from localhost.
  useEffect(() => {
    networkClient.connect();
    let cancelled = false;
    let backendKnownAbsent = false;

    const check = async () => {
      if (cancelled || backendKnownAbsent) {
        setNetworkOnline(false);
        return;
      }
      try {
        const res = await fetch(apiUrl('api/health'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const type = res.headers.get('content-type') || '';
        if (!type.includes('json')) throw new Error('non-JSON response');
        const data = (await res.json()) as {
          currentTick: number;
          tickRate: number;
          connectedClients: number;
          antiCheatActive: boolean;
        };
        if (cancelled) return;
        setNetworkOnline(true);
        appendConsoleLog(
          `[NETWORK] Authoritative server ONLINE — tick ${data.currentTick} @ ${data.tickRate}Hz, ${data.connectedClients} client(s), anti-cheat ${data.antiCheatActive ? 'ACTIVE' : 'INACTIVE'}`
        );
      } catch {
        if (cancelled) return;
        setNetworkOnline(false);
        // Distinguish "this deployment has no backend" from "the backend is down".
        isBackendExpected().then((expected) => {
          if (!expected && !cancelled) backendKnownAbsent = true;
        });
      }
    };

    void check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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

  // LOCAL LINK: connect to a local/LAN server, then drop straight into a match.
  const handleLocalLink = useCallback(
    (endpoint: string | null) => {
      appendConsoleLog(
        endpoint
          ? `[LOCAL] Joined ${endpoint} — zero-ping session`
          : '[LOCAL] Started embedded local authority — zero-ping session'
      );
      setSelectedMode('Deathmatch');
      setSelectedMapId('harbor_protocol');
      launchMatch('Deathmatch', 'harbor_protocol');
    },
    [appendConsoleLog, launchMatch, setSelectedMapId, setSelectedMode]
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
    // Route by the renderer that was actually selected. The 3D engine requires
    // WebGL2 (three.js is WebGL2-only since r163); anything else runs the same
    // match on the 2D compatibility renderer rather than failing.
    const useCompatibility =
      renderer.tier !== 'webgl2' && !video.rendererOverride.startsWith('Compatibility');

    return (
      <ErrorBoundary onReset={() => setPhase('MENU')} context="Live Match">
        <Suspense
          fallback={
            <PanelSpinner
              label={useCompatibility ? 'LOADING COMPATIBILITY RENDERER…' : 'LOADING TACTICAL RENDERER…'}
              fullscreen
            />
          }
        >
          {useCompatibility ? (
            <CompatibilityGameView onExit={handleExitMatch} onMatchComplete={handleMatchComplete} />
          ) : (
            <GameView onExit={handleExitMatch} onMatchComplete={handleMatchComplete} />
          )}
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
              {/* Zero-ping local session launcher — a round map plate, pinned
                  to the top bar so it is reachable from every screen. */}
              <LocalLinkButton onLaunch={handleLocalLink} />

              <div
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] font-bold ${
                  networkOnline
                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                    : 'border-amber-700/60 bg-amber-950/30 text-amber-300'
                }`}
                title={
                  networkOnline
                    ? 'Connected to the authoritative game server.'
                    : 'This deployment is static, so there is no backend. Matches run on the embedded local authority.'
                }
              >
                {networkOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {networkOnline
                  ? 'AUTHORITATIVE SERVER ONLINE'
                  : `STATIC HOST — LOCAL AUTHORITY (${getDeployBase()})`}
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

        {/* Renderer notice — informational only. The launcher is always usable;
            the notice explains which renderer was selected and why, and links
            to the diagnostics panel. It never blocks entry. */}
        {renderer.rationale && (
          <div
            className={`relative z-20 border-b ${
              renderer.tier === 'webgl2'
                ? 'border-tac-border bg-tac-panel/50'
                : 'border-amber-800/60 bg-amber-950/30'
            }`}
          >
            <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-5 py-2 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{renderer.rationale}</span>
              <button
                onClick={() => setActiveTab('DIAGNOSTICS')}
                className="shrink-0 rounded border border-amber-700/70 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-200 transition hover:bg-amber-900/40"
              >
                Diagnostics
              </button>
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
                <div>
                  RENDERER:{' '}
                  {renderer.tier === 'webgl2'
                    ? 'WebGL2'
                    : renderer.tier === 'none'
                      ? 'INTERFACE ONLY'
                      : 'COMPAT 2D'}
                </div>
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
              {activeTab === 'GRAPHICS' && <GraphicsPanel />}
              {activeTab === 'DIAGNOSTICS' && <DiagnosticsPanel />}
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


/**
 * Root component. The developer overlay (`?debug=1`) is mounted here so it is
 * available in the launcher, in a live match and on the result screen alike.
 */
export const App: React.FC = () => (
  <>
    <AppShell />
    {isDebugEnabled() && <DebugOverlay />}
  </>
);
