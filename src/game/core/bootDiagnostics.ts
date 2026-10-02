/**
 * Boot diagnostics.
 *
 * The original boot splash polled `#root` and, after a timeout, printed
 * "Failed to start. This application requires a modern browser with WebGL2…".
 * That message was both unattributable and frequently wrong: the actual cause
 * on the live deployment was a 404 on the module bootstrap, not a GPU problem.
 *
 * This module records each boot stage independently so the failure screen can
 * name the exact subsystem, and so the in-app diagnostics panel shows the same
 * data the error screen used.
 *
 * The recorder is also mirrored onto `window.__vanguardBoot` before the app
 * bundle executes, so the static `index.html` fallback can report precisely
 * what it managed to observe even if the module graph never loads at all.
 */

import {
  detectBrowserCapabilities,
  type BrowserCapabilities,
  type RendererTier
} from '../rendering/browser-capabilities';

export type BootStageId =
  | 'RUNTIME'
  | 'ENVIRONMENT'
  | 'MODULES'
  | 'RENDERER'
  | 'GPU'
  | 'SHADERS'
  | 'ASSETS'
  | 'APPLICATION';

export type StageStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

export interface BootStage {
  id: BootStageId;
  label: string;
  status: StageStatus;
  detail: string;
  durationMs: number;
}

export interface BootReport {
  startedAt: number;
  finishedAt: number | null;
  durationMs: number;
  stages: BootStage[];
  capabilities: BrowserCapabilities | null;
  rendererTier: RendererTier;
  /** Non-fatal issues worth showing next to the result. */
  warnings: string[];
  failures: string[];
  ready: boolean;
}

const STAGE_LABELS: Record<BootStageId, string> = {
  RUNTIME: 'Browser runtime',
  ENVIRONMENT: 'Environment',
  MODULES: 'JavaScript modules',
  RENDERER: 'Renderer',
  GPU: 'GPU / graphics context',
  SHADERS: 'Shaders',
  ASSETS: 'Assets',
  APPLICATION: 'Application'
};

const STAGE_ORDER: BootStageId[] = [
  'RUNTIME',
  'ENVIRONMENT',
  'MODULES',
  'RENDERER',
  'GPU',
  'SHADERS',
  'ASSETS',
  'APPLICATION'
];

class BootDiagnostics {
  private startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  private finishedAt: number | null = null;
  private stages = new Map<BootStageId, BootStage>();
  private stageStartedAt = new Map<BootStageId, number>();
  private caps: BrowserCapabilities | null = null;
  private listeners = new Set<(report: BootReport) => void>();

  constructor() {
    for (const id of STAGE_ORDER) {
      this.stages.set(id, {
        id,
        label: STAGE_LABELS[id],
        status: 'pending',
        detail: '',
        durationMs: 0
      });
    }
    this.publish();
  }

  private stamp(): number {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  }

