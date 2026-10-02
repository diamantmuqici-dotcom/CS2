/**
 * Authoritative server + anti-cheat end-to-end verification harness.
 *
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. Run:                   node scripts/verify-server.mjs [host:port]
 *
 * Verifies the full network contract: handshake, tick/ping telemetry, client
 * input acknowledgement, movement-budget anti-cheat, fire-rate anti-cheat,
 * server reconciliation, and authoritative purchase validation.
 */
import WebSocket from 'ws';
const target = process.argv[2] || 'localhost:5173';
const ws = new WebSocket(`ws://${target}/ws`);
const received = [];
let seq = 0;
const sendInput = (x, z) => { seq++; ws.send(JSON.stringify({ type: 'INPUT_CMD', seq, position: { x, y: 0, z }, yaw: 0.4, pitch: 0.05 })); };

ws.on('open', async () => {
  ws.send(JSON.stringify({ type: 'PING', clientSentAt: Date.now() }));

  // Baseline packet
  sendInput(0, -42);
  await new Promise(r => setTimeout(r, 40));

  // Realistic 32 Hz walk
  let x = 0, z = -42;
  for (let i = 0; i < 12; i++) {
    x += 0.21; z -= 0.05;
    sendInput(x, z);
    await new Promise(r => setTimeout(r, 31));
  }

  // Legit shot
  ws.send(JSON.stringify({ type: 'FIRE_EVENT', weaponId: 'harbinger_47', distanceMeters: 20, hitGroup: 'head', targetArmor: 100, targetHasHelmet: true }));
  await new Promise(r => setTimeout(r, 260));

  // Rapid-fire abuse: two shots fired back-to-back (0ms apart, far below the 100ms interval)
  ws.send(JSON.stringify({ type: 'FIRE_EVENT', weaponId: 'harbinger_47', distanceMeters: 20, hitGroup: 'head', targetArmor: 100, targetHasHelmet: true }));
  ws.send(JSON.stringify({ type: 'FIRE_EVENT', weaponId: 'harbinger_47', distanceMeters: 20, hitGroup: 'head', targetArmor: 100, targetHasHelmet: true }));
  await new Promise(r => setTimeout(r, 120));

  // Teleport hack
  sendInput(90, 90);
  await new Promise(r => setTimeout(r, 120));

  // Unaffordable buy
  ws.send(JSON.stringify({ type: 'BUY_REQUEST', itemId: 'monolith_awm', currentMoney: 500 }));
  // Affordable buy
  ws.send(JSON.stringify({ type: 'BUY_REQUEST', itemId: 'vector_9', currentMoney: 5000 }));
  await new Promise(r => setTimeout(r, 400));

  ws.close();
});

ws.on('message', (d) => received.push(JSON.parse(String(d))));
ws.on('close', () => {
  const types = received.map(m => m.type);
  const checks = {
    'welcome handshake': types.includes('WELCOME'),
    'ping/pong latency': types.includes('PONG'),
    'legit input acked (no false positives)': received.filter(m => m.type === 'ACK_INPUT').length >= 12,
    'exactly one reconcile (the teleport only)': received.filter(m => m.type === 'SERVER_RECONCILE').length === 1,
    'legit hit confirmed': received.some(m => m.type === 'HIT_CONFIRMED'),
    'rapid-fire rejected': received.some(m => m.type === 'ANTICHEAT_REJECT' && m.violation?.type === 'IMPOSSIBLE_FIRE_RATE'),
    'teleport rejected': received.some(m => m.type === 'SERVER_RECONCILE' && m.violation?.type === 'IMPOSSIBLE_MOVEMENT_SPEED'),
    'unaffordable buy denied': !received.some(m => m.type === 'BUY_APPROVED' && m.itemId === 'monolith_awm'),
    'affordable buy approved': received.some(m => m.type === 'BUY_APPROVED' && m.itemId === 'vector_9')
  };
  console.log('Acknowledgements:', received.filter(m => m.type === 'ACK_INPUT').length);
  console.log('Reconciles:', received.filter(m => m.type === 'SERVER_RECONCILE').length);
  console.log();
  let allPass = true;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? 'PASS ' : 'FAIL ') + k); if (!v) allPass = false; }
  process.exit(allPass ? 0 : 1);
});
ws.on('error', (e) => { console.error('WS ERROR', e.message); process.exit(1); });
