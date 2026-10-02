import React from 'react';
import { Loader2 } from 'lucide-react';

export const PanelSpinner: React.FC<{ label?: string; fullscreen?: boolean }> = ({
  label = 'LOADING…',
  fullscreen = false
}) => (
  <div
    className={`flex ${
      fullscreen ? 'h-screen w-screen bg-black' : 'min-h-[320px] rounded-lg border border-tac-border bg-tac-panel/60'
    } flex-col items-center justify-center gap-3`}
  >
    <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
    <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
  </div>
);
