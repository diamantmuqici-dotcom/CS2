/**
 * Diagnostics panel.
 *
 * Everything shown here is measured locally on the user's machine. Nothing is
 * uploaded, and no identifier, fingerprint or personal data leaves the page —
 * the panel is read-only and makes no network requests of its own.
 */

import React, { useEffect, useState } from 'react';
import { Stethoscope, Copy, Check } from 'lucide-react';
import { bootDiagnostics, type BootReport } from '../../game/core/bootDiagnostics';
import { rendererManager } from '../../game/rendering/renderer-manager';
import { performanceManager } from '../../game/core/performanceManager';
import { getDeployBase } from '../../shared/runtime';

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-tac-border/40 py-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{k}</span>
      <span
        className={`break-all text-right font-mono text-[10px] ${
          tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-red-300' : 'text-slate-300'
        }`}
      >
        {v}
      </span>
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-3">
    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-500/80">{title}</div>
    <div className="rounded border border-tac-border/60 bg-tac-panel2/50 px-3 py-1">{children}</div>
  </div>
);

export const DiagnosticsPanel: React.FC = () => {
  const [report, setReport] = useState<BootReport>(bootDiagnostics.getReport());
  const [telemetry, setTelemetry] = useState(performanceManager.getTelemetry());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubBoot = bootDiagnostics.subscribe(setReport);
    const unsubPerf = performanceManager.onTelemetry(setTelemetry);
    return () => {
      unsubBoot();
      unsubPerf();
    };
  }, []);

  const selection = rendererManager.getSelection();
  const caps = selection.capabilities;

  const copyReport = async () => {
    const text = [
      'Vanguard Protocol — local diagnostics',
      `URL: ${location.href}`,
      `Deploy base: ${getDeployBase()}`,
      `Renderer: ${selection.tier}`,
      `Rationale: ${selection.rationale}`,
      caps.webgl2.ok ? `WebGL2: OK (${caps.webgl2.gpu.renderer})` : `WebGL2: FAIL — ${caps.webgl2.reason}`,
      caps.webgl1.ok ? `WebGL1: OK (${caps.webgl1.gpu.renderer})` : `WebGL1: FAIL — ${caps.webgl1.reason}`,
      `GLSL: ${(caps.webgl2.ok ? caps.webgl2 : caps.webgl1).glslVersion || 'n/a'}`,
      `Max texture: ${(caps.webgl2.ok ? caps.webgl2 : caps.webgl1).maxTextureSize}`,
      `Extensions: ${(caps.webgl2.ok ? caps.webgl2 : caps.webgl1).extensions.length}`,
      `FPS: ${telemetry.fps}`,
      `Boot: ${report.durationMs}ms`,
      ...report.failures.map((f) => `FAILURE: ${f}`)
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be denied; the report is still visible on screen.
    }
  };

  return (
    <div className="rounded-lg border border-tac-border bg-tac-panel/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-cyan-400" />
        <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-white">Diagnostics</h3>
        <button
          type="button"
          onClick={copyReport}
          className="ml-auto flex items-center gap-1.5 rounded border border-tac-border bg-tac-panel2 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 transition hover:border-cyan-700 hover:text-cyan-300"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mb-3 rounded border border-tac-border/50 bg-tac-panel2/40 px-2.5 py-1.5 text-[9px] leading-relaxed text-slate-500">
        All values below are measured locally in your browser. Nothing is uploaded and no personal
        information is collected.
      </p>

      <Group title="Browser">
        <Row k="Browser" v={`${caps.browserName} ${caps.browserVersion}`} />
        <Row k="Operating system" v={caps.osName} />
        <Row k="Screen" v={`${caps.screen.width}x${caps.screen.height} @ ${caps.screen.colorDepth}-bit`} />
        <Row k="Viewport" v={`${caps.viewport.width}x${caps.viewport.height}`} />
        <Row k="Device pixel ratio" v={String(caps.devicePixelRatio)} />
        <Row k="Device" v={caps.isMobile ? 'Mobile / tablet' : caps.isTouch ? 'Touch-capable desktop' : 'Desktop'} />
        <Row k="CPU threads" v={String(caps.hardwareConcurrency)} />
        <Row
          k="Device memory"
          v={caps.deviceMemoryGb ? `${caps.deviceMemoryGb} GB` : 'not exposed'}
          tone={caps.deviceMemoryGb ? undefined : 'warn'}
        />
        <Row k="Language" v={caps.language} />
        <Row k="Online" v={caps.online ? 'Yes' : 'No'} tone={caps.online ? 'ok' : 'warn'} />
      </Group>

      <Group title="Graphics">
        <Row k="Renderer in use" v={selection.tier.toUpperCase()} tone="ok" />
        <Row k="Selection reason" v={selection.rationale} />
        <Row k="GPU" v={caps.gpu.renderer} tone={caps.gpu.unmasked ? undefined : 'warn'} />
        <Row k="GPU vendor" v={caps.gpu.vendor} />
        <Row k="GPU class" v={caps.gpu.class} tone={caps.gpu.class === 'software' ? 'warn' : undefined} />
        <Row
          k="WebGL2"
          v={caps.webgl2.ok ? 'Available' : caps.webgl2.reason || 'Unavailable'}
          tone={caps.webgl2.ok ? 'ok' : 'warn'}
        />
        <Row
          k="WebGL1"
          v={caps.webgl1.ok ? 'Available' : caps.webgl1.reason || 'Unavailable'}
          tone={caps.webgl1.ok ? 'ok' : 'warn'}
        />
        <Row k="GLSL version" v={(caps.webgl2.ok ? caps.webgl2 : caps.webgl1).glslVersion || 'n/a'} />
        <Row k="Max texture size" v={String((caps.webgl2.ok ? caps.webgl2 : caps.webgl1).maxTextureSize || 'n/a')} />
        <Row
          k="Max MSAA samples"
          v={caps.webgl2.maxSamples ? String(caps.webgl2.maxSamples) : 'not reported'}
        />
        <Row k="Max anisotropy" v={String((caps.webgl2.ok ? caps.webgl2 : caps.webgl1).maxAnisotropy)} />
        <Row k="WebGL extensions" v={String((caps.webgl2.ok ? caps.webgl2 : caps.webgl1).extensions.length)} />
        <Row k="WebGPU" v={caps.webGpu ? 'Available' : caps.webGpuReason || 'Unavailable'} />
        <Row k="Recommended quality" v={caps.recommendedQuality} />
      </Group>

      <Group title="Platform support">
        <Row k="JavaScript" v={caps.javascript.ok ? 'Yes' : 'No'} tone={caps.javascript.ok ? 'ok' : 'bad'} />
        <Row k="ES modules" v={caps.esModules.ok ? 'Yes' : 'No'} tone={caps.esModules.ok ? 'ok' : 'bad'} />
        <Row k="Dynamic import" v={caps.dynamicImport.ok ? 'Yes' : 'No'} tone={caps.dynamicImport.ok ? 'ok' : 'warn'} />
        <Row k="Canvas" v={caps.canvas.ok ? 'Yes' : 'No'} tone={caps.canvas.ok ? 'ok' : 'bad'} />
        <Row k="2D canvas" v={caps.canvas2d.ok ? 'Yes' : 'No'} tone={caps.canvas2d.ok ? 'ok' : 'warn'} />
        <Row k="Web Workers" v={caps.webWorkers ? 'Yes' : 'No'} />
        <Row k="WebAssembly" v={caps.webAssembly ? 'Yes' : 'No'} />
        <Row k="SharedArrayBuffer" v={caps.sharedArrayBuffer ? 'Yes' : 'No'} />
        <Row k="WebSocket" v={caps.webSocket ? 'Yes' : 'No'} />
        <Row k="WebRTC" v={caps.webRtc ? 'Yes' : 'No'} />
        <Row k="Pointer lock" v={caps.pointerLock ? 'Yes' : 'No'} tone={caps.pointerLock ? 'ok' : 'warn'} />
        <Row k="Raw mouse input" v={caps.unadjustedMovement ? 'Yes' : 'No'} />
        <Row k="AudioContext" v={caps.audioContext ? 'Yes' : 'No'} />
        <Row k="Gamepad API" v={caps.gamepad ? 'Yes' : 'No'} />
        <Row k="localStorage" v={caps.localStorageAvailable ? 'Yes' : 'Blocked'} tone={caps.localStorageAvailable ? 'ok' : 'warn'} />
        <Row k="IndexedDB" v={caps.indexedDbAvailable ? 'Yes' : 'No'} />
        <Row k="Reduced motion" v={caps.prefersReducedMotion ? 'Preferred' : 'No'} />
      </Group>

      <Group title="Runtime">
        <Row k="Deploy base" v={getDeployBase()} />
        <Row k="Boot time" v={`${report.durationMs} ms`} />
        <Row k="Detection time" v={`${caps.detectionMs} ms`} />
        <Row k="FPS" v={telemetry.fps ? String(telemetry.fps) : 'no frames yet'} tone={telemetry.fps ? 'ok' : undefined} />
        <Row k="Frame time" v={telemetry.frameTimeMs ? `${telemetry.frameTimeMs} ms` : '—'} />
        <Row k="1% low FPS" v={telemetry.onePercentLowFps ? String(telemetry.onePercentLowFps) : '—'} />
        <Row k="Pixel ratio" v={String(telemetry.pixelRatio)} />
        <Row k="Frames rendered" v={String(telemetry.frameCount)} />
        <Row k="Capped frames" v={String(telemetry.droppedFrames)} />
        <Row k="Hidden-tab skips" v={String(telemetry.skippedHidden)} />
        <Row
          k="JS heap"
          v={
            (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
              ? `${Math.round(
                  ((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize /
                    (1024 * 1024)) as number
                )} MB`
              : 'not exposed'
          }
          tone={
            (performance as unknown as { memory?: unknown }).memory ? undefined : 'warn'
          }
        />
      </Group>

      <Group title="Boot sequence">
        {report.stages.map((s) => (
          <Row
            key={s.id}
            k={s.label}
            v={`${s.status.toUpperCase()}${s.detail ? ` — ${s.detail}` : ''}`}
            tone={s.status === 'ok' || s.status === 'skipped' ? 'ok' : s.status === 'failed' ? 'bad' : undefined}
          />
        ))}
      </Group>

      {report.warnings.length > 0 && (
        <Group title="Notices">
          {report.warnings.map((w, i) => (
            <div key={i} className="border-b border-tac-border/40 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
              {w}
            </div>
          ))}
        </Group>
      )}

      {selection.rejected.length > 0 && (
        <Group title="Rejected renderers">
          {selection.rejected.map((r) => (
            <Row key={r.tier} k={r.tier} v={r.reason} tone="warn" />
          ))}
        </Group>
      )}
    </div>
  );
};
