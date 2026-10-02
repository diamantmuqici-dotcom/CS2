/**
 * Backwards-compatible adapter over `browser-capabilities.ts`.
 *
 * The original implementation probed WebGL2 once and set `unsupportedReason`
 * to a message claiming WebGL2 was "required", which is what produced the
 * misleading "This application requires a modern browser with WebGL2" error
 * screen. The real detection now lives in `browser-capabilities.ts`, and
 * `unsupportedReason` is only populated when nothing can render at all.
 *
 * New code should import from `browser-capabilities` / `renderer-manager`
 * directly; this module exists so existing call sites keep working.
 */

import { detectBrowserCapabilities, clearCapabilityCache as clearBrowserCache } from './browser-capabilities';
import type { BrowserCapabilities } from './browser-capabilities';

export interface SurfaceCapabilities {
  webgl2: boolean;
  webgl1: boolean;
  webgpu: boolean;
  pointerLock: boolean;
  webWorkers: boolean;
  offscreenCanvas: boolean;
  gamepad: boolean;
  webSocket: boolean;
  audioContext: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
  rendererString: string;
  vendorString: string;
  isSoftwareRenderer: boolean;
  /** True only when no rendering surface exists at all. */
  canRenderAnything: boolean;
  /**
   * Non-null ONLY when the device cannot render by any route. Previously this
   * was set for any machine without WebGL2, which blocked the whole app on
   * hardware that could still run the 2D compatibility renderer.
   */
  unsupportedReason: string | null;
  /** Non-fatal notes; safe to show in a banner. */
  notices: string[];
  full: BrowserCapabilities;
}

let cached: SurfaceCapabilities | null = null;

export function detectSurfaceCapability(): SurfaceCapabilities {
  if (cached) return cached;

  const caps = detectBrowserCapabilities();

  cached = {
    webgl2: caps.webgl2.ok,
    webgl1: caps.webgl1.ok,
    webgpu: caps.webGpu,
    pointerLock: caps.pointerLock,
    webWorkers: caps.webWorkers,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    gamepad: caps.gamepad,
    webSocket: caps.webSocket,
    audioContext: caps.audioContext,
    maxTextureSize: caps.webgl2.maxTextureSize || caps.webgl1.maxTextureSize || 4096,
    maxAnisotropy: caps.webgl2.maxAnisotropy || caps.webgl1.maxAnisotropy || 1,
    rendererString: caps.gpu.renderer,
    vendorString: caps.gpu.vendor,
    isSoftwareRenderer: caps.gpu.class === 'software',
    canRenderAnything: caps.canRenderAnything,
    // Only a total absence of a rendering surface is genuinely unsupported.
    unsupportedReason: caps.canRenderAnything
      ? null
      : `No rendering surface is available. WebGL2: ${caps.webgl2.reason ?? 'unavailable'}. WebGL1: ${
          caps.webgl1.reason ?? 'unavailable'
        }. 2D canvas: ${caps.canvas2d.reason ?? 'unavailable'}.`,
    notices: caps.warnings,
    full: caps
  };

  return cached;
}

export function clearCapabilityCache(): void {
  cached = null;
  clearBrowserCache();
}
