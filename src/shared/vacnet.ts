import { create } from 'zustand';

export const OFFICIAL_DISCORD_INVITE_URL = 'https://discord.gg/sC8FXyUGnd';
export const OFFICIAL_DISCORD_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1555586294179037194/r59KbmF6Qe96tMlukr5CtsG1NW4tB-sil2BmcqOBfKgjPkBYxLWNkA7_qH-Yz473tpGY';
export const VACNET_DISCORD_WEBHOOK_URL = OFFICIAL_DISCORD_WEBHOOK_URL;

export const VAC_LIVE_COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000; // 1 Day (24 Hours)

export type VacBanStatus =
  | 'CLEAN'
  | 'VAC_LIVE_COOLDOWN_24H'
  | 'PERMANENT_VAC_BAN'
  | 'UNBANNED_VERIFIED_CLEAN'
  | 'UNBANNED_TIMEOUT_SUSPICIOUS';

export type VerificationDecisionState =
  | 'NONE'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED_CHEATER_PERMANENT'
  | 'VERIFIED_NOT_CHEATING_UNBANNED'
  | 'TIMEOUT_AUTO_UNBANNED_SUSPICIOUS';

export interface PlayerAccountIdentity {
  accountId: string;
  accountName: string;
  steamId: string;
  uniqueId: string;
  hwid: string;
  ipAddress: string;
  accountCreatedAt: string;
  banStatus: VacBanStatus;
  verificationState: VerificationDecisionState;
  banReason: string | null;
  bannedAt: string | null;
  cooldownExpiresAtMs: number | null;
  caseId: string | null;
  linkedBannedAccountName?: string | null;
  suspiciousFlag: boolean;
}

export interface VacNetLearnedSignature {
  id: string;
  patternType:
    | 'AIMBOT_ANGULAR_SNAP'
    | 'SPINBOT_YAW_OVERFLOW'
    | 'RAPID_FIRE_SUBTICK_ABUSE'
    | 'SPEEDHACK_MOVEMENT_BUDGET'
    | 'WALLHACK_THROUGH_SMOKE_LOCK'
    | 'TRIGGERBOT_0MS_REACTION'
    | 'HWID_IP_ALT_EVASION';
  detectedAccount: string;
  hwid: string;
  ipAddress: string;
  confidence: number;
  learnedWeightDelta: number;
  learnedAt: string;
}

export interface VacNetLearningState {
  modelVersion: string;
  learningGeneration: number;
  totalBansAnalyzed: number;
  aimSnapThresholdDegPerTick: number;
  minReactionTimeMs: number;
  fireIntervalToleranceRatio: number;
  movementBurstToleranceRatio: number;
  headshotAnomalyThreshold: number;
  detectionConfidenceMultiplier: number;
  learnedSignatures: VacNetLearnedSignature[];
}

export interface VacWebhookLogEntry {
  id: string;
  timestamp: string;
  eventTitle: string;
  accountName: string;
  steamId: string;
  uniqueId: string;
  ipAddress: string;
  hwid: string;
  accountCreatedAt: string;
  banReason: string;
  statusLabel: string;
  suspicious: boolean;
  deliveredToDiscord: boolean;
  formattedMessage: string;
}

export interface HwidIpLockRecord {
  hwid: string;
  ipAddress: string;
  originAccountName: string;
  originSteamId: string;
  originUniqueId: string;
  caseId: string;
  reason: string;
  bannedAt: string;
  cooldownExpiresAtMs: number;
  status: 'VAC_LIVE_24H' | 'PERMANENT';
  verificationState: VerificationDecisionState;
}

const STORAGE_KEY_VACNET = 'cs2_vacnet_authority_v2';
const STORAGE_KEY_HWID = 'cs2_hardware_fingerprint_v2';
const STORAGE_KEY_IP = 'cs2_network_ip_fingerprint_v2';

function deterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex1.slice(0, 4)}-${hex1.slice(4, 8)}-${hex2.slice(0, 4)}-${hex2.slice(4, 8)}`;
}

export function getOrCreateHardwareId(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const existing = window.localStorage.getItem(STORAGE_KEY_HWID);
    if (existing) return existing;
  }
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const scr = typeof screen !== 'undefined' ? screen : null;
  const rawTraits = [
    nav?.userAgent || 'CS2-Client',
    nav?.language || 'en-US',
    String(nav?.hardwareConcurrency || 8),
    String((nav as unknown as { deviceMemory?: number })?.deviceMemory || 16),
    String(scr?.width || 1920),
    String(scr?.height || 1080),
    String(scr?.colorDepth || 24)
  ].join('|');
  const hwid = `HWID-${deterministicHash(rawTraits)}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_HWID, hwid);
    } catch {
      // Ignore storage error
    }
  }
  return hwid;
}

