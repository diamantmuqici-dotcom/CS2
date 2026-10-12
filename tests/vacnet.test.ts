import { describe, it, expect, beforeEach } from 'vitest';
import {
  useVacNetStore,
  VACNET_DISCORD_WEBHOOK_URL,
  OFFICIAL_DISCORD_INVITE_URL,
  VAC_LIVE_COOLDOWN_DURATION_MS,
  buildBoldDiscordWebhookMessage,
  isAccountCurrentlyBanned
} from '../src/shared/vacnet';
import { DEFAULT_KEYBINDS, useSettingsStore } from '../src/game/settings/settingsStore';

describe('VacNet 3.0 & VAC Live Anti-Cheat + CS2/CS:GO Systems', () => {
  beforeEach(() => {
    // Reset to clean state before each test
    useVacNetStore.getState().verifyPlayerNotCheatingUnban();
  });

  it('configures the exact Discord Webhook URL, Discord Ticket Invite URL, and 24-hour (1-day) VAC Live cooldown', () => {
    expect(VACNET_DISCORD_WEBHOOK_URL).toBe(
      'https://discord.com/api/webhooks/1555586294179037194/r59KbmF6Qe96tMlukr5CtsG1NW4tB-sil2BmcqOBfKgjPkBYxLWNkA7_qH-Yz473tpGY'
    );
    expect(OFFICIAL_DISCORD_INVITE_URL).toBe('https://discord.gg/sC8FXyUGnd');
    expect(VAC_LIVE_COOLDOWN_DURATION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('issues a 1-Day (24h) VAC Live Cooldown with HWID, IP, SteamID, UniqueID, Account Name, and Creation Date', () => {
    const store = useVacNetStore.getState();
    const record = store.triggerVacLiveBan('Aimbot + Sub-Tick Spinbot Anomaly');

    const updated = useVacNetStore.getState();
    expect(isAccountCurrentlyBanned(updated.currentAccount)).toBe(true);
    expect(updated.currentAccount.banStatus).toBe('VAC_LIVE_COOLDOWN_24H');
    expect(record.hwid).toMatch(/^HWID-/);
    expect(record.ipAddress).toBeTruthy();
    expect(record.steamId).toMatch(/^STEAM_1:/);
    expect(record.uniqueId).toMatch(/^CS2-UID-/);
    expect(record.accountCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    // Bold webhook payload verification
    const payload = buildBoldDiscordWebhookMessage(record);
    expect(payload.content).toContain('**VACNET 3.0 & VAC LIVE ANTI-CHEAT ENFORCEMENT REPORT**');
    expect(payload.content).toContain(`**ACCOUNT NAME:** **${record.accountName}**`);
    expect(payload.content).toContain(`**HWID (HARDWARE ID):** **${record.hwid}**`);
    expect(payload.content).toContain(`**IP ADDRESS:** **${record.ipAddress}**`);
    expect(payload.content).toContain(`**DATE ACCOUNT CREATED:** **${record.accountCreatedAt}**`);
    expect(payload.content).toContain(`**REASON FOR BAN:** **Aimbot + Sub-Tick Spinbot Anomaly**`);
    expect(payload.content).toContain(OFFICIAL_DISCORD_INVITE_URL);
  });

  it('immediately VAC-bans any other account on the same HWID/IP when switching accounts during a 1-Day VAC Live Cooldown', () => {
    const store = useVacNetStore.getState();
    store.triggerVacLiveBan('Wallhack + Triggerbot');

    // Switch to a brand new alternate account on the same PC (HWID + IP)
    const switchResult = useVacNetStore.getState().switchOrCreateAccount('SmurfAccount_99');
    expect(switchResult.autoBannedByHwidIp).toBe(true);
    expect(isAccountCurrentlyBanned(switchResult.account)).toBe(true);
    expect(switchResult.account.banStatus).toBe('VAC_LIVE_COOLDOWN_24H');
    expect(switchResult.account.banReason).toContain('VacNet HWID/IP Link Enforcement');
  });

  it('supports the 3 staff verification outcomes: Permanent Ban, Immediate Unban, and Not Verified in Time (Auto-Unban + Still Suspicious in Webhook)', () => {
    // Outcome 1: Verified Cheating -> Permanent Ban
    useVacNetStore.getState().triggerVacLiveBan('Spinbot Detected');
    useVacNetStore.getState().verifyPlayerCheatingPermanent();
    expect(useVacNetStore.getState().currentAccount.banStatus).toBe('PERMANENT_VAC_BAN');
    expect(isAccountCurrentlyBanned(useVacNetStore.getState().currentAccount)).toBe(true);

    // Outcome 2: Verified Not Cheating -> Immediate Unban
    useVacNetStore.getState().verifyPlayerNotCheatingUnban();
    expect(useVacNetStore.getState().currentAccount.banStatus).toBe('UNBANNED_VERIFIED_CLEAN');
    expect(isAccountCurrentlyBanned(useVacNetStore.getState().currentAccount)).toBe(false);

    // Outcome 3: Not Verified in Time (24h expires) -> Immediate Unban + Still Suspicious in Webhook
    useVacNetStore.getState().triggerVacLiveBan('Unverified Flick Anomaly');
    useVacNetStore.getState().checkAndProcessCooldownTimeout(true);
    const afterTimeout = useVacNetStore.getState().currentAccount;
    expect(afterTimeout.banStatus).toBe('UNBANNED_TIMEOUT_SUSPICIOUS');
    expect(isAccountCurrentlyBanned(afterTimeout)).toBe(false);
    expect(afterTimeout.suspiciousFlag).toBe(true);

    const lastLog = useVacNetStore.getState().webhookLogs[0];
    expect(lastLog.eventTitle).toContain('STILL SUSPICIOUS');
    expect(lastLog.suspicious).toBe(true);
  });

  it('learns from bans in VacNet 3.0 self-learning neural state', () => {
    const genBefore = useVacNetStore.getState().neuralModel.generation;
    useVacNetStore.getState().triggerVacLiveBan('Aimbot Pattern #4');
    const genAfter = useVacNetStore.getState().neuralModel.generation;
    expect(genAfter).toBeGreaterThan(genBefore);
  });

  it('includes CS2 default keybinds and CS:GO Graphics + Low-End/Mid-End PC optimizations', () => {
    expect(DEFAULT_KEYBINDS.lastWeaponUsed).toBe('KeyQ');
    expect(DEFAULT_KEYBINDS.dropWeapon).toBe('KeyG');
    expect(DEFAULT_KEYBINDS.buyMenu).toBe('KeyB');
    expect(DEFAULT_KEYBINDS.autoBuy).toBe('F1');
    expect(DEFAULT_KEYBINDS.rebuy).toBe('F2');

    useSettingsStore.getState().applyPreset('LOW_END_PC');
    expect(useSettingsStore.getState().video.csgoClassicGraphics).toBe(true);
    expect(useSettingsStore.getState().video.shaderDetailMode).toBe('CSGO_Fast_Lambert');

    useSettingsStore.getState().applyPreset('MID_END_PC');
    expect(useSettingsStore.getState().video.csgoClassicGraphics).toBe(true);
    expect(useSettingsStore.getState().video.shaderDetailMode).toBe('CSGO_Classic_Phong');
  });
});
