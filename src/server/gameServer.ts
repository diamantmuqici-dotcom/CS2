import type { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  validateFireInterval,
  validateMovementBudget,
  validateViewAnglesAndSnap,
  validateWorkshopPackage,
  createMovementBudget,
  MovementBudgetState,
  PlayerValidationState,
  AntiCheatViolation
} from '../shared/security';
import { WEAPON_SPECS, calculateWeaponDamage } from '../shared/weapons';
import { OFFICIAL_MAPS } from '../game/maps/officialMaps';
import type { GameModeId, RegionId } from '../shared/types';

export interface ServerSessionClient {
  id: string;
  username: string;
  role: 'User' | 'Creator' | 'Moderator' | 'Admin';
  ws: WebSocket;
  validation: PlayerValidationState;
  movementBudget: MovementBudgetState;
  violations: AntiCheatViolation[];
  money: number;
  ownedWeapons: Set<string>;
  armor: number;
  hasHelmet: boolean;
  lastSeq: number;
}

export class AuthoritativeGameServer {
  private clients = new Map<string, ServerSessionClient>();
  private serverTick = 0;
  private tickRate = 64;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private workshopStore = Object.values(OFFICIAL_MAPS).map((m) => ({
    id: m.id,
    name: m.name,
    author: m.author,
    version: m.version,
    supportedModes: m.supportedModes
  }));

