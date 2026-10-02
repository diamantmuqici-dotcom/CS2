import React, { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Upload,
  RotateCcw,
  Gauge,
  Sparkles,
  Keyboard,
  Crosshair as CrosshairIcon,
  Volume2,
  Gamepad2,
  Wifi,
  LayoutDashboard,
  MousePointer2,
  Eye,
  Cpu,
  AlertTriangle,
  Check
} from 'lucide-react';
import {
  useSettingsStore,
  BindableAction,
  DEFAULT_KEYBINDS,
  DEFAULT_CROSSHAIR_SETTINGS,
  PerformancePresetId,
  calculateCmPer360,
  calculateEffectiveDpi,
  convertSensitivityScale,
  getObjectDistanceCutoffMeters,
  getPlayerDistanceCutoffMeters
} from '../../game/settings/settingsStore';
import { REGION_SERVERS } from '../../game/core/gameStateStore';
import { Panel, Button, Toggle, Slider, SelectRow, StatChip, Tabs } from '../ui/primitives';
import { CrosshairReticle } from '../../game/ui/CrosshairReticle';
import { runHardwareBenchmark, HardwareBenchmarkReport } from '../../game/core/performanceMonitor';
import { soundEngine } from '../../game/audio/soundEngine';
import { RegionId } from '../../shared/types';

const ACTION_LABELS: Record<BindableAction, string> = {
  forward: 'Move Forward',
  backward: 'Move Backward',
  left: 'Strafe Left',
  right: 'Strafe Right',
  jump: 'Jump / Bhop',
  jumpAlt: 'Jump (Alternate — Mouse Wheel)',
  crouch: 'Crouch / Duck',
  walk: 'Walk (Silent)',
  fire: 'Primary Fire',
  altFire: 'Secondary Fire / Scope',
  reload: 'Reload Weapon',
  interact: 'Interact / Plant / Defuse',
  primaryWeapon: 'Primary Weapon',
  secondaryWeapon: 'Secondary Weapon',
  meleeWeapon: 'Melee Weapon',
  grenadeCycle: 'Cycle Grenades',
  smokeGrenade: 'Quick Smoke Grenade',
  flashGrenade: 'Quick Flash Grenade',
  heGrenade: 'Quick HE Grenade',
  incendiaryGrenade: 'Quick Incendiary',
  dropWeapon: 'Drop Weapon',
  inspectWeapon: 'Inspect Weapon',
  buyMenu: 'Buy Menu',
  scoreboard: 'Scoreboard',
  voicePushToTalk: 'Voice Push-to-Talk',
  consoleToggle: 'Developer Console',
  cullingDebugToggle: 'Occlusion Debug Overlay'
};

type SettingsCategory =
  | 'GAME'
  | 'MOUSE'
  | 'KEYBOARD'
  | 'CROSSHAIR'
  | 'SENSITIVITY'
  | 'VIDEO'
  | 'GRAPHICS'
  | 'AUDIO'
  | 'NETWORK'
  | 'HUD'
  | 'ACCESSIBILITY'
  | 'PRESETS'
  | 'CONFIG';

