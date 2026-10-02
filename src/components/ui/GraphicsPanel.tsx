/**
 * Graphics settings panel.
 *
 * Exposes the full graphics feature set the engine supports, grouped so the
 * common controls are reachable without scrolling, with one-click presets.
 * The initial preset is *recommended* from measured capabilities rather than
 * hard-coded, but every value remains manually overridable.
 */

import React, { useMemo, useState } from 'react';
import {
  Sliders,
  Gauge,
  Sparkles,
  Check,
  ChevronDown,
  ChevronRight,
  Monitor,
  Zap,
} from 'lucide-react';
import { useSettingsStore, type PerformancePresetId, type QualityTier } from '../../game/settings/settingsStore';
import { rendererManager } from '../../game/rendering/renderer-manager';
import { recommendPreset } from '../../game/core/performanceManager';
import type { GraphicsTestResult } from '../../game/core/graphicsBenchmark';

// `graphicsBenchmark` imports three.js, so it is deliberately NOT a static
// import here. A static import would pull the whole ~500 kB three.js chunk into
// the launcher's initial modulepreload, which is exactly the regression this
// project's code splitting exists to prevent. It is fetched on demand when the
// user presses Run graphics test.

const PRESETS: Array<{ id: PerformancePresetId; label: string; blurb: string }> = [
  { id: 'LOW_END_PC', label: 'Performance', blurb: 'Lowest cost — software rasterizers and old GPUs' },
  { id: 'COMPETITIVE', label: 'Balanced', blurb: 'Lowest latency for competitive play' },
  { id: 'BALANCED', label: 'Quality', blurb: 'Balanced fidelity and frame rate' },
  { id: 'ULTRA', label: 'Ultra', blurb: 'Maximum visual fidelity' },
  { id: 'CUSTOM', label: 'Custom', blurb: 'Your own configuration' }
];

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-tac-border/50 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-36 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
        aria-label="Graphics setting"
      />
      <span className="w-14 text-right font-mono text-[10px] text-cyan-300">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-cyan-600' : 'bg-slate-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: ReadonlyArray<T>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded border border-tac-border bg-tac-panel2 px-2 py-1 font-mono text-[10px] uppercase text-slate-200 outline-none focus:border-cyan-600"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

const QUALITY_TIERS: ReadonlyArray<QualityTier> = ['Low', 'Medium', 'High', 'Ultra'];

