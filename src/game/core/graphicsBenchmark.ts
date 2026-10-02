/**
 * "Run Graphics Test" — a real, measured benchmark.
 *
 * The previous hardware benchmark in `performanceMonitor.ts` derived a score
 * from a CPU-only sin/cos loop, which says nothing about the GPU. This module
 * instead builds an actual WebGL2 scene, renders it for a fixed wall-clock
 * window, and reports the frame times it genuinely measured.
 *
 * Results are real measurements or an explicit failure. Nothing is estimated,
 * and no default "144 FPS" is ever substituted.
 */

import * as THREE from 'three';
import { detectBrowserCapabilities, type BrowserCapabilities } from '../rendering/browser-capabilities';
import { recommendPreset } from './performanceManager';

export interface GraphicsTestResult {
  ok: boolean;
  /** Set when the test could not run at all. */
  error?: string;
  renderer: string;
  gpu: string;
  gpuClass: string;
  averageFps: number;
  onePercentLowFps: number;
  frameTimeMs: number;
  framesRendered: number;
  durationMs: number;
  recommendedPreset: string;
  recommendedQuality: string;
  devicePixelRatio: number;
  canvasSize: [number, number];
  measuredAt: string;
}

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vPos;
  uniform vec3 uColor;
  void main() {
    // Cheap per-pixel lighting so the fragment stage is genuinely exercised.
    float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.5))), 0.0);
    float grid = step(0.98, fract(vPos.x * 8.0)) + step(0.98, fract(vPos.y * 8.0));
    vec3 c = uColor * (0.25 + 0.75 * d) + grid * 0.15;
    gl_FragColor = vec4(c, 1.0);
  }
