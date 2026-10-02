/**
 * LOCAL LINK — a zero-latency session launcher.
 *
 * A round, map-plate button pinned to the top command bar. Pressing it opens
 * a session against the authoritative server running on the player's own
 * machine (or a LAN host they name), so a match with friends is not routed
 * through the public hosting.
 *
 * Behaviour:
 *  - Probes the endpoint with a short, explicit WebSocket handshake.
 *  - On success, joins that server and launches a match immediately.
 *  - On failure, it does NOT fake a connection: it reports the reason and
 *    offers the local embedded-authority match, which genuinely has no
 *    network hop at all.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, X, Loader2, Users, Server, Zap, Copy, Check } from 'lucide-react';
import { networkClient } from '../../game/network/networkClient';

export type LocalLinkStatus = 'idle' | 'probing' | 'connected' | 'failed';

export interface LocalLinkResult {
  ok: boolean;
  status: LocalLinkStatus;
  endpoint: string;
  message: string;
  latencyMs: number | null;
}

const DEFAULT_HOSTS = ['localhost:5173', '127.0.0.1:5173'];

/** Opens a WebSocket and resolves as soon as it is open, or rejects. */
function probeSocket(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const started = performance.now();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch {
        /* already closed */
      }
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error(`No response from ${url} after ${timeoutMs} ms.`))),
      timeoutMs
    );

    ws.onopen = () => finish(() => resolve(Math.round(performance.now() - started)));
    ws.onerror = () => finish(() => reject(new Error(`Could not reach ${url}.`)));
    ws.onclose = () => finish(() => reject(new Error(`${url} closed before the handshake completed.`)));
  });
}

function normaliseHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept "localhost", "localhost:5173", "http://host:5173", "ws://host:5173/ws".
  if (/^wss?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}/ws`;
  }
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withProto);
    return `ws://${url.host}/ws`;
  } catch {
    return null;
  }
}

