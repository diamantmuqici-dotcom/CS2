import { Vector3D } from '../../shared/types';
import { useSettingsStore } from '../settings/settingsStore';

export interface PredictedInputCmd {
  seq: number;
  timestampMs: number;
  position: Vector3D;
  yaw: number;
  pitch: number;
}

export interface NetworkTelemetry {
  connected: boolean;
  /**
   * True when the client has deliberately fallen back to a local authoritative
   * simulation because no remote server is reachable (offline / practice play).
   */
  localAuthority: boolean;
  pingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  serverTickRate: number;
  serverTick: number;
  lastAckedSeq: number;
  reconcileCount: number;
  antiCheatAlerts: string[];
}

class AuthoritativeNetworkClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pendingInputs: PredictedInputCmd[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private onReconcileCallback: ((pos: Vector3D) => void) | null = null;

  /**
   * Explicit WebSocket endpoint. Set by the LOCAL LINK button so a player can
   * join a server running on their own machine (or a LAN host) instead of the
   * host the page was served from. `null` = use the page origin.
   */
  private endpointOverride: string | null = null;

  private connectionLostCb: (() => void) | null = null;
  private connectionRestoredCb: (() => void) | null = null;
  private reconnectAttempts = 0;
  private hadConnection = false;

  public telemetry: NetworkTelemetry = {
    connected: false,
    localAuthority: true,
    pingMs: 16,
    jitterMs: 1.2,
    packetLossPercent: 0,
    serverTickRate: 64,
    serverTick: 0,
    lastAckedSeq: 0,
    reconcileCount: 0,
    antiCheatAlerts: []
  };

  public connect(): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.telemetry.localAuthority = false;

    try {
      const wsUrl = this.endpointOverride ?? defaultWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const wasDown = this.hadConnection === false && this.reconnectAttempts > 0;
        this.telemetry.connected = true;
        this.telemetry.localAuthority = false;
        this.reconnectAttempts = 0;
        this.startPingLoop();
        if (wasDown) this.connectionRestoredCb?.();
        this.hadConnection = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          this.handleMessage(msg);
        } catch {
          // Ignore malformed message
        }
      };

      this.ws.onclose = () => {
        const wasConnected = this.telemetry.connected;
        this.telemetry.connected = false;
        if (wasConnected) this.connectionLostCb?.();
      };

      this.ws.onerror = () => {
        this.telemetry.connected = false;
      };
    } catch {
      this.telemetry.connected = false;
    }
  }

  public onConnectionLost(cb: () => void): void {
    this.connectionLostCb = cb;
  }

  /**
   * Points the client at a specific server, e.g. the authoritative server
   * running on the player's own machine at ws://localhost:5173/ws.
   * Pass null to return to the default page-origin endpoint.
   */
  public setEndpoint(url: string | null): void {
    this.endpointOverride = url;
    this.closeSocket();
    this.telemetry.connected = false;
    this.telemetry.localAuthority = true;
    this.reconnectAttempts = 0;
    if (url) this.connect();
  }

  public getEndpoint(): string | null {
    return this.endpointOverride;
  }

  private closeSocket(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Already closing.
      }
      this.ws = null;
    }
  }

  public onConnectionRestored(cb: () => void): void {
    this.connectionRestoredCb = cb;
  }

  /** Immediately tears down the socket and retries the handshake. */
  public reconnectNow(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Already closing
      }
      this.ws = null;
    }
    this.telemetry.connected = false;
    this.reconnectAttempts++;
    this.connect();
  }

  private startPingLoop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING', clientSentAt: performance.now() }));
      }
    }, 1000);
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const netSettings = useSettingsStore.getState().network;

    if (msg.type === 'WELCOME') {
      this.telemetry.serverTickRate = Number(msg.tickRate) || 64;
      this.telemetry.serverTick = Number(msg.serverTick) || 0;
    } else if (msg.type === 'PONG') {
      const sentAt = Number(msg.clientSentAt) || performance.now();
      const rawRtt = Math.max(2, performance.now() - sentAt) + netSettings.simulateLatencyMs;
      const diff = Math.abs(rawRtt - this.telemetry.pingMs);
      this.telemetry.jitterMs = Number((this.telemetry.jitterMs * 0.8 + diff * 0.2).toFixed(1));
      this.telemetry.pingMs = Math.round(this.telemetry.pingMs * 0.7 + rawRtt * 0.3);
      this.telemetry.serverTick = Number(msg.serverTick) || this.telemetry.serverTick;
      this.telemetry.packetLossPercent = netSettings.simulatePacketLossPercent;
    } else if (msg.type === 'ACK_INPUT') {
      const ackSeq = Number(msg.seq) || 0;
      this.telemetry.lastAckedSeq = ackSeq;
      this.telemetry.serverTick = Number(msg.serverTick) || this.telemetry.serverTick;
      this.pendingInputs = this.pendingInputs.filter((cmd) => cmd.seq > ackSeq);
    } else if (msg.type === 'SERVER_RECONCILE') {
      this.telemetry.reconcileCount++;
      const authPos = msg.authoritativePosition as Vector3D | undefined;
      if (authPos && this.onReconcileCallback && netSettings.serverReconciliation) {
        this.onReconcileCallback(authPos);
      }
    } else if (msg.type === 'ANTICHEAT_REJECT') {
      const violation = msg.violation as { details?: string } | undefined;
      if (violation?.details) {
        this.telemetry.antiCheatAlerts = [violation.details, ...this.telemetry.antiCheatAlerts.slice(0, 9)];
      }
    }
  }

  public onServerReconcile(cb: (pos: Vector3D) => void): void {
    this.onReconcileCallback = cb;
  }

  public sendInputCommand(position: Vector3D, yaw: number, pitch: number): number {
    this.seq++;
    const cmd: PredictedInputCmd = {
      seq: this.seq,
      timestampMs: performance.now(),
      position: { ...position },
      yaw,
      pitch
    };
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > 128) {
      this.pendingInputs.shift();
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'INPUT_CMD',
          seq: cmd.seq,
          position: cmd.position,
          yaw: cmd.yaw,
          pitch: cmd.pitch
        })
      );
    } else {
      // Local embedded authority fallback tick increment
      this.telemetry.serverTick++;
      this.telemetry.lastAckedSeq = cmd.seq;
    }
    return this.seq;
  }

  public sendFireEvent(
    weaponId: string,
    distanceMeters: number,
    hitGroup: 'head' | 'chest' | 'stomach' | 'leg',
    targetArmor: number,
    targetHasHelmet: boolean
  ): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'FIRE_EVENT',
          weaponId,
          distanceMeters,
          hitGroup,
          targetArmor,
          targetHasHelmet
        })
      );
    }
  }
}

export const networkClient = new AuthoritativeNetworkClient();

/**
 * Default endpoint: a WebSocket on the same origin as the page.
 *
 * Note this is deliberately NOT the page's own directory. The authoritative
 * server serves `/ws` at the origin root, and on a static host such as GitHub
 * Pages there is no server at all — the socket simply fails to open and the
 * client falls back to its local authoritative simulation, which the launcher
 * reports honestly.
 */
function defaultWebSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
