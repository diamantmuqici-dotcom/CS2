/**
 * Browser capability detection.
 *
 * The previous check was a single `getContext('webgl2')` probe that decided
 * "supported / unsupported" for the whole application. That is both wrong
 * (WebGL1 and 2D-canvas machines were rejected outright) and dishonest
 * (it could not explain *why*).
 *
 * This module probes each capability independently and records the reason for
 * every failure, so the boot diagnostics can name the exact subsystem instead
 * of printing a generic "unsupported browser" message.
 *
 * Every probe is wrapped: a throwing or partially-implemented browser API
 * degrades to `false` + a recorded reason and never aborts detection.
 */

export type RendererTier = 'webgl2' | 'webgl1' | 'canvas2d' | 'none';

export type QualityTier = 'Low' | 'Medium' | 'High' | 'Ultra';

export type GpuClass = 'software' | 'integrated' | 'discrete' | 'unknown';

export interface ProbeResult {
  ok: boolean;
  /** Human-readable cause, present only when `ok` is false. */
  reason?: string;
  /** Milliseconds spent probing — surfaced in the diagnostics panel. */
  durationMs: number;
}

export interface GpuInfo {
  vendor: string;
  renderer: string;
  /** True when the unmasked strings were readable (Firefox blocks these by default). */
  unmasked: boolean;
  class: GpuClass;
}

export interface WebglProfile {
  version: 1 | 2 | null;
  ok: boolean;
  reason?: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxViewportDims: [number, number];
  maxVertexAttribs: number;
  maxSamples: number;
  maxAnisotropy: number;
  maxCombinedTextureUnits: number;
  /** Float render target / colour-buffer support, used by post-processing. */
  colorBufferFloat: boolean;
  colorBufferHalfFloat: boolean;
  depthTexture: boolean;
  derivatives: boolean;
  instancing: boolean;
  vertexArrayObjects: boolean;
  anisotropicFiltering: boolean;
  srgbFramebuffer: boolean;
  extensions: string[];
  glslVersion: string;
  lost: boolean;
  contextLostReason: string | null;
  gpu: GpuInfo;
  durationMs: number;
}

export interface BrowserCapabilities {
  /* --- runtime --------------------------------------------------------- */
  javascript: ProbeResult;
  esModules: ProbeResult;
  dynamicImport: ProbeResult;
  dom: ProbeResult;
  canvas: ProbeResult;
  canvas2d: ProbeResult;

  /* --- graphics -------------------------------------------------------- */
  webgl1: WebglProfile;
  webgl2: WebglProfile;

  /* --- platform -------------------------------------------------------- */
  gpu: GpuInfo;
  devicePixelRatio: number;
  screen: { width: number; height: number; colorDepth: number };
  viewport: { width: number; height: number };
  isMobile: boolean;
  isTouch: boolean;
  prefersReducedMotion: boolean;
  prefersDark: boolean;
  prefersHighContrast: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  browserName: string;
  browserVersion: string;
  osName: string;
  userAgent: string;
  language: string;
  online: boolean;
  cookieEnabled: boolean;
  localStorageAvailable: boolean;
  indexedDbAvailable: boolean;
  webWorkers: boolean;
  webAssembly: boolean;
  sharedArrayBuffer: boolean;
  webSocket: boolean;
  webRtc: boolean;
  gamepad: boolean;
  pointerLock: boolean;
  unadjustedMovement: boolean;
  audioContext: boolean;
  webGpu: boolean;
  webGpuReason: string | null;

