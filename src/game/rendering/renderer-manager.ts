/**
 * Renderer selection and lifetime.
 *
 * All GPU/browser detection is centralised here. The rest of the application
 * asks the manager which renderer it got and never probes WebGL itself, so
 * there is exactly one place where a fallback decision is made.
 *
 * Hierarchy (first available wins):
 *   1. WebGL2   — the full three.js 3D engine.
 *   2. WebGL1   — three.js r16x+ is WebGL2-only, so this is served by the
 *                 2D tactical renderer running on an accelerated canvas.
 *   3. Canvas2D — the same tactical renderer, software-rasterised.
 *   4. DOM      — the launcher only; there is no rendering surface at all.
 *
 * The manager also owns device pixel ratio, resize, quality tier and the
 * `webglcontextlost` / `webglcontextrestored` lifecycle.
 */

import {
  detectBrowserCapabilities,
  type BrowserCapabilities,
  type QualityTier,
  type RendererTier
} from './browser-capabilities';

export interface RendererSelection {
  tier: RendererTier;
  /** 3D engine available (three.js). */
  supports3D: boolean;
  /** A 2D canvas surface is available. */
  supportsCanvas2D: boolean;
  /** Nothing renders pixels; the DOM interface is all there is. */
  domOnly: boolean;
  capabilities: BrowserCapabilities;
  /** Human-readable explanation of why this tier was chosen. */
  rationale: string;
  /** Earlier tiers that were tried and rejected, with the reason. */
  rejected: Array<{ tier: RendererTier; reason: string }>;
}

export interface ContextLossState {
  lost: boolean;
  lostAt: number | null;
  recoveredAt: number | null;
  count: number;
  reason: string | null;
}

type ContextListener = (state: ContextLossState) => void;

const QUALITY_DPR_CAP: Record<QualityTier, number> = {
  Low: 1,
  Medium: 1.25,
  High: 1.5,
  Ultra: 2
};

export class RendererManager {
  private selection: RendererSelection | null = null;
  private listeners = new Set<ContextListener>();
  private detach: Array<() => void> = [];

  private quality: QualityTier = 'Medium';
  private renderScale = 1;
  private dynamicResolution = false;
  private dynamicScale = 1;
  private maxPixelRatio = 1.5;

  private state: ContextLossState = {
    lost: false,
    lostAt: null,
    recoveredAt: null,
    count: 0,
    reason: null
  };

  private lastFrameMs = 16.7;
  private frameAccumMs = 0;
  private frameCount = 0;

  /** Chooses the best renderer this device can actually drive. Never throws. */
  select(): RendererSelection {
    if (this.selection) return this.selection;

    const capabilities = detectBrowserCapabilities();
    const rejected: Array<{ tier: RendererTier; reason: string }> = [];

    let tier: RendererTier = 'none';
    let rationale = '';

    if (capabilities.webgl2.ok) {
      tier = 'webgl2';
      rationale = `WebGL2 context created (${capabilities.webgl2.gpu.renderer}, ${capabilities.webgl2.glslVersion}).`;
    } else {
      rejected.push({ tier: 'webgl2', reason: capabilities.webgl2.reason ?? 'No WebGL2 context.' });
      if (capabilities.webgl1.ok) {
        tier = 'webgl1';
        rationale = `WebGL2 unavailable — ${capabilities.webgl2.reason ?? 'no context'}. WebGL1 context created (${
          capabilities.webgl1.glslVersion
        }); the three.js engine is WebGL2-only, so the tactical 2D compatibility renderer is used instead.`;
      } else {
        rejected.push({ tier: 'webgl1', reason: capabilities.webgl1.reason ?? 'No WebGL1 context.' });
        if (capabilities.canvas2d.ok) {
          tier = 'canvas2d';
          rationale = `No WebGL context available — ${capabilities.webgl1.reason ?? 'none'}. Running the tactical 2D compatibility renderer on a 2D canvas.`;
        } else {
          rejected.push({ tier: 'canvas2d', reason: capabilities.canvas2d.reason ?? 'No 2D canvas.' });
          tier = 'none';
          rationale = 'No rendering context of any kind could be created. Running in interface-only mode.';
        }
      }
    }

    this.quality = capabilities.recommendedQuality;
    this.maxPixelRatio = Math.min(capabilities.maxPixelRatio, QUALITY_DPR_CAP[capabilities.recommendedQuality]);

    this.selection = {
      tier,
      supports3D: tier === 'webgl2',
      supportsCanvas2D: capabilities.canvas2d.ok,
      domOnly: tier === 'none',
      capabilities,
      rationale,
      rejected
    };
    return this.selection;
  }

  getSelection(): RendererSelection {
    return this.select();
  }