`;

interface ShaderReport {
  name: string;
  stage: 'vertex' | 'fragment';
  compiled: boolean;
  log: string;
}

/** Compiles the benchmark shaders individually and reports each result. */
function compileShaders(gl: WebGL2RenderingContext): { vertex: ShaderReport; fragment: ShaderReport } {
  const build = (type: number, name: string, source: string): ShaderReport => {
    const shader = gl.createShader(type);
    if (!shader) return { name, stage: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', compiled: false, log: 'gl.createShader returned null' };
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
    const log = gl.getShaderInfoLog(shader) || '';
    return {
      name,
      stage: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment',
      compiled: ok,
      log: ok ? 'Compiled' : log
    };
  };

  return {
    vertex: build(gl.VERTEX_SHADER, 'benchmark.vert', VERTEX_SHADER),
    fragment: build(gl.FRAGMENT_SHADER, 'benchmark.frag', FRAGMENT_SHADER)
  };
}

/**
 * Runs the benchmark. `durationMs` defaults to 2000, which is long enough for
 * the 1% low to be meaningful on a 60 Hz display.
 */
export async function runGraphicsTest(durationMs = 2000): Promise<GraphicsTestResult> {
  const measuredAt = new Date().toISOString();
  let caps: BrowserCapabilities;
  try {
    caps = detectBrowserCapabilities();
  } catch (err) {
    return {
      ok: false,
      error: `Capability detection failed: ${String(err)}`,
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
      measuredAt
    };
  }

  if (!caps.webgl2.ok) {
    return {
      ok: false,
      error: caps.webgl2.reason ?? 'WebGL2 is unavailable, so the 3D benchmark cannot run.',
      renderer: caps.webgl1.ok ? 'WebGL1' : caps.canvas2d.ok ? 'Canvas2D' : 'none',
      gpu: caps.gpu.renderer,
      gpuClass: caps.gpu.class,
      averageFps: 0,
      onePercentLowFps: 0,
      frameTimeMs: 0,
      framesRendered: 0,
      durationMs: 0,
      recommendedPreset: recommendPreset(caps.recommendedQuality, caps.gpu.class === 'software'),
      recommendedQuality: caps.recommendedQuality,
      devicePixelRatio: caps.devicePixelRatio,
      canvasSize: [caps.viewport.width, caps.viewport.height],
      measuredAt
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1280, Math.max(640, caps.viewport.width || 1280));
  canvas.height = Math.min(720, Math.max(360, caps.viewport.height || 720));
  // Keep the benchmark out of the layout and out of screenshots.
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer | null = null;
  const gl: WebGL2RenderingContext = canvas.getContext('webgl2', {
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  }) as WebGL2RenderingContext;

  try {
    if (!gl) throw new Error('WebGL2 context vanished between detection and the benchmark.');

    // Compile the shaders by hand first so a compile failure is reported as a
    // shader failure rather than a mysterious black canvas.
    const shaders = compileShaders(gl);
    for (const report of [shaders.vertex, shaders.fragment]) {
      if (!report.compiled) {
        throw new Error(`Shader "${report.name}" (${report.stage}) failed to compile: ${report.log}`);
      }
    }

    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1016);
    const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 0, 6);

    // A real workload: enough geometry and lights to exercise the GPU rather
    // than a single triangle that would report the CPU's frame pacing.
    const group = new THREE.Group();
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: false
    });
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        Math.cos((i / 24) * Math.PI * 2) * 2.6,
        ((i % 6) - 2.5) * 1.1,
        Math.sin((i / 24) * Math.PI * 2) * 2.6
      );
      mesh.rotation.set(i * 0.3, i * 0.5, i * 0.2);
      group.add(mesh);
    }
    scene.add(group);
    scene.add(new THREE.AmbientLight(0x334155, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xf59e0b, 30, 20);
    rim.position.set(-4, -2, 3);
    scene.add(rim);

    // Warm-up: the first frames include shader compilation and are not
    // representative, so they are measured and then discarded.
    for (let i = 0; i < 10; i++) {
      renderer.render(scene, camera);
    }
    gl.finish?.();

    const frameTimes: number[] = [];
    const start = performance.now();
    let last = start;

    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        frameTimes.push(now - last);
        last = now;

        group.rotation.y += 0.01;
        group.rotation.x += 0.004;
        renderer!.render(scene, camera);

        if (now - start < durationMs) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });

    if (frameTimes.length < 5) {
      throw new Error(
        `Only ${frameTimes.length} frames were rendered in ${durationMs}ms — the render loop is not producing frames.`
      );
    }

    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const sorted = [...frameTimes].sort((a, b) => b - a);
    const onePctCount = Math.max(1, Math.ceil(sorted.length * 0.01));
    const onePctAvg = sorted.slice(0, onePctCount).reduce((a, b) => a + b, 0) / onePctCount;

    const gpu = caps.gpu;
    return {
      ok: true,
      renderer: 'WebGL2',
      gpu: gpu.renderer,
      gpuClass: gpu.class,
      averageFps: Math.round(1000 / Math.max(0.1, avg)),
      onePercentLowFps: Math.round(1000 / Math.max(0.1, onePctAvg)),
      frameTimeMs: Number(avg.toFixed(2)),
      framesRendered: frameTimes.length,
      durationMs: Math.round(performance.now() - start),
      recommendedPreset: recommendPreset(caps.recommendedQuality, gpu.class === 'software'),
      recommendedQuality: caps.recommendedQuality,
      devicePixelRatio: caps.devicePixelRatio,
      canvasSize: [canvas.width, canvas.height],
      measuredAt
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      renderer: 'WebGL2',
      gpu: caps.gpu.renderer,
      gpuClass: caps.gpu.class,
      averageFps: 0,
      onePercentLowFps: 0,
      frameTimeMs: 0,
      framesRendered: 0,
      durationMs: 0,
      recommendedPreset: recommendPreset(caps.recommendedQuality, caps.gpu.class === 'software'),
      recommendedQuality: caps.recommendedQuality,
      devicePixelRatio: caps.devicePixelRatio,
      canvasSize: [canvas.width, canvas.height],
      measuredAt
    };
  } finally {
    // Always release the context; a leaked one counts against the browser's
    // context limit and can break the next context creation.
    try {
      renderer?.dispose();
    } catch {
      /* already gone */
    }
    try {
      canvas.remove();
    } catch {
      /* already gone */
    }
  }
}