  /* --- derived --------------------------------------------------------- */
  /** Best renderer this device can actually drive right now. */
  rendererTier: RendererTier;
  /** True when the app can present a playable 3D world. */
  canRender3D: boolean;
  /** True when any renderer at all is available. */
  canRenderAnything: boolean;
  recommendedQuality: QualityTier;
  maxPixelRatio: number;
  /** Non-fatal notes worth surfacing in the diagnostics panel. */
  warnings: string[];
  detectionMs: number;
}

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|virgl|generic renderer/i;
const INTEGRATED_RE = /intel|uhd graphics|iris|hd graphics|apple m\d|adreno [1-5]\d\d\b|mali-[tg][0-6]\d|powervr|videocore/i;
const DISCRETE_RE = /nvidia|geforce|gtx\s?\d|rtx\s?\d|quadro|radeon rx|radeon pro|arc a\d|apple m[1-9]|arc 700/i;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Reads an unmasked GPU string, tolerating the many ways this can be denied. */
function readGpuInfo(gl: WebGLRenderingContext | WebGL2RenderingContext | null): GpuInfo {
  const unknown: GpuInfo = { vendor: 'Unknown', renderer: 'Unknown', unmasked: false, class: 'unknown' };
  if (!gl) return unknown;

  let vendor = 'Unknown';
  let renderer = 'Unknown';
  let unmasked = false;

  const dbg = safe(() => gl.getExtension('WEBGL_debug_renderer_info'), null);
  if (dbg) {
    const v = safe(
      () => gl.getParameter((dbg as { UNMASKED_VENDOR_WEBGL: number }).UNMASKED_VENDOR_WEBGL),
      null
    );
    const r = safe(
      () => gl.getParameter((dbg as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL),
      null
    );
    if (typeof r === 'string' && r.trim().length > 0) {
      renderer = r;
      unmasked = true;
    }
    if (typeof v === 'string' && v.trim().length > 0) vendor = v;
  }

  // Fall back to the masked strings, which every browser exposes.
  if (renderer === 'Unknown') {
    const maskedRenderer = safe(() => gl.getParameter(gl.RENDERER), null);
    if (typeof maskedRenderer === 'string' && maskedRenderer.trim()) renderer = maskedRenderer;
  }
  if (vendor === 'Unknown') {
    const maskedVendor = safe(() => gl.getParameter(gl.VENDOR), null);
    if (typeof maskedVendor === 'string' && maskedVendor.trim()) vendor = maskedVendor;
  }

  const haystack = `${vendor} ${renderer}`;
  let gpuClass: GpuClass = 'unknown';
  if (SOFTWARE_RE.test(haystack)) gpuClass = 'software';
  else if (DISCRETE_RE.test(haystack)) gpuClass = 'discrete';
  else if (INTEGRATED_RE.test(haystack)) gpuClass = 'integrated';

  return { vendor, renderer, unmasked, class: gpuClass };
}

function classifyRenderer(gpu: GpuInfo, hasWebgl2: boolean, cores: number, memoryGb: number): QualityTier {
  if (gpu.class === 'software') return 'Low';
  if (gpu.class === 'discrete') return cores >= 8 && memoryGb >= 8 ? 'Ultra' : 'High';
  if (gpu.class === 'integrated') return cores >= 4 ? 'Medium' : 'Low';
  // Unknown GPU: a WebGL2 context alone is a reasonable proxy for a modern
  // machine, but do not assume a discrete card.
  return hasWebgl2 ? (cores >= 8 ? 'High' : 'Medium') : 'Low';
}

/**
 * Probes one WebGL version on a throwaway canvas.
 *
 * The context is deliberately released with WEBGL_lose_context so the browser's
 * pool of live contexts is not exhausted by diagnostics (Chrome caps at ~16).
 */
function probeWebgl(version: 1 | 2): WebglProfile {
  const started = now();
  const empty: WebglProfile = {
    version: null,
    ok: false,
    reason: '',
    maxTextureSize: 0,
    maxRenderbufferSize: 0,
    maxViewportDims: [0, 0],
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
    extensions: [],
    glslVersion: '',
    lost: false,
    contextLostReason: null,
    gpu: { vendor: 'Unknown', renderer: 'Unknown', unmasked: false, class: 'unknown' },
    durationMs: 0
  };

  if (!hasWindow() || typeof document === 'undefined') {
    return { ...empty, reason: 'No DOM available (non-browser context).' };
  }
  if (typeof HTMLCanvasElement === 'undefined') {
    return { ...empty, reason: 'HTMLCanvasElement is not implemented in this browser.' };
  }

  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    // Keep the probe cheap and side-effect free.
    canvas.style.display = 'none';

    const attrs: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default'
    };

    gl =
      version === 2
        ? ((canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null) ??
          (null as WebGL2RenderingContext | null))
        : ((canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ??
          (canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext | null));

    if (!gl) {
      return {
        ...empty,
        reason: describeContextFailure(version),
        durationMs: Number((now() - started).toFixed(2))
      };
    }
  } catch (err) {
    return {
      ...empty,
      reason: `getContext('${version === 2 ? 'webgl2' : 'webgl'}') threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
      durationMs: Number((now() - started).toFixed(2))
    };
  }

  const getParam = <T>(p: number, fallback: T): T => safe(() => gl!.getParameter(p) as T, fallback);
  const getExt = (name: string): unknown => safe(() => gl!.getExtension(name), null);

  const anisoExt = getExt('EXT_texture_filter_anisotropic') as { MAX_TEXTURE_MAX_ANISOTROPY_EXT: number } | null;

  const glslVersion = String(getParam(gl.SHADING_LANGUAGE_VERSION, ''));

  const viewportDims = getParam(gl.MAX_VIEWPORT_DIMS, new Int32Array([0, 0])) as Int32Array;

  // MAX_SAMPLES is WebGL2-only. On WebGL1, WebGL2-style MSAA is read from
  // MAX_SAMPLES_EXT on a WebGL2 context only, so it is reported as unknown.
  const maxSamples =
    version === 2 ? Number(getParam((gl as WebGL2RenderingContext).MAX_SAMPLES, 0)) || 0 : 0;

  const profile: WebglProfile = {
    version,
    ok: true,
    maxTextureSize: Number(getParam(gl.MAX_TEXTURE_SIZE, 0)) || 0,
    maxRenderbufferSize: Number(getParam(gl.MAX_RENDERBUFFER_SIZE, 0)) || 0,
    maxViewportDims: [Number(viewportDims?.[0] ?? 0), Number(viewportDims?.[1] ?? 0)],
    maxVertexAttribs: Number(getParam(gl.MAX_VERTEX_ATTRIBS, 0)) || 0,
    maxSamples,
    maxAnisotropy: anisoExt ? Number(getParam(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT, 1)) || 1 : 1,
    maxCombinedTextureUnits: Number(getParam(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS, 0)) || 0,
    colorBufferFloat: Boolean(getExt('EXT_color_buffer_float')),
    colorBufferHalfFloat: Boolean(getExt('EXT_color_buffer_half_float') || getExt('EXT_color_buffer_float')),
    depthTexture: Boolean(getExt('WEBGL_depth_texture')),
    // OES_standard_derivatives is core in WebGL2 and an extension in WebGL1.
    derivatives: version === 1 ? Boolean(getExt('OES_standard_derivatives')) : true,
    // Instanced drawing and VAOs are core in WebGL2; extensions in WebGL1.
    instancing: version === 2 ? true : Boolean(getExt('ANGLE_instanced_arrays')),
    vertexArrayObjects: version === 2 ? true : Boolean(getExt('OES_vertex_array_object')),
    anisotropicFiltering: Boolean(anisoExt),
    srgbFramebuffer: Boolean(getExt('EXT_sRGB')),
    extensions: safe(
      () => (gl!.getSupportedExtensions() ?? []).slice().sort(),
      [] as string[]
    ),
    glslVersion,
    lost: safe(() => gl!.isContextLost(), false),
    contextLostReason: null,
    gpu: readGpuInfo(gl),
    durationMs: 0
  };

  // Free the probe context. Failure here is harmless and must not fail detection.
  const lose = getExt('WEBGL_lose_context') as { loseContext(): void } | null;
  safe(() => lose?.loseContext(), undefined);
  safe(() => canvas?.remove(), undefined);

  return { ...profile, durationMs: Number((now() - started).toFixed(2)) };
}

/** Turns "no context" into an actionable sentence instead of a dead end. */
function describeContextFailure(version: 1 | 2): string {
  if (typeof navigator !== 'undefined' && /HeadlessChrome/i.test(navigator.userAgent || '')) {
    return `Headless browser did not provide a WebGL${version} context.`;
  }
  const base = `This browser/device did not provide a WebGL${version} context.`;
  if (hasWindow() && typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return `${base} The page is not a secure context, which browsers require for accelerated graphics.`;
  }
  return `${base} Hardware acceleration is most likely disabled in the browser settings.`;
}

function parseBrowser(ua: string): { name: string; version: string; os: string } {
  const isFirefox = /Firefox\/([\d.]+)/.exec(ua);
  const isEdge = /Edg(?:e|A|iOS)?\/([\d.]+)/.exec(ua);
  const isOpera = /(?:OPR|Opera)\/([\d.]+)/.exec(ua);
  const isSamsung = /SamsungBrowser\/([\d.]+)/.exec(ua);
  const isChrome = /Chrome\/([\d.]+)/.exec(ua);
  const isSafari = /Version\/([\d.]+).*Safari/.exec(ua);

  let name = 'Unknown Browser';
  let version = '—';

  if (isEdge) {
    name = 'Microsoft Edge';
    version = isEdge[1];
  } else if (isOpera) {
    name = 'Opera';
    version = isOpera[1];
  } else if (isSamsung) {
    name = 'Samsung Internet';
    version = isSamsung[1];
  } else if (isFirefox) {
    name = 'Mozilla Firefox';
    version = isFirefox[1];
  } else if (isChrome) {
    name = 'Google Chrome';
    version = isChrome[1];
  } else if (isSafari) {
    name = 'Safari';
    version = isSafari[1];
  }

  let os = 'Unknown OS';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = 'iOS / iPadOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/FreeBSD|OpenBSD|NetBSD/.test(ua)) os = 'BSD';

  return { name, version, os };
}

function localStorageAvailable(): boolean {
  if (!hasWindow()) return false;
  try {
    const key = '__vanguard_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    // Safari private mode and hardened Firefox profiles throw here.
    return false;
  }
}

function detectWebGpu(): { ok: boolean; reason: string | null } {
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: unknown }).gpu : undefined;
  if (!nav) {
    return {
      ok: false,
      reason: 'navigator.gpu is undefined — WebGPU is unsupported or disabled in this browser.'
    };
  }
  if (!isSecureContext) {
    return { ok: false, reason: 'WebGPU requires a secure context (HTTPS or localhost).' };
  }
  return { ok: true, reason: null };
}

let cached: BrowserCapabilities | null = null;

/** Full capability detection. Cached; call `clearCapabilityCache()` to re-probe. */
export function detectBrowserCapabilities(): BrowserCapabilities {
  if (cached) return cached;

  const detectionStart = now();
  const warnings: string[] = [];

  const javascript: ProbeResult = { ok: typeof window !== 'undefined', durationMs: 0 };

  const esModules: ProbeResult = {
    ok: 'noModule' in document.createElement('script'),
    reason: 'This browser does not support <script type="module"> (ES modules).',
    durationMs: 0
  };
  if (!esModules.ok) warnings.push('ES modules unavailable — the application bundle cannot execute.');

  const dynamicImport: ProbeResult = {
    ok: typeof ({} as { import?: unknown }).import === 'function' || 'onimport' in document.createElement('script'),
    reason: 'Dynamic import() unavailable — code-split panels will not load.',
    durationMs: 0
  };

  const dom: ProbeResult = {
    ok: typeof document !== 'undefined' && typeof document.getElementById === 'function' && !!document.body,
    reason: 'DOM unavailable.',
    durationMs: 0
  };

  const canvasSupported = typeof HTMLCanvasElement !== 'undefined';
  const canvas: ProbeResult = { ok: canvasSupported, reason: 'HTMLCanvasElement is not implemented.', durationMs: 0 };

  let canvas2dOk = false;
  if (canvasSupported) {
    canvas2dOk = safe(() => {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      return !!c.getContext('2d');
    }, false);
  }

  const webgl2 = probeWebgl(2);
  const webgl1 = probeWebgl(1);

  if (!webgl2.ok && webgl2.reason) warnings.push(`WebGL2: ${webgl2.reason}`);
  if (!webgl1.ok && webgl1.reason) warnings.push(`WebGL1: ${webgl1.reason}`);

  // Each probe already captured the unmasked GPU strings from its own context,
  // so no extra GL context is created here.
  const gpuInfo = webgl2.ok ? webgl2.gpu : webgl1.ok ? webgl1.gpu : webgl2.gpu;

  if (!gpuInfo.unmasked) {
    warnings.push(
      'The GPU model is hidden by browser privacy settings (Firefox blocks WEBGL_debug_renderer_info by default). Capability detection still works; only the GPU name is unavailable.'
    );
  }
  if (gpuInfo.class === 'software') {
    warnings.push('A software rasterizer (no GPU acceleration) was detected. Quality presets are capped to LOW.');
  }

  const nav = hasWindow() ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const parsed = parseBrowser(ua);

  const hardwareConcurrency = Math.max(1, Number(nav?.hardwareConcurrency) || 1);
  const deviceMemoryGb =
    (nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory ?? null;

  const isTouch = safe(() => (navigator.maxTouchPoints ?? 0) > 0, false) || 'ontouchstart' in (window as never);
  const isMobile =
    isTouch &&
    (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) ||
      (safe(() => window.matchMedia('(pointer: coarse)').matches, false) && window.innerWidth < 1100));

  const prefersReducedMotion = safe(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false);
  const prefersDark = safe(() => window.matchMedia('(prefers-color-scheme: dark)').matches, true);
  const prefersHighContrast = safe(
    () => window.matchMedia('(prefers-contrast: more)').matches || window.matchMedia('(forced-colors: active)').matches,
    false
  );

  const webGpu = detectWebGpu();
  const pointerLock = hasWindow() && typeof document !== 'undefined' && 'requestPointerLock' in Element.prototype;
  // `unadjustedMovement` can only be confirmed by actually locking the pointer,
  // so this is an informational heuristic, not a guarantee. The input manager
  // still attempts the option and silently falls back to a plain lock request,
  // so a wrong `true` here costs nothing.
  const unadjustedMovement = pointerLock && /Chrome\/|Edg\//.test(ua) && !/Android/.test(ua);

  const rendererTier: RendererTier = webgl2.ok
    ? 'webgl2'
    : webgl1.ok
      ? 'webgl1'
      : canvas2dOk
        ? 'canvas2d'
        : 'none';

  if (!webgl2.ok && webgl1.ok) {
    warnings.push(
      'WebGL2 is unavailable on this device. CSGO will run on its WebGL1 compatibility renderer with reduced effects.'
    );
  }
  if (rendererTier === 'canvas2d') {
    warnings.push(
      'No hardware-accelerated WebGL context is available. CSGO will run in compatibility rendering mode.'
    );
  }
  if (rendererTier === 'none') {
    warnings.push('Neither WebGL nor 2D canvas rendering is available. The tactical interface will run in DOM-only mode.');
  }

  const maxDprCap = gpuInfo.class === 'discrete' ? 2 : gpuInfo.class === 'software' ? 1 : 1.5;

  const caps: BrowserCapabilities = {
    javascript,
    esModules,
    dynamicImport,
    dom,
    canvas,
    canvas2d: { ok: canvas2dOk, reason: canvas2dOk ? undefined : 'getContext("2d") returned null.', durationMs: 0 },

    webgl1,
    webgl2,

    gpu: gpuInfo,
    devicePixelRatio: hasWindow() ? safe(() => window.devicePixelRatio, 1) || 1 : 1,
    screen: hasWindow()
      ? {
          width: safe(() => window.screen.width, 0),
          height: safe(() => window.screen.height, 0),
          colorDepth: safe(() => window.screen.colorDepth, 24)
        }
      : { width: 0, height: 0, colorDepth: 24 },
    viewport: hasWindow() ? { width: window.innerWidth, height: window.innerHeight } : { width: 0, height: 0 },
    isMobile,
    isTouch,
    prefersReducedMotion,
    prefersDark,
    prefersHighContrast,
    hardwareConcurrency,
    deviceMemoryGb,
    browserName: parsed.name,
    browserVersion: parsed.version,
    osName: parsed.os,
    userAgent: ua,
    language: nav?.language ?? 'unknown',
    online: nav?.onLine ?? true,
    cookieEnabled: safe(() => nav?.cookieEnabled ?? false, false),
    localStorageAvailable: localStorageAvailable(),
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    webWorkers: typeof Worker !== 'undefined',
    webAssembly: typeof WebAssembly !== 'undefined',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolatedSafe(),
    webSocket: typeof WebSocket !== 'undefined',
    webRtc: typeof RTCPeerConnection !== 'undefined',
    gamepad: Boolean(nav && 'getGamepads' in nav),
    pointerLock,
    unadjustedMovement,
    audioContext: hasWindow() && ('AudioContext' in window || 'webkitAudioContext' in window),
    webGpu: webGpu.ok,
    webGpuReason: webGpu.reason,

    rendererTier,
    canRender3D: webgl2.ok || webgl1.ok,
    canRenderAnything: webgl2.ok || webgl1.ok || canvas2dOk,
    recommendedQuality: classifyRenderer(gpuInfo, webgl2.ok, hardwareConcurrency, deviceMemoryGb ?? 4),
    maxPixelRatio: maxDprCap,
    warnings,
    detectionMs: 0
  };

  caps.detectionMs = Number((now() - detectionStart).toFixed(2));
  cached = caps;
  return caps;
}

function crossOriginIsolatedSafe(): boolean {
  return safe(() => (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true, false);
}

/** Re-runs detection. Used by the "Run Graphics Test" diagnostic. */
export function clearCapabilityCache(): void {
  cached = null;
}
