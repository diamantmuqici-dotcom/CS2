export interface SurfaceCapabilities {
  webgl2: boolean;
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
  unsupportedReason: string | null;
}

let cached: SurfaceCapabilities | null = null;

export function detectSurfaceCapability(): SurfaceCapabilities {
  if (cached) return cached;

  const hasWindow = typeof window !== 'undefined';
  const nav = hasWindow ? window.navigator : undefined;

  let webgl2 = false;
  let maxTextureSize = 4096;
  let maxAnisotropy = 8;
  let rendererString = 'Unknown WebGL Device';
  let vendorString = 'Unknown Vendor';

  if (hasWindow && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl) {
        webgl2 = true;
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) {
          maxAnisotropy = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 8;
        }
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          rendererString = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || rendererString);
          vendorString = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || vendorString);
        }
        const loseContext = gl.getExtension('WEBGL_lose_context');
        loseContext?.loseContext();
      }
    } catch {
      webgl2 = false;
    }
  }

  const isSoftwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(rendererString);

  const caps: SurfaceCapabilities = {
    webgl2,
    webgpu: Boolean(nav && 'gpu' in nav),
    pointerLock: Boolean(hasWindow && typeof document !== 'undefined' && 'requestPointerLock' in Element.prototype),
    webWorkers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    gamepad: Boolean(nav && 'getGamepads' in nav),
    webSocket: typeof WebSocket !== 'undefined',
    audioContext: hasWindow && ('AudioContext' in window || 'webkitAudioContext' in window),
    maxTextureSize,
    maxAnisotropy,
    rendererString,
    vendorString,
    isSoftwareRenderer,
    unsupportedReason: null
  };

  if (!webgl2) {
    caps.unsupportedReason =
      'This device or browser does not expose a WebGL2 rendering context, which is required for the Vanguard Protocol 3D renderer. Try updating your browser or enabling hardware acceleration.';
  } else if (isSoftwareRenderer) {
    caps.unsupportedReason =
      'A software rasterizer was detected instead of GPU hardware acceleration. The game will run, but you should lower render scale and use the LOW_END_PC preset for playable frame rates.';
  }

  cached = caps;
  return caps;
}

export function clearCapabilityCache(): void {
  cached = null;
}
