import React from 'react';
import { FrameTelemetrySnapshot } from '../core/performanceMonitor';
import { CullingFrameStats } from '../rendering/cullingSystem';
import { NetworkTelemetry } from '../network/networkClient';
import { TelemetryLevel } from '../settings/settingsStore';

interface TelemetryOverlayProps {
  mode: TelemetryLevel;
  showCullingDebug: boolean;
  frame: FrameTelemetrySnapshot;
  culling: CullingFrameStats;
  net: NetworkTelemetry;
}

export const TelemetryOverlay: React.FC<TelemetryOverlayProps> = ({
  mode,
  showCullingDebug,
  frame,
  culling,
  net
}) => {
  if (mode === 'OFF' && !showCullingDebug) return null;

  const totalCulled =
    culling.culledBehindCamera +
    culling.culledByFrustum +
    culling.culledByOcclusion +
    culling.culledByDistance;

  const cullRatioPercent =
    culling.totalObjects > 0 ? Math.round((totalCulled / culling.totalObjects) * 100) : 0;

  if (mode === 'MINIMAL' && !showCullingDebug) {
    return (
      <div className="pointer-events-none flex items-center gap-3 rounded border border-slate-800/90 bg-slate-950/85 px-3 py-1 font-mono text-[11px] text-slate-200 shadow-lg">
        <span>
          FPS: <strong className="text-emerald-400">{frame.fps}</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span>
          1% LOW: <strong className="text-cyan-400">{frame.onePercentLowFps}</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span>
          FT: <strong>{frame.frameTimeMs}ms</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span>
          PING: <strong className="text-emerald-400">{net.pingMs}ms</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span>
          TICK: <strong>{net.serverTickRate}Hz</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span>
          CULLED: <strong className="text-amber-400">{cullRatioPercent}%</strong>
        </span>
      </div>
    );
  }

  // FULL Telemetry + Smart Occlusion Debug Panel
  const history = frame.frameHistoryMs.slice(-60);
  const points = history
    .map((ms, idx) => {
      const x = (idx / Math.max(1, history.length - 1)) * 220;
      const y = 36 - Math.min(34, (ms / 25) * 34);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="pointer-events-none w-80 rounded-lg border border-slate-700/90 bg-slate-950/92 p-3 font-mono text-[11px] text-slate-200 shadow-2xl">
      <div className="mb-1.5 flex items-center justify-between border-b border-slate-800 pb-1">
        <span className="font-bold text-cyan-400">ENGINE TELEMETRY & OCCLUSION</span>
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
          {net.serverTickRate} TICK
        </span>
      </div>

      {/* FPS & Low Percentiles */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded bg-slate-900/90 p-1.5">
          <div className="text-[9px] text-slate-400">AVG FPS</div>
          <div className="text-sm font-black text-emerald-400">{frame.fps}</div>
        </div>
        <div className="rounded bg-slate-900/90 p-1.5">
          <div className="text-[9px] text-slate-400">1% LOW</div>
          <div className="text-sm font-black text-cyan-400">{frame.onePercentLowFps}</div>
        </div>
        <div className="rounded bg-slate-900/90 p-1.5">
          <div className="text-[9px] text-slate-400">0.1% LOW</div>
          <div className="text-sm font-black text-amber-400">{frame.pointOnePercentLowFps}</div>
        </div>
      </div>

      {/* Frame-Time Graph */}
      <div className="mt-2 rounded border border-slate-800 bg-slate-900/80 p-1.5">
        <div className="mb-1 flex justify-between text-[10px] text-slate-400">
          <span>Frame: {frame.frameTimeMs}ms</span>
          <span>CPU: {frame.cpuTimeMs}ms</span>
          <span>GPU: {frame.gpuTimeMs}ms</span>
        </div>
        <svg width="220" height="36" className="w-full overflow-visible">
          <line x1="0" y1="18" x2="220" y2="18" stroke="rgba(148,163,184,0.18)" strokeDasharray="2,2" />
          {points && (
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="1.6"
              points={points}
            />
          )}
        </svg>
      </div>

      {/* Smart Occlusion / "Behind Me" Culling Breakdown */}
      <div className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-[10px]">
        <div className="flex justify-between font-bold text-amber-300">
          <span>SMART OCCLUSION ("BEHIND ME")</span>
          <span>{cullRatioPercent}% SAVED</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Visible / Total Objects:</span>
          <span className="text-emerald-400 font-bold">
            {culling.visibleObjects} / {culling.totalObjects}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Culled Behind Camera:</span>
          <span className="text-red-400 font-bold">{culling.culledBehindCamera}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Culled Outside Frustum:</span>
          <span className="text-amber-400 font-bold">{culling.culledByFrustum}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Culled Behind Solid Walls:</span>
          <span className="text-purple-400 font-bold">{culling.culledByOcclusion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Culled By Distance Ring:</span>
          <span className="text-slate-300 font-bold">{culling.culledByDistance}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Active LOD (H / M / L):</span>
          <span>
            {culling.lodHighCount} / {culling.lodMediumCount} / {culling.lodLowCount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Draw Calls / Triangles:</span>
          <span>
            {culling.drawCalls} / {culling.triangles}
          </span>
        </div>
      </div>

      {/* Network & Memory */}
      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-slate-800 pt-1.5 text-[10px] text-slate-400">
        <div>Ping: <span className="text-white">{net.pingMs}ms (±{net.jitterMs}ms)</span></div>
        <div>Loss: <span className="text-white">{net.packetLossPercent}%</span></div>
        <div>Heap: <span className="text-white">{frame.memoryMb} MB</span></div>
        <div>Ack Seq: <span className="text-white">#{net.lastAckedSeq}</span></div>
      </div>
    </div>
  );
};
