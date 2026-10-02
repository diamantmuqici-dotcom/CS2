import React, { useEffect, useState } from 'react';
import { Activity, ArrowLeft, Bell, Database, Gauge, LockKeyhole, ShieldCheck, Users, Workflow } from 'lucide-react';
import { useGamePlatformStore } from '../game/core/gameStateStore';
import { apiUrl } from '../shared/runtime';

const ROUTES = ['dashboard', 'players', 'matches', 'reports', 'anticheat', 'cases', 'bans', 'appeals', 'replays', 'workshop', 'rewards', 'audit', 'server', 'settings'] as const;
type AdminRoute = typeof ROUTES[number];
interface Health { status: string; currentTick: number; tickRate: number; connectedClients: number; antiCheatActive: boolean; workshopMapCount: number; }

export const AdminPanel: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [route, setRoute] = useState<AdminRoute>('dashboard');
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profile = useGamePlatformStore((state) => state.profile);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('api/health'), { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Health>;
    }).then((value) => { if (!cancelled) setHealth(value); }).catch(() => { if (!cancelled) setError('Server health is unavailable from this deployment.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-tac-bg text-slate-100">
      <header className="border-b border-tac-border bg-tac-panel/95 px-5 py-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
          <button onClick={onExit} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> CSGO</button>
          <span className="h-5 w-px bg-tac-border" />
          <div><div className="text-sm font-black uppercase tracking-[.2em] text-white">Operator Console</div><div className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Protected administration / audit required</div></div>
          <div className="ml-auto flex items-center gap-2 rounded border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1.5 font-mono text-[10px] text-emerald-300"><LockKeyhole className="h-3 w-3" /> SERVER ROLE CHECK · {profile.role.toUpperCase()}</div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px] gap-5 px-5 py-5">
        <aside className="w-52 shrink-0 space-y-1 max-lg:hidden">{ROUTES.map((item) => <button key={item} onClick={() => setRoute(item)} className={`w-full border-l-2 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[.16em] ${route === item ? 'border-tac-amber bg-amber-950/25 text-tac-amber' : 'border-transparent text-slate-500 hover:text-white'}`}>{item}</button>)}</aside>
        <main className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[.25em] text-tac-amber">/admin/{route}</div><h1 className="mt-1 text-3xl font-black uppercase tracking-tight text-white">{route === 'dashboard' ? 'Command overview' : route}</h1></div><div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">All sensitive actions are audited</div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<Activity />} label="Server" value={health?.status?.toUpperCase() ?? 'CHECKING'} tone={health?.status === 'online' ? 'good' : 'warn'} />
            <Metric icon={<Gauge />} label="Server tick" value={health ? `${health.tickRate} Hz` : '—'} />
            <Metric icon={<Users />} label="Connections" value={health ? String(health.connectedClients) : '—'} />
            <Metric icon={<ShieldCheck />} label="Anti-cheat" value={health?.antiCheatActive ? 'ACTIVE' : 'CHECKING'} tone={health?.antiCheatActive ? 'good' : 'warn'} />
          </div>
          <section className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="border border-tac-border bg-tac-panel/90 p-4"><div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-tac-amber"><Workflow className="h-4 w-4" /> Control surface</div><div className="grid gap-2 sm:grid-cols-2">{['Review player account', 'Inspect match telemetry', 'Open anti-cheat cases', 'Process appeals', 'Moderate workshop', 'Review audit trail'].map((label) => <button key={label} onClick={() => setRoute(label.toLowerCase().includes('appeal') ? 'appeals' : label.toLowerCase().includes('anti') ? 'anticheat' : 'dashboard')} className="border border-tac-border bg-tac-panel2/70 p-3 text-left text-xs font-bold text-slate-200 transition hover:border-tac-amber/60 hover:bg-amber-950/15">{label}<div className="mt-1 text-[10px] font-normal text-slate-500">Requires authenticated operator session</div></button>)}</div></div>
            <div className="border border-tac-border bg-tac-panel/90 p-4"><div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-tac-amber"><Database className="h-4 w-4" /> Service posture</div><Info label="Database" value="Server-configured" /><Info label="Workshop maps" value={health ? String(health.workshopMapCount) : '—'} /><Info label="Current tick" value={health ? String(health.currentTick) : '—'} /><Info label="Notifications" value="Server only" /><div className="mt-4 border-t border-tac-border pt-3 text-[10px] leading-relaxed text-slate-500">Player clients never receive private security telemetry. This dashboard is a shell for server-authorized operators; actions must be authenticated by the server and create an audit record.</div></div>
          </section>
          {error && <div className="mt-4 border border-amber-800/60 bg-amber-950/20 p-3 text-xs text-amber-200"><Bell className="mr-2 inline h-4 w-4" />{error}</div>}
        </main>
      </div>
    </div>
  );
};

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'good' | 'warn' }) { return <div className="border border-tac-border bg-tac-panel/90 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{React.cloneElement(icon as React.ReactElement, { className: 'h-3.5 w-3.5' })}{label}</div><div className={`mt-2 font-mono text-xl font-bold ${tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b border-tac-border/50 py-2 text-[11px]"><span className="text-slate-500">{label}</span><span className="font-mono text-slate-200">{value}</span></div>; }