/** Loopback and .local hosts are exempt from the mixed-content rule. */
function isSecureContextHost(host: string): boolean {
  const h = host.replace(/:\d+$/, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost') || h.endsWith('.local');
}

/**
 * A page served over HTTPS cannot open an insecure WebSocket to a non-loopback
 * host — the browser blocks it before it leaves the machine. Detecting that up
 * front turns an opaque connection failure into an accurate explanation.
 */
function mixedContentBlock(endpoint: string): string | null {
  if (!window.isSecureContext) return null;
  if (!endpoint.startsWith('ws://')) return null;
  let host = '';
  try {
    host = new URL(endpoint).host;
  } catch {
    return null;
  }
  if (isSecureContextHost(host)) return null;
  return (
    `This page is served over HTTPS, so the browser blocks insecure WebSocket connections to ${host}. ` +
    `Serve the game server over HTTPS/wss, or open this page from http://localhost to connect to a local or LAN host.`
  );
}

export const LocalLinkButton: React.FC<{ onLaunch: (endpoint: string | null) => void }> = ({
  onLaunch
}) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LocalLinkStatus>('idle');
  const [host, setHost] = useState('localhost:5173');
  const [result, setResult] = useState<LocalLinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Deferred so the click that opened the dialog does not immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(t);
    };
  }, [open]);

  const connectAndLaunch = useCallback(
    async (rawHost: string) => {
      const endpoint = normaliseHost(rawHost);
      if (!endpoint) {
        setResult({
          ok: false,
          status: 'failed',
          endpoint: rawHost,
          message: 'That does not look like a valid host.',
          latencyMs: null
        });
        setStatus('failed');
        return;
      }

      setStatus('probing');
      setResult(null);

      // Fail fast with an accurate reason rather than letting the browser
      // block the socket and report a generic "could not connect".
      const blocked = mixedContentBlock(endpoint);
      if (blocked) {
        setStatus('failed');
        setLatency(null);
        setResult({ ok: false, status: 'failed', endpoint, message: blocked, latencyMs: null });
        return;
      }

      const candidates = rawHost.trim() === 'localhost' || rawHost.trim() === '' ? DEFAULT_HOSTS : [rawHost];
      let lastError = 'No host was reachable.';

      for (const candidate of candidates) {
        const candidateEndpoint = normaliseHost(candidate);
        if (!candidateEndpoint) continue;
        try {
          const ms = await probeSocket(candidateEndpoint, 2500);
          setLatency(ms);
          setStatus('connected');
          networkClient.setEndpoint(candidateEndpoint);
          setResult({
            ok: true,
            status: 'connected',
            endpoint: candidateEndpoint,
            message: `Connected to ${candidateEndpoint} in ${ms} ms.`,
            latencyMs: ms
          });
          setOpen(false);
          onLaunch(candidateEndpoint);
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      setStatus('failed');
      setLatency(null);
      setResult({
        ok: false,
        status: 'failed',
        endpoint,
        message: lastError,
        latencyMs: null
      });
    },
    [onLaunch]
  );

  const launchLocalOnly = useCallback(() => {
    networkClient.setEndpoint(null);
    setStatus('connected');
    setLatency(0);
    setResult({
      ok: true,
      status: 'connected',
      endpoint: 'embedded',
      message:
        'No server found — starting the embedded local authority. There is no network hop, so input latency is zero.',
      latencyMs: 0
    });
    setOpen(false);
    onLaunch(null);
  }, [onLaunch]);

  const copyInvite = async () => {
    const url = `${location.origin}${location.pathname}#local`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the URL is visible in the field anyway.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Local link — play at zero ping with friends on your own machine or LAN"
        className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-600/70 bg-gradient-to-br from-cyan-600/25 to-slate-900 text-cyan-300 shadow-lg shadow-cyan-950/60 transition hover:border-cyan-400 hover:from-cyan-500/40 hover:text-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {/* Rotating map-plate ring — GPU-cheap, disabled under reduced motion. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed border-cyan-500/40 motion-safe:animate-[spin_14s_linear_infinite]"
        />
        <span className="pointer-events-none absolute inset-[7px] rounded-full bg-cyan-500/10" />
        <MapPin className="relative h-[18px] w-[18px]" strokeWidth={2.2} />
        {status === 'connected' && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        )}
        {status === 'probing' && (
          <Loader2 className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-spin text-amber-300" />
        )}
        <span className="sr-only">Local link — zero ping session</span>
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="false"
          aria-label="Local link"
          className="fixed left-1/2 top-20 z-[9997] w-[min(420px,92vw)] -translate-x-1/2 rounded-lg border border-tac-border bg-tac-panel/95 p-4 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400" />
            <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-white">Local Link</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto rounded p-1 text-slate-500 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
            Connect straight to an authoritative server on your own machine or LAN. Traffic never leaves
            your network, so there is no routing delay between you and your friends.
          </p>

          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Server address
          </label>
          <div className="mb-2 flex gap-1.5">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void connectAndLaunch(host);
              }}
              placeholder="localhost:5173"
              spellCheck={false}
              autoComplete="off"
              aria-label="Local server address"
              className="min-w-0 flex-1 rounded border border-tac-border bg-tac-panel2 px-2.5 py-1.5 font-mono text-[11px] text-slate-100 outline-none focus:border-cyan-600"
            />
            <button
              type="button"
              onClick={() => void connectAndLaunch(host)}
              disabled={status === 'probing'}
              className="flex shrink-0 items-center gap-1.5 rounded border border-cyan-700 bg-cyan-950/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-900/60 disabled:opacity-50"
            >
              {status === 'probing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Connect
            </button>
          </div>

          <p className="mb-3 font-mono text-[9px] leading-relaxed text-slate-600">
            Start the bundled server with <code className="text-slate-400">npm run server</code>, or{' '}
            <code className="text-slate-400">npm run dev</code>, then share your LAN IP with friends.
            {window.isSecureContext && (
              <>
                {' '}
                This page is HTTPS, so a LAN address must also be served over{' '}
                <code className="text-slate-400">wss://</code>; loopback always works.
              </>
            )}
          </p>

          {result && (
            <div
              className={`mb-3 rounded border px-2.5 py-2 text-[10px] leading-relaxed ${
                result.ok
                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
                  : 'border-red-900 bg-red-950/40 text-red-200'
              }`}
            >
              <div className="font-bold">{result.ok ? 'Connected' : 'Could not connect'}</div>
              <div className="mt-0.5 font-mono opacity-90">{result.message}</div>
              {result.ok && result.latencyMs !== null && (
                <div className="mt-1 font-mono text-emerald-300/90">
                  Measured handshake: {result.latencyMs} ms
                  {result.latencyMs === 0 ? ' (no network hop)' : ''}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={launchLocalOnly}
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-900/50"
            >
              <Server className="h-3 w-3" />
              Play offline instantly
            </button>
            <button
              type="button"
              onClick={copyInvite}
              className="flex items-center gap-1.5 rounded border border-tac-border bg-tac-panel2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-cyan-700"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copy invite
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1.5 border-t border-tac-border/60 pt-2.5 text-[9px] text-slate-600">
            <Users className="h-3 w-3" />
            Share this page with friends on the same network and press LOCAL LINK to join the same host.
          </div>
        </div>
      )}
    </>
  );
};