  begin(id: BootStageId): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    stage.status = 'running';
    stage.detail = '';
    this.stageStartedAt.set(id, this.stamp());
    this.publish();
  }

  pass(id: BootStageId, detail = ''): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    stage.status = 'ok';
    stage.detail = detail;
    stage.durationMs = Number((this.stamp() - (this.stageStartedAt.get(id) ?? this.stamp())).toFixed(2));
    this.publish();
  }

  fail(id: BootStageId, detail: string): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    stage.status = 'failed';
    stage.detail = detail;
    stage.durationMs = Number((this.stamp() - (this.stageStartedAt.get(id) ?? this.stamp())).toFixed(2));
    this.publish();
  }

  skip(id: BootStageId, detail: string): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    stage.status = 'skipped';
    stage.detail = detail;
    this.publish();
  }

  setCapabilities(caps: BrowserCapabilities): void {
    this.caps = caps;
    this.publish();
  }

  /** Progress 0..1 across all stages, for the boot progress bar. */
  progress(): number {
    const list = STAGE_ORDER.map((id) => this.stages.get(id)!.status);
    const done = list.filter((s) => s === 'ok' || s === 'skipped' || s === 'failed').length;
    return Math.min(1, done / list.length);
  }

  markReady(): void {
    this.finishedAt = this.stamp();
    this.publish();
  }

  subscribe(listener: (report: BootReport) => void): () => void {
    this.listeners.add(listener);
    listener(this.getReport());
    return () => this.listeners.delete(listener);
  }

  getReport(): BootReport {
    const stages = STAGE_ORDER.map((id) => ({ ...this.stages.get(id)! }));
    const failures = stages
      .filter((s) => s.status === 'failed')
      .map((s) => `${s.label}: ${s.detail || 'failed with no reason recorded'}`);
    const warnings = this.caps?.warnings ?? [];
    const end = this.finishedAt ?? this.stamp();

    return {
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: Number((end - this.startedAt).toFixed(2)),
      stages,
      capabilities: this.caps,
      rendererTier: this.caps?.rendererTier ?? 'none',
      warnings,
      failures,
      ready: this.finishedAt !== null && failures.length === 0
    };
  }

  private publish(): void {
    const report = this.getReport();
    for (const listener of this.listeners) {
      try {
        listener(report);
      } catch {
        // A misbehaving listener must not break the boot sequence.
      }
    }
    // Mirror onto `window` so the static HTML shell in index.html and the
    // browser devtools both read the same report. `window` is written
    // explicitly (rather than relying on globalThis === window) so the
    // contract holds under any embedding.
    const target = typeof window !== 'undefined' ? window : (globalThis as unknown as Record<string, unknown>);
    try {
      (target as { __vanguardBoot?: BootReport }).__vanguardBoot = report;
    } catch {
      // A locked-down global object must not break the boot sequence.
    }
  }
}

export const bootDiagnostics = new BootDiagnostics();

/**
 * Runs every probe the app needs before it can start, and records the outcome
 * against the matching boot stage. Never throws.
 */
