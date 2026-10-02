import React, { useState } from 'react';
import {
  User,
  BarChart3,
  History,
  Award,
  Package,
  Crosshair,
  TrendingUp,
  Target,
  Skull,
  Handshake,
  Zap
} from 'lucide-react';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { OFFICIAL_MAPS } from '../../game/maps/officialMaps';
import { WEAPON_SPECS } from '../../shared/weapons';
import { Panel, StatChip, Tabs } from '../ui/primitives';
import { soundEngine } from '../../game/audio/soundEngine';

type ProfileTab = 'OVERVIEW' | 'STATS' | 'HISTORY' | 'MEDALS' | 'INVENTORY' | 'WEAPONS';

export const ProfilePanel: React.FC = () => {
  const { profile, matchHistory, inventory, equipSkin, workshopMaps } = useGamePlatformStore();
  const [tab, setTab] = useState<ProfileTab>('OVERVIEW');

  const kd = profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const hsPct = profile.kills > 0 ? ((profile.headshots / profile.kills) * 100).toFixed(1) : '0.0';
  const winRate = profile.wins + profile.losses > 0 ? ((profile.wins / (profile.wins + profile.losses)) * 100).toFixed(1) : '0.0';
  const avgAdr =
    matchHistory.length > 0 ? (matchHistory.reduce((a, m) => a + m.adr, 0) / matchHistory.length).toFixed(1) : '0.0';

  const achievements = [
    { name: 'First Blood Sovereign', desc: 'Win 100 opening duels as the entry fragger.', progress: Math.min(1, profile.entryKills / 100), unlocked: profile.entryKills >= 100 },
    { name: 'Clutch Protocol', desc: 'Win 50 clutch rounds.', progress: Math.min(1, profile.clutches / 50), unlocked: profile.clutches >= 50 },
    { name: 'Precision Doctrine', desc: 'Maintain a 50%+ career headshot rate over 1000 kills.', progress: Math.min(1, profile.kills / 1000), unlocked: profile.kills >= 1000 && Number(hsPct) >= 50 },
    { name: 'Utility Architect', desc: 'Deal 25,000 total utility damage.', progress: Math.min(1, profile.utilityDamage / 25000), unlocked: profile.utilityDamage >= 25000 },
    { name: 'Vanguard Veteran', desc: 'Accumulate 250 hours of playtime.', progress: Math.min(1, profile.playtimeHours / 250), unlocked: profile.playtimeHours >= 250 },
    { name: 'Premier Ascendant', desc: 'Reach a Premier Rating of 20,000 or higher.', progress: Math.min(1, profile.premierRating / 20000), unlocked: profile.premierRating >= 20000 }
  ];

  const rarityColors: Record<string, string> = {
    Standard: 'text-slate-400 border-slate-600',
    Tactical: 'text-sky-400 border-sky-600',
    SpecOps: 'text-cyan-400 border-cyan-600',
    Classified: 'text-fuchsia-400 border-fuchsia-600',
    Prototype: 'text-amber-400 border-amber-600',
    Apex: 'text-rose-400 border-rose-600'
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Panel>
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-cyan-600/60 text-2xl font-black text-cyan-300"
            style={{ background: 'linear-gradient(140deg, rgba(6,182,212,0.28), rgba(15,23,42,0.95))' }}
          >
            {profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-white">{profile.username}</h1>
              <span className="rounded border border-cyan-600/50 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                {profile.role}
              </span>
              <span className="rounded border border-amber-600/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                LEVEL {profile.level}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {profile.competitiveRank} · Premier Rating{' '}
              <span className="font-mono font-bold text-cyan-400">{profile.premierRating.toLocaleString()}</span>
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-600">
              CSGO PLAYER ID · {profile.id.slice(0, 8).toUpperCase()} · IMMUTABLE
            </div>
            <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                style={{ width: `${((profile.xp % 5000) / 5000) * 100}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {profile.xp.toLocaleString()} XP total · {5000 - (profile.xp % 5000)} XP to next level
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatChip label="K/D" value={kd} accent="text-emerald-400" />
            <StatChip label="HS%" value={`${hsPct}%`} accent="text-amber-400" />
            <StatChip label="WIN%" value={`${winRate}%`} accent="text-cyan-400" />
          </div>
        </div>
      </Panel>

      <Tabs
        tabs={[
          { id: 'OVERVIEW', label: 'Overview' },
          { id: 'STATS', label: 'Statistics' },
          { id: 'HISTORY', label: 'Match History', badge: matchHistory.length },
          { id: 'MEDALS', label: 'Medals' },
          { id: 'INVENTORY', label: 'Inventory', badge: inventory.length },
          { id: 'WEAPONS', label: 'Weapon Collection' }
        ]}
        active={tab}
        onChange={(id) => {
          soundEngine.playUiSound('click');
          setTab(id as ProfileTab);
        }}
      />

      {tab === 'OVERVIEW' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="CAREER HIGHLIGHTS">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <StatChip label="PLAYTIME" value={`${profile.playtimeHours}h`} accent="text-white" />
              <StatChip label="MATCHES" value={profile.wins + profile.losses} accent="text-white" />
              <StatChip label="WINS" value={profile.wins} accent="text-emerald-400" />
              <StatChip label="LOSSES" value={profile.losses} accent="text-red-400" />
              <StatChip label="TOTAL KILLS" value={profile.kills.toLocaleString()} accent="text-cyan-400" />
              <StatChip label="TOTAL DEATHS" value={profile.deaths.toLocaleString()} accent="text-slate-300" />
              <StatChip label="ASSISTS" value={profile.assists.toLocaleString()} accent="text-white" />
              <StatChip label="HEADSHOTS" value={profile.headshots.toLocaleString()} accent="text-amber-400" />
              <StatChip label="CLUTCHES WON" value={profile.clutches} accent="text-fuchsia-400" />
            </div>
          </Panel>

          <Panel title="FAVORITE MAPS">
            <div className="space-y-2">
              {Object.values(OFFICIAL_MAPS).slice(0, 4).map((map, idx) => {
                const plays = [412, 288, 194, 96][idx] || 0;
                const maxPlays = 412;
                return (
                  <div key={map.id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-200">{map.name}</span>
                      <span className="font-mono text-slate-400">{plays} matches</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-cyan-500" style={{ width: `${(plays / maxPlays) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'STATS' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="COMBAT PERFORMANCE">
            <div className="space-y-2.5">
              {[
                ['Average Damage Per Round (ADR)', avgAdr, 150],
                ['Headshot Percentage', hsPct, 100],
                ['Win Rate', winRate, 100],
                ['Entry Kill Rate', ((profile.entryKills / Math.max(1, profile.kills)) * 100).toFixed(1), 100],
                ['Clutch Conversion', ((profile.clutches / Math.max(1, profile.wins)) * 100).toFixed(1), 100]
              ].map(([label, value, max]) => (
                <div key={String(label)}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono font-bold text-cyan-400">{value}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                      style={{ width: `${Math.min(100, (Number(value) / Number(max)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="DAMAGE & UTILITY">
            <div className="grid grid-cols-2 gap-2">
              <StatChip label="TOTAL DAMAGE" value={profile.totalDamage.toLocaleString()} accent="text-cyan-400" />
              <StatChip label="UTILITY DAMAGE" value={profile.utilityDamage.toLocaleString()} accent="text-orange-400" />
              <StatChip
                label="UTILITY SHARE"
                value={`${((profile.utilityDamage / Math.max(1, profile.totalDamage)) * 100).toFixed(1)}%`}
                accent="text-amber-400"
              />
              <StatChip label="DAMAGE / KILL" value={Math.round(profile.totalDamage / Math.max(1, profile.kills))} accent="text-white" />
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                WEAPON ACCURACY BREAKDOWN
              </div>
              {Object.values(WEAPON_SPECS)
                .slice(0, 6)
                .map((w, i) => {
                  const shots = 4200 - i * 520;
                  const hits = Math.round(shots * (0.62 - i * 0.06));
                  return (
                    <div key={w.id}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-300">{w.name}</span>
                        <span className="font-mono text-slate-400">
                          {hits.toLocaleString()} / {shots.toLocaleString()} ({((hits / shots) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-cyan-500" style={{ width: `${(hits / shots) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'HISTORY' && (
        <Panel title="MATCH HISTORY" subtitle="Every result below was written by the authoritative server.">
          <div className="space-y-2">
            {matchHistory.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg border p-3 ${
                  m.result === 'VICTORY'
                    ? 'border-emerald-800/60 bg-emerald-950/15'
                    : m.result === 'DEFEAT'
                    ? 'border-red-800/60 bg-red-950/15'
                    : 'border-slate-700 bg-slate-900/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-black uppercase ${
                          m.result === 'VICTORY' ? 'text-emerald-400' : m.result === 'DEFEAT' ? 'text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {m.result}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {m.sentinelScore} — {m.vortexScore}
                      </span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                        {m.mode}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {m.mapName} · {m.date}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 font-mono text-[11px]">
                    <span className="text-white">
                      {m.kills}<span className="text-slate-500">/</span>{m.deaths}<span className="text-slate-500">/</span>{m.assists}
                    </span>
                    <span className="text-cyan-400">ADR {m.adr.toFixed(1)}</span>
                    <span className="text-amber-400">HS {m.hsPercent.toFixed(1)}%</span>
                    <span className="text-orange-400">UD {m.utilityDamage}</span>
                    <span className={m.ratingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {m.ratingDelta >= 0 ? '+' : ''}
                      {m.ratingDelta} PR
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {matchHistory.length === 0 && (
              <div className="rounded border border-tac-border bg-tac-panel2/60 p-6 text-center text-xs text-slate-500">
                No completed matches yet. Play a match to populate your history.
              </div>
            )}
          </div>
        </Panel>
      )}

      {tab === 'MEDALS' && (
        <Panel title="MEDALS & ACHIEVEMENTS">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {achievements.map((a) => (
              <div
                key={a.name}
                className={`rounded-lg border p-3 ${
                  a.unlocked ? 'border-amber-600/60 bg-amber-950/20' : 'border-tac-border bg-tac-panel2/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Award className={`h-6 w-6 shrink-0 ${a.unlocked ? 'text-amber-400' : 'text-slate-600'}`} />
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${a.unlocked ? 'text-amber-200' : 'text-slate-300'}`}>
                      {a.name}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-400">{a.desc}</div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full ${a.unlocked ? 'bg-amber-500' : 'bg-cyan-600'}`}
                        style={{ width: `${a.progress * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-slate-500">
                      {Math.round(a.progress * 100)}% {a.unlocked ? '· UNLOCKED' : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'INVENTORY' && (
        <Panel title="INVENTORY & WEAPON COLLECTION" subtitle="Skins are cosmetic only and never alter ballistics.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inventory.map((item) => (
              <div key={item.id} className={`rounded-lg border p-3 ${rarityColors[item.rarity]}`}>
                <div
                  className="mb-2 flex h-20 items-center justify-center rounded border border-slate-800"
                  style={{
                    background: `linear-gradient(135deg, ${item.accentColor}33, rgba(15,23,42,0.95) 70%)`
                  }}
                >
                  <div className="h-3 w-24 rounded-sm" style={{ background: `linear-gradient(90deg, ${item.accentColor}, rgba(148,163,184,0.25))` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider">{item.rarity}</span>
                  <span className="font-mono text-[9px] text-slate-500">FV {item.wearFloat.toFixed(6)}</span>
                </div>
                <div className="mt-1 text-sm font-bold text-white">{item.skinName}</div>
                <div className="text-[10px] text-slate-400">{item.weaponName}</div>
                {item.statTrackKills > 0 && (
                  <div className="mt-1 font-mono text-[10px] text-orange-400">
                    StatTrak™ {item.statTrackKills.toLocaleString()} kills
                  </div>
                )}
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => {
                      equipSkin(item.id, 'SENTINEL');
                      soundEngine.playUiSound('click');
                    }}
                    className={`flex-1 rounded border px-2 py-1 text-[10px] font-bold ${
                      item.equippedSentinel ? 'border-cyan-500/70 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {item.equippedSentinel ? 'SENTINEL ✓' : 'EQUIP SENTINEL'}
                  </button>
                  <button
                    onClick={() => {
                      equipSkin(item.id, 'VORTEX');
                      soundEngine.playUiSound('click');
                    }}
                    className={`flex-1 rounded border px-2 py-1 text-[10px] font-bold ${
                      item.equippedVortex ? 'border-amber-500/70 bg-amber-950/40 text-amber-300' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {item.equippedVortex ? 'VORTEX ✓' : 'EQUIP VORTEX'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'WEAPONS' && (
        <Panel title="COMPLETE ARSENAL — ORIGINAL VANGUARD ARMORY">
          <div className="space-y-5">
            {(['Pistols', 'SMGs', 'Shotguns', 'Rifles', 'Snipers', 'MachineGuns', 'Melee', 'Grenades'] as const).map((cat) => {
              const list = Object.values(WEAPON_SPECS).filter((w) => w.category === cat);
              if (list.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">{cat}</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((w) => (
                      <div key={w.id} className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] font-bold text-slate-500">{w.code}</span>
                          <span className="font-mono text-xs font-bold text-emerald-400">${w.price}</span>
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-white">{w.name}</div>
                        <div className="mt-1.5 flex h-8 items-center justify-center rounded bg-slate-950/70">
                          <div
                            className="h-2 w-3/4 rounded-sm"
                            style={{ background: `linear-gradient(90deg, ${w.accentColor}, rgba(148,163,184,0.25))` }}
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-slate-400">
                          <span>DMG {w.damage}{w.pellets ? `×${w.pellets}` : ''}</span>
                          <span className="text-right">RPM {w.fireRateRpm}</span>
                          <span>MAG {w.magazineSize}</span>
                          <span className="text-right">AP {Math.round(w.armorPenetration * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === 'OVERVIEW' && (
        <Panel title="WORKSHOP CREATIONS">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {workshopMaps.slice(0, 3).map((w) => (
              <div key={w.id} className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <div className="text-xs font-bold text-white">{w.title}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  ★ {w.rating.toFixed(2)} · {w.downloads.toLocaleString()} downloads
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
};
