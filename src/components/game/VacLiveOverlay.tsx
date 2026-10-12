import React, { useEffect, useState } from 'react';
import { ShieldAlert, ExternalLink, Copy, Check, Gavel, Unlock, TimerOff, Users } from 'lucide-react';
import {
  useVacNetStore,
  OFFICIAL_DISCORD_INVITE_URL,
  formatRemainingCooldown,
  isAccountCurrentlyBanned
} from '../../shared/vacnet';

export const VacLiveOverlay: React.FC<{
  onReturnToMenu?: () => void;
  onOpenVacNetTab?: () => void;
}> = ({ onReturnToMenu, onOpenVacNetTab }) => {
  const {
    currentAccount,
    knownAccounts,
    vacLiveMatchCancelledOverlay,
    switchOrCreateAccount,
    verifyPlayerCheatingPermanent,
    verifyPlayerNotCheatingUnban,
    checkAndProcessCooldownTimeout,
    dismissMatchCancelledOverlay
  } = useVacNetStore();

  const [copied, setCopied] = useState(false);
  const [altName, setAltName] = useState('');
  const [altAlert, setAltAlert] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      checkAndProcessCooldownTimeout(false);
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [checkAndProcessCooldownTimeout]);

  const isBanned = isAccountCurrentlyBanned(currentAccount);
  if (!isBanned && !vacLiveMatchCancelledOverlay?.active) return null;

  const ticketDetails = [
    `**CS2 VACNET 3.0 // VAC LIVE BAN APPEAL TICKET**`,
    `**Discord Server:** ${OFFICIAL_DISCORD_INVITE_URL}`,
    `**Account Name:** ${currentAccount.accountName}`,
    `**SteamID:** ${currentAccount.steamId}`,
    `**UniqueID:** ${currentAccount.uniqueId}`,
    `**HWID:** ${currentAccount.hwid}`,
    `**IP Address:** ${currentAccount.ipAddress}`,
    `**Account Created Date:** ${currentAccount.accountCreatedAt}`,
    `**Ban Reason:** ${currentAccount.banReason || vacLiveMatchCancelledOverlay?.reason || 'Irregular Gameplay Detected by VacNet'}`,
    `**Case ID:** ${currentAccount.caseId || vacLiveMatchCancelledOverlay?.caseId || 'VACLIVE'}`
  ].join('\n');

  const copyTicket = () => {
    navigator.clipboard?.writeText(ticketDetails);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/92 p-4 backdrop-blur-md font-bold">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border-2 border-red-600 bg-[#140708] text-white shadow-[0_0_90px_rgba(220,38,38,0.55)]">
        {/* Authentic CS2 VAC Live Red Header */}
        <div className="border-b-2 border-red-600 bg-gradient-to-r from-red-950 via-red-800 to-red-950 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <ShieldAlert className="h-11 w-11 shrink-0 text-red-200 animate-pulse" />
              <div>
                <div className="font-mono text-xs font-black uppercase tracking-[0.3em] text-red-200">
                  VACNET 3.0 // VAC LIVE ANTI-CHEAT SYSTEM
                </div>
                <h1 className="text-2xl font-black uppercase tracking-wider text-white sm:text-3xl">
                  {currentAccount.banStatus === 'PERMANENT_VAC_BAN'
                    ? 'PERMANENT VAC BAN — CHEATING VERIFIED'
                    : 'MATCH CANCELLED — 1-DAY VAC LIVE COOLDOWN'}
                </h1>
              </div>
            </div>
            {currentAccount.banStatus === 'VAC_LIVE_COOLDOWN_24H' && (
              <div className="rounded-lg border-2 border-red-400 bg-black/70 px-4 py-2 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-red-300">
                  1-DAY COOLDOWN REMAINING
                </div>
                <div className="font-mono text-xl font-black text-amber-300">
                  {formatRemainingCooldown(currentAccount.cooldownExpiresAtMs)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-6 space-y-4">
          <p className="text-sm font-extrabold leading-relaxed text-red-100">
            {currentAccount.banStatus === 'PERMANENT_VAC_BAN'
              ? 'Your account, Hardware ID (HWID), and IP Address have been PERMANENTLY BANNED by VacNet after verification confirmed cheating. Switching accounts on this PC will immediately VAC-ban any alternate account.'
              : 'VacNet has flagged irregular gameplay and issued a 1-Day (24-Hour) VAC Live Cooldown on your Account, Hardware ID (HWID), and IP Address. You cannot play for a full day—even if you switch to another account, VacNet will immediately VAC-ban that account until our team verifies your case!'}
          </p>

          {altAlert && (
            <div className="rounded border-2 border-amber-400 bg-amber-950/80 p-3 text-xs font-black text-amber-200">
              {altAlert}
            </div>
          )}

          {/* Account / HWID / IP / SteamID Details Box */}
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-red-800/80 bg-black/60 p-4 sm:grid-cols-2 text-xs">
            <div>
              <span className="text-red-400">ACCOUNT NAME:</span>{' '}
              <span className="font-mono font-black text-white">{currentAccount.accountName}</span>
            </div>
            <div>
              <span className="text-red-400">DATE ACCOUNT CREATED:</span>{' '}
              <span className="font-mono font-black text-amber-300">{currentAccount.accountCreatedAt}</span>
            </div>
            <div>
              <span className="text-red-400">STEAM ID:</span>{' '}
              <span className="font-mono font-black text-cyan-300">{currentAccount.steamId}</span>
            </div>
            <div>
              <span className="text-red-400">UNIQUE ID:</span>{' '}
              <span className="font-mono font-black text-emerald-300">{currentAccount.uniqueId}</span>
            </div>
            <div>
              <span className="text-red-400">HWID (HARDWARE ID):</span>{' '}
              <span className="font-mono font-black text-rose-300">{currentAccount.hwid}</span>
            </div>
            <div>
              <span className="text-red-400">IP ADDRESS:</span>{' '}
              <span className="font-mono font-black text-purple-300">{currentAccount.ipAddress}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-red-400">BAN REASON:</span>{' '}
              <span className="font-black text-white">
                {currentAccount.banReason || vacLiveMatchCancelledOverlay?.reason}
              </span>
            </div>
          </div>

          {/* Discord Ticket Appeal Instructions */}
          <div className="rounded-lg border-2 border-indigo-500/70 bg-indigo-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-indigo-300">
                  MAKE A TICKET IN OUR DISCORD SERVER TO VERIFY YOUR ACCOUNT
                </div>
                <div className="mt-0.5 text-xs font-bold text-slate-200">
                  Join <span className="text-white underline">{OFFICIAL_DISCORD_INVITE_URL}</span> and provide your{' '}
                  <span className="text-cyan-300">SteamID ({currentAccount.steamId})</span> &{' '}
                  <span className="text-emerald-300">UniqueID ({currentAccount.uniqueId})</span>.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={OFFICIAL_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black uppercase text-white shadow hover:bg-indigo-500"
                >
                  <ExternalLink className="h-4 w-4" />
                  OPEN DISCORD TICKET
                </a>
                <button
                  onClick={copyTicket}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-400/60 bg-black/60 px-3 py-2 text-xs font-black uppercase text-indigo-200 hover:bg-black"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'COPIED!' : 'COPY STEAMID / UNIQUEID'}
                </button>
              </div>
            </div>
          </div>

          {/* Test Account Switching while Banned -> Immediately VAC Bans the other account */}
          <div className="rounded-lg border border-red-900 bg-black/50 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-amber-300">
              <Users className="h-4 w-4" /> TRY SWITCHING TO ANOTHER ACCOUNT (HWID/IP EVASION DETECTION)
            </div>
            <p className="mb-2 text-[11px] font-bold text-slate-300">
              Switching to any other account while under a 1-Day VAC Live Cooldown immediately VAC-bans that account too
              and sends a bold report to our Discord Webhook:
            </p>
            <div className="flex flex-wrap gap-2">
              {knownAccounts.map((acc) => (
                <button
                  key={acc.accountId}
                  onClick={() => {
                    const res = switchOrCreateAccount(acc.accountName);
                    if (res.autoBannedByHwidIp) {
                      setAltAlert(
                        `⛔ Switched to "${res.account.accountName}" (${res.account.steamId}) → IMMEDIATELY VAC BANNED due to matching HWID (${res.account.hwid}) & IP (${res.account.ipAddress})!`
                      );
                    }
                  }}
                  className="rounded border border-red-700 bg-red-950/60 px-2.5 py-1 text-xs font-black text-red-200 hover:bg-red-900"
                >
                  Switch to {acc.accountName}
                </button>
              ))}
              <div className="flex flex-1 gap-1.5 min-w-[220px]">
                <input
                  type="text"
                  value={altName}
                  onChange={(e) => setAltName(e.target.value)}
                  placeholder="New alt account name..."
                  className="flex-1 rounded border border-red-800 bg-black px-2.5 py-1 text-xs font-bold text-white"
                />
                <button
                  onClick={() => {
                    const target = altName.trim() || `Alt_${Math.floor(Math.random() * 900 + 100)}`;
                    const res = switchOrCreateAccount(target);
                    setAltName('');
                    if (res.autoBannedByHwidIp) {
                      setAltAlert(
                        `⛔ Switched to "${res.account.accountName}" (${res.account.steamId}) → IMMEDIATELY VAC BANNED on HWID/IP & logged to Discord Webhook!`
                      );
                    }
                  }}
                  className="rounded bg-amber-600 px-3 py-1 text-xs font-black uppercase text-black hover:bg-amber-500"
                >
                  SWITCH ACCOUNT
                </button>
              </div>
            </div>
          </div>

          {/* Admin / Overwatch Verification Resolution Bar */}
          <div className="rounded-lg border border-slate-700 bg-slate-950/90 p-3.5">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-300">
              ADMIN / OVERWATCH TICKET VERIFICATION ACTIONS:
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => verifyPlayerCheatingPermanent()}
                className="flex items-center justify-center gap-1.5 rounded border border-red-500 bg-red-900/70 px-3 py-2 text-[11px] font-black uppercase text-white hover:bg-red-800"
              >
                <Gavel className="h-3.5 w-3.5" />
                VERIFY CHEATING (PERMANENT)
              </button>
              <button
                onClick={() => {
                  verifyPlayerNotCheatingUnban();
                  dismissMatchCancelledOverlay();
                  onReturnToMenu?.();
                }}
                className="flex items-center justify-center gap-1.5 rounded border border-emerald-500 bg-emerald-900/70 px-3 py-2 text-[11px] font-black uppercase text-white hover:bg-emerald-800"
              >
                <Unlock className="h-3.5 w-3.5" />
                VERIFY NOT CHEATING (UNBAN NOW)
              </button>
              <button
                onClick={() => {
                  checkAndProcessCooldownTimeout(true);
                  dismissMatchCancelledOverlay();
                  onReturnToMenu?.();
                }}
                className="flex items-center justify-center gap-1.5 rounded border border-yellow-500 bg-yellow-900/70 px-3 py-2 text-[11px] font-black uppercase text-yellow-100 hover:bg-yellow-800"
              >
                <TimerOff className="h-3.5 w-3.5" />
                NO VERIFY IN TIME (UNBAN + SUSPICIOUS)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {onOpenVacNetTab && (
              <button
                onClick={() => {
                  dismissMatchCancelledOverlay();
                  onOpenVacNetTab();
                }}
                className="rounded border border-slate-600 bg-slate-900 px-4 py-2 text-xs font-black uppercase text-slate-200 hover:bg-slate-800"
              >
                OPEN VACNET SECURITY & WEBHOOK LOGS
              </button>
            )}
            {onReturnToMenu && (
              <button
                onClick={() => {
                  dismissMatchCancelledOverlay();
                  onReturnToMenu();
                }}
                className="ml-auto rounded bg-red-700 px-5 py-2 text-xs font-black uppercase text-white hover:bg-red-600"
              >
                RETURN TO CS2 MAIN MENU
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
