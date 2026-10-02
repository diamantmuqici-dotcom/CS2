/**
 * Performance and frame pacing.
 *
 * Owns the frame loop's *policy* (when to render, at what pixel ratio, with
 * what quality) so the game engine and the UI do not each implement their own
 * version. The engine still owns the simulation; this class decides whether a
 * given animation frame should be presented.
 *
 * Responsibilities:
 *  - dynamic resolution scaling against a frame-time target
 *  - FPS limiting / frame pacing with a stable present interval
 *  - render throttling while the tab is hidden or the window is occluded
 *  - visibility + resize handling with debounce
 *  - real telemetry (no placeholder numbers)
 */

import { rendererManager } from '../rendering/renderer-manager';
import type { QualityTier } from '../rendering/browser-capabilities';

export interface FramePolicy {
  /** Target present interval in ms. 0 = uncapped. */
  targetFrameMs: number;
  /** Frame-time the dynamic resolution controller aims for. */
  targetFrameTimeMs: number;
  quality: QualityTier;
  dynamicResolution: boolean;
  renderScale: number;
  vsync: boolean;
}

export interface LiveTelemetry {
  fps: number;
  frameTimeMs: number;
  cpuTimeMs: number;
  onePercentLowFps: number;
  frameCount: number;
  droppedFrames: number;
  pixelRatio: number;
  skippedHidden: number;
}

/**
 * Picks a starting preset from measured capabilities.
 * Used for the launcher's "recommended" badge; the user can always override.
 */
export function recommendPreset(tier: QualityTier, isSoftware: boolean): 'LOW_END_PC' | 'COMPETITIVE' | 'BALANCED' | 'QUALITY' | 'ULTRA' {
  if (isSoftware) return 'LOW_END_PC';
  switch (tier) {
    case 'Low':
      return 'LOW_END_PC';
    case 'Medium':
      return 'COMPETITIVE';
    case 'High':
      return 'QUALITY';
    case 'Ultra':
      return 'ULTRA';
    default:
      return 'BALANCED';
  }
}

export class PerformanceManager {
  private lastPresent = 0;
  private started = false;
  private frameTimes: number[] = [];
  private maxSamples = 240;
  private smoothedFrameMs = 16.7;
  private lastCpuMs = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private skippedHidden = 0;
  private pixelRatio = 1;

  private detachVisibility: (() => void) | null = null;
  private listeners = new Set<(t: LiveTelemetry) => void>();
  private listenerAccumulator = 0;

  private policy: FramePolicy = {
    targetFrameMs: 0,
    targetFrameTimeMs: 16.7,
    quality: 'Medium',
    dynamicResolution: true,
    renderScale: 1,
    vsync: true
  };

  applyPolicy(policy: Partial<FramePolicy>): void {
    this.policy = { ...this.policy, ...policy };
    rendererManager.setQuality(this.policy.quality);
    rendererManager.setRenderScale(this.policy.renderScale);
    rendererManager.setDynamicResolution(this.policy.dynamicResolution);
  }

  getPolicy(): FramePolicy {
    return { ...this.policy };
  }

  /**
   * Decides whether this frame should be rendered.
   *
   * Returns false when the tab is hidden (saving battery and GPU) or when the
   * frame-rate cap has not elapsed yet. Skipped frames are counted, not
   * silently dropped, so telemetry stays honest.
   */
  shouldRender(now: number): boolean {
    if (rendererManager.isHidden()) {
      this.skippedHidden++;
      this.lastPresent = now;
      return false;
    }

    if (this.policy.targetFrameMs > 0) {
      const elapsed = now - this.lastPresent;
      if (this.lastPresent !== 0 && elapsed < this.policy.targetFrameMs) {
        // Allow a small tolerance so the cap does not quantise badly at high rates.
        if (elapsed < this.policy.targetFrameMs - 0.6) {
          this.droppedFrames++;
          return false;
        }
      }
    }

    this.lastPresent = now;
    return true;
  }