export const GraphicsPanel: React.FC = () => {
  const video = useSettingsStore((s) => s.video);
  const updateVideo = useSettingsStore((s) => s.updateVideo);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const [open, setOpen] = useState<Record<string, boolean>>({ core: true, effects: true, advanced: false });
  const [test, setTest] = useState<GraphicsTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const selection = rendererManager.getSelection();
  const caps = selection.capabilities;

  const recommended = useMemo(
    () => recommendPreset(caps.recommendedQuality, caps.gpu.class === 'software'),
    [caps.recommendedQuality, caps.gpu.class]
  );

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      // Lazy import keeps three.js out of the launcher's critical path.
      const { runGraphicsTest } = await import('../../game/core/graphicsBenchmark');
      setTest(await runGraphicsTest(2000));
    } catch (err) {
      setTest({
        ok: false,
        error: `The graphics test could not start: ${err instanceof Error ? err.message : String(err)}`,
        renderer: 'unknown',
        gpu: 'unknown',
        gpuClass: 'unknown',
        averageFps: 0,
        onePercentLowFps: 0,
        frameTimeMs: 0,
        framesRendered: 0,
        durationMs: 0,
        recommendedPreset: 'BALANCED',
        recommendedQuality: 'Low',
        devicePixelRatio: 1,
        canvasSize: [0, 0],
        measuredAt: new Date().toISOString()
      });
    } finally {
      setTesting(false);
    }
  };

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="rounded-lg border border-tac-border bg-tac-panel/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-cyan-400" />
        <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-white">Graphics</h3>
        <span className="ml-auto rounded border border-tac-border bg-tac-panel2 px-2 py-0.5 font-mono text-[9px] uppercase text-slate-400">
          {selection.tier === 'webgl2' ? 'WebGL2' : selection.tier === 'none' ? 'Interface only' : 'Compatibility 2D'}
        </span>
      </div>

      {/* Presets */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {PRESETS.map((p) => {
          const active = video.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              title={p.blurb}
              className={`flex flex-col items-center gap-0.5 rounded border px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                active
                  ? 'border-cyan-600 bg-cyan-600/15 text-cyan-300'
                  : 'border-tac-border bg-tac-panel2 text-slate-400 hover:border-cyan-700 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1">
                {active && <Check className="h-3 w-3" />}
                {p.label}
              </span>
              {p.id === recommended && !active && (
                <span className="text-[8px] font-normal normal-case text-amber-400">recommended</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Core */}
      <Section title="Core" icon={<Monitor className="h-3 w-3" />} open={!!open.core} onToggle={() => toggle('core')}>
        <Row label="Renderer" hint="Force a specific renderer, or let the app choose the best available.">
          <Select
            label="Renderer"
            value={video.rendererOverride}
            options={['Auto', 'WebGL2', 'Compatibility2D'] as const}
            onChange={(v) => updateVideo({ rendererOverride: v })}
          />
        </Row>
        <Row label="Resolution scale" hint="Renders below native resolution and upscales. The biggest performance lever.">
          <Slider
            value={video.renderScale}
            min={0.5}
            max={1.5}
            step={0.05}
            onChange={(v) => updateVideo({ renderScale: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>
        <Row label="Dynamic resolution" hint="Automatically lowers internal resolution to hold the frame-time target.">
          <Toggle
            checked={video.dynamicResolution}
            onChange={(v) => updateVideo({ dynamicResolution: v })}
            label="Dynamic resolution"
          />
        </Row>
        <Row label="FPS limit" hint="Caps the presented frame rate to free CPU and GPU headroom.">
          <Select
            label="FPS limit"
            value={video.fpsCapPreset}
            options={['30', '60', '120', '144', '165', '240', '360', 'Unlimited'] as const}
            onChange={(v) => updateVideo({ fpsCapPreset: v, fpsCapCustom: v === 'Unlimited' ? 240 : Number(v) })}
          />
        </Row>
        <Row label="VSync" hint="Synchronises presentation with the display refresh.">
          <Toggle checked={video.vsync} onChange={(v) => updateVideo({ vsync: v })} label="VSync" />
        </Row>
        <Row label="Anti-aliasing" hint="MSAA needs a WebGL2 context; FXAA works on every renderer.">
          <Select
            label="Anti-aliasing"
            value={video.antiAliasing}
            options={['Off', 'FXAA', 'MSAA'] as const}
            onChange={(v) => updateVideo({ antiAliasing: v })}
          />
        </Row>
        <Row label="Performance mode">
          <Select
            label="Performance mode"
            value={video.performanceMode}
            options={['Off', 'BatterySaver', 'Balanced', 'Maximum'] as const}
            onChange={(v) => updateVideo({ performanceMode: v })}
          />
        </Row>
      </Section>

      {/* Effects */}
      <Section title="Effects" icon={<Sparkles className="h-3 w-3" />} open={!!open.effects} onToggle={() => toggle('effects')}>
        <Row label="Shadow quality">
          <Select
            label="Shadow quality"
            value={video.shadowQuality}
            options={['Off', 'Low', 'Medium', 'High', 'Ultra'] as const}
            onChange={(v) => updateVideo({ shadowQuality: v })}
          />
        </Row>
        <Row label="Shadow distance">
          <Slider
            value={video.shadowDistance}
            min={15}
            max={150}
            step={5}
            onChange={(v) => updateVideo({ shadowDistance: v })}
            format={(v) => `${v}m`}
          />
        </Row>
        <Row label="Texture quality">
          <Select
            label="Texture quality"
            value={video.textureQuality}
            options={QUALITY_TIERS}
            onChange={(v) => updateVideo({ textureQuality: v })}
          />
        </Row>
        <Row label="Effects quality">
          <Select
            label="Effects quality"
            value={video.effectsQuality}
            options={QUALITY_TIERS}
            onChange={(v) => updateVideo({ effectsQuality: v })}
          />
        </Row>
        <Row label="Post processing">
          <Toggle
            checked={video.postProcessing}
            onChange={(v) => updateVideo({ postProcessing: v })}
            label="Post processing"
          />
        </Row>
        <Row label="Bloom">
          <Toggle checked={video.bloom} onChange={(v) => updateVideo({ bloom: v })} label="Bloom" />
        </Row>
        <Row label="Motion blur">
          <Toggle checked={video.motionBlur} onChange={(v) => updateVideo({ motionBlur: v })} label="Motion blur" />
        </Row>
        <Row label="Depth of field">
          <Toggle checked={video.depthOfField} onChange={(v) => updateVideo({ depthOfField: v })} label="Depth of field" />
        </Row>
        <Row label="Sharpening">
          <Slider
            value={video.sharpening}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => updateVideo({ sharpening: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>
        <Row label="Particles" hint="Particle budget for impacts, smoke and fire.">
          <Slider
            value={video.particleLimit}
            min={0}
            max={400}
            step={10}
            onChange={(v) => updateVideo({ particleLimit: v })}
          />
        </Row>
        <Row label="View distance" hint="How far opponents are simulated and rendered.">
          <Select
            label="View distance"
            value={String(video.playerVisibilityDistance)}
            options={['50', '100', '150', '200', '300', '500', 'Unlimited'] as const}
            onChange={(v) =>
              updateVideo({ playerVisibilityDistance: v === 'Unlimited' ? 'Unlimited' : (Number(v) as 50) })
            }
          />
        </Row>
      </Section>

      {/* Advanced */}
      <Section
        title="Advanced & diagnostics"
        icon={<Gauge className="h-3 w-3" />}
        open={!!open.advanced}
        onToggle={() => toggle('advanced')}
      >
        <Row label="Anisotropic filtering">
          <Select
            label="Anisotropic filtering"
            value={String(video.anisotropicFiltering)}
            options={['1', '2', '4', '8', '16'] as const}
            onChange={(v) => updateVideo({ anisotropicFiltering: Number(v) as 1 })}
          />
        </Row>
        <Row label="Ambient effects" hint="Fog, volumetrics and reflections.">
          <Select
            label="Ambient effects"
            value={video.reflections}
            options={['Off', 'Low', 'High'] as const}
            onChange={(v) => updateVideo({ reflections: v })}
          />
        </Row>
        <Row label="Telemetry">
          <Select
            label="Telemetry"
            value={video.telemetryMode}
            options={['OFF', 'MINIMAL', 'FULL'] as const}
            onChange={(v) => updateVideo({ telemetryMode: v })}
          />
        </Row>

        <div className="mt-3 rounded border border-tac-border bg-tac-panel2 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Graphics test</div>
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="flex items-center gap-1.5 rounded border border-cyan-700 bg-cyan-950/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-900/50 disabled:opacity-50"
          >
            <Zap className="h-3 w-3" />
            {testing ? 'Measuring…' : 'Run graphics test'}
          </button>

          {test && (
            <div className="mt-3 space-y-1 font-mono text-[10px]">
              {test.ok ? (
                <>
                  <Line k="Renderer" v={test.renderer} />
                  <Line k="GPU" v={test.gpu} />
                  <Line k="Average FPS" v={String(test.averageFps)} />
                  <Line k="1% low FPS" v={String(test.onePercentLowFps)} />
                  <Line k="Frame time" v={`${test.frameTimeMs} ms`} />
                  <Line k="Frames rendered" v={`${test.framesRendered} in ${test.durationMs} ms`} />
                  <Line k="Test resolution" v={`${test.canvasSize[0]}x${test.canvasSize[1]}`} />
                  <Line k="GPU tier" v={test.gpuClass} />
                  <Line k="Recommended preset" v={test.recommendedPreset} highlight />
                </>
              ) : (
                <>
                  <div className="text-red-300">Test could not run</div>
                  <div className="text-slate-400">{test.error}</div>
                  <Line k="Recommended preset" v={test.recommendedPreset} highlight />
                </>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
};

const Line = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => (
  <div className="flex justify-between gap-3">
    <span className="text-slate-500">{k}</span>
    <span className={`truncate text-right ${highlight ? 'text-amber-300' : 'text-slate-300'}`} title={v}>
      {v}
    </span>
  </div>
);

const Section = ({
  title,
  icon,
  open,
  onToggle,
  children
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="mb-2 rounded border border-tac-border/70">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition hover:text-cyan-300"
    >
      {icon}
      {title}
      <span className="ml-auto">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
    </button>
    {open && <div className="border-t border-tac-border/50 px-3 pb-1">{children}</div>}
  </div>
);