export function runCapabilityProbes(): BrowserCapabilities {
  bootDiagnostics.begin('RUNTIME');
  const hasWindow = typeof window !== 'undefined';
  bootDiagnostics[hasWindow ? 'pass' : 'fail'](
    'RUNTIME',
    hasWindow ? `${navigator.userAgent.slice(0, 60)}…` : 'No window object — not a browser context.'
  );

  bootDiagnostics.begin('ENVIRONMENT');
  let caps: BrowserCapabilities;
  try {
    caps = detectBrowserCapabilities();
    bootDiagnostics.pass(
      'ENVIRONMENT',
      `${caps.browserName} ${caps.browserVersion} · ${caps.osName} · ${caps.hardwareConcurrency} cores`
    );
  } catch (err) {
    // Detection itself must never be the reason the app fails to boot.
    caps = {
      javascript: { ok: hasWindow, durationMs: 0 },
      esModules: { ok: false, durationMs: 0 },
      dynamicImport: { ok: false, durationMs: 0 },
      dom: { ok: hasWindow, durationMs: 0 },
      canvas: { ok: false, durationMs: 0 },
      canvas2d: { ok: false, durationMs: 0 },
      webgl1: emptyProfile('Capability detection threw before WebGL1 could be probed.'),
      webgl2: emptyProfile('Capability detection threw before WebGL2 could be probed.'),
      gpu: { vendor: 'Unknown', renderer: 'Unknown', unmasked: false, class: 'unknown' },
      devicePixelRatio: 1,
      screen: { width: 0, height: 0, colorDepth: 24 },
      viewport: { width: 0, height: 0 },
      isMobile: false,
      isTouch: false,
      prefersReducedMotion: false,
      prefersDark: true,
      prefersHighContrast: false,
      hardwareConcurrency: 1,
      deviceMemoryGb: null,
      browserName: 'Unknown',
      browserVersion: '—',
      osName: 'Unknown',
      userAgent: hasWindow ? navigator.userAgent : '',
      language: 'unknown',
      online: false,
      cookieEnabled: false,
      localStorageAvailable: false,
      indexedDbAvailable: false,
      webWorkers: false,
      webAssembly: false,
      sharedArrayBuffer: false,
      webSocket: false,
      webRtc: false,
      gamepad: false,
      pointerLock: false,
      unadjustedMovement: false,
      audioContext: false,
      webGpu: false,
      webGpuReason: 'Capability detection failed.',
      rendererTier: 'none',
      canRender3D: false,
      canRenderAnything: false,
      recommendedQuality: 'Low',
      maxPixelRatio: 1,
      warnings: [
        `Capability detection raised: ${err instanceof Error ? err.message : String(err)}. Rendering fell back to the safest mode.`
      ],
      detectionMs: 0
    };
    bootDiagnostics.fail('ENVIRONMENT', `Capability detection failed: ${String(err)}`);
  }
  bootDiagnostics.setCapabilities(caps);

  bootDiagnostics.begin('MODULES');
  // This function is itself executing from inside an ES module, so module
  // support is proven by the fact that we are running — regardless of what the
  // static feature test reports. jsdom and some embedded webviews do not
  // implement the `noModule` IDL attribute, which made the static check report
  // a false negative and mark a working boot as failed.
  if (caps.javascript.ok) {
    bootDiagnostics.pass(
      'MODULES',
      caps.esModules.ok
        ? 'ES module graph executed; code splitting available.'
        : 'ES module graph executed (verified at runtime; the static noModule probe is unsupported here).'
    );
  } else {
    bootDiagnostics.fail('MODULES', caps.esModules.reason ?? 'JavaScript is unavailable.');
  }

  bootDiagnostics.begin('RENDERER');
  // Every tier of the hierarchy is a *working* renderer, including the
  // DOM-only level, so this stage only fails when the application genuinely
  // cannot present anything at all. Losing WebGL2 degrades quality; it does
  // not break the product, and marking it failed would incorrectly raise the
  // initialization-failure screen on a machine that can still play.
  if (caps.webgl2.ok) {
    bootDiagnostics.pass('RENDERER', 'WebGL2 selected (GLSL ES 3.00).');
  } else if (caps.webgl1.ok) {
    bootDiagnostics.pass(
      'RENDERER',
      `WebGL2 unavailable (${caps.webgl2.reason ?? 'no context'}) — selected WebGL1 compatibility renderer (GLSL ES 1.00).`
    );
  } else if (caps.canvas2d.ok) {
    bootDiagnostics.pass('RENDERER', 'No WebGL context — selected 2D canvas compatibility renderer.');
  } else {
    bootDiagnostics.pass(
      'RENDERER',
      `No WebGL or 2D canvas context is available. Running in interface-only mode: the launcher, settings, workshop and map editor remain fully usable. WebGL2: ${
        caps.webgl2.reason ?? 'unavailable'
      }.`
    );
    bootDiagnostics.setCapabilities(caps);
  }

  bootDiagnostics.begin('GPU');
  if (caps.gpu.class === 'software') {
    bootDiagnostics.pass(
      'GPU',
      `Software rasterizer detected (${caps.gpu.renderer}). Quality is capped to LOW.`
    );
  } else {
    bootDiagnostics.pass(
      'GPU',
      caps.gpu.unmasked
        ? `${caps.gpu.vendor} / ${caps.gpu.renderer} (${caps.gpu.class})`
        : `GPU name hidden by browser privacy (${caps.gpu.renderer}); classified as ${caps.gpu.class}.`
    );
  }

  bootDiagnostics.begin('ASSETS');
  bootDiagnostics.pass(
    'ASSETS',
    'All assets are generated procedurally at runtime — there are no network asset downloads.'
  );

  return caps;
}

function emptyProfile(reason: string) {
  return {
    version: null,
    ok: false,
    reason,
    maxTextureSize: 0,
    maxRenderbufferSize: 0,
    maxViewportDims: [0, 0] as [number, number],
    maxVertexAttribs: 0,
    maxSamples: 0,
    maxAnisotropy: 1,
    maxCombinedTextureUnits: 0,
    colorBufferFloat: false,
    colorBufferHalfFloat: false,
    depthTexture: false,
    derivatives: false,
    instancing: false,
    vertexArrayObjects: false,
    anisotropicFiltering: false,
    srgbFramebuffer: false,
    extensions: [] as string[],
    glslVersion: '',
    lost: false,
    contextLostReason: null,
    gpu: { vendor: 'Unknown', renderer: 'Unknown', unmasked: false, class: 'unknown' as const },
    durationMs: 0
  };
}