  public attachWebSocketServer(server: HttpServer): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = request.url || '';
      if (url.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    });

    wss.on('connection', (ws: WebSocket) => {
      const clientId = `op_${Math.random().toString(36).slice(2, 9)}`;
      const session: ServerSessionClient = {
        id: clientId,
        username: 'Operative_Zero',
        role: 'Admin',
        ws,
        validation: {
          lastPosition: { x: 0, y: 0, z: -42 },
          lastTimestampMs: Date.now(),
          hasBaseline: false,
          lastFireTimestampMs: 0,
          lastYaw: 0,
          lastPitch: 0,
          violationScore: 0,
          violations: []
        },
        movementBudget: createMovementBudget(),
        violations: [],
        money: 800,
        ownedWeapons: new Set(['vp9_tactical', 'kestrel_18', 'combat_blade']),
        armor: 0,
        hasHelmet: false,
        lastSeq: 0
      };

      this.clients.set(clientId, session);

      ws.send(
        JSON.stringify({
          type: 'WELCOME',
          clientId,
          serverTick: this.serverTick,
          tickRate: this.tickRate,
          timestamp: Date.now()
        })
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          this.handleClientPacket(session, msg);
        } catch {
          // Ignore malformed packet
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });
    });

    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => {
        this.serverTick++;
      }, Math.round(1000 / this.tickRate));
    }

    return wss;
  }

  private handleClientPacket(client: ServerSessionClient, msg: Record<string, unknown>): void {
    const now = Date.now();

    if (msg.type === 'PING') {
      client.ws.send(
        JSON.stringify({
          type: 'PONG',
          clientSentAt: msg.clientSentAt,
          serverTime: now,
          serverTick: this.serverTick,
          tickRate: this.tickRate
        })
      );
      return;
    }

    if (msg.type === 'INPUT_CMD') {
      const seq = Number(msg.seq) || 0;
      const pos = msg.position as { x: number; y: number; z: number } | undefined;
      const yaw = Number(msg.yaw) || 0;
      const pitch = Number(msg.pitch) || 0;

      if (pos && typeof pos.x === 'number') {
        const dtSec = (now - client.validation.lastTimestampMs) / 1000;
        // The first packet after spawn establishes the authoritative baseline.
        // Subsequent packets are validated against a time-regenerated movement
        // budget, which tolerates jitter and coalesced packets while still
        // catching genuine teleports and sustained speed exploits.
        const moveViolation = client.validation.hasBaseline
          ? validateMovementBudget(client.validation.lastPosition, pos, dtSec, client.movementBudget)
          : null;
        const angleViolation = validateViewAnglesAndSnap(
          client.validation.lastYaw,
          client.validation.lastPitch,
          yaw,
          pitch,
          dtSec,
          false
        );
        client.validation.hasBaseline = true;

        if (moveViolation) {
          client.validation.violations.push(moveViolation);
          client.violations.push(moveViolation);
          if (client.violations.length > 50) client.violations.shift();
          // Server reconciles client back to last valid position
          client.ws.send(
            JSON.stringify({
              type: 'SERVER_RECONCILE',
              seq,
              authoritativePosition: client.validation.lastPosition,
              violation: moveViolation
            })
          );
          return;
        }

        if (angleViolation) {
          client.validation.violations.push(angleViolation);
          client.violations.push(angleViolation);
          if (client.violations.length > 50) client.violations.shift();
        }

        client.validation.lastPosition = { ...pos };
        client.validation.lastTimestampMs = now;
        client.validation.lastYaw = yaw;
        client.validation.lastPitch = pitch;
        client.lastSeq = seq;

        client.ws.send(
          JSON.stringify({
            type: 'ACK_INPUT',
            seq,
            serverTick: this.serverTick,
            authoritativePosition: client.validation.lastPosition
          })
        );
      }
      return;
    }

    if (msg.type === 'FIRE_EVENT') {
      const weaponId = String(msg.weaponId || 'vp9_tactical');
      const distanceMeters = Math.max(0, Number(msg.distanceMeters) || 10);
      const hitGroup = (msg.hitGroup as 'head' | 'chest' | 'stomach' | 'leg') || 'chest';
      const targetArmor = Number(msg.targetArmor) || 0;
      const targetHasHelmet = Boolean(msg.targetHasHelmet);

      const fireViolation = validateFireInterval(weaponId, client.validation.lastFireTimestampMs, now);
      if (fireViolation) {
        client.validation.violations.push(fireViolation);
        client.violations.push(fireViolation);
        if (client.violations.length > 50) client.violations.shift();
        client.ws.send(
          JSON.stringify({
            type: 'ANTICHEAT_REJECT',
            violation: fireViolation
          })
        );
        return;
      }

      client.validation.lastFireTimestampMs = now;
      const spec = WEAPON_SPECS[weaponId];
      if (spec) {
        const dmg = calculateWeaponDamage({
          weapon: spec,
          distanceMeters,
          hitGroup,
          targetArmor,
          targetHasHelmet
        });
        client.ws.send(
          JSON.stringify({
            type: 'HIT_CONFIRMED',
            weaponId,
            healthDamage: dmg.healthDamage,
            armorDamage: dmg.armorDamage,
            serverTick: this.serverTick
          })
        );
      }
      return;
    }

    if (msg.type === 'BUY_REQUEST') {
      const itemId = String(msg.itemId || '');
      const currentMoney = Number(msg.currentMoney) || client.money;
      const spec = WEAPON_SPECS[itemId];
      if (spec && currentMoney >= spec.price) {
        client.money = currentMoney - spec.price;
        client.ownedWeapons.add(itemId);
        client.ws.send(
          JSON.stringify({
            type: 'BUY_APPROVED',
            itemId,
            remainingMoney: client.money,
            serverTick: this.serverTick
          })
        );
      }
    }
  }

  public getHealthStatus() {
    const totalViolations = Array.from(this.clients.values()).reduce(
      (sum, c) => sum + c.violations.length,
      0
    );
    return {
      status: 'online',
      service: 'CSGO Authoritative Server',
      tickRate: this.tickRate,
      currentTick: this.serverTick,
      connectedClients: this.clients.size,
      antiCheatActive: true,
      antiCheatViolations: totalViolations,
      workshopMapCount: this.workshopStore.length
    };
  }

  /**
   * Allocates a verified match ticket for the HTTP matchmaking boundary.
   * The ticket is intentionally server-created; the browser never chooses a
   * server endpoint or match identifier. A production deployment can replace
   * the in-process allocator with a fleet/queue service without changing the
   * client contract.
   */
  public allocateMatch(payload: unknown) {
    const request = payload as Partial<{ mode: GameModeId; mapId: string; region: RegionId; partySize: number; rating: number; clientVersion: string }> | null;
    const modes: GameModeId[] = ['Competitive', 'Premier', 'Wingman', 'Rush', 'Casual', 'Deathmatch', 'Retakes', 'Practice', 'Custom'];
    const regions: RegionId[] = ['EU', 'NA', 'SA', 'Asia', 'Oceania', 'Middle East', 'Africa'];
    if (!request || !modes.includes(request.mode as GameModeId) || !regions.includes(request.region as RegionId)) {
      return { ok: false, error: { code: 'MATCHMAKING_INVALID_REQUEST', message: 'The queue request could not be validated.', retryable: false } };
    }
    const mapId = String(request.mapId || '');
    if (!OFFICIAL_MAPS[mapId] && !mapId.startsWith('ws_')) {
      return { ok: false, error: { code: 'MATCHMAKING_MAP_UNAVAILABLE', message: 'That map is not available on the selected server.', retryable: false } };
    }
    const mode = request.mode as GameModeId;
    const tickRate = mode === 'Premier' || mode === 'Competitive' ? 128 : 64;
    const now = Date.now();
    return {
      ok: true,
      matchId: `srv_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      serverId: `authority-${String(request.region).toLowerCase()}-01`,
      endpoint: 'ws://authoritative-session.internal/ws',
      region: request.region,
      mode,
      mapId,
      tickRate,
      playerSlots: Math.max(2, Math.min(10, Number(request.partySize) || 1)),
      issuedAt: now,
      expiresAt: now + 60_000,
      source: 'SERVER' as const
    };
  }

  /** Returns the anti-cheat telemetry recorded for a session (moderator/admin only). */
  public getSessionViolations(clientId: string): AntiCheatViolation[] {
    return this.clients.get(clientId)?.violations ?? [];
  }

  /** Applies an authoritative authoritative patch of the client's position (used for reconciliation tests). */
  public forceBaseline(clientId: string, position: { x: number; y: number; z: number }): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.validation.lastPosition = { ...position };
    client.validation.hasBaseline = false;
  }

  public validateAndStoreWorkshopMap(payload: unknown) {
    const res = validateWorkshopPackage(payload);
    if (res.valid && res.sanitizedMap) {
      this.workshopStore.unshift({
        id: res.sanitizedMap.id,
        name: res.sanitizedMap.name,
        author: res.sanitizedMap.author,
        version: res.sanitizedMap.version,
        supportedModes: res.sanitizedMap.supportedModes
      });
    }
    return res;
  }
}

export const authoritativeServer = new AuthoritativeGameServer();
