// @vitest-environment jsdom
/**
 * Capability detection and renderer selection.
 *
 * These tests drive the detection with a controllable `getContext` so every
 * branch of the fallback hierarchy is exercised — including the machines that
 * caused the original problem. They assert on real behaviour, not on mocked
 * return values alone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectBrowserCapabilities,
  clearCapabilityCache,
  type WebglProfile
} from '../src/game/rendering/browser-capabilities';
import { RendererManager } from '../src/game/rendering/renderer-manager';
import { detectSurfaceCapability, clearCapabilityCache as clearSurfaceCache } from '../src/game/rendering/capabilities';

type ContextKind = 'webgl2' | 'webgl' | '2d' | null;

/** Minimal GL double: enough surface for the probe to read real parameters. */
function makeGl(version: 1 | 2, renderer = 'Test GPU') {
  const params: Record<number, unknown> = {
    0x1f00: 8192, // MAX_TEXTURE_SIZE
    0x84e8: 8192, // MAX_RENDERBUFFER_SIZE
    0x8b4d: new Int32Array([16384, 16384]), // MAX_VIEWPORT_DIMS
    0x8869: 16, // MAX_VERTEX_ATTRIBS
    0x8d57: 4, // MAX_SAMPLES (WebGL2)
    0x1f01: 'WebKit WebGL', // VENDOR (masked)
  };
  params[0x8b8b] = 'WebGL GLSL ES 3.00';
  if (version === 1) {
    params[0x8b8b] = 'WebGL GLSL ES 1.0 (OpenGL ES 2.0)';
    params[0x8df2] = 0x8df2; // OES_standard_derivatives
  }

  return {
    __version: version,
    MAX_TEXTURE_SIZE: 0x1f00,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    MAX_VIEWPORT_DIMS: 0x8b4d,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_SAMPLES: 0x8d57,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
    SHADING_LANGUAGE_VERSION: 0x8b8b,
    RENDERER: 0x1f01,
    VENDOR: 0x1f01,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    getParameter: (p: number) => params[p],
    getExtension: (name: string) => {
      if (name === 'EXT_texture_filter_anisotropic') {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff };
      }
      if (name === 'WEBGL_lose_context') return { loseContext: () => {} };
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_RENDERER_WEBGL: 0x9246, UNMASKED_VENDOR_WEBGL: 0x9245 };
      }
      if (name === 'EXT_color_buffer_float') return {};
      return null;
    },
    getSupportedExtensions: () => ['EXT_texture_filter_anisotropic', 'EXT_color_buffer_float'],
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    isContextLost: () => false,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    _rendererString: renderer
  };
}

function installGetContext(map: { webgl2?: ContextKind; webgl?: ContextKind; '2d'?: ContextKind }): void {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(
    this: HTMLCanvasElement,
    id: string,
    ...rest: unknown[]
  ) {
    void rest;
    if (id === 'webgl2') {
      if (map.webgl2 === 'webgl2') return makeGl(2) as unknown as RenderingContext;
      if (map.webgl2 === null) return null;
    }
    if (id === 'webgl' || id === 'experimental-webgl') {
      if (map.webgl === 'webgl') return makeGl(1) as unknown as RenderingContext;
      if (map.webgl === null) return null;
    }
    if (id === '2d') {
      return map['2d'] === '2d' ? ({} as unknown as RenderingContext) : null;
    }
    return original.call(this, id as '2d', ...(rest as []));
  } as typeof HTMLCanvasElement.prototype.getContext;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  clearCapabilityCache();
  clearSurfaceCache();
  window.matchMedia =
    originalMatchMedia ??
    ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    } as unknown as MediaQueryList));
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  clearCapabilityCache();
  clearSurfaceCache();
});