  /**
   * Binds context-loss handling to a canvas. Safe to call for non-WebGL tiers,
   * where the events simply never fire.
   */
  attachContextWatch(canvas: HTMLCanvasElement): () => void {
    this.detach.forEach((fn) => fn());
    this.detach = [];

    const onLost = (event: Event) => {
      // Without preventDefault() the browser will never fire `restored`.
      event.preventDefault();
      this.state = {
        lost: true,
        lostAt: performance.now(),
        recoveredAt: null,
        count: this.state.count + 1,
        reason: 'The graphics driver reset the WebGL context (GPU timeout, driver crash, or a tab switch on a low-memory device).'
      };
      this.emit();
    };

    const onRestored = () => {
      this.state = { ...this.state, lost: false, recoveredAt: performance.now(), reason: null };
      // The drawing buffer is reallocated by the browser, so the cached pixel
      // ratio must be reapplied.
      this.applyPixelRatio(canvas);
      this.emit();
    };

    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    this.detach.push(() => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    });

    return () => this.detach.forEach((fn) => fn());
  }

  onContextChange(listener: ContextListener): () => void {
    this.listeners.add(listener);
    try {
      // Deliver the current state immediately so a subscriber never has to
      // wait for the first loss to learn whether it is already lost.
      listener(this.state);
    } catch {
      // A subscriber that throws must not break registration.
    }
    return () => this.listeners.delete(listener);
  }

  getContextState(): ContextLossState {
    return { ...this.state };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Listener errors must not break the render loop.
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* Quality + resolution                                                   */
  /* --------------------------------------------------------------------- */

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    this.maxPixelRatio = Math.min(
      this.getSelection().capabilities.maxPixelRatio,
      QUALITY_DPR_CAP[quality]
    );
  }

  getQuality(): QualityTier {
    return this.quality;
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(2, scale));
  }

  getRenderScale(): number {
    return this.renderScale;
  }

  setDynamicResolution(enabled: boolean): void {
    this.dynamicResolution = enabled;
    if (!enabled) this.dynamicScale = 1;
  }

  isDynamicResolution(): boolean {
    return this.dynamicResolution;
  }

  /**
   * Feeds frame timing in and returns the pixel ratio the canvas should use.
   *
   * With dynamic resolution on, the internal buffer is scaled between 0.6x and
   * 1.0x to hold the frame-time target. The scale moves in small steps and
   * only after a full measurement window, so it never visibly pulses.
   */
  updateAdaptiveScale(frameDeltaMs: number): number {
    this.lastFrameMs = this.lastFrameMs * 0.9 + Math.min(500, frameDeltaMs) * 0.1;

    if (!this.dynamicResolution) return this.resolvePixelRatio();

    this.frameAccumMs += frameDeltaMs;
    this.frameCount++;
    if (this.frameCount < 30) return this.resolvePixelRatio();

    const avg = this.frameAccumMs / this.frameCount;
    this.frameAccumMs = 0;
    this.frameCount = 0;

    if (avg > 22 && this.dynamicScale > 0.6) this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.05);
    else if (avg < 13 && this.dynamicScale < 1) this.dynamicScale = Math.min(1, this.dynamicScale + 0.025);

    return this.resolvePixelRatio();
  }

  getDynamicScale(): number {
    return this.dynamicScale;
  }

  private resolvePixelRatio(): number {
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.max(0.5, Math.min(deviceDpr, this.maxPixelRatio) * this.renderScale * this.dynamicScale);
  }

  /** Applies the current ratio to a canvas, capped by the GPU's max texture size. */
  applyPixelRatio(canvas: HTMLCanvasElement, cssWidth?: number, cssHeight?: number): number {
    const caps = this.getSelection().capabilities;
    const maxTexture = caps.webgl2.ok
      ? caps.webgl2.maxTextureSize
      : caps.webgl1.ok
        ? caps.webgl1.maxTextureSize
        : 8192;
    const limit = maxTexture > 0 ? maxTexture : 8192;

    const w = Math.max(1, Math.round(cssWidth ?? canvas.clientWidth ?? window.innerWidth));
    const h = Math.max(1, Math.round(cssHeight ?? canvas.clientHeight ?? window.innerHeight));
    const ratio = Math.min(this.resolvePixelRatio(), limit / Math.max(w, h));

    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));

    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    return ratio;
  }

  /** True when the tab is hidden — the caller should stop rendering entirely. */
  isHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /** Mean smoothed frame time in milliseconds. */
  getFrameTimeMs(): number {
    return Number(this.lastFrameMs.toFixed(2));
  }
}

/** Process-wide manager. */
export const rendererManager = new RendererManager();
