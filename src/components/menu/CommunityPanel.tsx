import React, { useState } from 'react';
import { UserPlus, UserMinus, Users, Trophy, Clock, Flag, Crown, Check } from 'lucide-react';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { Panel, Button, StatChip, Tabs } from '../ui/primitives';
import { soundEngine } from '../../game/audio/soundEngine';

type CommunityTab = 'FRIENDS' | 'PARTY' | 'RECENT' | 'LEADERBOARDS';

export const CommunityPanel: React.FC = () => {
  const { friends, party, inviteFriendToParty, kickFromParty, togglePartyReady } = useGamePlatformStore();
  const [tab, setTab] = useState<CommunityTab>('FRIENDS');
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('Cheating / Invalid Movement');
  const [reportSent, setReportSent] = useState(false);

  const recentPlayers = [
    { id: 'r1', name: 'Blitz_Krieger', status: 'Online - Lobby' as const, premierRating: 17780, rank: 'Platinum Striker I', avatarColor: '#f97316' },
    { id: 'r2', name: 'Sable_Wolf', status: 'In Match' as const, premierRating: 20440, rank: 'Obsidian Elite', avatarColor: '#8b5cf6' },
    { id: 'r3', name: 'Torque_X', status: 'Offline' as const, premierRating: 15230, rank: 'Gold Vanguard III', avatarColor: '#22c55e' },
    { id: 'r4', name: 'Meridian_9', status: 'Online - Lobby' as const, premierRating: 19880, rank: 'Diamond Vanguard II', avatarColor: '#06b6d4' }
  ];

  const leaderboard = [
    { rank: 1, name: 'Apex_Sovereign', rating: 24180, wins: 312, hs: 61.2, region: 'EU' },
    { rank: 2, name: 'Vanguard_Prime', rating: 23790, wins: 298, hs: 58.9, region: 'NA' },
    { rank: 3, name: 'Obsidian_Edge', rating: 23410, wins: 287, hs: 60.4, region: 'EU' },
    { rank: 4, name: 'Zenith_Protocol', rating: 22980, wins: 265, hs: 57.1, region: 'Asia' },
    { rank: 5, name: 'Operative_Zero', rating: 21450, wins: 148, hs: 54.0, region: 'EU' },
    { rank: 6, name: 'Kestrel_VFX', rating: 18920, wins: 132, hs: 51.8, region: 'EU' },
    { rank: 7, name: 'Nexus_Aim', rating: 16400, wins: 118, hs: 49.2, region: 'EU' },
    { rank: 8, name: 'Valkyrie_99', rating: 20110, wins: 141, hs: 52.6, region: 'EU' }
  ].sort((a, b) => b.rating - a.rating).map((entry, i) => ({ ...entry, rank: i + 1 }));

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'FRIENDS', label: 'Friends', badge: friends.length },
          { id: 'PARTY', label: 'Party', badge: party.length },
          { id: 'RECENT', label: 'Recent Players', badge: recentPlayers.length },
          { id: 'LEADERBOARDS', label: 'Leaderboards' }
        ]}
        active={tab}
        onChange={(id) => {
          soundEngine.playUiSound('click');
          setTab(id as CommunityTab);
        }}
      />

      {tab === 'FRIENDS' && (
        <Panel title="FRIEND LIST">
          <div className="space-y-2">
            {friends.map((f) => {
              const inParty = party.some((p) => p.name === f.name);
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-tac-border bg-tac-panel2/60 p-3"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded font-black text-white"
                    style={{ backgroundColor: f.avatarColor }}
                  >
                    {f.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{f.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          f.status === 'Offline'
                            ? 'bg-slate-800 text-slate-500'
                            : f.status === 'In Match'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {f.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {f.rank} · PR {f.premierRating.toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant={inParty ? 'secondary' : 'primary'}
                    size="sm"
                    disabled={inParty || f.status === 'Offline' || party.length >= 5}
                    onClick={() => {
                      inviteFriendToParty(f.id);
                      soundEngine.playUiSound('click');
                    }}
                  >
                    <UserPlus className="h-3 w-3" />
                    {inParty ? 'IN PARTY' : 'INVITE'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReportTarget(f.name);
                      setReportSent(false);
                    }}
                  >
                    <Flag className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === 'PARTY' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel title="PARTY LOBBY" subtitle={`${party.length} / 5 members · up to 5 for Competitive and Premier`}>
            <div className="space-y-2">
              {party.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-tac-border bg-tac-panel2/60 p-3"
                >
                  {member.isLeader && <Crown className="h-4 w-4 shrink-0 text-amber-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white">{member.name}</div>
                    <div className="text-[10px] text-slate-400">
                      PR {member.premierRating.toLocaleString()} · {member.ping}ms
                    </div>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                      member.ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {member.ready ? 'READY' : 'NOT READY'}
                  </span>
                  {!member.isLeader && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        kickFromParty(member.id);
                        soundEngine.playUiSound('click');
                      }}
                    >
                      <UserMinus className="h-3 w-3" /> KICK
                    </Button>
                  )}
                </div>
              ))}
              {party.length === 1 && (
                <div className="rounded border border-tac-border bg-tac-panel2/50 p-4 text-center text-[11px] text-slate-500">
                  Invite friends from the Friends tab to fill your party. Matchmaking will use the highest
                  Premier Rating in the party for expanded skill search.
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => { togglePartyReady(); soundEngine.playUiSound('click'); }}>
                <Check className="h-3 w-3" /> TOGGLE READY
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { soundEngine.playUiSound('click'); }}>
                <Users className="h-3 w-3" /> COPY INVITE LINK
              </Button>
            </div>
          </Panel>

          <Panel title="SOLO / PARTY MATCHMAKING RULES">
            <div className="space-y-2 text-[11px] leading-relaxed text-slate-400">
              <div className="rounded border border-tac-border bg-slate-900/50 p-2.5">
                <strong className="text-slate-300">Party size gating:</strong> Competitive and Premier allow 1–5.
                Wingman allows 1–2. Parties larger than the mode's team size cannot queue.
              </div>
              <div className="rounded border border-tac-border bg-slate-900/50 p-2.5">
                <strong className="text-slate-300">Skill search:</strong> The matchmaker uses the party's highest
                Premier Rating as the anchor, then expands its search window over time.
              </div>
              <div className="rounded border border-tac-border bg-slate-900/50 p-2.5">
                <strong className="text-slate-300">Region:</strong> The party leader's region preference applies.
                The matchmaker additionally validates that the selected region is under everyone's ping cap.
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'RECENT' && (
        <Panel title="RECENT PLAYERS">
          <div className="space-y-2">
            {recentPlayers.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-tac-border bg-tac-panel2/60 p-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded font-black text-white"
                  style={{ backgroundColor: p.avatarColor }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white">{p.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {p.rank} · PR {p.premierRating.toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    soundEngine.playUiSound('click');
                  }}
                  disabled={p.status === 'Offline'}
                >
                  <UserPlus className="h-3 w-3" /> ADD
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setReportTarget(p.name)}>
                  <Flag className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'LEADERBOARDS' && (
        <Panel title="GLOBAL PREMIER LEADERBOARD" subtitle="Season 4 · server-verified ratings only">
          <div className="overflow-hidden rounded border border-tac-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 font-mono uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">OPERATIVE</th>
                  <th className="px-3 py-2">REGION</th>
                  <th className="px-3 py-2 text-right">PREMIER RATING</th>
                  <th className="px-3 py-2 text-right">WINS</th>
                  <th className="px-3 py-2 text-right">HS%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leaderboard.map((row) => (
                  <tr
                    key={row.name}
                    className={row.name === 'Operative_Zero' ? 'bg-cyan-950/25 text-cyan-200' : 'bg-slate-950/40 text-slate-200'}
                  >
                    <td className="px-3 py-2 font-mono font-bold">
                      {row.rank <= 3 ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Trophy className="h-3.5 w-3.5" />
                          {row.rank}
                        </span>
                      ) : (
                        row.rank
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.region}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-cyan-400">
                      {row.rating.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">{row.wins}</td>
                    <td className="px-3 py-2 text-right text-amber-400">{row.hs}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Clock className="h-3 w-3" /> Leaderboard refreshes hourly from the statistics service.
          </div>
        </Panel>
      )}

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-lg border border-tac-border bg-tac-panel p-5">
            <h3 className="text-sm font-black uppercase tracking-wide text-white">
              Report {reportTarget}
            </h3>
            {reportSent ? (
              <div className="mt-3 rounded border border-emerald-800/60 bg-emerald-950/30 p-3 text-[11px] text-emerald-200">
                Report submitted to the moderation service. Reports are queued for the Moderator role and
                reviewed alongside server-side telemetry evidence.
              </div>
            ) : (
              <>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="mt-3 w-full rounded border border-tac-border bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
                >
                  {[
                    'Cheating / Invalid Movement',
                    'Suspicious Aim Behaviour',
                    'Abusive Voice / Chat',
                    'Griefing / Team Killing',
                    'Inappropriate Profile Content',
                    'Boosting / Match Manipulation'
                  ].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Reports are attributable and rate-limited server-side. False mass-reporting is itself a
                  punishable offence.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReportTarget(null);
                  setReportSent(false);
                }}
              >
                CLOSE
              </Button>
              {!reportSent && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setReportSent(true);
                    soundEngine.playUiSound('click');
                  }}
                >
                  <Flag className="h-3 w-3" /> SUBMIT REPORT
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'FRIENDS' && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatChip label="ONLINE FRIENDS" value={friends.filter((f) => f.status !== 'Offline').length} accent="text-emerald-400" />
          <StatChip label="IN MATCH" value={friends.filter((f) => f.status === 'In Match').length} accent="text-amber-400" />
          <StatChip label="PARTY SIZE" value={`${party.length}/5`} accent="text-cyan-400" />
          <StatChip label="RECENT PLAYERS" value={recentPlayers.length} accent="text-white" />
        </div>
      )}
    </div>
  );
};
