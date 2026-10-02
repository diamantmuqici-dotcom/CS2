/**
 * Developer diagnostics overlay, enabled with `?debug=1`.
 *
 * Off by default. Shows live frame data, the renderer in use, canvas state,
 * boot timing and any WebGL/console errors collected since load. Everything is
 * read from the local machine; nothing is sent anywhere.
 */

import React, { useEffect, useRef, useState } from 'react';
import { rendererManager } from '../../game/rendering/renderer-manager';
import { performanceManager } from '../../game/core/performanceManager';
import { bootDiagnostics, type BootReport } from '../../game/core/bootDiagnostics';
import { getDeployBase } from '../../shared/runtime';

interface ErrorEntry {
  time: string;
  kind: 'console' | 'webgl' | 'exception';
  message: string;
}

/** True when the page was opened with ?debug=1 (or ?debug=true). */
export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const flag = new URLSearchParams(window.location.search).get('debug');
    return flag === '1' || flag === 'true';
  } catch {
    return false;
  }
}

export const DebugOverlay: React.FC = () => {
  const [telemetry, setTelemetry] = useState(performanceManager.getTelemetry());
  const [report, setReport] = useState<BootReport>(bootDiagnostics.getReport());
  const [canvas, setCanvas] = useState({ width: 0, height: 0, ratio: 0 });
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [visible, setVisible] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const unsub = performanceManager.onTelemetry(setTelemetry);
    const unsubBoot = bootDiagnostics.subscribe(setReport);

    // Capture uncaught errors for the overlay only. Nothing is suppressed —
    // the original handlers still run and the console still receives them.
    const onError = (e: ErrorEvent) => {
      setErrors((prev) =>
        [
          ...prev.slice(-19),
          {
            time: new Date().toLocaleTimeString(),
            kind: 'exception' as const,
            message: e.message || String(e.error ?? 'unknown error')
          }
        ]
      );
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      setErrors((prev) =>
        [
          ...prev.slice(-19),
          {
            time: new Date().toLocaleTimeString(),
            kind: 'exception' as const,
            message: `Unhandled rejection: ${String(e.reason?.message ?? e.reason)}`
          }
        ]
      );
    };
    const onConsole = (e: Event) => {
      const type = (e as { type?: string }).type;
      if (type !== 'error' && type !== 'warning') return;
      // Ignore the noisy React devtools nag and our own capability warnings.
      const text = type === 'error' ? 'error' : 'warn';
      setErrors((prev) => [
        ...prev.slice(-19),
        { time: new Date().toLocaleTimeString(), kind: 'console', message: `${text}: ${(e as { message?: string }).message ?? ''}` }
      ]);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('console', onConsole);

    const timer = window.setInterval(() => {
      const c = canvasRef.current ?? (document.querySelector('canvas') as HTMLCanvasElement | null);
      if (c) {
        setCanvas({
          width: c.width,
          height: c.height,
          ratio: c.height > 0 ? Number((c.width / c.height).toFixed(3)) : 0
        });
      }
    }, 500);

    return () => {
      unsub();
      unsubBoot();
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('console', onConsole);
      window.clearInterval(timer);
    };
  }, []);

  const selection = rendererManager.getSelection();
  const caps = selection.capabilities;

  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[9998] max-h-[70vh] w-[330px] select-none overflow-y-auto rounded border border-emerald-800/60 bg-black/85 font-mono text-[10px] leading-relaxed text-emerald-200 shadow-2xl backdrop-blur-sm">
      <div className="pointer-events-auto sticky top-0 flex items-center gap-2 border-b border-emerald-900/70 bg-black/90 px-2 py-1">
        <span className="font-bold uppercase tracking-widest text-emerald-400">Vanguard Debug</span>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="ml-auto rounded border border-emerald-800 px-1.5 py-0.5 text-[9px] text-emerald-300 hover:bg-emerald-950"
        >
          {visible ? 'hide' : 'show'}
        </button>
      </div>

      {visible && (
        <div className="px-2 py-1.5">
          <L k="FPS" v={telemetry.fps ? `${telemetry.fps} (1% low ${telemetry.onePercentLowFps})` : '—'} />
          <L k="Frame time" v={telemetry.frameTimeMs ? `${telemetry.frameTimeMs} ms` : '—'} />
          <L k="CPU time" v={telemetry.cpuTimeMs ? `${telemetry.cpuTimeMs} ms` : '—'} />
          <L k="Frames / capped" v={`${telemetry.frameCount} / ${telemetry.droppedFrames}`} />
          <L k="Pixel ratio" v={String(telemetry.pixelRatio)} />
          <L k="Dynamic scale" v={rendererManager.getDynamicScale().toFixed(2)} />
          <L k="Quality" v={rendererManager.getQuality()} />
          <L k="Renderer" v={selection.tier} />
          <L k="GPU" v={caps.gpu.renderer} />
          <L k="WebGL2 / WebGL1" v={`${caps.webgl2.ok ? 'yes' : 'no'} / ${caps.webgl1.ok ? 'yes' : 'no'}`} />
          <L k="Canvas" v={canvas.width ? `${canvas.width}x${canvas.height} (${canvas.ratio})` : 'none'} />
          <L k="DPR" v={String(caps.devicePixelRatio)} />
          <L k="Viewport" v={`${caps.viewport.width}x${caps.viewport.height}`} />
          <L k="Context lost" v={rendererManager.getContextState().lost ? 'YES' : 'no'} />
          <L k="Boot time" v={`${report.durationMs} ms`} />
          <L k="Deploy base" v={getDeployBase()} />
          <L k="Hidden skips" v={String(telemetry.skippedHidden)} />
          <L
            k="Heap"
            v={
              (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
                ? `${Math.round(
                    (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize /
                      (1024 * 1024)
                  )} MB`
                : 'not exposed'
            }
          />

          {report.stages.some((s) => s.status === 'failed') && (
            <div className="mt-1.5 border-t border-emerald-900/70 pt-1.5">
              {report.stages
                .filter((s) => s.status === 'failed')
                .map((s) => (
                  <div key={s.id} className="text-red-300">
                    ✗ {s.label}: {s.detail}
                  </div>
                ))}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-1.5 border-t border-emerald-900/70 pt-1.5">
              <div className="mb-0.5 text-[9px] uppercase tracking-widest text-amber-400">
                errors ({errors.length})
              </div>
              {errors.slice(-6).map((e, i) => (
                <div key={i} className="truncate text-amber-200/80" title={e.message}>
                  {e.time} {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const L = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-emerald-500/80">{k}</span>
    <span className="truncate text-right text-emerald-200" title={v}>
      {v}
    </span>
  </div>
);
