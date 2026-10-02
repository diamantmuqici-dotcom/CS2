import React from 'react';
import { CrosshairSettings } from '../settings/settingsStore';

interface CrosshairReticleProps {
  settings: CrosshairSettings;
  movementSpeed?: number;
  recoilOffset?: { pitch: number; yaw: number };
  isFiring?: boolean;
  isScoped?: boolean;
}

export const CrosshairReticle: React.FC<CrosshairReticleProps> = ({
  settings,
  movementSpeed = 0,
  recoilOffset = { pitch: 0, yaw: 0 },
  isFiring = false,
  isScoped = false
}) => {
  if (isScoped) {
    return (
      <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
        {/* Sniper Dual-Plane Scope Overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle, transparent 29%, rgba(4, 7, 13, 0.96) 31%)'
          }}
        />
        <div className="relative h-[58vh] w-[58vh] rounded-full border-2 border-cyan-500/60 shadow-[0_0_40px_rgba(0,0,0,0.9)]">
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-black/90" />
          <div className="absolute bottom-0 top-0 left-1/2 w-[1px] bg-black/90" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
        </div>
      </div>
    );
  }

  const dynMoveGap = settings.dynamicMovement ? Math.min(18, movementSpeed * 1.8) : 0;
  const dynFireGap = settings.dynamicFiring && isFiring ? 6 : 0;
  const effectiveGap = Math.max(-4, settings.gap + dynMoveGap + dynFireGap);

  const offsetX = settings.recoilFeedback ? -recoilOffset.yaw * 260 : 0;
  const offsetY = settings.recoilFeedback ? -recoilOffset.pitch * 260 : 0;

  const borderStyle = settings.outline
    ? `${settings.outlineThickness}px solid rgba(0, 0, 0, 0.88)`
    : 'none';

  return (
    <div
      className="pointer-events-none flex items-center justify-center"
      style={{
        opacity: settings.opacity,
        transform: `translate(${offsetX}px, ${offsetY}px)`
      }}
    >
      <div className="relative flex items-center justify-center">
        {settings.style === 'CircleReticle' && (
          <div
            className="rounded-full"
            style={{
              width: `${(effectiveGap + settings.size) * 2}px`,
              height: `${(effectiveGap + settings.size) * 2}px`,
              border: `${settings.thickness}px solid ${settings.color}`,
              boxShadow: settings.outline ? `0 0 0 ${settings.outlineThickness}px rgba(0,0,0,0.85)` : 'none'
            }}
          />
        )}

        {settings.style !== 'DotOnly' && settings.style !== 'CircleReticle' && (
          <>
            {/* Top arm (hidden in TShape) */}
            {settings.style !== 'TShape' && (
              <div
                style={{
                  position: 'absolute',
                  width: `${settings.thickness}px`,
                  height: `${settings.size}px`,
                  backgroundColor: settings.color,
                  border: borderStyle,
                  bottom: `${effectiveGap}px`
                }}
              />
            )}
            {/* Bottom arm */}
            <div
              style={{
                position: 'absolute',
                width: `${settings.thickness}px`,
                height: `${settings.size}px`,
                backgroundColor: settings.color,
                border: borderStyle,
                top: `${effectiveGap}px`
              }}
            />
            {/* Left arm */}
            <div
              style={{
                position: 'absolute',
                height: `${settings.thickness}px`,
                width: `${settings.size}px`,
                backgroundColor: settings.color,
                border: borderStyle,
                right: `${effectiveGap}px`
              }}
            />
            {/* Right arm */}
            <div
              style={{
                position: 'absolute',
                height: `${settings.thickness}px`,
                width: `${settings.size}px`,
                backgroundColor: settings.color,
                border: borderStyle,
                left: `${effectiveGap}px`
              }}
            />
          </>
        )}

        {(settings.centerDot || settings.style === 'DotOnly') && (
          <div
            style={{
              width: `${settings.centerDotSize + 1}px`,
              height: `${settings.centerDotSize + 1}px`,
              backgroundColor: settings.color,
              border: borderStyle,
              borderRadius: '9999px'
            }}
          />
        )}
      </div>
    </div>
  );
};
