import React, { useEffect, useRef, useState } from 'react';
import { Terminal, X } from 'lucide-react';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import {
  useSettingsStore,
  getObjectDistanceCutoffMeters,
  PerformancePresetId
} from '../../game/settings/settingsStore';
import { WEAPON_SPECS } from '../../shared/weapons';

interface CommandConsoleProps {
  onClose: () => void;
}

const HELP_TEXT = [
  'Available commands (client-safe cvars only):',
  '  help                          — list every command',
  '  fps_max <0|30|60|120|144|165|240|360|n>  — set the FPS cap (0 = unlimited)',
  '  view_distance player <50|100|150|200|300|500|unlimited>  — enemy render distance cap',
  '  view_distance object <near|medium|far|ultra|custom>      — decorative object cull ring',
  '  occlusion <0|1>               — toggle Smart Occlusion ("Behind Me") culling',
  '  portal_culling <0|1>          — toggle portal/room visibility culling',
  '  lod <0|1>                     — toggle level-of-detail streaming',
  '  texture_quality <low|medium|high|ultra>',
  '  shadow_quality <off|low|medium|high|ultra>',
  '  shadow_distance <10-160>',
  '  render_scale <0.5-1.5>',
  '  fov <68-110>                  — field of view',
  '  sensitivity <0.1-8>           — mouse sensitivity',
  '  volume <0-1>                  — master volume',
  '  cl_crosshair_color <#hex>',
  '  cl_crosshair_size <1-20>',
  '  cl_crosshair_gap <-4-15>',
  '  cl_crosshair_thickness <1-8>',
  '  cl_crosshair_dot <0|1>',
  '  cl_crosshair_outline <0|1>',
  '  cl_showfps <off|minimal|full> — telemetry overlay level',
  '  cl_culling_debug <0|1>        — occlusion debug visualization',
  '  preset <competitive|balanced|quality|ultra|low_end_pc|high_end_pc|streaming|practice>',
  '  optimize_competitive          — apply the full competitive optimization pass',
  '  weapons                       — list every weapon ID and its ballistics',
  '  clear                         — clear the console buffer',
  '',
  'Server administration commands (kick, ban, sv_cheats, map rotation) are intentionally',
  'not exposed to ordinary clients. They are only available over the authenticated admin API.'
];