describe('detectBrowserCapabilities', () => {
  it('reports WebGL2 and the full profile when available', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const caps = detectBrowserCapabilities();

    expect(caps.webgl2.ok).toBe(true);
    expect(caps.webgl2.version).toBe(2);
    expect(caps.webgl2.maxTextureSize).toBe(8192);
    expect(caps.webgl2.maxSamples).toBe(4);
    expect(caps.webgl2.extensions.length).toBeGreaterThan(0);
    expect(caps.rendererTier).toBe('webgl2');
    expect(caps.canRender3D).toBe(true);
  });

  it('falls back to WebGL1 when WebGL2 is unavailable, and explains why', () => {
    installGetContext({ webgl2: null, webgl: 'webgl', '2d': '2d' });
    const caps = detectBrowserCapabilities();

    expect(caps.webgl2.ok).toBe(false);
    expect(caps.webgl2.reason).toBeTruthy();
    expect(caps.webgl1.ok).toBe(true);
    expect(caps.rendererTier).toBe('webgl1');
    expect(caps.canRender3D).toBe(true);
    // The user must be told why they are not on the top tier.
    expect(caps.warnings.join(' ')).toMatch(/WebGL2 is unavailable/i);
  });

  it('falls back to 2D canvas when no WebGL context exists at all', () => {
    installGetContext({ webgl2: null, webgl: null, '2d': '2d' });
    const caps = detectBrowserCapabilities();

    expect(caps.webgl1.ok).toBe(false);
    expect(caps.canvas2d.ok).toBe(true);
    expect(caps.rendererTier).toBe('canvas2d');
    // A canvas2d machine is still fully usable — it must NOT be "unsupported".
    expect(caps.canRenderAnything).toBe(true);
  });

  it('reports tier "none" only when no surface exists whatsoever', () => {
    installGetContext({ webgl2: null, webgl: null, '2d': null });
    const caps = detectBrowserCapabilities();

    expect(caps.rendererTier).toBe('none');
    expect(caps.canRenderAnything).toBe(false);
    expect(caps.canRender3D).toBe(false);
  });

  it('records a reason on every failed probe instead of failing silently', () => {
    installGetContext({ webgl2: null, webgl: null, '2d': null });
    const caps = detectBrowserCapabilities();

    expect(caps.webgl2.reason).toBeTruthy();
    expect(caps.webgl1.reason).toBeTruthy();
    expect(caps.canvas2d.reason).toBeTruthy();
  });

  it('classifies a software rasterizer and caps the recommended quality', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const gl = makeGl(2, 'Google SwiftShader');
    // Force the unmasked string to identify a software rasterizer.
    gl.getParameter = ((p: number) =>
      p === 0x9246 ? 'Google SwiftShader Device' : makeGl(2).getParameter(p)) as typeof gl.getParameter;

    HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, id: string) {
      if (id === 'webgl2' || id === 'webgl') return gl as unknown as RenderingContext;
      return originalGetContext.call(this, id as '2d');
    } as typeof HTMLCanvasElement.prototype.getContext;

    const caps = detectBrowserCapabilities();
    expect(caps.gpu.class).toBe('software');
    expect(caps.recommendedQuality).toBe('Low');
    expect(caps.warnings.join(' ')).toMatch(/software rasterizer/i);
  });

  it('survives a getContext that throws', () => {
    HTMLCanvasElement.prototype.getContext = function throwing() {
      throw new Error('SecurityError: context blocked');
    } as typeof HTMLCanvasElement.prototype.getContext;

    const caps = detectBrowserCapabilities();
    expect(caps.webgl2.ok).toBe(false);
    expect(caps.webgl2.reason).toBeTruthy();
    expect(caps.rendererTier).toBe('none');
  });

  it('caches the result and clears on demand', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const first = detectBrowserCapabilities();
    const second = detectBrowserCapabilities();
    expect(second).toBe(first);

    clearCapabilityCache();
    const third = detectBrowserCapabilities();
    expect(third).not.toBe(first);
  });
});

