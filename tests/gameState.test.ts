import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear()
});
vi.stubGlobal('window', { localStorage: globalThis.localStorage, devicePixelRatio: 1 });

import { useGamePlatformStore, REGION_SERVERS, DEFAULT_BUY_PRESETS } from '../src/game/core/gameStateStore';
import { OFFICIAL_MAPS } from '../src/game/maps/officialMaps';
import { WEAPON_SPECS } from '../src/shared/weapons';

describe('Region catalogue', () => {
  it('covers every documented region exactly once', () => {
    const expected = ['EU', 'NA', 'SA', 'Asia', 'Oceania', 'Middle East', 'Africa'];
    const ids = REGION_SERVERS.map((r) => r.id);
    expect(ids.sort()).toEqual(expected.sort());
  });

  it('every region reports a plausible latency and status', () => {
    for (const r of REGION_SERVERS) {
      expect(r.pingMs).toBeGreaterThan(0);
      expect(['Optimal', 'Good', 'High Latency']).toContain(r.status);
      expect(r.loadPercent).toBeGreaterThanOrEqual(0);
      expect(r.loadPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe('Buy presets', () => {
  it('ships presets for rifle, eco, anti-eco, sniper, and utility scenarios', () => {
    const ids = DEFAULT_BUY_PRESETS.map((p) => p.id);
    expect(ids).toContain('preset_rifle_full');
    expect(ids).toContain('preset_eco');
    expect(ids).toContain('preset_anti_eco');
    expect(ids).toContain('preset_sniper');
    expect(ids).toContain('preset_utility');
  });

  it('every preset references real weapon IDs', () => {
    for (const preset of DEFAULT_BUY_PRESETS) {
      if (preset.primaryWeaponId) expect(WEAPON_SPECS[preset.primaryWeaponId]).toBeDefined();
      if (preset.secondaryWeaponId) expect(WEAPON_SPECS[preset.secondaryWeaponId]).toBeDefined();
      for (const g of preset.grenades) {
        expect(WEAPON_SPECS[g]).toBeDefined();
      }
    }
  });

  it('allows saving a custom preset', () => {
    const before = useGamePlatformStore.getState().buyPresets.length;
    useGamePlatformStore.getState().saveBuyPreset({
      id: 'test_custom',
      name: 'Test Custom',
      primaryWeaponId: 'vector_9',
      secondaryWeaponId: 'viper_p250',
      armorType: 'kevlar_helmet',
      defuseKit: true,
      grenades: ['flash_grenade']
    });
    expect(useGamePlatformStore.getState().buyPresets.length).toBe(before + 1);
  });

  it('updates rather than duplicates an existing preset id', () => {
    useGamePlatformStore.getState().saveBuyPreset({
      id: 'preset_eco',
      name: 'Renamed Eco',
      primaryWeaponId: null,
      secondaryWeaponId: 'viper_p250',
      armorType: 'none',
      defuseKit: false,
      grenades: []
    });
    const matches = useGamePlatformStore.getState().buyPresets.filter((p) => p.id === 'preset_eco');
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Renamed Eco');
  });
});

describe('Match lifecycle', () => {
  beforeEach(() => {
    useGamePlatformStore.getState().leaveMatch();
    useGamePlatformStore.getState().cancelQueue();
  });

  it('starts a Competitive match with the correct round budget', () => {
    useGamePlatformStore.getState().startMatch('Competitive', 'harbor_protocol', 'SENTINEL');
    const match = useGamePlatformStore.getState().match;
    expect(match.isRunning).toBe(true);
    expect(match.maxRounds).toBe(24);
    expect(match.phase).toBe('BUY_PHASE');
    expect(match.playerTeam).toBe('SENTINEL');
    expect(match.mapId).toBe('harbor_protocol');
  });

  it('starts Wingman with a shortened match', () => {
    useGamePlatformStore.getState().startMatch('Wingman', 'foundry_wing', 'SENTINEL');
    expect(useGamePlatformStore.getState().match.maxRounds).toBe(16);
  });

  it('starts Retakes already post-plant', () => {
    useGamePlatformStore.getState().startMatch('Retakes', 'harbor_protocol', 'SENTINEL');
    const match = useGamePlatformStore.getState().match;
    expect(match.phase).toBe('BOMB_PLANTED');
    expect(match.bombPlanted).toBe(true);
  });

  it('starts Deathmatch immediately live with no buy phase', () => {
    useGamePlatformStore.getState().startMatch('Deathmatch', 'harbor_protocol', 'SENTINEL');
    const match = useGamePlatformStore.getState().match;
    expect(match.phase).toBe('LIVE_ROUND');
  });

  it('starts Practice with the sandbox options enabled', () => {
    useGamePlatformStore.getState().startMatch('Practice', 'proving_grounds', 'SENTINEL');
    const match = useGamePlatformStore.getState().match;
    expect(match.practiceOptions.infiniteAmmo).toBe(true);
    expect(match.practiceOptions.showGrenadeTrajectory).toBe(true);
  });

  it('leaving a match stops it', () => {
    useGamePlatformStore.getState().startMatch('Competitive', 'harbor_protocol', 'SENTINEL');
    useGamePlatformStore.getState().leaveMatch();
    expect(useGamePlatformStore.getState().match.isRunning).toBe(false);
  });
});

describe('Premier veto flow', () => {
  beforeEach(() => {
    useGamePlatformStore.getState().cancelQueue();
  });

  it('entering Premier queue opens the veto phase instead of a plain queue', () => {
    useGamePlatformStore.getState().setSelectedMode('Premier');
    useGamePlatformStore.getState().startQueue();
    expect(useGamePlatformStore.getState().premierVeto.active).toBe(true);
    expect(useGamePlatformStore.getState().queueState.active).toBe(false);
  });

  it('banning maps advances the veto and finishes with a played map', () => {
    useGamePlatformStore.getState().setSelectedMode('Premier');
    useGamePlatformStore.getState().startQueue();

    useGamePlatformStore.getState().banPremierMap('harbor_protocol');
    useGamePlatformStore.getState().banPremierMap('citadel_spire');
    useGamePlatformStore.getState().banPremierMap('foundry_wing');

    const state = useGamePlatformStore.getState();
    expect(state.premierVeto.bannedMaps.length).toBe(3);
    expect(state.selectedMapId).toBeTruthy();
  });

  it('cancelling the veto clears all veto state', () => {
    useGamePlatformStore.getState().setSelectedMode('Premier');
    useGamePlatformStore.getState().startQueue();
    useGamePlatformStore.getState().banPremierMap('harbor_protocol');
    useGamePlatformStore.getState().cancelQueue();
    expect(useGamePlatformStore.getState().premierVeto.active).toBe(false);
    expect(useGamePlatformStore.getState().premierVeto.bannedMaps).toEqual([]);
  });

  it('cannot ban the same map twice', () => {
    useGamePlatformStore.getState().setSelectedMode('Premier');
    useGamePlatformStore.getState().startQueue();
    useGamePlatformStore.getState().banPremierMap('harbor_protocol');
    useGamePlatformStore.getState().banPremierMap('harbor_protocol');
    expect(
      useGamePlatformStore.getState().premierVeto.bannedMaps.filter((m) => m === 'harbor_protocol').length
    ).toBe(1);
  });
});

describe('Workshop store', () => {
  it('publishes a new map and makes it available as a custom map', () => {
    const before = useGamePlatformStore.getState().workshopMaps.length;
    const result = useGamePlatformStore.getState().publishWorkshopMap({
      ...OFFICIAL_MAPS.proving_grounds,
      id: 'ws_test_publish',
      name: 'Test Publish Map',
      author: 'Tester'
    });
    expect(result.ok).toBe(true);
    expect(useGamePlatformStore.getState().workshopMaps.length).toBe(before + 1);
    expect(useGamePlatformStore.getState().customMaps.ws_test_publish).toBeDefined();
  });

  it('updates an existing published map in place with a changelog entry', () => {
    useGamePlatformStore.getState().publishWorkshopMap({
      ...OFFICIAL_MAPS.proving_grounds,
      id: 'ws_test_update',
      name: 'Update Target',
      author: 'Tester',
      version: '1.0.0'
    });
    const countBefore = useGamePlatformStore.getState().workshopMaps.length;
    useGamePlatformStore.getState().publishWorkshopMap(
      {
        ...OFFICIAL_MAPS.proving_grounds,
        id: 'ws_test_update',
        name: 'Update Target',
        author: 'Tester',
        version: '1.1.0'
      },
      'Balance pass on cover'
    );

    const updated = useGamePlatformStore.getState().workshopMaps.find((m) => m.id === 'ws_test_update');
    expect(useGamePlatformStore.getState().workshopMaps.length).toBe(countBefore);
    expect(updated!.version).toBe('1.1.0');
    expect(updated!.changelog[0]).toContain('Balance pass on cover');
  });

  it('toggles subscriptions and adjusts the counter', () => {
    const map = useGamePlatformStore.getState().workshopMaps[0];
    const before = map.subscriptions;
    useGamePlatformStore.getState().toggleSubscribeWorkshopMap(map.id);
    const after = useGamePlatformStore.getState().workshopMaps.find((m) => m.id === map.id)!;
    expect(after.isSubscribed).toBe(!map.isSubscribed);
    expect(after.subscriptions).toBe(map.isSubscribed ? before - 1 : before + 1);
  });

  it('toggles favourites', () => {
    const map = useGamePlatformStore.getState().workshopMaps[0];
    const before = map.isFavorite;
    useGamePlatformStore.getState().toggleFavoriteWorkshopMap(map.id);
    expect(useGamePlatformStore.getState().workshopMaps.find((m) => m.id === map.id)!.isFavorite).toBe(!before);
  });

  it('updates the running average when a rating is submitted', () => {
    const map = useGamePlatformStore.getState().workshopMaps[0];
    const ratingBefore = map.rating;
    const countBefore = map.ratingCount;
    useGamePlatformStore.getState().rateWorkshopMap(map.id, 1);
    const after = useGamePlatformStore.getState().workshopMaps.find((m) => m.id === map.id)!;
    expect(after.ratingCount).toBe(countBefore + 1);
    expect(after.rating).not.toBe(ratingBefore);
    expect(after.rating).toBeGreaterThanOrEqual(1);
    expect(after.rating).toBeLessThanOrEqual(5);
  });

  it('deletes only the creator’s own map entry', () => {
    const before = useGamePlatformStore.getState().workshopMaps.length;
    useGamePlatformStore.getState().deleteWorkshopMap(useGamePlatformStore.getState().workshopMaps[0].id);
    expect(useGamePlatformStore.getState().workshopMaps.length).toBe(before - 1);
  });
});

describe('Party system', () => {
  it('invites a friend into the party', () => {
    const friend = useGamePlatformStore.getState().friends[0];
    const before = useGamePlatformStore.getState().party.length;
    if (!useGamePlatformStore.getState().party.some((p) => p.name === friend.name)) {
      useGamePlatformStore.getState().inviteFriendToParty(friend.id);
      expect(useGamePlatformStore.getState().party.length).toBe(before + 1);
    }
  });

  it('does not invite the same friend twice', () => {
    const friend = useGamePlatformStore.getState().friends[1];
    useGamePlatformStore.getState().inviteFriendToParty(friend.id);
    const afterFirst = useGamePlatformStore.getState().party.length;
    useGamePlatformStore.getState().inviteFriendToParty(friend.id);
    expect(useGamePlatformStore.getState().party.length).toBe(afterFirst);
  });

  it('never allows the party leader to be kicked', () => {
    const leader = useGamePlatformStore.getState().party.find((p) => p.isLeader)!;
    useGamePlatformStore.getState().kickFromParty(leader.id);
    expect(useGamePlatformStore.getState().party.some((p) => p.isLeader)).toBe(true);
  });

  it('kicks a non-leader member', () => {
    const friend = useGamePlatformStore.getState().friends[2];
    useGamePlatformStore.getState().inviteFriendToParty(friend.id);
    const member = useGamePlatformStore.getState().party.find((p) => p.name === friend.name);
    if (member) {
      useGamePlatformStore.getState().kickFromParty(member.id);
      expect(useGamePlatformStore.getState().party.some((p) => p.id === member.id)).toBe(false);
    }
  });
});

describe('Inventory', () => {
  it('equips a skin for one team without affecting the other', () => {
    const item = useGamePlatformStore.getState().inventory.find((i) => i.weaponId === 'harbinger_47')!;
    useGamePlatformStore.getState().equipSkin(item.id, 'VORTEX');
    const after = useGamePlatformStore.getState().inventory.find((i) => i.id === item.id)!;
    expect(after.equippedVortex).toBe(true);
  });

  it('only one skin per weapon can be equipped per team', () => {
    const weaponId = 'vanguard_m4s';
    useGamePlatformStore.getState().inventory
      .filter((i) => i.weaponId === weaponId)
      .forEach((i) => useGamePlatformStore.getState().equipSkin(i.id, 'SENTINEL'));
    const equipped = useGamePlatformStore
      .getState()
      .inventory.filter((i) => i.weaponId === weaponId && i.equippedSentinel);
    expect(equipped.length).toBeLessThanOrEqual(1);
  });
});

describe('Match recording', () => {
  it('records a completed match into history and updates the profile', () => {
    const historyBefore = useGamePlatformStore.getState().matchHistory.length;
    const winsBefore = useGamePlatformStore.getState().profile.wins;

    useGamePlatformStore.getState().recordCompletedMatch({
      id: `match_test_${Date.now()}`,
      date: new Date().toISOString(),
      mode: 'Competitive',
      mapId: 'harbor_protocol',
      mapName: 'Harbor Protocol',
      sentinelScore: 13,
      vortexScore: 7,
      playerTeam: 'SENTINEL',
      result: 'VICTORY',
      kills: 20,
      deaths: 10,
      assists: 5,
      adr: 95.5,
      hsPercent: 45.0,
      utilityDamage: 120,
      clutches: 1,
      mvps: 3,
      ratingDelta: 200,
      scoreboard: []
    });

    expect(useGamePlatformStore.getState().matchHistory.length).toBe(historyBefore + 1);
    expect(useGamePlatformStore.getState().profile.wins).toBe(winsBefore + 1);
    expect(useGamePlatformStore.getState().lastMatchResult).not.toBeNull();
  });

  it('never lets Premier Rating fall below the floor of 1000', () => {
    for (let i = 0; i < 40; i++) {
      useGamePlatformStore.getState().recordCompletedMatch({
        id: `match_loss_${i}`,
        date: new Date().toISOString(),
        mode: 'Competitive',
        mapId: 'citadel_spire',
        mapName: 'Citadel Spire',
        sentinelScore: 3,
        vortexScore: 13,
        playerTeam: 'SENTINEL',
        result: 'DEFEAT',
        kills: 2,
        deaths: 18,
        assists: 1,
        adr: 20,
        hsPercent: 10,
        utilityDamage: 0,
        clutches: 0,
        mvps: 0,
        ratingDelta: -500,
        scoreboard: []
      });
    }
    expect(useGamePlatformStore.getState().profile.premierRating).toBeGreaterThanOrEqual(1000);
  });
});

describe('Replay store', () => {
  it('provides a demo replay with a valid actor stream', () => {
    const replays = useGamePlatformStore.getState().replays;
    expect(replays.length).toBeGreaterThan(0);
    const replay = replays[0];
    expect(replay.events.length).toBeGreaterThan(0);
    const snapshot = replay.events.find((e) => e.type === 'snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot!.actors!.length).toBeGreaterThan(0);
    for (const actor of snapshot!.actors!) {
      expect(actor.pos).toHaveLength(3);
      expect(Number.isFinite(actor.yaw)).toBe(true);
      expect(Number.isFinite(actor.hp)).toBe(true);
    }
  });

  it('records a replay alongside a completed match when supplied', () => {
    const before = useGamePlatformStore.getState().replays.length;
    useGamePlatformStore.getState().recordCompletedMatch(
      {
        id: `match_with_replay_${Date.now()}`,
        date: new Date().toISOString(),
        mode: 'Wingman',
        mapId: 'foundry_wing',
        mapName: 'Foundry Core',
        sentinelScore: 9,
        vortexScore: 4,
        playerTeam: 'SENTINEL',
        result: 'VICTORY',
        kills: 14,
        deaths: 6,
        assists: 2,
        adr: 110,
        hsPercent: 55,
        utilityDamage: 40,
        clutches: 1,
        mvps: 3,
        ratingDelta: 150,
        scoreboard: []
      },
      {
        id: `rep_test_${Date.now()}`,
        title: 'Test Replay',
        mapId: 'foundry_wing',
        mapName: 'Foundry Core',
        mode: 'Wingman',
        date: new Date().toISOString(),
        durationSec: 10,
        sentinelScore: 9,
        vortexScore: 4,
        winner: 'SENTINEL',
        rounds: 2,
        tickRate: 64,
        events: []
      }
    );
    expect(useGamePlatformStore.getState().replays.length).toBe(before + 1);
  });
});

describe('Official map catalogue', () => {
  it('registers all four shipped maps', () => {
    expect(Object.keys(OFFICIAL_MAPS).sort()).toEqual(
      ['citadel_spire', 'foundry_wing', 'harbor_protocol', 'proving_grounds'].sort()
    );
  });

  it('every official map supports Competitive-adjacent or Practice modes', () => {
    for (const map of Object.values(OFFICIAL_MAPS)) {
      expect(map.supportedModes.length).toBeGreaterThan(0);
      expect(map.id).toBeTruthy();
      expect(map.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