export const CommandConsole: React.FC<CommandConsoleProps> = ({ onClose }) => {
  const { consoleLogs, appendConsoleLog } = useGamePlatformStore();
  const settings = useSettingsStore();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [consoleLogs]);

  const print = (line: string) => appendConsoleLog(line);

  const execute = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    print(`> ${trimmed}`);
    setHistory((h) => [...h.slice(-49), trimmed]);
    setHistoryIndex(-1);

    const [cmdRaw, ...args] = trimmed.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const arg = args[0];
    const num = Number(arg);
    const boolArg = () => arg === '1' || arg === 'true' || arg === 'on';

    switch (cmd) {
      case 'help':
        HELP_TEXT.forEach(print);
        break;

      case 'clear':
        useGamePlatformStore.setState({ consoleLogs: ['[CONSOLE] Buffer cleared.'] });
        break;

      case 'fps_max': {
        const value = arg === 'unlimited' || num === 0 ? 'Unlimited' : String(num);
        const valid = ['Unlimited', '30', '60', '120', '144', '165', '240', '360', 'Custom'];
        if (valid.includes(value)) {
          settings.updateVideo({ fpsCapPreset: value as never, fpsCapCustom: num || 240 });
          print(`[OK] fps_max set to ${value}`);
        } else {
          settings.updateVideo({ fpsCapPreset: 'Custom', fpsCapCustom: Math.max(15, num) });
          print(`[OK] fps_max custom set to ${Math.max(15, num)}`);
        }
        break;
      }

      case 'view_distance': {
        const target = (args[0] || '').toLowerCase();
        const value = (args[1] || '').toLowerCase();
        if (target === 'player') {
          const parsed = value === 'unlimited' ? 'Unlimited' : Number(value);
          if (['Unlimited', 50, 100, 150, 200, 300, 500].includes(parsed as never)) {
            settings.updateVideo({ playerVisibilityDistance: parsed as never });
            print(`[OK] Player visibility distance = ${parsed}. Note: enemies with line of sight are always rendered.`);
          } else {
            print('[ERROR] Valid values: 50|100|150|200|300|500|unlimited');
          }
        } else if (target === 'object') {
          if (['near', 'medium', 'far', 'ultra', 'custom'].includes(value)) {
            const map: Record<string, string> = { near: 'Near', medium: 'Medium', far: 'Far', ultra: 'Ultra', custom: 'Custom' };
            settings.updateVideo({ objectVisibilityDistance: map[value] as never });
            print(`[OK] Object visibility distance = ${map[value]} (${getObjectDistanceCutoffMeters({ ...settings.video, objectVisibilityDistance: map[value] as never })}m)`);
          } else {
            print('[ERROR] Valid values: near|medium|far|ultra|custom');
          }
        } else {
          print('[ERROR] Usage: view_distance player <value> | view_distance object <value>');
        }
        break;
      }

      case 'occlusion':
        settings.updateVideo({ smartOcclusionCulling: boolArg() });
        print(`[OK] Smart occlusion culling ${boolArg() ? 'ENABLED' : 'DISABLED'}`);
        break;

      case 'portal_culling':
        settings.updateVideo({ portalVisibilityCulling: boolArg() });
        print(`[OK] Portal visibility culling ${boolArg() ? 'ENABLED' : 'DISABLED'}`);
        break;

      case 'frustum_culling':
        settings.updateVideo({ frustumCulling: boolArg() });
        print(`[OK] Frustum culling ${boolArg() ? 'ENABLED' : 'DISABLED'}`);
        break;

      case 'lod':
        settings.updateVideo({ lodEnabled: boolArg() });
        print(`[OK] LOD streaming ${boolArg() ? 'ENABLED' : 'DISABLED'}`);
        break;

      case 'texture_quality': {
        const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
        const v = map[(arg || '').toLowerCase()];
        if (v) {
          settings.updateVideo({ textureQuality: v as never });
          print(`[OK] texture_quality = ${v}`);
        } else print('[ERROR] Valid values: low|medium|high|ultra');
        break;
      }

      case 'shadow_quality': {
        const map: Record<string, string> = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
        const v = map[(arg || '').toLowerCase()];
        if (v) {
          settings.updateVideo({ shadowQuality: v as never });
          print(`[OK] shadow_quality = ${v}`);
        } else print('[ERROR] Valid values: off|low|medium|high|ultra');
        break;
      }

      case 'shadow_distance':
        settings.updateVideo({ shadowDistance: Math.max(10, Math.min(160, num)) });
        print(`[OK] shadow_distance = ${Math.max(10, Math.min(160, num))}m`);
        break;

      case 'render_scale':
        settings.updateVideo({ renderScale: Math.max(0.5, Math.min(1.5, num)) });
        print(`[OK] render_scale = ${Math.max(0.5, Math.min(1.5, num))}`);
        break;

      case 'fov':
        settings.updateVideo({ fov: Math.max(68, Math.min(110, num)) });
        print(`[OK] fov = ${Math.max(68, Math.min(110, num))}`);
        break;

      case 'sensitivity':
        settings.updateMouse({ sensitivity: Math.max(0.1, Math.min(8, num)) });
        print(`[OK] sensitivity = ${Math.max(0.1, Math.min(8, num))}`);
        break;

      case 'volume':
        settings.updateAudio({ masterVolume: Math.max(0, Math.min(1, num)) });
        print(`[OK] volume = ${Math.max(0, Math.min(1, num))}`);
        break;

      case 'cl_crosshair_color':
        if (/^#[0-9a-fA-F]{6}$/.test(arg || '')) {
          settings.updateCrosshair({ color: arg });
          print(`[OK] cl_crosshair_color = ${arg}`);
        } else print('[ERROR] Provide a 6-digit hex color, e.g. #00ff00');
        break;

      case 'cl_crosshair_size':
        settings.updateCrosshair({ size: Math.max(1, Math.min(20, num)) });
        print(`[OK] cl_crosshair_size = ${Math.max(1, Math.min(20, num))}`);
        break;

      case 'cl_crosshair_gap':
        settings.updateCrosshair({ gap: Math.max(-4, Math.min(15, num)) });
        print(`[OK] cl_crosshair_gap = ${Math.max(-4, Math.min(15, num))}`);
        break;

      case 'cl_crosshair_thickness':
        settings.updateCrosshair({ thickness: Math.max(1, Math.min(8, num)) });
        print(`[OK] cl_crosshair_thickness = ${Math.max(1, Math.min(8, num))}`);
        break;

      case 'cl_crosshair_dot':
        settings.updateCrosshair({ centerDot: boolArg() });
        print(`[OK] cl_crosshair_dot = ${boolArg() ? 1 : 0}`);
        break;

      case 'cl_crosshair_outline':
        settings.updateCrosshair({ outline: boolArg() });
        print(`[OK] cl_crosshair_outline = ${boolArg() ? 1 : 0}`);
        break;

      case 'cl_showfps': {
        const map: Record<string, string> = { off: 'OFF', minimal: 'MINIMAL', full: 'FULL' };
        const v = map[(arg || '').toLowerCase()];
        if (v) {
          settings.updateVideo({ telemetryMode: v as never });
          print(`[OK] cl_showfps = ${v}`);
        } else print('[ERROR] Valid values: off|minimal|full');
        break;
      }

      case 'cl_culling_debug':
        settings.updateVideo({ showCullingDebug: boolArg() });
        print(`[OK] Culling debug overlay ${boolArg() ? 'ENABLED (press F3 in game)' : 'DISABLED'}`);
        break;

      case 'preset': {
        const map: Record<string, PerformancePresetId> = {
          competitive: 'COMPETITIVE',
          balanced: 'BALANCED',
          quality: 'QUALITY',
          ultra: 'ULTRA',
          low_end_pc: 'LOW_END_PC',
          high_end_pc: 'HIGH_END_PC',
          streaming: 'STREAMING',
          practice: 'PRACTICE'
        };
        const v = map[(arg || '').toLowerCase()];
        if (v) {
          settings.applyPreset(v);
          print(`[OK] Applied preset ${v}`);
        } else print('[ERROR] Valid: competitive|balanced|quality|ultra|low_end_pc|high_end_pc|streaming|practice');
        break;
      }

      case 'optimize_competitive': {
        const diffs = settings.applyCompetitiveOptimization();
        print(`[OK] Competitive optimization applied — ${diffs.length} change(s):`);
        diffs.forEach((d) => print(`     ${d.setting}: ${d.before} → ${d.after}  (${d.impact})`));
        break;
      }

      case 'weapons':
        Object.values(WEAPON_SPECS).forEach((w) =>
          print(
            `  ${w.id.padEnd(22)} ${w.name.padEnd(24)} ${w.category.padEnd(12)} dmg ${String(w.damage).padEnd(5)} rpm ${String(w.fireRateRpm).padEnd(5)} mag ${String(w.magazineSize).padEnd(4)} $${w.price}`
          )
        );
        break;

      case 'kick':
      case 'ban':
      case 'sv_cheats':
      case 'map':
      case 'rcon':
      case 'admin':
        print(
          '[DENIED] Server administration commands are not available from the client console. They require an authenticated Moderator or Admin session through the admin API.'
        );
        break;

      default:
        print(`[ERROR] Unknown command "${cmd}". Type "help" for the command list.`);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-cyan-800/60 bg-slate-950/97 backdrop-blur">
      <div className="flex items-center justify-between border-b border-tac-border px-4 py-2">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-cyan-400">
          <Terminal className="h-3.5 w-3.5" />
          VANGUARD DEVELOPER CONSOLE
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-red-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="max-h-64 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed">
        {consoleLogs.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith('[ERROR]') || line.startsWith('[DENIED]')
                ? 'text-red-400'
                : line.startsWith('[OK]') || line.includes('ONLINE')
                ? 'text-emerald-400'
                : line.startsWith('>')
                ? 'text-cyan-400'
                : 'text-slate-400'
            }
          >
            {line}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-tac-border px-4 py-2">
        <span className="font-mono text-xs text-cyan-400">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              execute(input);
              setInput('');
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const nextIdx = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
              if (history[nextIdx]) {
                setInput(history[nextIdx]);
                setHistoryIndex(nextIdx);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextIdx = historyIndex + 1;
              if (nextIdx >= history.length) {
                setInput('');
                setHistoryIndex(-1);
              } else {
                setInput(history[nextIdx]);
                setHistoryIndex(nextIdx);
              }
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder='Type "help" for the command list…'
          className="flex-1 bg-transparent font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600"
        />
      </div>
    </div>
  );
};