  /** Records a presented frame and returns the pixel ratio to render at. */
  recordFrame(frameDeltaMs: number, cpuTimeMs: number): number {
    // Clamp so a stall (tab switch, GC pause) does not poison the average.
    const clamped = Math.max(0.5, Math.min(500, frameDeltaMs));
    this.smoothedFrameMs = this.smoothedFrameMs * 0.9 + clamped * 0.1;
    this.lastCpuMs = cpuTimeMs;
    this.frameCount++;

    this.frameTimes.push(clamped);
    if (this.frameTimes.length > this.maxSamples) this.frameTimes.shift();

    this.pixelRatio = rendererManager.updateAdaptiveScale(clamped);

    this.listenerAccumulator += clamped;
    if (this.listenerAccumulator > 250) {
      this.listenerAccumulator = 0;
      const snapshot = this.getTelemetry();
      for (const listener of this.listeners) {
        try {
          listener(snapshot);
        } catch {
          // A subscriber must not be able to break the frame loop.
        }
      }
    }

    return this.pixelRatio;
  }

  onTelemetry(listener: (t: LiveTelemetry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Real telemetry. With no recorded frames the values are 0 / null rather
   * than invented "144 FPS" placeholders.
   */
  getTelemetry(): LiveTelemetry {
    if (this.frameTimes.length === 0) {
      return {
        fps: 0,
        frameTimeMs: 0,
        cpuTimeMs: 0,
        onePercentLowFps: 0,
        frameCount: 0,
        droppedFrames: this.droppedFrames,
        pixelRatio: this.pixelRatio,
        skippedHidden: this.skippedHidden
      };
    }

    const recent = this.frameTimes.slice(-60);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const onePctCount = Math.max(1, Math.ceil(sorted.length * 0.01));
    const slowestOnePctAvg = sorted.slice(0, onePctCount).reduce((a, b) => a + b, 0) / onePctCount;

    return {
      fps: Math.round(1000 / Math.max(0.5, avg)),
      frameTimeMs: Number(avg.toFixed(2)),
      cpuTimeMs: Number(this.lastCpuMs.toFixed(2)),
      onePercentLowFps: Math.round(1000 / Math.max(1, slowestOnePctAvg)),
      frameCount: this.frameCount,
      droppedFrames: this.droppedFrames,
      pixelRatio: Number(this.pixelRatio.toFixed(2)),
      skippedHidden: this.skippedHidden
    };
  }

  /** Resets the frame history, e.g. after a map change or a context restore. */
  reset(): void {
    this.frameTimes = [];
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.skippedHidden = 0;
    this.smoothedFrameMs = 16.7;
  }

  /**
   * Stops the loop when the tab is hidden and forces one frame on return, so a
   * backgrounded tab does not accumulate a huge delta on the next frame.
   */
  handleVisibilityChange(): void {
    if (rendererManager.isHidden()) {
      this.reset();
    } else {
      this.lastPresent = 0;
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (typeof document !== 'undefined') {
      const handler = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', handler, false);
      this.detachVisibility = () => document.removeEventListener('visibilitychange', handler);
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.detachVisibility?.();
    this.detachVisibility = null;
  }
}

export const performanceManager = new PerformanceManager();

/**
 * Debounced resize handler. Returns the subscriber; the callback receives the
 * current CSS size. Window resizing fires continuously while dragging, so the
 * actual work is coalesced.
 */
export function onResizeDebounced(callback: (w: number, h: number) => void, delayMs = 90): () => void {
  if (typeof window === 'undefined') return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handler = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => callback(window.innerWidth, window.innerHeight), delayMs);
  };
  window.addEventListener('resize', handler, false);
  window.addEventListener('orientationchange', handler, false);
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener('resize', handler, false);
    window.removeEventListener('orientationchange', handler, false);
  };
}
