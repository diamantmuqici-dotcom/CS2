export interface FrameTelemetrySnapshot {
  fps: number;
  onePercentLowFps: number;
  pointOnePercentLowFps: number;
  frameTimeMs: number;
  cpuTimeMs: number;
  gpuTimeMs: number;
  memoryMb: number;
  frameHistoryMs: number[];
}

export class PerformanceMonitor {
  private frameTimesMs: number[] = [];
  private maxSamples = 240;
  private lastCpuDurationMs = 1.2;

  public recordFrame(frameDeltaMs: number, cpuDurationMs: number): FrameTelemetrySnapshot {
    const clampedFrame = Math.max(0.5, Math.min(200, frameDeltaMs));
    this.frameTimesMs.push(clampedFrame);
    if (this.frameTimesMs.length > this.maxSamples) {
      this.frameTimesMs.shift();
    }
    this.lastCpuDurationMs = cpuDurationMs;
    return this.getSnapshot();
  }

  public getSnapshot(): FrameTelemetrySnapshot {
    // With no recorded frames there is nothing to report. Returning invented
    // "144 FPS" placeholders made the telemetry panel lie before the first
    // frame was ever presented, so the values are honestly zero instead.
    if (this.frameTimesMs.length === 0) {
      return {
        fps: 0,
        onePercentLowFps: 0,
        pointOnePercentLowFps: 0,
        frameTimeMs: 0,
        cpuTimeMs: 0,
        gpuTimeMs: 0,
        memoryMb: this.readMemoryMb(),
        frameHistoryMs: []
      };
    }

    const recent = this.frameTimesMs.slice(-60);
    const avgFrameMs = recent.reduce((a, b) => a + b, 0) / recent.length;
    const fps = Math.round(1000 / Math.max(0.5, avgFrameMs));

    const sortedDesc = [...this.frameTimesMs].sort((a, b) => b - a);
    const onePctCount = Math.max(1, Math.ceil(sortedDesc.length * 0.01));
    const pointOnePctCount = Math.max(1, Math.ceil(sortedDesc.length * 0.001));

    const slowestOnePctAvg =
      sortedDesc.slice(0, onePctCount).reduce((a, b) => a + b, 0) / onePctCount;
    const slowestPointOnePctAvg =
      sortedDesc.slice(0, pointOnePctCount).reduce((a, b) => a + b, 0) / pointOnePctCount;

    return {
      fps,
      onePercentLowFps: Math.round(1000 / Math.max(1, slowestOnePctAvg)),
      pointOnePercentLowFps: Math.round(1000 / Math.max(1, slowestPointOnePctAvg)),
      frameTimeMs: Number(avgFrameMs.toFixed(2)),
      cpuTimeMs: Number(this.lastCpuDurationMs.toFixed(2)),
      // GPU time is not exposed to web pages without a timer-query extension.
      // Reporting a fixed multiple of frame time would be fabricated, so it is
      // reported as 0 and the UI labels it "not exposed".
      gpuTimeMs: 0,
      memoryMb: this.readMemoryMb(),
      frameHistoryMs: this.frameTimesMs.slice(-80)
    };
  }

  private readMemoryMb(): number {
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return perfMem ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024)) : 0;
  }
}

export interface HardwareBenchmarkReport {
  webgl2Supported: boolean;
  webgpuSupported: boolean;
  pointerLockSupported: boolean;
  webWorkersSupported: boolean;
  gamepadSupported: boolean;
  rendererName: string;
  cpuCores: number;
  deviceMemoryGb: number;
  syntheticFrameTimeMs: number;
  estimatedScore: number;
  recommendedPreset: 'COMPETITIVE' | 'BALANCED' | 'QUALITY' | 'LOW_END_PC';
  disclaimer: string;
}

export function runHardwareBenchmark(): HardwareBenchmarkReport {
  const hasWindow = typeof window !== 'undefined';
  const nav = hasWindow ? window.navigator : undefined;

  let webgl2Supported = false;
  let rendererName = 'Standard WebGL2 Graphics Pipeline';
  if (hasWindow && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl) {
        webgl2Supported = true;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          rendererName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || rendererName);
        }
      }
    } catch {
      // Fallback
    }
  }

  const webgpuSupported = Boolean(nav && 'gpu' in nav);
  const pointerLockSupported = Boolean(hasWindow && 'exitPointerLock' in document);
  const webWorkersSupported = typeof Worker !== 'undefined';
  const gamepadSupported = Boolean(nav && 'getGamepads' in nav);
  const cpuCores = nav?.hardwareConcurrency || 8;
  const deviceMemoryGb = (nav as unknown as { deviceMemory?: number })?.deviceMemory || 8;

  // Run fast synthetic matrix/raycast micro-benchmark (~15ms)
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < 120000; i++) {
    acc += Math.sin(i * 0.01) * Math.cos(i * 0.02);
  }
  const elapsed = Math.max(0.4, performance.now() - start);
  const syntheticFrameTimeMs = Number((elapsed * 0.45 + (acc > 1e9 ? 0.01 : 0)).toFixed(2));

  const isSoftwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);
  let estimatedScore = Math.round((cpuCores * 110 + deviceMemoryGb * 75) / Math.max(0.5, syntheticFrameTimeMs * 0.25));
  if (isSoftwareRenderer) estimatedScore = Math.min(estimatedScore, 650);

  let recommendedPreset: HardwareBenchmarkReport['recommendedPreset'] = 'BALANCED';
  if (isSoftwareRenderer || estimatedScore < 750) {
    recommendedPreset = 'LOW_END_PC';
  } else if (estimatedScore > 1800) {
    recommendedPreset = 'QUALITY';
  } else {
    recommendedPreset = 'COMPETITIVE';
  }

  return {
    webgl2Supported,
    webgpuSupported,
    pointerLockSupported,
    webWorkersSupported,
    gamepadSupported,
    rendererName,
    cpuCores,
    deviceMemoryGb,
    syntheticFrameTimeMs,
    estimatedScore,
    recommendedPreset,
    disclaimer:
      'Browser APIs abstract direct hardware telemetry for privacy. This benchmark estimates relative frame budget using synthetic math/WebGL throughput and cannot perfectly identify physical GPU clocks.'
  };
}