export function getOrCreateClientIp(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const existing = window.localStorage.getItem(STORAGE_KEY_IP);
    if (existing) return existing;
  }
  const hwid = getOrCreateHardwareId();
  const parts = hwid.replace('HWID-', '').split('-');
  const o1 = 185;
  const o2 = (parseInt(parts[0] || 'A4', 16) % 200) + 20;
  const o3 = (parseInt(parts[1] || '5B', 16) % 240) + 10;
  const o4 = (parseInt(parts[2] || '1C', 16) % 250) + 2;
  const ip = `${o1}.${o2}.${o3}.${o4}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_IP, ip);
    } catch {
      // Ignore
    }
  }
  return ip;
}

export function generateSteamIdFromSeed(seedStr: string): string {
  let num = 0;
  for (let i = 0; i < seedStr.length; i++) {
    num = (num * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const acct = 10000000 + (num % 89999999);
  const y = num % 2;
  return `STEAM_1:${y}:${acct}`;
}

export function generateUniqueIdFromSeed(seedStr: string): string {
  const hash = deterministicHash(seedStr);
  return `CS2-UID-${hash.slice(0, 9)}`;
}

export function formatBoldDiscordWebhookMessage(params: {
  eventTitle: string;
  accountName: string;
  steamId: string;
  uniqueId: string;
  ipAddress: string;
  hwid: string;
  accountCreatedAt: string;
  bannedAt: string;
  reason: string;
  statusText: string;
  caseId: string;
  vacNetVersion: string;
  confidence: number;
  isSuspiciousTimeout?: boolean;
}): string {
  const lines = [
    `🚨 **VACNET 3.0 & VAC LIVE ANTI-CHEAT ENFORCEMENT REPORT** 🚨`,
    `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**`,
    `**EVENT:** **${params.eventTitle}**`,
    `**STATUS:** **${params.statusText}**`,
    params.isSuspiciousTimeout
      ? `⚠️ **ALERT:** **ADMIN VERIFICATION WINDOW (24H) EXPIRED — PLAYER AUTOMATICALLY UNBANNED BY TIMEOUT BUT REMAINS FLAGGED AS [SUSPICIOUS] IN VACNET!**`
      : null,
    `**ACCOUNT NAME:** **${params.accountName}**`,
    `**STEAM ID:** **${params.steamId}**`,
    `**UNIQUE ID:** **${params.uniqueId}**`,
    `**IP ADDRESS:** **${params.ipAddress}**`,
    `**HWID (HARDWARE ID):** **${params.hwid}**`,
    `**DATE ACCOUNT CREATED:** **${params.accountCreatedAt}**`,
    `**DATE OF ACTION / BAN:** **${params.bannedAt}**`,
    `**REASON FOR BAN:** **${params.reason}**`,
    `**VACNET CASE ID:** **${params.caseId}**`,
    `**VACNET MODEL:** **${params.vacNetVersion} (Confidence: ${params.confidence.toFixed(1)}%)**`,
    `**DISCORD BAN APPEAL TICKET SERVER:** **${OFFICIAL_DISCORD_INVITE_URL}**`,
    `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**`
  ].filter(Boolean);
  return lines.join('\n');
}

export async function dispatchVacNetWebhook(content: string): Promise<boolean> {
  // 1. Try server-side proxy endpoint first if running with backend
  try {
    const serverRes = await fetch('/api/anticheat/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, webhookUrl: OFFICIAL_DISCORD_WEBHOOK_URL })
    });
    if (serverRes.ok) {
      return true;
    }
  } catch {
    // Fall through to direct browser webhook POST
  }

  // 2. Direct POST to Discord Webhook URL so it works on static hosts / browser directly
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(OFFICIAL_DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'VacNet 3.0 // VAC Live Enforcement',
          content
        })
      });
      return res.ok || res.status === 204;
    } catch {
      return false;
    }
  }
  return false;
}

export interface VacNetStoreState {
  currentAccount: PlayerAccountIdentity;
  knownAccounts: PlayerAccountIdentity[];
  activeHwidIpLock: HwidIpLockRecord | null;
  learning: VacNetLearningState;
  neuralModel: { generation: number; modelVersion: string; totalBansAnalyzed: number };
  telemetry: {
    suspicionScore: number;
    totalShots: number;
    headshots: number;
    lastSubTickFraction: number;
  };
  webhookLogs: VacWebhookLogEntry[];
  vacLiveMatchCancelledOverlay: {
    active: boolean;
    offenderName: string;
    reason: string;
    caseId: string;
    cooldownExpiresAtMs: number;
  } | null;

  // Actions
  triggerVacLiveBan: (
    params:
      | string
      | {
          reason: string;
          patternType?: VacNetLearnedSignature['patternType'];
          inMatch?: boolean;
        }
  ) => PlayerAccountIdentity;
  switchOrCreateAccount: (newAccountName: string) => {
    account: PlayerAccountIdentity;
    autoBannedByHwidIp: boolean;
  };
  verifyPlayerCheatingPermanent: () => void;
  verifyPlayerNotCheatingUnban: () => void;
  checkAndProcessCooldownTimeout: (forceSimulateExpiry?: boolean) => boolean;
  dismissMatchCancelledOverlay: () => void;
  syncServerIp: (ip: string) => void;
  syncIdentityFromServer: () => Promise<void>;
  recordShotTelemetry: (shot: {
    angularVelocityDegPerTick: number;
    reactionTimeMs: number;
    isHeadshot: boolean;
    throughWall: boolean;
    subTickFraction: number;
  }) => void;
}

function createInitialAccount(): PlayerAccountIdentity {
  const hwid = getOrCreateHardwareId();
  const ip = getOrCreateClientIp();
  const name = 'Operative_Zero';
  return {
    accountId: 'acc_operative_zero',
    accountName: name,
    steamId: generateSteamIdFromSeed(name),
    uniqueId: generateUniqueIdFromSeed(name),
    hwid,
    ipAddress: ip,
    accountCreatedAt: '2024-11-15 14:22:08 UTC',
    banStatus: 'CLEAN',
    verificationState: 'NONE',
    banReason: null,
    bannedAt: null,
    cooldownExpiresAtMs: null,
    caseId: null,
    linkedBannedAccountName: null,
    suspiciousFlag: false
  };
}

const DEFAULT_LEARNING_STATE: VacNetLearningState = {
  modelVersion: 'VacNet 3.0.4-Neural',
  learningGeneration: 14,
  totalBansAnalyzed: 1284,
  aimSnapThresholdDegPerTick: 105.0,
  minReactionTimeMs: 42,
  fireIntervalToleranceRatio: 0.82,
  movementBurstToleranceRatio: 1.15,
  headshotAnomalyThreshold: 0.88,
  detectionConfidenceMultiplier: 1.0,
  learnedSignatures: [
    {
      id: 'sig_boot_1',
      patternType: 'AIMBOT_ANGULAR_SNAP',
      detectedAccount: 'SpinBot_X99',
      hwid: 'HWID-88A1-44F0-9012-CC3E',
      ipAddress: '185.142.88.19',
      confidence: 99.4,
      learnedWeightDelta: -3.2,
      learnedAt: '2026-10-01 21:14:00 UTC'
    },
    {
      id: 'sig_boot_2',
      patternType: 'RAPID_FIRE_SUBTICK_ABUSE',
      detectedAccount: 'Macro_Trigger_77',
      hwid: 'HWID-19C4-77D2-33A1-99B0',
      ipAddress: '185.91.204.55',
      confidence: 97.8,
      learnedWeightDelta: -2.1,
      learnedAt: '2026-10-02 04:50:12 UTC'
    }
  ]
};

function loadPersistedVacNet(): Partial<VacNetStoreState> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_VACNET);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePersistedVacNet(state: Partial<VacNetStoreState>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload = {
      currentAccount: state.currentAccount,
      knownAccounts: state.knownAccounts,
      activeHwidIpLock: state.activeHwidIpLock,
      learning: state.learning,
      webhookLogs: (state.webhookLogs || []).slice(0, 40)
    };
    window.localStorage.setItem(STORAGE_KEY_VACNET, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
}

const persisted = loadPersistedVacNet();
const initialAcc = persisted.currentAccount || createInitialAccount();

export const useVacNetStore = create<VacNetStoreState>((set, get) => ({
  currentAccount: initialAcc,
  knownAccounts: persisted.knownAccounts || [
    initialAcc,
    {
      accountId: 'acc_smurf_alt',
      accountName: 's1mple_alt_2026',
      steamId: generateSteamIdFromSeed('s1mple_alt_2026'),
      uniqueId: generateUniqueIdFromSeed('s1mple_alt_2026'),
      hwid: getOrCreateHardwareId(),
      ipAddress: getOrCreateClientIp(),
      accountCreatedAt: '2026-08-19 09:11:45 UTC',
      banStatus: 'CLEAN',
      verificationState: 'NONE',
      banReason: null,
      bannedAt: null,
      cooldownExpiresAtMs: null,
      caseId: null,
      linkedBannedAccountName: null,
      suspiciousFlag: false
    }
  ],
  activeHwidIpLock: persisted.activeHwidIpLock || null,
  learning: persisted.learning || DEFAULT_LEARNING_STATE,
  neuralModel: {
    generation: (persisted.learning || DEFAULT_LEARNING_STATE).learningGeneration,
    modelVersion: (persisted.learning || DEFAULT_LEARNING_STATE).modelVersion,
    totalBansAnalyzed: (persisted.learning || DEFAULT_LEARNING_STATE).totalBansAnalyzed
  },
  telemetry: {
    suspicionScore: 2,
    totalShots: 0,
    headshots: 0,
    lastSubTickFraction: 0.5
  },
  webhookLogs: persisted.webhookLogs || [],
  vacLiveMatchCancelledOverlay: null,

  syncIdentityFromServer: async () => {
    if (typeof fetch === 'undefined') return;
    try {
      const res = await fetch('/api/client-identity', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { ip?: string };
      if (data.ip) get().syncServerIp(data.ip);
    } catch {
      // Ignore in offline/static mode
    }
  },

  recordShotTelemetry: (shot) => {
    set((state) => {
      const totalShots = state.telemetry.totalShots + 1;
      const headshots = state.telemetry.headshots + (shot.isHeadshot ? 1 : 0);
      const isSnapAnomaly = shot.angularVelocityDegPerTick > state.learning.aimSnapThresholdDegPerTick;
      const isReactionAnomaly = shot.reactionTimeMs < state.learning.minReactionTimeMs;
      const deltaRisk = (isSnapAnomaly ? 28 : 0) + (isReactionAnomaly ? 24 : 0) - 0.5;
      const suspicionScore = Math.max(0, Math.min(100, state.telemetry.suspicionScore + deltaRisk));
      return {
        telemetry: {
          suspicionScore,
          totalShots,
          headshots,
          lastSubTickFraction: shot.subTickFraction
        }
      };
    });
  },

  syncServerIp: (ip: string) => {
    if (!ip) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY_IP, ip);
      } catch {
        // Ignore
      }
    }
    set((state) => {
      const updatedCurrent = { ...state.currentAccount, ipAddress: ip };
      const updatedKnown = state.knownAccounts.map((a) => ({ ...a, ipAddress: ip }));
      const next = {
        ...state,
        currentAccount: updatedCurrent,
        knownAccounts: updatedKnown
      };
      savePersistedVacNet(next);
      return next;
    });
  },

  triggerVacLiveBan: (input) => {
    const params = typeof input === 'string' ? { reason: input, patternType: 'AIMBOT_ANGULAR_SNAP' as const, inMatch: true } : input;
    const { reason, patternType = 'AIMBOT_ANGULAR_SNAP', inMatch = false } = params;
    const state = get();
    const now = Date.now();
    const nowIso = new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const expiresAt = now + VAC_LIVE_COOLDOWN_DURATION_MS;
    const caseId = `VACLIVE-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // 1. VacNet Learns from this ban! Tighten detection thresholds & record neural signature
    const prevLearn = state.learning;
    const confidence = Math.min(99.9, 94.5 + prevLearn.learningGeneration * 0.25);
    const newSignature: VacNetLearnedSignature = {
      id: `sig_${now}`,
      patternType,
      detectedAccount: state.currentAccount.accountName,
      hwid: state.currentAccount.hwid,
      ipAddress: state.currentAccount.ipAddress,
      confidence,
      learnedWeightDelta: -2.5,
      learnedAt: nowIso
    };

    const nextLearning: VacNetLearningState = {
      ...prevLearn,
      learningGeneration: prevLearn.learningGeneration + 1,
      totalBansAnalyzed: prevLearn.totalBansAnalyzed + 1,
      aimSnapThresholdDegPerTick: Math.max(45, Number((prevLearn.aimSnapThresholdDegPerTick - 2.5).toFixed(1))),
      minReactionTimeMs: Math.min(95, prevLearn.minReactionTimeMs + 3),
      fireIntervalToleranceRatio: Math.min(0.94, Number((prevLearn.fireIntervalToleranceRatio + 0.01).toFixed(2))),
      detectionConfidenceMultiplier: Number((prevLearn.detectionConfidenceMultiplier + 0.04).toFixed(2)),
      learnedSignatures: [newSignature, ...prevLearn.learnedSignatures.slice(0, 24)]
    };

    const bannedAccount: PlayerAccountIdentity = {
      ...state.currentAccount,
      banStatus: 'VAC_LIVE_COOLDOWN_24H',
      verificationState: 'PENDING_VERIFICATION',
      banReason: reason,
      bannedAt: nowIso,
      cooldownExpiresAtMs: expiresAt,
      caseId,
      suspiciousFlag: true
    };

    const lockRecord: HwidIpLockRecord = {
      hwid: bannedAccount.hwid,
      ipAddress: bannedAccount.ipAddress,
      originAccountName: bannedAccount.accountName,
      originSteamId: bannedAccount.steamId,
      originUniqueId: bannedAccount.uniqueId,
      caseId,
      reason,
      bannedAt: nowIso,
      cooldownExpiresAtMs: expiresAt,
      status: 'VAC_LIVE_24H',
      verificationState: 'PENDING_VERIFICATION'
    };

    const formattedMsg = formatBoldDiscordWebhookMessage({
      eventTitle: '1-DAY VAC LIVE COOLDOWN ISSUED (HWID + IP LOCKED)',
      accountName: bannedAccount.accountName,
      steamId: bannedAccount.steamId,
      uniqueId: bannedAccount.uniqueId,
      ipAddress: bannedAccount.ipAddress,
      hwid: bannedAccount.hwid,
      accountCreatedAt: bannedAccount.accountCreatedAt,
      bannedAt: nowIso,
      reason,
      statusText: '1-DAY (24H) VAC LIVE COOLDOWN — PENDING ADMIN VERIFICATION',
      caseId,
      vacNetVersion: nextLearning.modelVersion,
      confidence
    });

    const logEntry: VacWebhookLogEntry = {
      id: `wh_${now}`,
      timestamp: nowIso,
      eventTitle: '1-DAY VAC LIVE BAN',
      accountName: bannedAccount.accountName,
      steamId: bannedAccount.steamId,
      uniqueId: bannedAccount.uniqueId,
      ipAddress: bannedAccount.ipAddress,
      hwid: bannedAccount.hwid,
      accountCreatedAt: bannedAccount.accountCreatedAt,
      banReason: reason,
      statusLabel: '1-DAY VAC LIVE (PENDING VERIFICATION)',
      suspicious: true,
      deliveredToDiscord: true,
      formattedMessage: formattedMsg
    };

    const updatedKnown = state.knownAccounts.some((a) => a.accountName === bannedAccount.accountName)
      ? state.knownAccounts.map((a) => (a.accountName === bannedAccount.accountName ? bannedAccount : a))
      : [...state.knownAccounts, bannedAccount];

    const nextState: Partial<VacNetStoreState> = {
      currentAccount: bannedAccount,
      knownAccounts: updatedKnown,
      activeHwidIpLock: lockRecord,
      learning: nextLearning,
      neuralModel: {
        generation: nextLearning.learningGeneration,
        modelVersion: nextLearning.modelVersion,
        totalBansAnalyzed: nextLearning.totalBansAnalyzed
      },
      webhookLogs: [logEntry, ...state.webhookLogs],
      vacLiveMatchCancelledOverlay: inMatch
        ? {
            active: true,
            offenderName: bannedAccount.accountName,
            reason,
            caseId,
            cooldownExpiresAtMs: expiresAt
          }
        : state.vacLiveMatchCancelledOverlay
    };

    set(nextState);
    savePersistedVacNet({ ...state, ...nextState });
    void dispatchVacNetWebhook(formattedMsg);
    return bannedAccount;
  },

  switchOrCreateAccount: (newAccountName: string) => {
    const cleanName = newAccountName.trim() || `Player_${Math.floor(Math.random() * 9000 + 1000)}`;
    const state = get();
    const hwid = getOrCreateHardwareId();
    const ip = state.currentAccount.ipAddress || getOrCreateClientIp();
    const now = Date.now();
    const nowIso = new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    // First check if an active 24h lock has already timed out
    state.checkAndProcessCooldownTimeout(false);
    const refreshedState = get();
    const lock = refreshedState.activeHwidIpLock;

    let targetAccount = refreshedState.knownAccounts.find(
      (a) => a.accountName.toLowerCase() === cleanName.toLowerCase()
    );

    if (!targetAccount) {
      targetAccount = {
        accountId: `acc_${now.toString(36)}`,
        accountName: cleanName,
        steamId: generateSteamIdFromSeed(cleanName),
        uniqueId: generateUniqueIdFromSeed(cleanName),
        hwid,
        ipAddress: ip,
        accountCreatedAt: nowIso,
        banStatus: 'CLEAN',
        verificationState: 'NONE',
        banReason: null,
        bannedAt: null,
        cooldownExpiresAtMs: null,
        caseId: null,
        linkedBannedAccountName: null,
        suspiciousFlag: false
      };
    }

    // CRITICAL REQUIREMENT:
    // "when they get banned they get 1 day vac live can't play for a whole day even if switch to other acc
    //  imeaditly vac other acc until we verify that ur not cheating or cheating"
    const isHwidOrIpLocked =
      lock !== null &&
      (lock.hwid === hwid || lock.ipAddress === ip) &&
      (lock.status === 'PERMANENT' ||
        (lock.status === 'VAC_LIVE_24H' && lock.cooldownExpiresAtMs > now));

    let autoBannedByHwidIp = false;

    if (isHwidOrIpLocked && lock) {
      autoBannedByHwidIp = true;
      const altReason = `VacNet HWID/IP Link Enforcement — Switched to Alt Account while "${lock.originAccountName}" (${lock.originSteamId}) is under ${
        lock.status === 'PERMANENT' ? 'PERMANENT VAC BAN' : '1-Day VAC Live Cooldown'
      } [${lock.reason}]`;

      targetAccount = {
        ...targetAccount,
        hwid,
        ipAddress: ip,
        banStatus: lock.status === 'PERMANENT' ? 'PERMANENT_VAC_BAN' : 'VAC_LIVE_COOLDOWN_24H',
        verificationState:
          lock.status === 'PERMANENT' ? 'VERIFIED_CHEATER_PERMANENT' : 'PENDING_VERIFICATION',
        banReason: altReason,
        bannedAt: nowIso,
        cooldownExpiresAtMs: lock.cooldownExpiresAtMs,
        caseId: lock.caseId,
        linkedBannedAccountName: lock.originAccountName,
        suspiciousFlag: true
      };

      // VacNet also learns from Alt-Account HWID/IP evasion attempts
      const nextLearning: VacNetLearningState = {
        ...refreshedState.learning,
        learningGeneration: refreshedState.learning.learningGeneration + 1,
        totalBansAnalyzed: refreshedState.learning.totalBansAnalyzed + 1,
        learnedSignatures: [
          {
            id: `sig_alt_${now}`,
            patternType: 'HWID_IP_ALT_EVASION',
            detectedAccount: targetAccount.accountName,
            hwid,
            ipAddress: ip,
            confidence: 100.0,
            learnedWeightDelta: -1.5,
            learnedAt: nowIso
          },
          ...refreshedState.learning.learnedSignatures.slice(0, 24)
        ]
      };

      const formattedMsg = formatBoldDiscordWebhookMessage({
        eventTitle: 'ALT ACCOUNT IMMEDIATELY VAC BANNED (HWID / IP EVASION DETECTED)',
        accountName: targetAccount.accountName,
        steamId: targetAccount.steamId,
        uniqueId: targetAccount.uniqueId,
        ipAddress: targetAccount.ipAddress,
        hwid: targetAccount.hwid,
        accountCreatedAt: targetAccount.accountCreatedAt,
        bannedAt: nowIso,
        reason: altReason,
        statusText:
          lock.status === 'PERMANENT'
            ? 'PERMANENT VAC BAN (LINKED HWID/IP)'
            : '1-DAY VAC LIVE COOLDOWN (ALT ACCOUNT BLOCKED UNTIL VERIFIED)',
        caseId: lock.caseId,
        vacNetVersion: nextLearning.modelVersion,
        confidence: 100.0
      });

      const logEntry: VacWebhookLogEntry = {
        id: `wh_alt_${now}`,
        timestamp: nowIso,
        eventTitle: 'ALT ACCOUNT HWID/IP BAN',
        accountName: targetAccount.accountName,
        steamId: targetAccount.steamId,
        uniqueId: targetAccount.uniqueId,
        ipAddress: targetAccount.ipAddress,
        hwid: targetAccount.hwid,
        accountCreatedAt: targetAccount.accountCreatedAt,
        banReason: altReason,
        statusLabel:
          lock.status === 'PERMANENT' ? 'PERMANENT VAC BAN (ALT)' : '1-DAY VAC LIVE (ALT BLOCKED)',
        suspicious: true,
        deliveredToDiscord: true,
        formattedMessage: formattedMsg
      };

      const updatedKnown = refreshedState.knownAccounts.some(
        (a) => a.accountName.toLowerCase() === targetAccount!.accountName.toLowerCase()
      )
        ? refreshedState.knownAccounts.map((a) =>
            a.accountName.toLowerCase() === targetAccount!.accountName.toLowerCase() ? targetAccount! : a
          )
        : [...refreshedState.knownAccounts, targetAccount];

      const nextState: Partial<VacNetStoreState> = {
        currentAccount: targetAccount,
        knownAccounts: updatedKnown,
        learning: nextLearning,
        webhookLogs: [logEntry, ...refreshedState.webhookLogs]
      };
      set(nextState);
      savePersistedVacNet({ ...refreshedState, ...nextState });
      void dispatchVacNetWebhook(formattedMsg);
      return { account: targetAccount, autoBannedByHwidIp: true };
    }

    const updatedKnown = refreshedState.knownAccounts.some(
      (a) => a.accountName.toLowerCase() === targetAccount!.accountName.toLowerCase()
    )
      ? refreshedState.knownAccounts.map((a) =>
          a.accountName.toLowerCase() === targetAccount!.accountName.toLowerCase() ? targetAccount! : a
        )
      : [...refreshedState.knownAccounts, targetAccount];

    const nextState: Partial<VacNetStoreState> = {
      currentAccount: targetAccount,
      knownAccounts: updatedKnown
    };
    set(nextState);
    savePersistedVacNet({ ...refreshedState, ...nextState });
    return { account: targetAccount, autoBannedByHwidIp: false };
  },

  verifyPlayerCheatingPermanent: () => {
    const state = get();
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const caseId = state.currentAccount.caseId || state.activeHwidIpLock?.caseId || `VACPERM-${Date.now()}`;
    const reason =
      state.currentAccount.banReason ||
      state.activeHwidIpLock?.reason ||
      'Verified Cheating by VacNet / Overwatch Review';

    const updatedAccount: PlayerAccountIdentity = {
      ...state.currentAccount,
      banStatus: 'PERMANENT_VAC_BAN',
      verificationState: 'VERIFIED_CHEATER_PERMANENT',
      banReason: `${reason} [VERIFIED CHEATING — PERMANENT VAC BAN]`,
      bannedAt: state.currentAccount.bannedAt || nowIso,
      cooldownExpiresAtMs: null,
      caseId,
      suspiciousFlag: true
    };

    const updatedKnown = state.knownAccounts.map((a) =>
      a.hwid === updatedAccount.hwid || a.ipAddress === updatedAccount.ipAddress
        ? {
            ...a,
            banStatus: 'PERMANENT_VAC_BAN' as const,
            verificationState: 'VERIFIED_CHEATER_PERMANENT' as const,
            banReason: `${reason} [VERIFIED CHEATING — PERMANENT VAC BAN]`,
            cooldownExpiresAtMs: null,
            caseId,
            suspiciousFlag: true
          }
        : a
    );

    const updatedLock: HwidIpLockRecord = {
      hwid: updatedAccount.hwid,
      ipAddress: updatedAccount.ipAddress,
      originAccountName: state.activeHwidIpLock?.originAccountName || updatedAccount.accountName,
      originSteamId: state.activeHwidIpLock?.originSteamId || updatedAccount.steamId,
      originUniqueId: state.activeHwidIpLock?.originUniqueId || updatedAccount.uniqueId,
      caseId,
      reason: `${reason} [VERIFIED CHEATING — PERMANENT]`,
      bannedAt: nowIso,
      cooldownExpiresAtMs: Number.MAX_SAFE_INTEGER,
      status: 'PERMANENT',
      verificationState: 'VERIFIED_CHEATER_PERMANENT'
    };

    const formattedMsg = formatBoldDiscordWebhookMessage({
      eventTitle: 'VERIFIED CHEATING — PERMANENT VAC BAN ENFORCED',
      accountName: updatedAccount.accountName,
      steamId: updatedAccount.steamId,
      uniqueId: updatedAccount.uniqueId,
      ipAddress: updatedAccount.ipAddress,
      hwid: updatedAccount.hwid,
      accountCreatedAt: updatedAccount.accountCreatedAt,
      bannedAt: nowIso,
      reason: updatedAccount.banReason || reason,
      statusText: 'PERMANENT VAC BAN (VERIFIED CHEATING — HWID & IP BLACKLISTED)',
      caseId,
      vacNetVersion: state.learning.modelVersion,
      confidence: 100.0
    });

    const logEntry: VacWebhookLogEntry = {
      id: `wh_perm_${Date.now()}`,
      timestamp: nowIso,
      eventTitle: 'VERIFIED CHEATING — PERMANENT BAN',
      accountName: updatedAccount.accountName,
      steamId: updatedAccount.steamId,
      uniqueId: updatedAccount.uniqueId,
      ipAddress: updatedAccount.ipAddress,
      hwid: updatedAccount.hwid,
      accountCreatedAt: updatedAccount.accountCreatedAt,
      banReason: updatedAccount.banReason || reason,
      statusLabel: 'PERMANENT VAC BAN',
      suspicious: true,
      deliveredToDiscord: true,
      formattedMessage: formattedMsg
    };

    const nextState: Partial<VacNetStoreState> = {
      currentAccount: updatedAccount,
      knownAccounts: updatedKnown,
      activeHwidIpLock: updatedLock,
      webhookLogs: [logEntry, ...state.webhookLogs]
    };
    set(nextState);
    savePersistedVacNet({ ...state, ...nextState });
    void dispatchVacNetWebhook(formattedMsg);
  },

  verifyPlayerNotCheatingUnban: () => {
    const state = get();
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const caseId = state.currentAccount.caseId || state.activeHwidIpLock?.caseId || 'CLEARED';
    const prevReason = state.currentAccount.banReason || 'VAC Live Investigation';

    const clearedAccount: PlayerAccountIdentity = {
      ...state.currentAccount,
      banStatus: 'UNBANNED_VERIFIED_CLEAN',
      verificationState: 'VERIFIED_NOT_CHEATING_UNBANNED',
      banReason: null,
      bannedAt: null,
      cooldownExpiresAtMs: null,
      caseId: null,
      linkedBannedAccountName: null,
      suspiciousFlag: false
    };

    const updatedKnown = state.knownAccounts.map((a) => ({
      ...a,
      banStatus: 'CLEAN' as const,
      verificationState: 'VERIFIED_NOT_CHEATING_UNBANNED' as const,
      banReason: null,
      bannedAt: null,
      cooldownExpiresAtMs: null,
      caseId: null,
      linkedBannedAccountName: null,
      suspiciousFlag: false
    }));

    const formattedMsg = formatBoldDiscordWebhookMessage({
      eventTitle: 'VERIFIED NOT CHEATING — IMMEDIATE UNBAN EXECUTED',
      accountName: clearedAccount.accountName,
      steamId: clearedAccount.steamId,
      uniqueId: clearedAccount.uniqueId,
      ipAddress: clearedAccount.ipAddress,
      hwid: clearedAccount.hwid,
      accountCreatedAt: clearedAccount.accountCreatedAt,
      bannedAt: nowIso,
      reason: `Cleared of "${prevReason}" — Verified Not Cheating by Admin`,
      statusText: 'IMMEDIATELY UNBANNED (VERIFIED CLEAN — ALL LINKED ACCOUNTS UNLOCKED)',
      caseId,
      vacNetVersion: state.learning.modelVersion,
      confidence: 0.0
    });

    const logEntry: VacWebhookLogEntry = {
      id: `wh_clear_${Date.now()}`,
      timestamp: nowIso,
      eventTitle: 'VERIFIED NOT CHEATING — IMMEDIATE UNBAN',
      accountName: clearedAccount.accountName,
      steamId: clearedAccount.steamId,
      uniqueId: clearedAccount.uniqueId,
      ipAddress: clearedAccount.ipAddress,
      hwid: clearedAccount.hwid,
      accountCreatedAt: clearedAccount.accountCreatedAt,
      banReason: `Cleared of: ${prevReason}`,
      statusLabel: 'IMMEDIATELY UNBANNED (VERIFIED CLEAN)',
      suspicious: false,
      deliveredToDiscord: true,
      formattedMessage: formattedMsg
    };

    const nextState: Partial<VacNetStoreState> = {
      currentAccount: clearedAccount,
      knownAccounts: updatedKnown,
      activeHwidIpLock: null,
      vacLiveMatchCancelledOverlay: null,
      webhookLogs: [logEntry, ...state.webhookLogs]
    };
    set(nextState);
    savePersistedVacNet({ ...state, ...nextState });
    void dispatchVacNetWebhook(formattedMsg);
  },

  checkAndProcessCooldownTimeout: (forceSimulateExpiry = false) => {
    const state = get();
    const lock = state.activeHwidIpLock;
    const acc = state.currentAccount;

    const isPending24h =
      acc.banStatus === 'VAC_LIVE_COOLDOWN_24H' ||
      (lock && lock.status === 'VAC_LIVE_24H' && lock.verificationState === 'PENDING_VERIFICATION');

    if (!isPending24h) return false;

    const expiresAt = acc.cooldownExpiresAtMs || lock?.cooldownExpiresAtMs || 0;
    const now = Date.now();

    if (!forceSimulateExpiry && now < expiresAt) {
      return false;
    }

    // "if we don't come in time imeaditly unban but still says suspicus in our webhook"
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const caseId = acc.caseId || lock?.caseId || 'VACLIVE-TIMEOUT';
    const origReason = acc.banReason || lock?.reason || 'Irregular Gameplay Detected by VacNet';

    const autoUnbannedAccount: PlayerAccountIdentity = {
      ...acc,
      banStatus: 'UNBANNED_TIMEOUT_SUSPICIOUS',
      verificationState: 'TIMEOUT_AUTO_UNBANNED_SUSPICIOUS',
      banReason: origReason,
      cooldownExpiresAtMs: null,
      suspiciousFlag: true
    };

    const updatedKnown = state.knownAccounts.map((a) => ({
      ...a,
      banStatus: 'UNBANNED_TIMEOUT_SUSPICIOUS' as const,
      verificationState: 'TIMEOUT_AUTO_UNBANNED_SUSPICIOUS' as const,
      cooldownExpiresAtMs: null,
      suspiciousFlag: true
    }));

    const formattedMsg = formatBoldDiscordWebhookMessage({
      eventTitle: '24H VAC LIVE TIMER EXPIRED (NO ADMIN VERIFICATION IN TIME) — AUTO-UNBANNED BUT STILL [SUSPICIOUS]',
      accountName: autoUnbannedAccount.accountName,
      steamId: autoUnbannedAccount.steamId,
      uniqueId: autoUnbannedAccount.uniqueId,
      ipAddress: autoUnbannedAccount.ipAddress,
      hwid: autoUnbannedAccount.hwid,
      accountCreatedAt: autoUnbannedAccount.accountCreatedAt,
      bannedAt: nowIso,
      reason: `${origReason} — [UNVERIFIED WITHIN 24H: IMMEDIATELY UNBANNED BY TIMEOUT, STILL MARKED SUSPICIOUS]`,
      statusText: '⚠️ IMMEDIATELY UNBANNED (TIMEOUT) — STILL FLAGGED AS [SUSPICIOUS] IN WEBHOOK & VACNET',
      caseId,
      vacNetVersion: state.learning.modelVersion,
      confidence: 89.5,
      isSuspiciousTimeout: true
    });

    const logEntry: VacWebhookLogEntry = {
      id: `wh_timeout_${Date.now()}`,
      timestamp: nowIso,
      eventTitle: 'AUTO-UNBANNED (TIMEOUT) — STILL SUSPICIOUS',
      accountName: autoUnbannedAccount.accountName,
      steamId: autoUnbannedAccount.steamId,
      uniqueId: autoUnbannedAccount.uniqueId,
      ipAddress: autoUnbannedAccount.ipAddress,
      hwid: autoUnbannedAccount.hwid,
      accountCreatedAt: autoUnbannedAccount.accountCreatedAt,
      banReason: origReason,
      statusLabel: 'UNBANNED (TIMEOUT) — STILL SUSPICIOUS ⚠️',
      suspicious: true,
      deliveredToDiscord: true,
      formattedMessage: formattedMsg
    };

    const nextState: Partial<VacNetStoreState> = {
      currentAccount: autoUnbannedAccount,
      knownAccounts: updatedKnown,
      activeHwidIpLock: null,
      vacLiveMatchCancelledOverlay: null,
      webhookLogs: [logEntry, ...state.webhookLogs]
    };
    set(nextState);
    savePersistedVacNet({ ...state, ...nextState });
    void dispatchVacNetWebhook(formattedMsg);
    return true;
  },

  dismissMatchCancelledOverlay: () => {
    set({ vacLiveMatchCancelledOverlay: null });
  }
}));

export function buildBoldDiscordWebhookMessage(account: PlayerAccountIdentity): { content: string } {
  const content = formatBoldDiscordWebhookMessage({
    eventTitle: '1-DAY VAC LIVE COOLDOWN ISSUED (HWID + IP LOCKED)',
    accountName: account.accountName,
    steamId: account.steamId,
    uniqueId: account.uniqueId,
    ipAddress: account.ipAddress,
    hwid: account.hwid,
    accountCreatedAt: account.accountCreatedAt,
    bannedAt: account.bannedAt || new Date().toISOString(),
    reason: account.banReason || 'Irregular Gameplay Detected by VacNet',
    statusText: account.banStatus,
    caseId: account.caseId || 'VACLIVE',
    vacNetVersion: 'VacNet 3.0.4-Neural',
    confidence: 99.1
  });
  return { content };
}

export function isAccountCurrentlyBanned(account: PlayerAccountIdentity): boolean {
  return account.banStatus === 'VAC_LIVE_COOLDOWN_24H' || account.banStatus === 'PERMANENT_VAC_BAN';
}

export function formatRemainingCooldown(expiresAtMs: number | null): string {
  if (!expiresAtMs) return '00:00:00';
  const diff = Math.max(0, expiresAtMs - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}