describe('capabilities adapter', () => {
  it('does NOT mark a WebGL1 machine as unsupported', () => {
    installGetContext({ webgl2: null, webgl: 'webgl', '2d': '2d' });
    clearSurfaceCache();
    const surface = detectSurfaceCapability();

    expect(surface.webgl2).toBe(false);
    expect(surface.webgl1).toBe(true);
    // This is the regression: the old adapter set a hard-fail reason here.
    expect(surface.unsupportedReason).toBeNull();
    expect(surface.canRenderAnything).toBe(true);
  });

  it('still reports a reason when nothing can render', () => {
    installGetContext({ webgl2: null, webgl: null, '2d': null });
    clearSurfaceCache();
    const surface = detectSurfaceCapability();
    expect(surface.unsupportedReason).toBeTruthy();
  });
});

describe('RendererManager', () => {
  it('selects WebGL2 and records no rejected tiers', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    const sel = mgr.select();

    expect(sel.tier).toBe('webgl2');
    expect(sel.supports3D).toBe(true);
    expect(sel.rejected).toHaveLength(0);
    expect(sel.rationale).toMatch(/WebGL2/);
  });

  it('records why WebGL2 was rejected when falling back', () => {
    installGetContext({ webgl2: null, webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    const sel = mgr.select();

    expect(sel.tier).toBe('webgl1');
    expect(sel.rejected.map((r) => r.tier)).toContain('webgl2');
    expect(sel.rejected[0].reason).toBeTruthy();
  });

  it('records both rejected WebGL tiers when falling back to canvas2d', () => {
    installGetContext({ webgl2: null, webgl: null, '2d': '2d' });
    const mgr = new RendererManager();
    const sel = mgr.select();

    expect(sel.tier).toBe('canvas2d');
    expect(sel.rejected.map((r) => r.tier)).toEqual(['webgl2', 'webgl1']);
  });

  it('clamps the pixel ratio to the GPU ceiling and the render scale', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    mgr.select();
    mgr.setRenderScale(1.5);
    mgr.setDynamicResolution(false);

    const canvas = document.createElement('canvas');
    const ratio = mgr.applyPixelRatio(canvas, 800, 600);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1.5 * 2);
    expect(canvas.width).toBe(Math.round(800 * ratio));
  });

  it('scales the internal buffer down when frames run long and back up when fast', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    mgr.select();
    mgr.setDynamicResolution(true);

    const start = mgr.getDynamicScale();
    for (let i = 0; i < 30; i++) mgr.updateAdaptiveScale(40); // 25 FPS
    const degraded = mgr.getDynamicScale();
    expect(degraded).toBeLessThan(start);

    for (let i = 0; i < 120; i++) mgr.updateAdaptiveScale(8); // 125 FPS
    expect(mgr.getDynamicScale()).toBeGreaterThan(degraded);
    expect(mgr.getDynamicScale()).toBeLessThanOrEqual(1);
  });

  it('holds the scale steady when dynamic resolution is off', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    mgr.select();
    mgr.setDynamicResolution(false);
    const before = mgr.getDynamicScale();
    for (let i = 0; i < 60; i++) mgr.updateAdaptiveScale(45);
    expect(mgr.getDynamicScale()).toBe(before);
  });

  it('tracks context loss and restoration', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    mgr.select();

    const canvas = document.createElement('canvas');
    const detach = mgr.attachContextWatch(canvas);

    const seen: boolean[] = [];
    mgr.onContextChange((s) => seen.push(s.lost));

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(mgr.getContextState().lost).toBe(true);
    // preventDefault() is mandatory or the browser never fires `restored`.
    expect(lost.defaultPrevented).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(mgr.getContextState().lost).toBe(false);
    expect(mgr.getContextState().count).toBe(1);
    expect(seen).toContain(true);
    expect(seen).toContain(false);

    detach();
  });

  it('does not throw when a context listener misbehaves', () => {
    installGetContext({ webgl2: 'webgl2', webgl: 'webgl', '2d': '2d' });
    const mgr = new RendererManager();
    mgr.select();
    mgr.onContextChange(() => {
      throw new Error('bad listener');
    });
    const canvas = document.createElement('canvas');
    mgr.attachContextWatch(canvas);
    expect(() => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))).not.toThrow();
  });
});

// Keep the unused-type import meaningful for readers of this file.
export type { WebglProfile };
