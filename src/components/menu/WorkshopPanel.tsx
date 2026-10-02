import React, { useMemo, useState } from 'react';
import {
  Download,
  UploadCloud,
  Star,
  Heart,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Search,
  Users,
  BarChart3,
  FileJson,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { Panel, Button, StatChip, Tabs, SelectRow } from '../ui/primitives';
import { validateWorkshopPackage } from '../../shared/security';
import { soundEngine } from '../../game/audio/soundEngine';
import { GameMapDefinition } from '../../shared/types';
import { apiUrl } from '../../shared/runtime';

type WorkshopTab = 'BROWSE' | 'UPLOAD' | 'MY_MAPS' | 'SUBSCRIPTIONS' | 'RATINGS' | 'STATS';

export const WorkshopPanel: React.FC<{ onTestMap: (mapId: string) => void }> = ({ onTestMap }) => {
  const {
    workshopMaps,
    profile,
    toggleSubscribeWorkshopMap,
    toggleFavoriteWorkshopMap,
    rateWorkshopMap,
    deleteWorkshopMap,
    publishWorkshopMap,
    appendConsoleLog
  } = useGamePlatformStore();

  const [tab, setTab] = useState<WorkshopTab>('BROWSE');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'rating' | 'plays'>('popular');
  const [selectedId, setSelectedId] = useState<string | null>(workshopMaps[0]?.id ?? null);
  const [uploadText, setUploadText] = useState('');
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateWorkshopPackage> | null>(null);
  const [serverResult, setServerResult] = useState<string | null>(null);
  const [serverValidated, setServerValidated] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');

  const filtered = useMemo(() => {
    let list = [...workshopMaps];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.title.toLowerCase().includes(q) || m.creator.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
      );
    }
    if (modeFilter !== 'All') {
      list = list.filter((m) => m.supportedModes.includes(modeFilter as never));
    }
    switch (sortBy) {
      case 'newest':
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'plays':
        list.sort((a, b) => b.plays - a.plays);
        break;
      default:
        list.sort((a, b) => b.downloads - a.downloads);
    }
    return list;
  }, [workshopMaps, search, modeFilter, sortBy]);

  const selected = workshopMaps.find((m) => m.id === selectedId) || filtered[0];
  const myMaps = workshopMaps.filter((m) => m.creator === profile.username);
  const subscriptions = workshopMaps.filter((m) => m.isSubscribed);

  const handleValidate = async () => {
    setServerValidated(false);
    setServerResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(uploadText);
    } catch {
      setValidationResult({
        valid: false,
        errors: ['Uploaded package is not valid JSON.'],
        warnings: [],
        packageSizeBytes: uploadText.length
      });
      return;
    }

    // 1. Client-side structural + security validation
    const local = validateWorkshopPackage(parsed);
    setValidationResult(local);

    if (!local.valid || !local.sanitizedMap) return;

    // 2. Server-side ruleset validation via the authoritative backend
    try {
      const res = await fetch(apiUrl('api/workshop/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local.sanitizedMap)
      });
      const data = await res.json();
      if (data.valid) {
        setServerValidated(true);
        setServerResult(`Server validation PASSED — ${data.packageSizeBytes} bytes accepted.`);
      } else {
        setServerResult(`Server rejected package: ${(data.errors || []).join('; ')}`);
      }
    } catch {
      setServerResult('Authoritative server unreachable — package validated locally only and NOT published to the global index.');
    }
  };

  const handlePublish = () => {
    if (!serverValidated || !validationResult?.valid || !validationResult.sanitizedMap) return;
    const map = validationResult.sanitizedMap;
    const result = publishWorkshopMap(map, uploadTitle || 'Initial community publication');
    appendConsoleLog(`[WORKSHOP] ${result.message}`);
    soundEngine.playUiSound('buy');
    setServerResult(result.message);
    setTab('MY_MAPS');
  };

  const handleExportMap = (map: GameMapDefinition) => {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.id}.vanguardmap.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        <Panel
          title="WORKSHOP"
          subtitle="Original community maps validated against a strict, script-free data format."
          actions={
            <Tabs
              tabs={[
                { id: 'BROWSE', label: 'Browse', badge: workshopMaps.length },
                { id: 'UPLOAD', label: 'Upload' },
                { id: 'MY_MAPS', label: 'My Maps', badge: myMaps.length },
                { id: 'SUBSCRIPTIONS', label: 'Subscriptions', badge: subscriptions.length },
                { id: 'RATINGS', label: 'Ratings' },
                { id: 'STATS', label: 'Statistics' }
              ]}
              active={tab}
              onChange={(id) => {
                soundEngine.playUiSound('click');
                setTab(id as WorkshopTab);
              }}
            />
          }
        >
          {tab === 'BROWSE' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search maps by title, creator, or description…"
                    className="w-full rounded border border-tac-border bg-tac-panel py-2 pl-9 pr-3 text-xs text-slate-100 outline-none focus:border-cyan-600"
                  />
                </div>
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="rounded border border-tac-border bg-tac-panel px-2.5 py-2 text-xs text-slate-100"
                >
                  {['All', 'Competitive', 'Premier', 'Wingman', 'Rush', 'Casual', 'Deathmatch', 'Retakes', 'Practice', 'Custom'].map((m) => (
                    <option key={m} value={m}>
                      {m === 'All' ? 'All Modes' : m}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="rounded border border-tac-border bg-tac-panel px-2.5 py-2 text-xs text-slate-100"
                >
                  <option value="popular">Most Popular</option>
                  <option value="newest">Newest</option>
                  <option value="rating">Highest Rated</option>
                  <option value="plays">Most Played</option>
                </select>
              </div>

              <div className="space-y-2">
                {filtered.length === 0 && (
                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-6 text-center text-xs text-slate-500">
                    No workshop maps match the current filters.
                  </div>
                )}
                {filtered.map((map) => (
                  <button
                    key={map.id}
                    onClick={() => {
                      soundEngine.playUiSound('hover');
                      setSelectedId(map.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                      selected?.id === map.id
                        ? 'border-cyan-500/70 bg-cyan-950/25'
                        : 'border-tac-border bg-tac-panel2/60 hover:border-slate-600'
                    }`}
                  >
                    <div
                      className="flex h-14 w-20 shrink-0 items-center justify-center rounded border border-slate-700 font-mono text-[9px] font-bold uppercase text-slate-400"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(6,182,212,0.22), rgba(15,23,42,0.95) 60%), repeating-linear-gradient(45deg, rgba(148,163,184,0.08) 0 6px, transparent 6px 12px)'
                      }}
                    >
                      {map.title.slice(0, 8)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-white">{map.title}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                          v{map.version}
                        </span>
                        {map.rating >= 4.8 && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                            TOP RATED
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        by <span className="font-semibold text-slate-300">{map.creator}</span> · updated {map.updatedAt}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {map.supportedModes.slice(0, 5).map((m) => (
                          <span key={m} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[9px] text-slate-400">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1 text-xs font-bold text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" />
                        {map.rating.toFixed(2)}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">{map.downloads.toLocaleString()} DL</div>
                      <div className="text-[10px] text-slate-500">{map.subscriptions.toLocaleString()} SUB</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'UPLOAD' && (
            <div className="space-y-3">
              <div className="rounded border border-cyan-800/50 bg-cyan-950/25 p-3 text-[11px] leading-relaxed text-cyan-200">
                <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
                <strong>Sandboxed format:</strong> Workshop packages are pure declarative JSON. No JavaScript, no
                shaders, no binary blobs, and no external network references are ever executed. Uploads are
                validated for package size, geometry bounds, object counts, material whitelisting, and prototype
                pollution patterns before acceptance.
              </div>

              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-300">
                  Map Title
                </label>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Titan Foundry Redux"
                  className="w-full rounded border border-tac-border bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-600"
                />
              </div>

              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-300">
                  Map Package (JSON)
                </label>
                <textarea
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  placeholder='{"name":"My Map","objects":[{"type":"floor","position":[0,0,0],"size":[40,1,40],...}]}'
                  className="h-40 w-full rounded border border-tac-border bg-slate-950 p-2.5 font-mono text-[10px] text-slate-200 outline-none focus:border-cyan-600"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => exportExampleTemplate(setUploadText)}>
                    <FileJson className="h-3 w-3" /> LOAD EXAMPLE TEMPLATE
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleValidate}>
                    <ShieldCheck className="h-3 w-3" /> VALIDATE PACKAGE
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={!serverValidated || !validationResult?.valid}
                    onClick={handlePublish}
                  >
                    <UploadCloud className="h-3 w-3" /> PUBLISH TO WORKSHOP
                  </Button>
                </div>
              </div>

              {validationResult && (
                <div
                  className={`rounded border p-3 ${
                    validationResult.valid
                      ? 'border-emerald-800/60 bg-emerald-950/25'
                      : 'border-red-800/60 bg-red-950/25'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {validationResult.valid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-300">VALIDATION PASSED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-400" />
                        <span className="text-red-300">VALIDATION FAILED</span>
                      </>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-slate-400">
                      {validationResult.packageSizeBytes.toLocaleString()} bytes
                    </span>
                  </div>
                  {validationResult.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] text-red-300">
                      {validationResult.errors.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  )}
                  {validationResult.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] text-amber-300">
                      {validationResult.warnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {serverResult && (
                <div className="rounded border border-cyan-800/60 bg-cyan-950/25 p-3 text-[11px] text-cyan-200">
                  {serverResult}
                </div>
              )}
            </div>
          )}

          {tab === 'MY_MAPS' && (
            <div className="space-y-2">
              {myMaps.length === 0 ? (
                <div className="rounded border border-tac-border bg-tac-panel2/60 p-6 text-center text-xs text-slate-500">
                  You have not published any maps yet. Use the Upload tab or the Map Editor to create one.
                </div>
              ) : (
                myMaps.map((map) => (
                  <div
                    key={map.id}
                    className="flex items-center gap-3 rounded-lg border border-tac-border bg-tac-panel2/60 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white">{map.title}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        v{map.version} · {map.downloads} downloads · ★ {map.rating.toFixed(2)} ({map.ratingCount})
                      </div>
                      <div className="mt-1 max-h-16 overflow-y-auto text-[10px] leading-snug text-slate-500">
                        {map.changelog.slice(0, 3).map((c, i) => (
                          <div key={i}>{c}</div>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => onTestMap(map.id)}>
                        TEST
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleExportMap(map.mapData)}>
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          deleteWorkshopMap(map.id);
                          appendConsoleLog(`[WORKSHOP] Deleted map ${map.id}`);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'SUBSCRIPTIONS' && (
            <div className="space-y-2">
              {subscriptions.length === 0 ? (
                <div className="rounded border border-tac-border bg-tac-panel2/60 p-6 text-center text-xs text-slate-500">
                  You are not subscribed to any workshop maps.
                </div>
              ) : (
                subscriptions.map((map) => (
                  <div key={map.id} className="flex items-center gap-3 rounded-lg border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white">{map.title}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">by {map.creator}</div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onTestMap(map.id)}>
                      PLAY
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSubscribeWorkshopMap(map.id)}
                    >
                      UNSUBSCRIBE
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'RATINGS' && (
            <div className="space-y-2">
              {workshopMaps.map((map) => (
                <div key={map.id} className="rounded-lg border border-tac-border bg-tac-panel2/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{map.title}</div>
                      <div className="text-[10px] text-slate-400">
                        ★ {map.rating.toFixed(2)} from {map.ratingCount.toLocaleString()} ratings
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => {
                            rateWorkshopMap(map.id, star);
                            soundEngine.playUiSound('click');
                          }}
                          className="text-amber-400 transition hover:scale-110"
                        >
                          <Star className={`h-4 w-4 ${star <= Math.round(map.rating) ? 'fill-amber-400' : ''}`} />
                        </button>
                      ))}
                      <button
                        onClick={() => toggleFavoriteWorkshopMap(map.id)}
                        className="ml-2 transition hover:scale-110"
                        title="Favorite"
                      >
                        <Heart className={`h-4 w-4 ${map.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-500'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'STATS' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <StatChip label="TOTAL MAPS" value={workshopMaps.length} accent="text-cyan-400" />
                <StatChip
                  label="TOTAL DOWNLOADS"
                  value={workshopMaps.reduce((a, m) => a + m.downloads, 0).toLocaleString()}
                  accent="text-emerald-400"
                />
                <StatChip
                  label="TOTAL SUBSCRIPTIONS"
                  value={workshopMaps.reduce((a, m) => a + m.subscriptions, 0).toLocaleString()}
                  accent="text-amber-400"
                />
                <StatChip
                  label="TOTAL PLAYS"
                  value={workshopMaps.reduce((a, m) => a + m.plays, 0).toLocaleString()}
                  accent="text-rose-400"
                />
              </div>

              <div className="overflow-hidden rounded border border-tac-border">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900/70 font-mono uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2">MAP</th>
                      <th className="px-3 py-2 text-right">RATING</th>
                      <th className="px-3 py-2 text-right">DOWNLOADS</th>
                      <th className="px-3 py-2 text-right">SUBS</th>
                      <th className="px-3 py-2 text-right">PLAYS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {workshopMaps.map((m) => (
                      <tr key={m.id} className="bg-slate-950/40">
                        <td className="px-3 py-2 font-semibold text-slate-200">{m.title}</td>
                        <td className="px-3 py-2 text-right text-amber-400">{m.rating.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{m.downloads.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{m.subscriptions.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{m.plays.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Detail sidebar */}
      <div className="space-y-3">
        {selected && (
          <>
            <Panel title="MAP DETAIL">
              <div
                className="mb-3 flex h-36 items-center justify-center rounded border border-slate-700 font-mono text-xs font-bold uppercase text-slate-300"
                style={{
                  background:
                    'linear-gradient(140deg, rgba(245,158,11,0.18), rgba(15,23,42,0.98) 55%), repeating-linear-gradient(90deg, rgba(6,182,212,0.12) 0 12px, transparent 12px 24px)'
                }}
              >
                {selected.title} — SECTOR VIEW
              </div>
              <h3 className="text-base font-black text-white">{selected.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{selected.description}</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatChip label="CREATOR" value={selected.creator} accent="text-cyan-400" />
                <StatChip label="VERSION" value={`v${selected.version}`} accent="text-white" />
                <StatChip label="RATING" value={`★ ${selected.rating.toFixed(2)}`} accent="text-amber-400" sub={`${selected.ratingCount} ratings`} />
                <StatChip label="UPDATED" value={selected.updatedAt} accent="text-slate-300" />
              </div>

              <div className="mt-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  SUPPORTED MODES
                </div>
                <div className="flex flex-wrap gap-1">
                  {selected.supportedModes.map((m) => (
                    <span key={m} className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  UPDATE HISTORY
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {selected.changelog.map((c, i) => (
                    <div key={i} className="rounded bg-slate-900/60 px-2 py-1.5 text-[10px] text-slate-400">
                      {c}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant={selected.isSubscribed ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => {
                    toggleSubscribeWorkshopMap(selected.id);
                    soundEngine.playUiSound('click');
                  }}
                >
                  <Users className="h-3 w-3" />
                  {selected.isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    toggleFavoriteWorkshopMap(selected.id);
                    soundEngine.playUiSound('click');
                  }}
                >
                  <Heart className={`h-3 w-3 ${selected.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                  FAVORITE
                </Button>
                <Button variant="success" size="sm" onClick={() => onTestMap(selected.id)}>
                  <BarChart3 className="h-3 w-3" /> PLAY NOW
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExportMap(selected.mapData)}>
                  <Download className="h-3 w-3" /> EXPORT
                </Button>
              </div>
            </Panel>

            <Panel title="PACKAGE SAFETY REPORT">
              <div className="space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Declarative geometry data only — no executable content
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  {selected.mapData.objects.length} objects within bounds (max 1500)
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Material whitelist enforced
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  SHA-256 package checksum recorded per version
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  Static analysis cannot prove intent. Community maps remain subject to moderator review and
                  player reports.
                </div>
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};

function exportExampleTemplate(setter: (s: string) => void) {
  const template: Partial<GameMapDefinition> = {
    id: 'ws_example_arena',
    name: 'Example Workshop Arena',
    subtitle: 'Generated starter template',
    author: 'Your Callsign',
    version: '1.0.0',
    description: 'A minimal valid workshop map template with spawns, geometry, and a bomb site.',
    supportedModes: ['Deathmatch', 'Practice', 'Custom'],
    ambientColor: '#64748b',
    skyColor: '#0b1322',
    fogColor: '#131f33',
    objects: [
      {
        id: 'floor_1',
        name: 'Ground',
        type: 'floor',
        position: [0, -0.5, 0],
        size: [60, 1, 60],
        color: '#1e2530',
        material: 'concrete',
        collidable: true,
        occluder: false,
        lodTier: 'always'
      },
      {
        id: 'wall_1',
        name: 'North Wall',
        type: 'wall',
        position: [0, 4, -30],
        size: [60, 8, 1.5],
        color: '#273244',
        material: 'concrete',
        collidable: true,
        occluder: true,
        lodTier: 'always'
      },
      {
        id: 'cover_1',
        name: 'Center Cover',
        type: 'cover',
        position: [0, 1, 0],
        size: [3, 2, 3],
        color: '#d97706',
        material: 'wood',
        collidable: true,
        occluder: false,
        lodTier: 'near'
      },
      {
        id: 'spawn_s',
        name: 'Sentinel Spawn',
        type: 'spawn_sentinel',
        position: [0, 0.1, -24],
        size: [10, 0.2, 6],
        color: '#06b6d4',
        material: 'energy',
        collidable: false,
        occluder: false,
        lodTier: 'always'
      },
      {
        id: 'spawn_v',
        name: 'Vortex Spawn',
        type: 'spawn_vortex',
        position: [0, 0.1, 24],
        size: [10, 0.2, 6],
        color: '#f59e0b',
        material: 'energy',
        collidable: false,
        occluder: false,
        lodTier: 'always'
      },
      {
        id: 'site_a',
        name: 'Bomb Site A',
        type: 'bomb_site_a',
        position: [-14, 0.15, 0],
        size: [10, 0.3, 10],
        color: '#ef4444',
        material: 'energy',
        collidable: false,
        occluder: false,
        lodTier: 'always'
      }
    ],
    portals: [],
    waypoints: [],
    callouts: [{ name: 'Center', position: [0, 0, 0], radius: 12 }]
  };
  setter(JSON.stringify(template, null, 2));
}
