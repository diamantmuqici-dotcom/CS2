import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  BrainCircuit,
  Users,
  Copy,
  Check,
  ExternalLink,
  AlertOctagon,
  Send,
  Gavel,
  Unlock,
  TimerOff
} from 'lucide-react';
import {
  useVacNetStore,
  OFFICIAL_DISCORD_INVITE_URL,
  OFFICIAL_DISCORD_WEBHOOK_URL,
  formatRemainingCooldown,
  isAccountCurrentlyBanned,
  dispatchVacNetWebhook
} from '../../shared/vacnet';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { Panel, Button, StatChip } from '../ui/primitives';
import { soundEngine } from '../../game/audio/soundEngine';

export const VacNetPanel: React.FC = () => {
  const {
    currentAccount,
    knownAccounts,
    activeHwidIpLock,
    learning,
    webhookLogs,
    triggerVacLiveBan,
    switchOrCreateAccount,
    verifyPlayerCheatingPermanent,
    verifyPlayerNotCheatingUnban,
    checkAndProcessCooldownTimeout
  } = useVacNetStore();

  const appendConsoleLog = useGamePlatformStore((s) => s.appendConsoleLog);

  const [newAccInput, setNewAccInput] = useState('');
  const [customBanReason, setCustomBanReason] = useState('VacNet 3.0 Irregular Gameplay — Sub-Tick Aimbot & Angular Snap');
  const [copiedTicket, setCopiedTicket] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Live 1-second timer tick that also checks if the 24-hour VAC Live cooldown expired without admin verification
  useEffect(() => {
    const id = window.setInterval(() => {
      const autoUnbanned = checkAndProcessCooldownTimeout(false);
      if (autoUnbanned) {
        setStatusBanner(
          '24-Hour VAC Live Cooldown expired without admin verification in time — IMMEDIATELY UNBANNED, but still flagged as SUSPICIOUS in Discord Webhook!'
        );
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [checkAndProcessCooldownTimeout]);

  const isBanned = isAccountCurrentlyBanned(currentAccount);

  const ticketTemplate = [
    `**CS2 VACNET / VAC LIVE BAN APPEAL TICKET**`,
    `**Discord Server:** ${OFFICIAL_DISCORD_INVITE_URL}`,
    `**Account Name:** ${currentAccount.accountName}`,
    `**SteamID:** ${currentAccount.steamId}`,
    `**UniqueID:** ${currentAccount.uniqueId}`,
    `**HWID:** ${currentAccount.hwid}`,
    `**IP Address:** ${currentAccount.ipAddress}`,
    `**Account Created Date:** ${currentAccount.accountCreatedAt}`,
    `**Ban Status:** ${currentAccount.banStatus}`,
    `**Ban Reason:** ${currentAccount.banReason || 'None (Clean / Inquiry)'}`,
    `**VacNet Case ID:** ${currentAccount.caseId || 'N/A'}`
  ].join('\n');

  const handleCopyTicket = () => {
    navigator.clipboard?.writeText(ticketTemplate);
    setCopiedTicket(true);
    soundEngine.playUiSound('click');
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  const handleSwitchAccount = (targetName: string) => {
    if (!targetName.trim()) return;
    const res = switchOrCreateAccount(targetName.trim());
    useGamePlatformStore.setState((s) => ({
      profile: {
        ...s.profile,
        username: res.account.accountName
      }
    }));
    soundEngine.playUiSound(res.autoBannedByHwidIp ? 'error' : 'click');
    if (res.autoBannedByHwidIp) {
      const msg = `[VACNET HWID/IP ENFORCEMENT] Switched to account "${res.account.accountName}" (${res.account.steamId}) on locked HWID (${res.account.hwid}) / IP (${res.account.ipAddress}) → IMMEDIATELY VAC BANNED!`;
      setStatusBanner(msg);
      appendConsoleLog(msg);
    } else {
      setStatusBanner(`Switched active account to "${res.account.accountName}" (${res.account.steamId}).`);
    }
    setNewAccInput('');
  };

  return (
    <div className="space-y-4 font-bold">
      {/* Top VAC Live Status Banner */}
      <div
        className={`rounded-lg border-2 p-5 shadow-2xl ${
          currentAccount.banStatus === 'PERMANENT_VAC_BAN'
            ? 'border-red-600 bg-red-950/75 text-red-100'
            : currentAccount.banStatus === 'VAC_LIVE_COOLDOWN_24H'
            ? 'border-amber-500 bg-red-950/60 text-amber-100'
            : currentAccount.banStatus === 'UNBANNED_TIMEOUT_SUSPICIOUS'
            ? 'border-yellow-500 bg-yellow-950/50 text-yellow-100'
            : 'border-emerald-600/70 bg-emerald-950/35 text-emerald-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {isBanned ? (
              <ShieldAlert className="h-10 w-10 shrink-0 text-red-400 animate-pulse" />
            ) : (
              <ShieldCheck className="h-10 w-10 shrink-0 text-emerald-400" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.22em]">
                <span>VACNET 3.0 // VAC LIVE ANTI-CHEAT AUTHORITY</span>
                <span className="rounded bg-black/50 px-2 py-0.5 font-mono text-[10px]">
                  {learning.modelVersion} · GEN #{learning.learningGeneration}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-black uppercase tracking-wide text-white">
                {currentAccount.banStatus === 'PERMANENT_VAC_BAN'
                  ? '⛔ PERMANENT VAC BAN — VERIFIED CHEATING (HWID + IP BLACKLISTED)'
                  : currentAccount.banStatus === 'VAC_LIVE_COOLDOWN_24H'
                  ? `⛔ 1-DAY VAC LIVE COOLDOWN ACTIVE — CANNOT PLAY FOR 24 HOURS (${formatRemainingCooldown(
                      currentAccount.cooldownExpiresAtMs
                    )} REMAINING)`
                  : currentAccount.banStatus === 'UNBANNED_TIMEOUT_SUSPICIOUS'
                  ? '⚠️ IMMEDIATELY UNBANNED (24H ADMIN TIMEOUT) — FLAGGED [SUSPICIOUS] IN DISCORD WEBHOOK'
                  : '✓ VACNET STATUS: TRUSTED & CLEAN — HARDWARE ID & IP VERIFIED'}
              </h2>
              {currentAccount.banReason && (
                <div className="mt-1 text-xs font-extrabold text-red-200">
                  REASON: {currentAccount.banReason}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={OFFICIAL_DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border-2 border-indigo-400 bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-indigo-500"
            >
              <ExternalLink className="h-4 w-4" />
              JOIN DISCORD & OPEN APPEAL TICKET
            </a>
            <button
              onClick={handleCopyTicket}
              className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-black/70"
            >
              {copiedTicket ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copiedTicket ? 'COPIED STEAMID & TICKET!' : 'COPY STEAMID / UNIQUEID FOR TICKET'}
            </button>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div className="rounded border-2 border-amber-500/80 bg-amber-950/60 px-4 py-3 text-xs font-black text-amber-200">
          {statusBanner}
        </div>
      )}

      {/* Account Identity + Hardware & IP Fingerprint + Discord Ticket Appeal */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="ACCOUNT, STEAMID / UNIQUEID, HWID & IP IDENTITY"
          subtitle="Hardware ID and IP Address persist across all accounts on this PC. Switching accounts while under a 1-Day VAC Live Cooldown immediately VAC-bans the other account."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatChip label="ACCOUNT NAME" value={currentAccount.accountName} accent="text-white" />
            <StatChip label="ACCOUNT CREATED" value={currentAccount.accountCreatedAt} accent="text-amber-300" />
            <StatChip label="STEAM ID" value={currentAccount.steamId} accent="text-cyan-300" />
            <StatChip label="UNIQUE ID" value={currentAccount.uniqueId} accent="text-emerald-300" />
            <StatChip
              label="HWID (HARDWARE ID)"
              value={currentAccount.hwid}
              accent="text-rose-400"
              sub="Bound to physical machine"
            />
            <StatChip
              label="IP ADDRESS"
              value={currentAccount.ipAddress}
              accent="text-purple-300"
              sub="Network endpoint logged"
            />
          </div>

          {/* Account Switcher to test / enforce immediate alt-account VAC ban */}
          <div className="mt-4 rounded-lg border border-tac-border bg-black/40 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400">
                <Users className="h-4 w-4" /> ACCOUNT SWITCHER (HWID + IP EVASION GUARD)
              </span>
              <span className="font-mono text-[10px] font-bold text-slate-400">
                {knownAccounts.length} ACCOUNTS ON THIS HWID/IP
              </span>
            </div>
            <p className="mb-2.5 text-[11px] font-bold text-slate-300">
              If you have an active 1-Day VAC Live ban (or Permanent ban) and switch to another account, VacNet
              immediately detects your matching HWID (<span className="font-mono text-rose-300">{currentAccount.hwid}</span>) &
              IP (<span className="font-mono text-purple-300">{currentAccount.ipAddress}</span>) and VAC-bans the other
              account until an admin verifies you!
            </p>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {knownAccounts.map((acc) => {
                const active = acc.accountName === currentAccount.accountName;
                const accBanned = isAccountCurrentlyBanned(acc);
                return (
                  <button
                    key={acc.accountId}
                    onClick={() => handleSwitchAccount(acc.accountName)}
                    className={`rounded border px-2.5 py-1.5 text-xs font-black transition ${
                      active
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : accBanned
                        ? 'border-red-700 bg-red-950/50 text-red-300'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500'
                    }`}
                  >
                    {acc.accountName} ({acc.steamId}){' '}
                    {acc.banStatus === 'PERMANENT_VAC_BAN'
                      ? '· [PERM VAC]'
                      : acc.banStatus === 'VAC_LIVE_COOLDOWN_24H'
                      ? '· [1D VAC LIVE]'
                      : acc.suspiciousFlag
                      ? '· [SUSPICIOUS]'
                      : '· [CLEAN]'}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAccInput}
                onChange={(e) => setNewAccInput(e.target.value)}
                placeholder="Enter another account name to switch / test alt ban..."
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-amber-500"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSwitchAccount(newAccInput || `Alt_Account_${Math.floor(Math.random() * 900 + 100)}`)}
              >
                SWITCH / CREATE ALT ACCOUNT
              </Button>
            </div>
          </div>
        </Panel>

        {/* Discord Appeal Ticket & Verification Controls */}
        <Panel
          title="DISCORD BAN APPEAL TICKET & ADMIN VERIFICATION SYSTEM"
          subtitle={`Official Discord Server: ${OFFICIAL_DISCORD_INVITE_URL}`}
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-indigo-500/50 bg-indigo-950/30 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
                  HOW TO APPEAL YOUR 1-DAY VAC LIVE COOLDOWN
                </span>
                <a
                  href={OFFICIAL_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs font-black text-indigo-300 underline hover:text-white"
                >
                  {OFFICIAL_DISCORD_INVITE_URL}
                </a>
              </div>
              <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-slate-200">
                1. Click <strong>Join Discord & Open Appeal Ticket</strong> ({OFFICIAL_DISCORD_INVITE_URL}).
                <br />
                2. Paste your <strong>SteamID ({currentAccount.steamId})</strong> and <strong>UniqueID ({currentAccount.uniqueId})</strong> in your ticket.
                <br />
                3. <strong>If we verify you are cheating:</strong> Your ban becomes <strong>PERMANENT</strong> on all accounts, HWID, and IP.
                <br />
                4. <strong>If we verify you are NOT cheating:</strong> You are <strong>IMMEDIATELY UNBANNED</strong> across your account, HWID, and IP.
                <br />
                5. <strong>If we don't come in time (24h expires):</strong> You are <strong>IMMEDIATELY UNBANNED</strong> automatically so you can play, but our Discord Webhook still marks your account as <strong>SUSPICIOUS</strong>!
              </p>
              <pre className="mt-2.5 overflow-x-auto rounded border border-slate-800 bg-black/70 p-2.5 font-mono text-[10px] font-bold text-slate-200">
                {ticketTemplate}
              </pre>
            </div>

            {/* Admin / Verification Workflow Controls */}
            <div className="rounded-lg border border-tac-border bg-tac-panel2/80 p-3.5">
              <div className="mb-2 text-xs font-black uppercase tracking-wider text-amber-400">
                VAC LIVE VERIFICATION & ENFORCEMENT CONTROLS
              </div>
              <div className="mb-2.5 flex gap-2">
                <input
                  type="text"
                  value={customBanReason}
                  onChange={(e) => setCustomBanReason(e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
                  placeholder="Ban reason..."
                />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    triggerVacLiveBan({
                      reason: customBanReason,
                      patternType: 'AIMBOT_ANGULAR_SNAP',
                      inMatch: false
                    });
                    soundEngine.playUiSound('error');
                    setStatusBanner(
                      `1-Day VAC Live Cooldown issued to ${currentAccount.accountName} (HWID: ${currentAccount.hwid}, IP: ${currentAccount.ipAddress}). Sent bold report to Discord Webhook!`
                    );
                  }}
                >
                  <AlertOctagon className="h-3.5 w-3.5" />
                  TRIGGER 1-DAY VAC LIVE BAN + WEBHOOK
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => {
                    verifyPlayerCheatingPermanent();
                    soundEngine.playUiSound('error');
                    setStatusBanner(
                      'VERIFIED CHEATING → Upgraded to PERMANENT VAC BAN on Account, HWID, and IP! Webhook notified.'
                    );
                  }}
                  className="flex items-center justify-center gap-1.5 rounded border-2 border-red-600 bg-red-950/70 px-3 py-2.5 text-[11px] font-black uppercase text-red-200 transition hover:bg-red-900"
                >
                  <Gavel className="h-4 w-4" />
                  1. VERIFY CHEATING (PERMANENT BAN)
                </button>

                <button
                  onClick={() => {
                    verifyPlayerNotCheatingUnban();
                    soundEngine.playUiSound('buy');
                    setStatusBanner(
                      'VERIFIED NOT CHEATING → IMMEDIATELY UNBANNED Account, HWID & IP! Webhook notified.'
                    );
                  }}
                  className="flex items-center justify-center gap-1.5 rounded border-2 border-emerald-600 bg-emerald-950/70 px-3 py-2.5 text-[11px] font-black uppercase text-emerald-200 transition hover:bg-emerald-900"
                >
                  <Unlock className="h-4 w-4" />
                  2. VERIFY LEGIT (IMMEDIATE UNBAN)
                </button>

                <button
                  onClick={() => {
                    // Ensure there's a 24h cooldown first if none active so the user can test timeout any time
                    if (currentAccount.banStatus !== 'VAC_LIVE_COOLDOWN_24H') {
                      triggerVacLiveBan({
                        reason: customBanReason,
                        patternType: 'AIMBOT_ANGULAR_SNAP',
                        inMatch: false
                      });
                    }
                    checkAndProcessCooldownTimeout(true);
                    soundEngine.playUiSound('click');
                    setStatusBanner(
                      'ADMIN DID NOT COME IN TIME (24H TIMEOUT) → IMMEDIATELY UNBANNED, but Webhook still reports [SUSPICIOUS]!'
                    );
                  }}
                  className="flex items-center justify-center gap-1.5 rounded border-2 border-yellow-500 bg-yellow-950/70 px-3 py-2.5 text-[11px] font-black uppercase text-yellow-200 transition hover:bg-yellow-900"
                >
                  <TimerOff className="h-4 w-4" />
                  3. NO VERIFY IN TIME (UNBAN + SUSPICIOUS)
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* VacNet 3.0 Neural Self-Learning Telemetry */}
      <Panel
        title="VACNET 3.0 SELF-LEARNING NEURAL ANTI-CHEAT ENGINE"
        subtitle="VacNet learns from every ban — dynamically tightening angular snap, sub-tick cadence, and movement anomaly weights."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <StatChip label="MODEL GENERATION" value={`Gen #${learning.learningGeneration}`} accent="text-cyan-300" />
          <StatChip label="BANS LEARNED" value={learning.totalBansAnalyzed.toLocaleString()} accent="text-emerald-300" />
          <StatChip
            label="AIM SNAP THRESHOLD"
            value={`${learning.aimSnapThresholdDegPerTick}°/tick`}
            accent="text-amber-300"
            sub="Tightens per aimbot ban"
          />
          <StatChip
            label="MIN REACTION FLOOR"
            value={`${learning.minReactionTimeMs} ms`}
            accent="text-rose-300"
            sub="Triggerbot detector"
          />
          <StatChip
            label="CADENCE TOLERANCE"
            value={`${Math.round(learning.fireIntervalToleranceRatio * 100)}%`}
            accent="text-purple-300"
            sub="Sub-tick rapid fire"
          />
          <StatChip
            label="CONFIDENCE MULT"
            value={`${learning.detectionConfidenceMultiplier.toFixed(2)}x`}
            accent="text-white"
            sub="Neural weight boost"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['AIMBOT_ANGULAR_SNAP', 'Simulate Aimbot Snap Detection (180° Sub-Tick Flick)'],
              ['SPINBOT_YAW_OVERFLOW', 'Simulate Spinbot Detection (Continuous 360° Yaw Spin)'],
              ['RAPID_FIRE_SUBTICK_ABUSE', 'Simulate Rapid-Fire Abuse (0ms Sub-Tick Double Shot)'],
              ['SPEEDHACK_MOVEMENT_BUDGET', 'Simulate Speedhack / Teleport Violation'],
              ['WALLHACK_THROUGH_SMOKE_LOCK', 'Simulate Wallhack / Smoke Tracking Lock']
            ] as const
          ).map(([pattern, label]) => (
            <button
              key={pattern}
              onClick={() => {
                triggerVacLiveBan({
                  reason: `VacNet 3.0 Neural Detection: ${label}`,
                  patternType: pattern,
                  inMatch: false
                });
                soundEngine.playUiSound('error');
              }}
              className="rounded border border-red-700/70 bg-red-950/40 px-3 py-1.5 text-[11px] font-black text-red-200 transition hover:bg-red-900/60"
            >
              <BrainCircuit className="mr-1.5 inline h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto rounded border border-tac-border">
          <table className="w-full text-left text-xs font-bold">
            <thead className="bg-slate-900/90 font-mono text-[10px] uppercase text-slate-300">
              <tr>
                <th className="px-3 py-2">PATTERN LEARNED</th>
                <th className="px-3 py-2">DETECTED ACCOUNT</th>
                <th className="px-3 py-2">HWID</th>
                <th className="px-3 py-2">IP ADDRESS</th>
                <th className="px-3 py-2">CONFIDENCE</th>
                <th className="px-3 py-2">TIMESTAMP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/60">
              {learning.learnedSignatures.slice(0, 8).map((sig) => (
                <tr key={sig.id}>
                  <td className="px-3 py-2 font-mono text-amber-300">{sig.patternType}</td>
                  <td className="px-3 py-2 text-white">{sig.detectedAccount}</td>
                  <td className="px-3 py-2 font-mono text-rose-300">{sig.hwid}</td>
                  <td className="px-3 py-2 font-mono text-purple-300">{sig.ipAddress}</td>
                  <td className="px-3 py-2 font-mono text-emerald-300">{sig.confidence.toFixed(1)}%</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{sig.learnedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Discord Webhook Live Feed */}
      <Panel
        title="DISCORD WEBHOOK ENFORCEMENT LOG"
        subtitle={`Target Webhook: ${OFFICIAL_DISCORD_WEBHOOK_URL.slice(0, 68)}... (Shows IP, HWID, Account Name, Creation Date, Ban Reason & Suspicious Status in BOLD)`}
      >
        <div className="space-y-2.5">
          {webhookLogs.length === 0 ? (
            <div className="rounded border border-tac-border bg-black/40 p-4 text-center text-xs font-bold text-slate-400">
              No webhook dispatches in this session yet. Click "TRIGGER 1-DAY VAC LIVE BAN + WEBHOOK" above to send a
              live bold ban report to your Discord webhook!
            </div>
          ) : (
            webhookLogs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className={`rounded-lg border p-3.5 ${
                  log.statusLabel.includes('UNBANNED (TIMEOUT)')
                    ? 'border-yellow-500/70 bg-yellow-950/30'
                    : log.suspicious
                    ? 'border-red-600/70 bg-red-950/30'
                    : 'border-emerald-600/70 bg-emerald-950/25'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] font-black text-amber-300">
                      {log.eventTitle}
                    </span>
                    <span className="text-xs font-black text-white">{log.statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{log.timestamp}</span>
                    <button
                      onClick={() => {
                        void dispatchVacNetWebhook(log.formattedMessage);
                        setStatusBanner('Re-dispatched bold payload to Discord Webhook!');
                      }}
                      className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-black text-slate-200 hover:border-amber-400"
                    >
                      <Send className="h-3 w-3" /> RESEND TO WEBHOOK
                    </button>
                  </div>
                </div>
                <pre className="mt-2 whitespace-pre-wrap rounded border border-slate-800/90 bg-black/75 p-3 font-mono text-[11px] font-bold leading-relaxed text-slate-100">
                  {log.formattedMessage}
                </pre>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
};