const CATEGORIES: Array<{ id: SettingsCategory; label: string; icon: React.ReactNode }> = [
  { id: 'VIDEO', label: 'Video', icon: <Eye className="h-3.5 w-3.5" /> },
  { id: 'GRAPHICS', label: 'Graphics', icon: <Gauge className="h-3.5 w-3.5" /> },
  { id: 'PRESETS', label: 'Presets & Optimizer', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'MOUSE', label: 'Mouse', icon: <MousePointer2 className="h-3.5 w-3.5" /> },
  { id: 'SENSITIVITY', label: 'Sensitivity Lab', icon: <CrosshairIcon className="h-3.5 w-3.5" /> },
  { id: 'KEYBOARD', label: 'Keyboard', icon: <Keyboard className="h-3.5 w-3.5" /> },
  { id: 'CROSSHAIR', label: 'Crosshair', icon: <CrosshairIcon className="h-3.5 w-3.5" /> },
  { id: 'AUDIO', label: 'Audio', icon: <Volume2 className="h-3.5 w-3.5" /> },
  { id: 'HUD', label: 'HUD & Game', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: 'NETWORK', label: 'Network', icon: <Wifi className="h-3.5 w-3.5" /> },
  { id: 'ACCESSIBILITY', label: 'Accessibility', icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { id: 'CONFIG', label: 'Config Files', icon: <Download className="h-3.5 w-3.5" /> }
];

export const SettingsPanel: React.FC = () => {
  const store = useSettingsStore();
  const [category, setCategory] = useState<SettingsCategory>('VIDEO');
  const [search, setSearch] = useState('');
  const [rebinding, setRebinding] = useState<BindableAction | null>(null);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [optimizationDiff, setOptimizationDiff] = useState<typeof store.lastOptimizationDiff | null>(null);
  const [benchmark, setBenchmark] = useState<HardwareBenchmarkReport | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const { video, mouse, crosshair, audio, gameplay, network, keybinds } = store;

  const lowerSearch = search.trim().toLowerCase();

  const matchesSearch = (label: string, hint?: string) => {
    if (!lowerSearch) return true;
    return label.toLowerCase().includes(lowerSearch) || (hint || '').toLowerCase().includes(lowerSearch);
  };

  const handleRebind = (action: BindableAction) => {
    setRebinding(action);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRebinding(null);
        window.removeEventListener('keydown', handler, true);
        return;
      }
      store.setKeybind(action, e.code);
      setRebinding(null);
      window.removeEventListener('keydown', handler, true);
    };
    const mouseHandler = (e: MouseEvent) => {
      e.preventDefault();
      store.setKeybind(action, `Mouse${e.button}`);
      setRebinding(null);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('mousedown', mouseHandler, true);
    };
    window.addEventListener('keydown', handler, true);
    window.addEventListener('mousedown', mouseHandler, true);
  };

  const conflicts = useMemo(() => {
    const map = new Map<string, BindableAction[]>();
    (Object.entries(keybinds) as Array<[BindableAction, string]>).forEach(([action, code]) => {
      const list = map.get(code) || [];
      list.push(action);
      map.set(code, list);
    });
    return Array.from(map.entries()).filter(([, list]) => list.length > 1);
  }, [keybinds]);

  const downloadConfig = (cat: 'all' | 'video' | 'controls' | 'audio' | 'crosshair' | 'gameplay' | 'network') => {
    const json = store.exportCategoryJson(cat);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cat === 'all' ? 'vanguard_config_bundle.json' : `${cat}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${a.download}`);
  };

  const runOptimization = () => {
    const diffs = store.applyCompetitiveOptimization();
    setOptimizationDiff(diffs);
    soundEngine.playUiSound('buy');
  };

  const runBenchmark = () => {
    setBenchmarkRunning(true);
    setTimeout(() => {
      const report = runHardwareBenchmark();
      setBenchmark(report);
      store.applyPreset(report.recommendedPreset);
      setBenchmarkRunning(false);
    }, 260);
  };

  const renderCategory = () => {
    switch (category) {
      // ------------------------------------------------------------------
      case 'VIDEO':
        return (
          <div className="space-y-2">
            {matchesSearch('Resolution Preset', 'render resolution scale native') && (
              <SelectRow
                label="Resolution Preset"
                value={video.resolutionPreset}
                options={[
                  { value: '1280x720', label: '1280 x 720' },
                  { value: '1600x900', label: '1600 x 900' },
                  { value: '1920x1080', label: '1920 x 1080' },
                  { value: '2560x1440', label: '2560 x 1440' },
                  { value: 'Native', label: 'Native Window' }
                ]}
                onChange={(v) => store.updateVideo({ resolutionPreset: v as typeof video.resolutionPreset })}
              />
            )}
            {matchesSearch('Render Scale') && (
              <Slider
                label="Render Scale"
                value={video.renderScale}
                min={0.5}
                max={1.5}
                step={0.05}
                onChange={(v) => store.updateVideo({ renderScale: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                hint="Internal render resolution multiplier. Lower values raise FPS with a softness tradeoff."
              />
            )}
            {matchesSearch('Field of View', 'fov') && (
              <Slider
                label="Field of View (FOV)"
                value={video.fov}
                min={68}
                max={110}
                onChange={(v) => store.updateVideo({ fov: v })}
                suffix="°"
                hint="Horizontal FOV. Competitive standard is 90."
              />
            )}
            {matchesSearch('VSync') && (
              <Toggle
                label="VSync"
                hint="Synchronizes present to display refresh. Adds input latency — disabled is recommended for competitive play."
                checked={video.vsync}
                onChange={(v) => store.updateVideo({ vsync: v })}
              />
            )}
            {matchesSearch('FPS Cap', 'fps_max frame limiter') && (
              <>
                <SelectRow
                  label="FPS Cap"
                  value={video.fpsCapPreset}
                  options={[
                    { value: '30', label: '30' },
                    { value: '60', label: '60' },
                    { value: '120', label: '120' },
                    { value: '144', label: '144' },
                    { value: '165', label: '165' },
                    { value: '240', label: '240' },
                    { value: '360', label: '360' },
                    { value: 'Unlimited', label: 'Unlimited' },
                    { value: 'Custom', label: 'Custom' }
                  ]}
                  onChange={(v) => store.updateVideo({ fpsCapPreset: v as typeof video.fpsCapPreset })}
                  hint="Caps the render loop frequency. Unlimited is recommended with VSync off for lowest latency."
                />
                {video.fpsCapPreset === 'Custom' && (
                  <Slider
                    label="Custom FPS Cap"
                    value={video.fpsCapCustom}
                    min={15}
                    max={1000}
                    step={5}
                    onChange={(v) => store.updateVideo({ fpsCapCustom: v })}
                    suffix=" FPS"
                  />
                )}
              </>
            )}
            {matchesSearch('Anti-Aliasing') && (
              <SelectRow
                label="Anti-Aliasing"
                value={video.antiAliasing}
                options={[
                  { value: 'Off', label: 'Off (max FPS)' },
                  { value: 'FXAA', label: 'FXAA (fast)' },
                  { value: 'MSAA', label: 'MSAA (crisp)' }
                ]}
                onChange={(v) => store.updateVideo({ antiAliasing: v as typeof video.antiAliasing })}
              />
            )}
            {matchesSearch('Anisotropic Filtering') && (
              <SelectRow
                label="Anisotropic Filtering"
                value={String(video.anisotropicFiltering)}
                options={[1, 2, 4, 8, 16].map((v) => ({ value: String(v), label: `${v}x` }))}
                onChange={(v) => store.updateVideo({ anisotropicFiltering: Number(v) as 1 | 2 | 4 | 8 | 16 })}
                hint="Improves texture clarity on floors viewed at shallow angles."
              />
            )}
            {matchesSearch('Sharpening', 'clarity contrast') && (
              <Slider
                label="Sharpening / Clarity Boost"
                value={video.sharpening}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => store.updateVideo({ sharpening: v })}
                format={(v) => `${Math.round(v * 100)}%`}
                hint="Post-sharpen filter. Legitimate visibility aid that reveals target silhouettes without extra information."
              />
            )}
            {matchesSearch('Head Bob') && (
              <Toggle
                label="Head Bob"
                hint="Camera bob while moving. Disabled by default for competitive stability."
                checked={video.headBob}
                onChange={(v) => store.updateVideo({ headBob: v })}
              />
            )}
          </div>
        );

      // ------------------------------------------------------------------
      case 'GRAPHICS':
        return (
          <div className="space-y-3">
            <Panel title="RENDERER PIPELINE">
              <div className="space-y-2">
                {matchesSearch('Frustum Culling') && (
                  <Toggle
                    label="Frustum Culling"
                    hint="Skips geometry entirely outside the camera view cone."
                    checked={video.frustumCulling}
                    onChange={(v) => store.updateVideo({ frustumCulling: v })}
                  />
                )}
                {matchesSearch('Smart Occlusion', 'behind me black culling solid walls') && (
                  <Toggle
                    label='Smart Occlusion ("Behind Me" Culling)'
                    hint="Ray-solid occlusion: geometry hidden behind thick walls and geometry behind the camera are not drawn. Multiple corner-ray verification prevents pop-in."
                    checked={video.smartOcclusionCulling}
                    onChange={(v) => store.updateVideo({ smartOcclusionCulling: v })}
                  />
                )}
                {matchesSearch('Portal Visibility') && (
                  <Toggle
                    label="Portal / Room Visibility Culling"
                    hint="Room-graph traversal limits rendering to interiors reachable from the current room through open portals."
                    checked={video.portalVisibilityCulling}
                    onChange={(v) => store.updateVideo({ portalVisibilityCulling: v })}
                  />
                )}
                {matchesSearch('LOD') && (
                  <Toggle
                    label="Level of Detail (LOD)"
                    hint="Reduces mesh detail on distant objects (48m / 22m thresholds)."
                    checked={video.lodEnabled}
                    onChange={(v) => store.updateVideo({ lodEnabled: v })}
                  />
                )}
                {matchesSearch('Instancing') && (
                  <Toggle
                    label="Geometry Batching & Material Instancing"
                    hint="Shares materials and batches draw calls across identical surfaces."
                    checked={video.instancingEnabled}
                    onChange={(v) => store.updateVideo({ instancingEnabled: v })}
                  />
                )}
              </div>
            </Panel>

            <Panel title="VISIBILITY DISTANCE">
              <div className="space-y-2">
                {matchesSearch('Player Visibility Distance', 'render distance players') && (
                  <SelectRow
                    label="Player Visibility Distance"
                    value={String(video.playerVisibilityDistance)}
                    options={[50, 100, 150, 200, 300, 500, 'Unlimited'].map((v) => ({
                      value: String(v),
                      label: v === 'Unlimited' ? 'Unlimited' : `${v}m`
                    }))}
                    onChange={(v) =>
                      store.updateVideo({
                        playerVisibilityDistance: (v === 'Unlimited' ? 'Unlimited' : Number(v)) as never
                      })
                    }
                    hint="Distance cap for rendering opponents that are BEHIND solid geometry. Enemies with true line of sight are ALWAYS rendered regardless of this setting — gameplay is never compromised."
                  />
                )}
                {matchesSearch('Object Visibility Distance', 'props decor draw distance') && (
                  <SelectRow
                    label="Object Visibility Distance"
                    value={video.objectVisibilityDistance}
                    options={[
                      { value: 'Near', label: 'Near (~35m)' },
                      { value: 'Medium', label: 'Medium (~65m)' },
                      { value: 'Far', label: 'Far (~110m)' },
                      { value: 'Ultra', label: 'Ultra (~250m)' },
                      { value: 'Custom', label: 'Custom' }
                    ]}
                    onChange={(v) =>
                      store.updateVideo({ objectVisibilityDistance: v as typeof video.objectVisibilityDistance })
                    }
                    hint="Distance cap for decorative props, distant set dressing, and LOD-tier geometry. Bomb sites and objectives are never distance-culled."
                  />
                )}
                {video.objectVisibilityDistance === 'Custom' && (
                  <Slider
                    label="Custom Object Distance"
                    value={video.customObjectDistanceMeters}
                    min={20}
                    max={400}
                    step={5}
                    onChange={(v) => store.updateVideo({ customObjectDistanceMeters: v })}
                    suffix="m"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <StatChip
                    label="EFFECTIVE PLAYER CUTOFF"
                    value={
                      getPlayerDistanceCutoffMeters(video) > 9000
                        ? 'Unlimited'
                        : `${getPlayerDistanceCutoffMeters(video)}m`
                    }
                    accent="text-cyan-400"
                  />
                  <StatChip
                    label="OBJECT CULL RING"
                    value={`${getObjectDistanceCutoffMeters(video)}m`}
                    accent="text-amber-400"
                  />
                </div>
              </div>
            </Panel>

            <Panel title="QUALITY TIERS">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {matchesSearch('Texture Quality') && (
                  <SelectRow
                    label="Texture Quality"
                    value={video.textureQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ textureQuality: v as typeof video.textureQuality })}
                  />
                )}
                {matchesSearch('Model Quality') && (
                  <SelectRow
                    label="Model Quality"
                    value={video.modelQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ modelQuality: v as typeof video.modelQuality })}
                  />
                )}
                {matchesSearch('Shadow Quality') && (
                  <SelectRow
                    label="Shadow Quality"
                    value={video.shadowQuality}
                    options={['Off', 'Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ shadowQuality: v as typeof video.shadowQuality })}
                    hint="Low preserves player silhouette shadows at minimal GPU cost."
                  />
                )}
                {matchesSearch('Lighting Quality') && (
                  <SelectRow
                    label="Lighting Quality"
                    value={video.lightingQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ lightingQuality: v as typeof video.lightingQuality })}
                  />
                )}
                {matchesSearch('Effects Quality') && (
                  <SelectRow
                    label="Effects Quality"
                    value={video.effectsQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ effectsQuality: v as typeof video.effectsQuality })}
                  />
                )}
                {matchesSearch('Particle Quality') && (
                  <SelectRow
                    label="Particle Quality"
                    value={video.particleQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ particleQuality: v as typeof video.particleQuality })}
                  />
                )}
                {matchesSearch('Foliage Quality') && (
                  <SelectRow
                    label="Foliage Quality"
                    value={video.foliageQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ foliageQuality: v as typeof video.foliageQuality })}
                  />
                )}
                {matchesSearch('Water Quality') && (
                  <SelectRow
                    label="Water Quality"
                    value={video.waterQuality}
                    options={['Low', 'Medium', 'High', 'Ultra'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ waterQuality: v as typeof video.waterQuality })}
                  />
                )}
                {matchesSearch('Reflections') && (
                  <SelectRow
                    label="Reflections"
                    value={video.reflections}
                    options={['Off', 'Low', 'High'].map((v) => ({ value: v, label: v }))}
                    onChange={(v) => store.updateVideo({ reflections: v as typeof video.reflections })}
                  />
                )}
              </div>

              <div className="mt-3 space-y-2">
                {matchesSearch('Shadow Distance') && (
                  <Slider
                    label="Shadow Distance"
                    value={video.shadowDistance}
                    min={10}
                    max={160}
                    step={5}
                    onChange={(v) => store.updateVideo({ shadowDistance: v })}
                    suffix="m"
                    hint="Dynamic shadow cascade range. Lower values tightly focus shadow texels near the player."
                  />
                )}
                {matchesSearch('Particle Limit') && (
                  <Slider
                    label="Particle Budget"
                    value={video.particleLimit}
                    min={0}
                    max={400}
                    step={10}
                    onChange={(v) => store.updateVideo({ particleLimit: v })}
                    hint="Maximum simultaneously pooled impact/spark particles."
                  />
                )}
              </div>
            </Panel>

            <Panel title="POST-PROCESSING & EFFECTS">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {matchesSearch('Ambient Occlusion') && (
                  <Toggle
                    label="Ambient Occlusion"
                    hint="Contact shadowing. Costs GPU time in dark corners."
                    checked={video.ambientOcclusion}
                    onChange={(v) => store.updateVideo({ ambientOcclusion: v })}
                  />
                )}
                {matchesSearch('Post Processing') && (
                  <Toggle
                    label="Post-Processing Pipeline"
                    checked={video.postProcessing}
                    onChange={(v) => store.updateVideo({ postProcessing: v })}
                  />
                )}
                {matchesSearch('Volumetrics') && (
                  <Toggle
                    label="Volumetric Light Shafts"
                    checked={video.volumetrics}
                    onChange={(v) => store.updateVideo({ volumetrics: v })}
                  />
                )}
                {matchesSearch('Motion Blur') && (
                  <Toggle
                    label="Motion Blur"
                    hint="Blurs during fast flicks. Strongly discouraged in competitive play."
                    checked={video.motionBlur}
                    onChange={(v) => store.updateVideo({ motionBlur: v })}
                  />
                )}
                {matchesSearch('Depth of Field') && (
                  <Toggle
                    label="Depth of Field"
                    hint="Blurs distant geometry. Discouraged in competitive play."
                    checked={video.depthOfField}
                    onChange={(v) => store.updateVideo({ depthOfField: v })}
                  />
                )}
                {matchesSearch('Bloom') && (
                  <Toggle
                    label="Bloom"
                    checked={video.bloom}
                    onChange={(v) => store.updateVideo({ bloom: v })}
                  />
                )}
                {matchesSearch('Color Grading') && (
                  <Toggle
                    label="Color Grading / Tone Mapping"
                    checked={video.colorGrading}
                    onChange={(v) => store.updateVideo({ colorGrading: v })}
                  />
                )}
                {matchesSearch('Competitive Clarity') && (
                  <Toggle
                    label="Competitive Clarity Boost"
                    hint="Applies neutral contrast and desaturation of non-critical decorative elements so hostile silhouettes read faster. Provides no information the game rules do not already permit."
                    checked={video.competitiveClarityBoost}
                    onChange={(v) => store.updateVideo({ competitiveClarityBoost: v })}
                  />
                )}
              </div>
            </Panel>

            <Panel title="TELEMETRY & DEBUG">
              <div className="space-y-2">
                {matchesSearch('Performance Telemetry') && (
                  <SelectRow
                    label="Performance Telemetry Overlay"
                    value={video.telemetryMode}
                    options={[
                      { value: 'OFF', label: 'Off' },
                      { value: 'MINIMAL', label: 'Minimal (FPS / Ping)' },
                      { value: 'FULL', label: 'Full Graphs & Occlusion Stats' }
                    ]}
                    onChange={(v) => store.updateVideo({ telemetryMode: v as typeof video.telemetryMode })}
                    hint="Telemetry is never mandatory during normal gameplay."
                  />
                )}
                {matchesSearch('Occlusion Debug') && (
                  <Toggle
                    label="Occlusion Debug Visualization (F3)"
                    hint="Highlights visible (green), behind-camera (red), wall-occluded (purple), and frustum/distance-culled (amber) geometry on the radar."
                    checked={video.showCullingDebug}
                    onChange={(v) => store.updateVideo({ showCullingDebug: v })}
                  />
                )}
              </div>
            </Panel>
          </div>
        );

      // ------------------------------------------------------------------
      case 'PRESETS':
        return (
          <div className="space-y-3">
            <Panel title="PERFORMANCE MODES">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {(
                  [
                    ['COMPETITIVE', 'Competitive', 'Max FPS · Min post-processing · Minimal particles'],
                    ['BALANCED', 'Balanced', 'Good visual quality with strong frame pacing'],
                    ['QUALITY', 'Quality', 'Higher lighting, shadows, and effects'],
                    ['ULTRA', 'Ultra', 'Maximum visual fidelity'],
                    ['LOW_END_PC', 'Low-End PC', 'Aggressive downscale for integrated GPUs'],
                    ['HIGH_END_PC', 'High-End PC', 'Unlimited budget visuals'],
                    ['STREAMING', 'Streaming', 'Stable pacing with presentable output'],
                    ['PRACTICE', 'Practice', 'Full telemetry + max visibility for training']
                  ] as Array<[PerformancePresetId, string, string]>
                ).map(([id, label, desc]) => (
                  <button
                    key={id}
                    onClick={() => {
                      store.applyPreset(id);
                      soundEngine.playUiSound('click');
                      setMessage(`Applied preset: ${label}`);
                    }}
                    className={`rounded-lg border p-3 text-left transition ${
                      video.preset === id
                        ? 'border-cyan-500/70 bg-cyan-950/30'
                        : 'border-tac-border bg-tac-panel2/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-sm font-bold text-white">{label}</div>
                    <div className="mt-1 text-[10px] leading-snug text-slate-400">{desc}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel
              title="COMPETITIVE OPTIMIZATION"
              subtitle="One click applies every low-latency, high-FPS, low-visual-clutter adjustment and reports exactly what changed."
            >
              <Button variant="primary" size="lg" onClick={runOptimization} className="w-full">
                <Sparkles className="h-4 w-4" />
                APPLY COMPETITIVE OPTIMIZATION
              </Button>

              {optimizationDiff && (
                <div className="mt-3 overflow-hidden rounded border border-emerald-800/60">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-emerald-950/50 font-mono uppercase text-emerald-300">
                      <tr>
                        <th className="px-3 py-1.5">SETTING</th>
                        <th className="px-3 py-1.5">BEFORE</th>
                        <th className="px-3 py-1.5">AFTER</th>
                        <th className="px-3 py-1.5">IMPACT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {optimizationDiff.map((d, i) => (
                        <tr key={i} className="bg-slate-900/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-200">{d.setting}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{d.before}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-400">{d.after}</td>
                          <td className="px-3 py-1.5 text-slate-400">{d.impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="AUTOMATIC HARDWARE OPTIMIZER">
              <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Runs a short synthetic math + WebGL capability probe, then recommends a preset. Browser APIs
                intentionally abstract physical GPU clocks, so this cannot perfectly identify your hardware.
              </p>
              <Button variant="secondary" onClick={runBenchmark} disabled={benchmarkRunning}>
                <Cpu className="h-4 w-4" />
                {benchmarkRunning ? 'RUNNING BENCHMARK…' : 'RUN HARDWARE BENCHMARK'}
              </Button>

              {benchmark && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <StatChip label="RECOMMENDED" value={benchmark.recommendedPreset} accent="text-cyan-400" />
                    <StatChip label="EST. SCORE" value={benchmark.estimatedScore} accent="text-emerald-400" />
                    <StatChip label="CPU CORES" value={benchmark.cpuCores} accent="text-white" />
                    <StatChip label="DEVICE MEMORY" value={`${benchmark.deviceMemoryGb}GB`} accent="text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <StatChip label="WEBGL2" value={benchmark.webgl2Supported ? 'YES' : 'NO'} accent={benchmark.webgl2Supported ? 'text-emerald-400' : 'text-red-400'} />
                    <StatChip label="WEBGPU" value={benchmark.webgpuSupported ? 'YES' : 'NO'} accent={benchmark.webgpuSupported ? 'text-emerald-400' : 'text-slate-500'} />
                    <StatChip label="POINTER LOCK" value={benchmark.pointerLockSupported ? 'YES' : 'NO'} accent={benchmark.pointerLockSupported ? 'text-emerald-400' : 'text-red-400'} />
                    <StatChip label="WEB WORKERS" value={benchmark.webWorkersSupported ? 'YES' : 'NO'} accent={benchmark.webWorkersSupported ? 'text-emerald-400' : 'text-slate-500'} />
                  </div>
                  <div className="rounded border border-tac-border bg-slate-900/60 p-2.5 font-mono text-[10px] text-slate-400">
                    RENDERER: {benchmark.rendererName}
                  </div>
                  <div className="flex items-start gap-2 rounded border border-amber-800/50 bg-amber-950/25 p-2.5 text-[10px] text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {benchmark.disclaimer}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        );

      // ------------------------------------------------------------------
      case 'MOUSE':
        return (
          <div className="space-y-2">
            {matchesSearch('DPI') && (
              <Slider
                label="Mouse DPI"
                value={mouse.dpi}
                min={100}
                max={3200}
                step={50}
                onChange={(v) => store.updateMouse({ dpi: v })}
                hint="Hardware DPI. Used for cm/360 calculations in the Sensitivity Lab."
              />
            )}
            {matchesSearch('Sensitivity', 'sens') && (
              <Slider
                label="Sensitivity"
                value={mouse.sensitivity}
                min={0.1}
                max={8}
                step={0.01}
                onChange={(v) => store.updateMouse({ sensitivity: v })}
                format={(v) => v.toFixed(2)}
                hint="Hipfire look multiplier applied to raw mouse counts."
              />
            )}
            {matchesSearch('Scoped Sensitivity') && (
              <Slider
                label="Scoped Sensitivity"
                value={mouse.scopedSensitivity}
                min={0.1}
                max={2}
                step={0.01}
                onChange={(v) => store.updateMouse({ scopedSensitivity: v })}
                format={(v) => v.toFixed(2)}
                hint="Multiplier applied while using a weapon optic."
              />
            )}
            {matchesSearch('ADS Sensitivity') && (
              <Slider
                label="ADS Sensitivity"
                value={mouse.adsSensitivity}
                min={0.1}
                max={2}
                step={0.01}
                onChange={(v) => store.updateMouse({ adsSensitivity: v })}
                format={(v) => v.toFixed(2)}
              />
            )}
            {matchesSearch('Zoom Multiplier') && (
              <Slider
                label="Zoom Sensitivity Multiplier"
                value={mouse.zoomMultiplier}
                min={0.5}
                max={2}
                step={0.01}
                onChange={(v) => store.updateMouse({ zoomMultiplier: v })}
                format={(v) => v.toFixed(2)}
              />
            )}
            {matchesSearch('Raw Input', 'unadjusted movement pointer lock') && (
              <Toggle
                label="Raw Mouse Input (unadjustedMovement)"
                hint="Requests raw hardware sensor data with OS-level acceleration bypassed via the Pointer Lock unadjustedMovement API where supported."
                checked={mouse.rawInput}
                onChange={(v) => store.updateMouse({ rawInput: v })}
              />
            )}
            {matchesSearch('Mouse Acceleration', 'accel') && (
              <>
                <Toggle
                  label="Mouse Acceleration"
                  hint="Strongly discouraged. Enabling this breaks deterministic muscle memory."
                  checked={mouse.mouseAcceleration}
                  onChange={(v) => store.updateMouse({ mouseAcceleration: v })}
                />
                {mouse.mouseAcceleration && (
                  <Slider
                    label="Acceleration Amount"
                    value={mouse.accelerationAmount}
                    min={1}
                    max={2}
                    step={0.01}
                    onChange={(v) => store.updateMouse({ accelerationAmount: v })}
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                )}
              </>
            )}
            {matchesSearch('Invert Y', 'invert') && (
              <Toggle
                label="Invert Vertical Axis"
                checked={mouse.invertY}
                onChange={(v) => store.updateMouse({ invertY: v })}
              />
            )}
            {matchesSearch('Per-Category Sensitivity', 'pistol rifle sniper') && (
              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                  Per-Category Sensitivity Multipliers
                </div>
                <div className="space-y-2">
                  <Slider
                    label="Pistols / Sidearms"
                    value={mouse.pistolSensMultiplier}
                    min={0.5}
                    max={2}
                    step={0.01}
                    onChange={(v) => store.updateMouse({ pistolSensMultiplier: v })}
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                  <Slider
                    label="Rifles / SMGs"
                    value={mouse.rifleSensMultiplier}
                    min={0.5}
                    max={2}
                    step={0.01}
                    onChange={(v) => store.updateMouse({ rifleSensMultiplier: v })}
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                  <Slider
                    label="Snipers / Scoped"
                    value={mouse.sniperSensMultiplier}
                    min={0.5}
                    max={2}
                    step={0.01}
                    onChange={(v) => store.updateMouse({ sniperSensMultiplier: v })}
                    format={(v) => `${v.toFixed(2)}x`}
                  />
                </div>
              </div>
            )}
            {matchesSearch('Jump Behavior', 'bhop scroll') && (
              <SelectRow
                label="Jump Behavior"
                value={mouse.jumpBehavior}
                options={[
                  { value: 'HoldOrTap', label: 'Hold or Tap' },
                  { value: 'ScrollBhopFriendly', label: 'Scroll Bhop Friendly' },
                  { value: 'StrictGrounded', label: 'Strict Grounded Only' }
                ]}
                onChange={(v) => store.updateMouse({ jumpBehavior: v as typeof mouse.jumpBehavior })}
                hint="Controls how jump input is buffered against ground contact. Jump itself is fully rebindable in the Keyboard tab."
              />
            )}
          </div>
        );

      // ------------------------------------------------------------------
      case 'SENSITIVITY': {
        const effectiveDpi = calculateEffectiveDpi(mouse.dpi, mouse.sensitivity);
        const cm360 = calculateCmPer360(mouse.dpi, mouse.sensitivity);
        return (
          <div className="space-y-3">
            <Panel title="SENSITIVITY LABORATORY">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <StatChip label="MOUSE DPI" value={mouse.dpi} accent="text-white" />
                <StatChip label="SENSITIVITY" value={mouse.sensitivity.toFixed(2)} accent="text-cyan-400" />
                <StatChip label="EFFECTIVE DPI" value={effectiveDpi} accent="text-emerald-400" />
                <StatChip label="CM / 360°" value={`${cm360} cm`} accent="text-amber-400" />
              </div>

              {/* 360-degree visualization */}
              <div className="mt-4 flex items-center gap-6 rounded border border-tac-border bg-slate-950/60 p-4">
                <svg width="150" height="150" viewBox="0 0 150 150">
                  <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
                  <circle cx="75" cy="75" r="46" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" strokeDasharray="3,3" />
                  <circle cx="75" cy="75" r="30" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" strokeDasharray="3,3" />
                  {[0, 90, 180, 270].map((deg) => (
                    <line
                      key={deg}
                      x1={75 + Math.cos((deg * Math.PI) / 180) * 30}
                      y1={75 + Math.sin((deg * Math.PI) / 180) * 30}
                      x2={75 + Math.cos((deg * Math.PI) / 180) * 62}
                      y2={75 + Math.sin((deg * Math.PI) / 180) * 62}
                      stroke="rgba(148,163,184,0.2)"
                      strokeWidth="1"
                    />
                  ))}
                  <line x1="75" y1="75" x2="137" y2="75" stroke="#06b6d4" strokeWidth="2.5" />
                  <circle cx="75" cy="75" r="3" fill="#06b6d4" />
                  <text x="75" y="14" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                    0° / 360°
                  </text>
                  <text x="140" y="78" textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                    90°
                  </text>
                  <text x="75" y="144" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                    180°
                  </text>
                  <text x="10" y="78" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                    270°
                  </text>
                </svg>

                <div className="flex-1 space-y-2 text-xs text-slate-300">
                  <div className="font-bold uppercase tracking-wide text-cyan-400">DISTANCE TO ROTATE</div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">180° Turn</span>
                    <span className="font-mono font-bold">{Math.round(cm360 / 2)} cm</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">360° Full Turn</span>
                    <span className="font-mono font-bold">{cm360} cm</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">720° Double Turn</span>
                    <span className="font-mono font-bold">{Math.round(cm360 * 2)} cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Scoped cm/360</span>
                    <span className="font-mono font-bold">{calculateCmPer360(mouse.dpi, mouse.sensitivity * mouse.scopedSensitivity)} cm</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="SENSITIVITY CONVERSION">
              <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Mathematically derived conversions using each title's published yaw scale. Conversion is only
                meaningful where both engines use a directly proportional constant yaw rate.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <StatChip
                  label="VALORANT EQUIVALENT"
                  value={convertSensitivityScale(mouse.sensitivity, 'Valorant')}
                  accent="text-rose-400"
                  sub="yaw 0.07°/count"
                />
                <StatChip
                  label="OVERWATCH 2 EQUIVALENT"
                  value={convertSensitivityScale(mouse.sensitivity, 'Overwatch')}
                  accent="text-orange-400"
                  sub="yaw 0.0066°/count"
                />
                <StatChip
                  label="APEX / SOURCE EQUIVALENT"
                  value={convertSensitivityScale(mouse.sensitivity, 'Apex')}
                  accent="text-emerald-400"
                  sub="yaw 0.022°/count"
                />
              </div>
            </Panel>

            <Panel title="TRAINING DRILLS">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {[
                  ['180° FLICK', `Turn 180° in ${Math.round(cm360 / 2)} cm of mouse travel`],
                  ['360° TRACK', `Full rotation in ${cm360} cm — practice smooth continuous tracking`],
                  ['720° CONTROL', `${Math.round(cm360 * 2)} cm double rotation for extended swipe resets`]
                ].map(([label, hint]) => (
                  <div key={label} className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="text-xs font-bold text-cyan-400">{label}</div>
                    <div className="mt-1 text-[10px] leading-snug text-slate-400">{hint}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        );
      }

      // ------------------------------------------------------------------
      case 'KEYBOARD':
        return (
          <div className="space-y-3">
            {conflicts.length > 0 && (
              <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-[11px] text-amber-200">
                <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
                <strong>Binding conflicts detected:</strong>{' '}
                {conflicts
                  .map(([code, actions]) => `${code} → ${actions.map((a) => ACTION_LABELS[a]).join(', ')}`)
                  .join(' | ')}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => store.resetKeybinds()}>
                <RotateCcw className="h-3 w-3" /> RESET DEFAULTS
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
              {(Object.keys(keybinds) as BindableAction[])
                .filter((action) => matchesSearch(ACTION_LABELS[action], action))
                .map((action) => (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-3 rounded border border-tac-border bg-tac-panel2/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-200">
                      {ACTION_LABELS[action]}
                    </span>
                    <button
                      onClick={() => handleRebind(action)}
                      className={`min-w-[110px] rounded border px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                        rebinding === action
                          ? 'animate-pulse border-cyan-500 bg-cyan-950/50 text-cyan-300'
                          : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-600'
                      } ${keybinds[action] !== DEFAULT_KEYBINDS[action] ? 'ring-1 ring-amber-600/40' : ''}`}
                    >
                      {rebinding === action ? 'PRESS ANY KEY…' : keybinds[action]}
                    </button>
                  </div>
                ))}
            </div>
            <p className="text-[10px] text-slate-500">
              Every action is independently bindable to keyboard keys, mouse buttons, and the mouse wheel.
              Duplicate bindings are permitted but flagged above. Configurations are versioned so future
              updates will not break existing files.
            </p>
          </div>
        );

      // ------------------------------------------------------------------
      case 'CROSSHAIR':
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-2">
              {matchesSearch('Crosshair Style') && (
                <SelectRow
                  label="Crosshair Style"
                  value={crosshair.style}
                  options={[
                    { value: 'ClassicStatic', label: 'Classic Static' },
                    { value: 'ClassicDynamic', label: 'Classic Dynamic' },
                    { value: 'DotOnly', label: 'Dot Only' },
                    { value: 'TShape', label: 'T Shape' },
                    { value: 'CircleReticle', label: 'Circle Reticle' }
                  ]}
                  onChange={(v) => store.updateCrosshair({ style: v as typeof crosshair.style })}
                />
              )}
              {matchesSearch('Crosshair Color') && (
                <div className="rounded border border-tac-border bg-tac-panel2/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Crosshair Color</span>
                    <input
                      type="color"
                      value={crosshair.color}
                      onChange={(e) => store.updateCrosshair({ color: e.target.value })}
                      className="h-7 w-14 cursor-pointer rounded border border-tac-border bg-slate-900"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['#22d3ee', '#00ff00', '#ff0000', '#ffffff', '#ff00ff', '#ffff00', '#ff8800'].map((c) => (
                      <button
                        key={c}
                        onClick={() => store.updateCrosshair({ color: c })}
                        style={{ backgroundColor: c }}
                        className={`h-5 w-5 rounded border ${
                          crosshair.color === c ? 'border-white' : 'border-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {matchesSearch('Crosshair Size') && (
                <Slider label="Size" value={crosshair.size} min={1} max={20} onChange={(v) => store.updateCrosshair({ size: v })} suffix="px" />
              )}
              {matchesSearch('Crosshair Thickness') && (
                <Slider label="Thickness" value={crosshair.thickness} min={1} max={8} onChange={(v) => store.updateCrosshair({ thickness: v })} suffix="px" />
              )}
              {matchesSearch('Crosshair Gap') && (
                <Slider label="Gap" value={crosshair.gap} min={-4} max={15} onChange={(v) => store.updateCrosshair({ gap: v })} suffix="px" />
              )}
              {matchesSearch('Outline') && (
                <>
                  <Toggle label="Outline" checked={crosshair.outline} onChange={(v) => store.updateCrosshair({ outline: v })} />
                  {crosshair.outline && (
                    <Slider label="Outline Thickness" value={crosshair.outlineThickness} min={1} max={3} onChange={(v) => store.updateCrosshair({ outlineThickness: v })} suffix="px" />
                  )}
                </>
              )}
              {matchesSearch('Opacity') && (
                <Slider
                  label="Opacity"
                  value={crosshair.opacity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={(v) => store.updateCrosshair({ opacity: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              )}
              {matchesSearch('Center Dot', 'dot') && (
                <>
                  <Toggle label="Center Dot" checked={crosshair.centerDot} onChange={(v) => store.updateCrosshair({ centerDot: v })} />
                  {crosshair.centerDot && (
                    <Slider label="Center Dot Size" value={crosshair.centerDotSize} min={1} max={6} onChange={(v) => store.updateCrosshair({ centerDotSize: v })} suffix="px" />
                  )}
                </>
              )}
              {matchesSearch('Dynamic Movement') && (
                <Toggle
                  label="Dynamic Gap — Movement"
                  hint="Crosshair expands while moving, visualizing current inaccuracy."
                  checked={crosshair.dynamicMovement}
                  onChange={(v) => store.updateCrosshair({ dynamicMovement: v })}
                />
              )}
              {matchesSearch('Dynamic Firing') && (
                <Toggle
                  label="Dynamic Gap — Firing"
                  hint="Crosshair expands while shooting."
                  checked={crosshair.dynamicFiring}
                  onChange={(v) => store.updateCrosshair({ dynamicFiring: v })}
                />
              )}
              {matchesSearch('Recoil Feedback') && (
                <Toggle
                  label="Recoil Displacement Feedback"
                  hint="Physically displaces the crosshair to mirror recoil bloom."
                  checked={crosshair.recoilFeedback}
                  onChange={(v) => store.updateCrosshair({ recoilFeedback: v })}
                />
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    store.updateCrosshair({ ...DEFAULT_CROSSHAIR_SETTINGS });
                    setMessage('Crosshair reset to defaults.');
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> RESET CROSSHAIR
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const exported = JSON.stringify({ schemaVersion: 1, category: 'crosshair.json', crosshair }, null, 2);
                    navigator.clipboard?.writeText(exported);
                    setMessage('Crosshair config copied to clipboard.');
                  }}
                >
                  <Download className="h-3 w-3" /> COPY CROSSHAIR JSON
                </Button>
              </div>
            </div>

            <Panel title="LIVE PREVIEW">
              <div className="relative flex h-56 items-center justify-center overflow-hidden rounded border border-tac-border bg-gradient-to-b from-slate-800 to-slate-950">
                <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.2)_1px,transparent_1px)] [background-size:22px_22px]" />
                <CrosshairReticle settings={crosshair} movementSpeed={0} isFiring={false} />
                <div className="absolute left-3 top-2 font-mono text-[10px] text-slate-500">
                  PREVIEW SURFACE — HARBOR PROTOCOL CONCRETE
                </div>
              </div>
            </Panel>
          </div>
        );

      // ------------------------------------------------------------------
      case 'AUDIO':
        return (
          <div className="space-y-2">
            {matchesSearch('Master Volume') && (
              <Slider label="Master Volume" value={audio.masterVolume} min={0} max={1} step={0.01} onChange={(v) => store.updateAudio({ masterVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('SFX Volume', 'sound effects') && (
              <Slider label="SFX Volume" value={audio.sfxVolume} min={0} max={1} step={0.01} onChange={(v) => store.updateAudio({ sfxVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('Weapon Volume', 'gunshots') && (
              <Slider label="Weapon / Gunshot Volume" value={audio.weaponVolume} min={0} max={1} step={0.01} onChange={(v) => store.updateAudio({ weaponVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('Footstep Boost', 'steps') && (
              <Slider
                label="Footstep Boost"
                value={audio.footstepBoost}
                min={0.5}
                max={2.5}
                step={0.05}
                onChange={(v) => store.updateAudio({ footstepBoost: v })}
                format={(v) => `${v.toFixed(2)}x`}
                hint="Raises enemy footstep audibility. Competitive profiles typically set 1.2–1.6x."
              />
            )}
            {matchesSearch('Voice Volume', 'voice chat') && (
              <Slider label="Voice Chat Volume" value={audio.voiceVolume} min={0} max={1} step={0.01} onChange={(v) => store.updateAudio({ voiceVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('UI Volume') && (
              <Slider label="UI Volume" value={audio.uiVolume} min={0} max={1} step={0.01} onChange={(v) => store.updateAudio({ uiVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('HRTF', 'spatial 3d audio') && (
              <Toggle
                label="HRTF Spatial Audio"
                hint="Head-related transfer function binaural panning for accurate directional audio cues."
                checked={audio.spatialHrtf}
                onChange={(v) => store.updateAudio({ spatialHrtf: v })}
              />
            )}
            {matchesSearch('Audio Occlusion', 'sound occlusion walls') && (
              <Toggle
                label="Sound Occlusion"
                hint="Low-pass filters sounds originating behind solid geometry."
                checked={audio.soundOcclusion}
                onChange={(v) => store.updateAudio({ soundOcclusion: v })}
              />
            )}
            {matchesSearch('Competitive Audio Profile') && (
              <Toggle
                label="Competitive Audio Profile"
                hint="Suppresses ambient and music layers to prioritize gameplay-critical positional cues."
                checked={audio.competitiveAudioProfile}
                onChange={(v) => store.updateAudio({ competitiveAudioProfile: v })}
              />
            )}
            {matchesSearch('Mute When Unfocused') && (
              <Toggle label="Mute When Window Unfocused" checked={audio.muteWhenUnfocused} onChange={(v) => store.updateAudio({ muteWhenUnfocused: v })} />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                soundEngine.playUiSound('click');
                soundEngine.playWeaponFire('Rifles', false, { x: 3, y: 1.6, z: -2 }, false);
              }}
            >
              TEST POSITIONAL GUNSHOT
            </Button>
          </div>
        );

      // ------------------------------------------------------------------
      case 'HUD':
        return (
          <div className="space-y-2">
            {matchesSearch('Language') && (
              <SelectRow
                label="Interface Language"
                value={gameplay.language}
                options={[
                  { value: 'en-US', label: 'English (US)' },
                  { value: 'de-DE', label: 'Deutsch' },
                  { value: 'es-ES', label: 'Español' },
                  { value: 'fr-FR', label: 'Français' },
                  { value: 'pt-BR', label: 'Português (BR)' },
                  { value: 'ja-JP', label: '日本語' }
                ]}
                onChange={(v) => store.updateGameplay({ language: v as typeof gameplay.language })}
              />
            )}
            {matchesSearch('HUD Opacity') && (
              <Slider label="HUD Opacity" value={gameplay.hudOpacity} min={0.2} max={1} step={0.05} onChange={(v) => store.updateGameplay({ hudOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
            {matchesSearch('Radar Size', 'minimap') && (
              <Slider label="Radar Size" value={gameplay.radarSize} min={120} max={340} step={5} onChange={(v) => store.updateGameplay({ radarSize: v })} suffix="px" />
            )}
            {matchesSearch('Radar Zoom', 'minimap scale') && (
              <Slider label="Radar Zoom" value={gameplay.radarZoom} min={0.5} max={2.2} step={0.05} onChange={(v) => store.updateGameplay({ radarZoom: v })} format={(v) => `${v.toFixed(2)}x`} />
            )}
            {matchesSearch('Radar Rotate') && (
              <Toggle label="Rotate Radar With View" checked={gameplay.radarRotate} onChange={(v) => store.updateGameplay({ radarRotate: v })} />
            )}
            {matchesSearch('Damage Indicators') && (
              <Toggle label="Damage Indicators" checked={gameplay.damageIndicators} onChange={(v) => store.updateGameplay({ damageIndicators: v })} />
            )}
            {matchesSearch('Kill Feed') && (
              <Toggle label="Kill Feed" checked={gameplay.killFeedEnabled} onChange={(v) => store.updateGameplay({ killFeedEnabled: v })} />
            )}
            {matchesSearch('Teammate Equipment', 'overhead') && (
              <Toggle label="Teammate Equipment Overhead" checked={gameplay.teammateEquipmentOverhead} onChange={(v) => store.updateGameplay({ teammateEquipmentOverhead: v })} />
            )}
            {matchesSearch('Enemy Name On Aim') && (
              <Toggle
                label="Enemy Identification On Aim"
                hint="Shows a nameplate only for opponents you are already aiming at with line of sight."
                checked={gameplay.enemyNameOnAim}
                onChange={(v) => store.updateGameplay({ enemyNameOnAim: v })}
              />
            )}
            {matchesSearch('Interaction Prompts') && (
              <Toggle label="Interaction Prompts" checked={gameplay.interactionPrompts} onChange={(v) => store.updateGameplay({ interactionPrompts: v })} />
            )}
            {matchesSearch('Subtitles') && (
              <Toggle label="Subtitles" checked={gameplay.subtitles} onChange={(v) => store.updateGameplay({ subtitles: v })} />
            )}
            {matchesSearch('Visual Audio Radar', 'sound visualization') && (
              <Toggle
                label="Visual Audio Radar Ring"
                hint="Displays a directional ring that pulses toward recent sound events, an accessibility aid for players with hearing impairments."
                checked={gameplay.visualAudioRadarRing}
                onChange={(v) => store.updateGameplay({ visualAudioRadarRing: v })}
              />
            )}
          </div>
        );

      // ------------------------------------------------------------------
      case 'NETWORK':
        return (
          <div className="space-y-2">
            {matchesSearch('Preferred Region', 'server location') && (
              <SelectRow
                label="Preferred Region"
                value={network.preferredRegion}
                options={REGION_SERVERS.map((r) => ({ value: r.id, label: `${r.name} — ${r.city} (${r.pingMs}ms)` }))}
                onChange={(v) => store.updateNetwork({ preferredRegion: v as RegionId })}
                hint="Region selection is a preference; the matchmaker still validates latency before placing you."
              />
            )}
            {matchesSearch('Max Acceptable Ping', 'latency limit') && (
              <Slider label="Max Acceptable Ping" value={network.maxAcceptablePingMs} min={20} max={250} step={5} onChange={(v) => store.updateNetwork({ maxAcceptablePingMs: v })} suffix="ms" />
            )}
            {matchesSearch('Packet Rate', 'tickrate tick rate') && (
              <SelectRow
                label="Packet Rate (Tick Rate)"
                value={String(network.packetRateHz)}
                options={[
                  { value: '64', label: '64 Hz (standard)' },
                  { value: '128', label: '128 Hz (high precision)' }
                ]}
                onChange={(v) => store.updateNetwork({ packetRateHz: Number(v) as 64 | 128 })}
                hint="Higher tick rate costs bandwidth but tightens hit registration."
              />
            )}
            {matchesSearch('Interpolation Delay', 'lag compensation') && (
              <Slider
                label="Interpolation Delay"
                value={network.interpolationDelayMs}
                min={0}
                max={60}
                step={0.5}
                onChange={(v) => store.updateNetwork({ interpolationDelayMs: v })}
                suffix="ms"
                hint="Buffer used to smooth remote entity motion. 15.6ms equals one 64-tick interval."
              />
            )}
            {matchesSearch('Client-side Prediction') && (
              <Toggle label="Client-Side Prediction" checked={network.clientSidePrediction} onChange={(v) => store.updateNetwork({ clientSidePrediction: v })} />
            )}
            {matchesSearch('Server Reconciliation') && (
              <Toggle label="Server Reconciliation" checked={network.serverReconciliation} onChange={(v) => store.updateNetwork({ serverReconciliation: v })} />
            )}
            {matchesSearch('Lag Compensation') && (
              <Toggle label="Lag Compensation (Server Rewind)" checked={network.lagCompensation} onChange={(v) => store.updateNetwork({ lagCompensation: v })} />
            )}
            {matchesSearch('Simulate Latency', 'netgraph debug') && (
              <Slider
                label="Simulate Latency (Debug)"
                value={network.simulateLatencyMs}
                min={0}
                max={300}
                step={2}
                onChange={(v) => store.updateNetwork({ simulateLatencyMs: v })}
                suffix="ms"
                hint="Developer tool for testing prediction and interpolation behaviour under adverse conditions."
              />
            )}
            {matchesSearch('Simulate Packet Loss', 'netgraph debug') && (
              <Slider
                label="Simulate Packet Loss (Debug)"
                value={network.simulatePacketLossPercent}
                min={0}
                max={25}
                step={0.5}
                onChange={(v) => store.updateNetwork({ simulatePacketLossPercent: v })}
                suffix="%"
              />
            )}
            <div className="rounded border border-tac-border bg-slate-900/60 p-3 text-[10px] leading-relaxed text-slate-400">
              The authoritative server validates movement speed, fire cadence, view-angle bounds, and economy
              actions every tick. Client packets are treated as untrusted input requests.
            </div>
          </div>
        );

      // ------------------------------------------------------------------
      case 'ACCESSIBILITY':
        return (
          <div className="space-y-2">
            {matchesSearch('Colorblind', 'color blind mode') && (
              <SelectRow
                label="Colorblind Preset"
                value={gameplay.colorblindMode}
                options={[
                  { value: 'None', label: 'None' },
                  { value: 'Protanopia', label: 'Protanopia (red-weak)' },
                  { value: 'Deuteranopia', label: 'Deuteranopia (green-weak)' },
                  { value: 'Tritanopia', label: 'Tritanopia (blue-weak)' }
                ]}
                onChange={(v) => store.updateGameplay({ colorblindMode: v as typeof gameplay.colorblindMode })}
              />
            )}
            {matchesSearch('UI Scale') && (
              <Slider label="UI Scale" value={gameplay.uiScale} min={0.8} max={1.5} step={0.05} onChange={(v) => store.updateGameplay({ uiScale: v })} format={(v) => `${v.toFixed(2)}x`} />
            )}
            {matchesSearch('Text Scale') && (
              <Slider label="Text Scale" value={gameplay.textScale} min={0.8} max={1.6} step={0.05} onChange={(v) => store.updateGameplay({ textScale: v })} format={(v) => `${v.toFixed(2)}x`} />
            )}
            {matchesSearch('High Contrast') && (
              <Toggle label="High Contrast HUD" checked={gameplay.highContrastHud} onChange={(v) => store.updateGameplay({ highContrastHud: v })} />
            )}
            {matchesSearch('Reduced Motion') && (
              <Toggle
                label="Reduce Motion"
                hint="Disables menu transitions, animated backgrounds, and non-essential HUD animation."
                checked={gameplay.reducedMotion}
                onChange={(v) => store.updateGameplay({ reducedMotion: v })}
              />
            )}
            {matchesSearch('Screen Flash Reduction', 'flashbang accessibility') && (
              <Toggle
                label="Reduce Screen Flash Intensity"
                hint="Caps the maximum brightness ramp applied by flash effects while preserving gameplay duration and blinding behaviour."
                checked={gameplay.flashbangDarkMode}
                onChange={(v) => store.updateGameplay({ flashbangDarkMode: v })}
              />
            )}
            {matchesSearch('Subtitles') && (
              <Toggle label="Subtitles" checked={gameplay.subtitles} onChange={(v) => store.updateGameplay({ subtitles: v })} />
            )}
            {matchesSearch('Audio Visualization') && (
              <Toggle
                label="Directional Sound Visualization"
                hint="Shows a pulsing direction ring for gameplay-critical sounds. Visualizes only audio the player is already receiving."
                checked={gameplay.visualAudioRadarRing}
                onChange={(v) => store.updateGameplay({ visualAudioRadarRing: v })}
              />
            )}
            {matchesSearch('HUD Opacity') && (
              <Slider label="HUD Opacity" value={gameplay.hudOpacity} min={0.2} max={1} step={0.05} onChange={(v) => store.updateGameplay({ hudOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            )}
          </div>
        );

      // ------------------------------------------------------------------
      case 'CONFIG':
        return (
          <div className="space-y-3">
            <Panel title="EXPORT CONFIGURATION">
              <div className="flex flex-wrap gap-2">
                {(['all', 'video', 'controls', 'audio', 'crosshair', 'gameplay', 'network'] as const).map((cat) => (
                  <Button key={cat} variant="secondary" size="sm" onClick={() => downloadConfig(cat)}>
                    <Download className="h-3 w-3" />
                    {cat === 'all' ? 'vanguard_config_bundle.json' : `${cat}.json`}
                  </Button>
                ))}
              </div>
            </Panel>

            <Panel title="IMPORT CONFIGURATION">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='Paste exported JSON here (video.json, controls.json, crosshair.json, or a full bundle)'
                className="h-32 w-full rounded border border-tac-border bg-slate-950 p-2.5 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-600"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const res = store.importCategoryJson(importText);
                    setMessage(res.message);
                    soundEngine.playUiSound(res.ok ? 'buy' : 'error');
                  }}
                >
                  <Upload className="h-3 w-3" /> IMPORT CONFIG
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    store.resetAllSettings();
                    setMessage('All settings reset to factory defaults.');
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> RESET ALL SETTINGS
                </Button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Configs are versioned with a <span className="font-mono">schemaVersion</span> field. Importing a
                newer schema is rejected with a clear error rather than silently corrupting your settings. Local
                settings persist to browser storage; cloud sync is available through the account service.
              </p>
            </Panel>

            <Panel title="CLOUD SYNC">
              <div className="flex items-center justify-between rounded border border-tac-border bg-tac-panel2/60 px-3 py-2.5">
                <div>
                  <div className="text-xs font-bold text-slate-200">Cloud Settings Synchronization</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Persist settings server-side against your account so they follow you across machines.
                  </div>
                </div>
                <span className="rounded bg-slate-800 px-2 py-1 font-mono text-[10px] text-slate-400">
                  {typeof navigator !== 'undefined' && navigator.onLine ? 'AUTHENTICATED' : 'OFFLINE'}
                </span>
              </div>
            </Panel>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Category sidebar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings… (e.g. sensitivity, jump)"
            className="w-full rounded border border-tac-border bg-tac-panel py-2 pl-9 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-600"
          />
        </div>

        {lowerSearch && (
          <div className="rounded border border-cyan-800/50 bg-cyan-950/25 p-2 text-[10px] text-cyan-200">
            Searching across <strong>all</strong> categories for “{search}”. Clear the field to browse by tab.
          </div>
        )}

        <nav className="space-y-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                soundEngine.playUiSound('hover');
                setCategory(cat.id);
              }}
              className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-bold uppercase tracking-wide transition ${
                category === cat.id
                  ? 'bg-cyan-600/15 text-cyan-300 ring-1 ring-cyan-700/50'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div>
        {message && (
          <div className="mb-3 flex items-center gap-2 rounded border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-[11px] text-emerald-200">
            <Check className="h-3.5 w-3.5" />
            {message}
          </div>
        )}

        {lowerSearch ? (
          // Unified search results across every category
          <div className="space-y-3">
            {CATEGORIES.filter((c) => c.id !== 'CONFIG').map((cat) => (
              <Panel key={cat.id} title={`${cat.label} — MATCHES`}>
                <SearchResultsFor
                  category={cat.id}
                  search={lowerSearch}
                  onOpen={() => {
                    setCategory(cat.id);
                    setSearch('');
                  }}
                />
              </Panel>
            ))}
          </div>
        ) : (
          renderCategory()
        )}
      </div>
    </div>
  );
};

const SEARCH_INDEX: Record<string, string[]> = {
  VIDEO: ['Resolution', 'Render Scale', 'FOV', 'VSync', 'FPS Cap', 'Anti-Aliasing', 'Anisotropic Filtering', 'Sharpening', 'Head Bob'],
  GRAPHICS: ['Frustum Culling', 'Smart Occlusion', 'Portal Culling', 'LOD', 'Instancing', 'Player Visibility Distance', 'Object Visibility Distance', 'Texture Quality', 'Shadow Quality', 'Particles', 'Ambient Occlusion', 'Reflections', 'Motion Blur', 'Depth of Field', 'Bloom'],
  PRESETS: ['Competitive', 'Balanced', 'Quality', 'Ultra', 'Low-End PC', 'High-End PC', 'Streaming', 'Practice', 'Benchmark'],
  MOUSE: ['DPI', 'Sensitivity', 'Scoped Sensitivity', 'ADS Sensitivity', 'Raw Input', 'Mouse Acceleration', 'Invert Y', 'Jump Behavior'],
  SENSITIVITY: ['Effective DPI', 'cm/360', 'Sensitivity Conversion', '180 Turn', '360 Turn', '720 Turn'],
  KEYBOARD: ['Move Forward', 'Move Backward', 'Strafe Left', 'Strafe Right', 'Jump', 'Crouch', 'Walk', 'Reload', 'Interact', 'Buy Menu', 'Scoreboard', 'Voice', 'Console'],
  CROSSHAIR: ['Style', 'Size', 'Thickness', 'Gap', 'Outline', 'Opacity', 'Color', 'Center Dot', 'Dynamic', 'Recoil Feedback'],
  AUDIO: ['Master Volume', 'SFX', 'Weapon Volume', 'Footstep Boost', 'Voice', 'HRTF', 'Occlusion', 'Competitive Profile'],
  HUD: ['Language', 'HUD Opacity', 'Radar Size', 'Radar Zoom', 'Damage Indicators', 'Kill Feed', 'Subtitles', 'Interaction Prompts'],
  NETWORK: ['Region', 'Ping', 'Tick Rate', 'Interpolation', 'Prediction', 'Reconciliation', 'Lag Compensation', 'Packet Loss'],
  ACCESSIBILITY: ['Colorblind', 'UI Scale', 'Text Scale', 'High Contrast', 'Reduced Motion', 'Flash Reduction', 'Sound Visualization'],
  CONFIG: ['Export', 'Import', 'Reset', 'Cloud Sync']
};

const SearchResultsFor: React.FC<{ category: string; search: string; onOpen: () => void }> = ({
  category,
  search,
  onOpen
}) => {
  const entries = (SEARCH_INDEX[category] || []).filter((e) => e.toLowerCase().includes(search));
  if (entries.length === 0) {
    return <div className="text-[11px] text-slate-500">No matching settings in this category.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => (
        <button
          key={e}
          onClick={onOpen}
          className="rounded border border-tac-border bg-tac-panel2 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-cyan-600"
        >
          {e}
        </button>
      ))}
    </div>
  );
};
