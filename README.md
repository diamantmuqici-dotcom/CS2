# VANGUARD PROTOCOL

**A browser-based competitive tactical FPS platform with an original 3D engine, authoritative multiplayer architecture, a map workshop, and a live in-browser map editor.**

Vanguard Protocol is an original, independently developed project. It contains no third-party game code, assets, models, textures, audio, map layouts, or branding. Every weapon, map, sound, prop, and UI element is generated procedurally in code or authored for this project.

---

## Table of contents

1. [What is actually implemented](#1-what-is-actually-implemented)
2. [Architecture](#2-architecture)
3. [Running locally](#3-running-locally)
4. [Production build & deployment](#4-production-build--deployment)
5. [Testing & verification](#5-testing--verification)
6. [Backend requirements](#6-backend-requirements)
7. [Database requirements](#7-database-requirements)
8. [Performance engineering](#8-performance-engineering)
9. [Anti-cheat & security model](#9-anti-cheat--security-model)
10. [Browser support & the renderer hierarchy](#10-browser-support--the-renderer-hierarchy)
11. [Known gaps / honest remaining work](#11-known-gaps--honest-remaining-work)

---

## 1. What is actually implemented

### Playable game (vertical slice, verified)

| System | Status |
| --- | --- |
| Main menu launcher (7 sections, keyboard-navigable) | Working |
| 3D renderer (Three.js / WebGL2, original procedural geometry) | Working |
| First-person camera + raw Pointer Lock mouse look | Working |
| WASD movement, crouch, walk, jump, acceleration, friction, air control | Working |
| Ramps, stairs, ladders, water volumes, step-up, collision, occlusion | Working |
| Weapons: 20 firearms + melee + 5 grenades with full ballistics tables | Working |
| Fire, spread/bloom, recoil patterns, recoil recovery, reload, scoping | Working |
| Hitscan hitboxes (head/chest/stomach/legs) + damage falloff + armor + wallbang | Working |
| Muzzle flash, tracers, decals, shell ejection, impact particles | Working |
| Grenades: smoke, flash, HE, incendiary, decoy with bounce physics | Working |
| Bomb plant / defuse objective loop with progress + audio cues | Working |
| Round system, buy phase, MR12 ruleset, overtime detection | Working |
| Economy: win/loss bonus ladder, plant/defuse bonuses, kill rewards | Working |
| Buy menu (7 categories, live stat inspector, 5 presets + custom presets) | Working |
| Teams, elimination, scoreboard, kill feed, match result screen | Working |
| Bots with navigation, LOS-gated aiming, difficulty tiers, buying, objectives | Working |
| Radar/minimap with rotation, zoom, callouts, objective markers | Working |
| HUD: health/armor/ammo/money, round timer, bomb timer, prompts | Working |
| Practice sandbox: infinite ammo, grenade trajectory, freeze bots, refill | Working |
| Smart Occlusion culling (frustum + rear-hemisphere + solid-wall rays + distance + LOD) | Working |
| Performance telemetry overlay (FPS, 1%/0.1% lows, frame graph, cull breakdown) | Working |
| Occlusion debug visualization (F3) | Working |
| 9 game modes wired to real configurations | Working |
| Premier map veto flow | Working |
| Custom game rules (team size, timers, money, gravity, speed, friendly fire) | Working |
| Workshop: browse/search/filter/sort, upload with validation, subscribe, favourite, rate, delete | Working |
| Map editor: 22 tools, properties, layers, grid snap, undo/redo, save, test, publish | Working |
| Replay theatre: 3 camera modes, timeline, transport, per-round jump, event markers | Working |
| Profile, stats, match history, medals, inventory, weapon collection | Working |
| Friends, party (invite/kick/ready/leader), recent players, leaderboards | Working |
| Full settings suite across 12 categories with live search | Working |
| Rebindable controls (every action, incl. jump, to mouse buttons and wheel) | Working |
| Crosshair editor with live preview | Working |
| Sensitivity lab (cm/360, 180/360/720 drills, cross-title conversion) | Working |
| Performance presets + "Competitive Optimization" with a change report | Working |
| Automatic hardware benchmark with recommendations | Working |
| Versioned config export/import (6 categories + full bundle) | Working |
| Developer console with 30+ cvars | Working |
| Authoritative WebSocket server (tick loop, input ack, reconciliation) | Working |
| Anti-cheat: movement budget, fire-rate, view-angle, aim-snap telemetry | Working |
| Workshop security validation (size, count, whitelist, XSS/prototype patterns) | Working |

### Modes

Competitive · Premier · Wingman · Rush · Casual · Deathmatch · Retakes · Practice · Custom — all launch into a real playable match with the correct team size, round budget, timers, economy, and objective rules.

---

## 2. Architecture

```
src/
  shared/                 Isomorphic code usable by both client and server
    types.ts              Domain types (maps, players, replays, csutom game config)
    weapons.ts            Complete original arsenal + pure damage mathematics
    security.ts           Workshop package validation + anti-cheat validators

  game/                   CLIENT simulation & presentation
    core/
      gameEngine.ts       Renderer host, fixed-step loop, input routing, combat
      gameStateStore.ts   Zustand platform store (profile, match, workshop, party)
      performanceMonitor.ts  Frame telemetry + hardware benchmark
    physics/physicsEngine.ts   Movement solver, AABB collision, LOS, grenades
    rendering/
      worldRenderer.ts    Map → scene graph, LOD groups, operator avatars
      cullingSystem.ts    Smart Occlusion evaluation (objects AND players)
      effectsSystem.ts    Pooled decals/tracers/particles/smoke/fire/shells
      viewmodel.ts        Procedural first-person weapon rig + animator
      browser-capabilities.ts  Independent per-feature detection (WebGL1/2,
                               extensions, limits, GPU class, DPR, platform)
      renderer-manager.ts      Single owner of renderer selection, context
                               loss/restore, pixel ratio and quality tier
      tactical-renderer.ts     Canvas-2D tactical renderer for the compat path
      capabilities.ts          Backwards-compatible adapter over the two above
    weapons/weaponSystem.ts    Fire gating, spread, recoil, hitbox raycasting
    input/inputManager.ts      Raw pointer lock input, rebindable action mapping
    audio/soundEngine.ts       Procedural WebAudio synthesis, HRTF spatialization
    bots/botSystem.ts          Fair-play bot AI (LOS-gated, difficulty tiers)
    modes/roundLogic.ts        Pure round/economy/match-completion rules
    maps/officialMaps.ts       4 hand-authored original maps
    network/networkClient.ts   Client prediction, reconciliation, telemetry
    settings/settingsStore.ts  Versioned settings + presets + sensitivity math
    core/
      bootDiagnostics.ts      Staged boot report; names the failing subsystem
      performanceManager.ts   Frame pacing, dynamic resolution, real telemetry
      graphicsBenchmark.ts    Measured (not synthetic) GPU benchmark
      compatibilityMatch.ts   Match sim for machines without a WebGL2 context
    ui/                        In-game HUD components

  shared/runtime.ts       Sub-path-safe URL resolution for GitHub Pages

  server/                 SERVER (authoritative)
    gameServer.ts         WebSocket tick loop, validation, authoritative state
    standalone.ts         Express + WS standalone production entrypoint

  components/             React launcher shell + panels (code-split)
workers/cullingWorker.ts  Off-main-thread batch visibility evaluation
database/                 PostgreSQL schema + seed data
tests/                    233 unit + integration tests
scripts/verify-server.mjs End-to-end network/anti-cheat harness
scripts/verify-deploy.mjs Serves dist/ under /CS2/ and checks every URL
scripts/verify-boot.mjs   Boots the built bundle in jsdom with no GPU
.github/workflows/deploy.yml  Build + deploy to GitHub Pages
```

**Client vs server separation is explicit.** `src/game/**` is client-side and may be optimistic. `src/server/**` owns all authoritative state. `src/shared/**` holds only pure, side-effect-free logic that both sides must agree on.

---

## 3. Running locally

```bash
npm install
cp .env.example .env      # optional: override ports / tick rate
npm run dev               # http://localhost:5173
```

The Vite dev server also boots the **authoritative game server** in-process:

* WebSocket endpoint — `ws://localhost:5173/ws`
* `GET /api/health` — service heartbeat, tick rate, client count, anti-cheat state
* `POST /api/workshop/validate` — server-side workshop package validation

Standalone server (serves `dist/` + the same API/WS):

```bash
npm run build
npm run server            # http://localhost:4000
```

### First steps in the app

1. **PLAY → Practice → Launch Sandbox Instantly** for an immediate, ungated look at the 3D engine.
2. Click **ENTER MATCH** to capture the pointer, then use `WASD` + mouse.
3. `B` opens the buy menu · `TAB` shows the scoreboard · `F3` toggles occlusion debug · `` ` `` opens the console.
4. **SETTINGS → Presets & Optimizer → Apply Competitive Optimization** shows exactly which values changed and why.

---

## 4. Production build & deployment

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (233 tests, 10 suites)
npm run build       # tsc -b && vite build
npm run preview     # serve the built bundle locally
```

Bundle output (gzip), after code splitting:

| Chunk | Raw | Gzip |
| --- | --- | --- |
| `index` (launcher shell) | ~258 kB | ~74 kB |
| `vendor` (React, Zustand, icons) | ~178 kB | ~53 kB |
| `three` (loaded only for 3D views) | ~489 kB | ~123 kB |
| `GameView` (engine + HUD) | ~122 kB | ~34 kB |
| `CompatibilityGameView` (2D match view) | ~24 kB | ~8 kB |
| `MapEditorPanel` | ~27 kB | ~8 kB |
| `WorkshopPanel` | ~19 kB | ~6 kB |
| `ReplayPanel` | ~13 kB | ~4 kB |
| CSS | ~43 kB | ~8 kB |

Three.js is **not** in the launcher's critical path — it is fetched only when a 3D panel, the graphics
benchmark, or a match opens. `npm run verify:deploy` fails the build if a static import ever pulls it
back into the initial `modulepreload`.

### 4.1 Why the live site used to show "Failed to start."

This was **not** a browser, GPU or WebGL problem. The GitHub Pages API reported:

```json
{ "build_type": "legacy", "source": { "branch": "main", "path": "/" } }
```

`build_type: "legacy"` with `path: "/"` publishes the **raw repository root**. Pages never ran
`npm run build` and never served `dist/`. The document it served was the *source* `index.html`,
whose bootstrap is:

```html
<script type="module" src="/src/main.tsx"></script>
```

On `diamantmuqici-dotcom.github.io` that resolves to `https://diamantmuqici-dotcom.github.io/src/main.tsx`,
which does not exist — and would not have worked even if it did, because a browser cannot parse TSX
or resolve bare specifiers. The module never executed, React never mounted, `#root` stayed empty,
and after a 13.5-second watchdog the splash printed a generic "requires a modern browser with
WebGL2" message that blamed the user's hardware for a deployment fault.

Three defects combined to produce it:

1. **Pages was configured to publish the source tree** instead of a build artifact.
2. **Vite had no `base` configured**, so a real build would still have emitted `/assets/...`
   (origin-root) URLs and 404'd under `/CS2/`.
3. **The failure message blamed the browser** instead of reporting the actual cause, so the real
   fault was invisible.

### 4.2 The fix

| Defect | Fix |
| --- | --- |
| Source tree published | `.github/workflows/deploy.yml` builds and deploys `dist/`; Pages set to `build_type: workflow` |
| Origin-root asset URLs | `vite.config.ts` sets `base: './'`, so every emitted URL is document-relative and works from any mount point |
| Runtime URLs assuming `/` | `src/shared/runtime.ts` resolves API/asset URLs from the document location; the document is the ground truth, not `import.meta.env.BASE_URL` |
| Blaming the browser | `index.html` observes the real failure — a failed module `load` event, an uncaught error, or a mount timeout — and names the subsystem |
| Hard WebGL2 gate | Removed. The renderer hierarchy in §10 degrades instead of refusing to start |

`npm run verify:deploy` serves `dist/` under a `/CS2/` sub-path and asserts the document, every
referenced asset, its MIME type, the `modulepreload` list, and the absence of any origin-root URL.
`npm run verify:boot` then loads the built bundle in jsdom with **no WebGL and no canvas** and
asserts the module graph evaluates, React mounts, and the boot report records a successful run.
Both run in CI on every push to `main`.

### 4.3 Other hosts

`base: './'` is mount-point agnostic, so `dist/` also works from a domain root, a nested path, or
`file://`. For a static host there is no backend, so the launcher reports
`STATIC HOST — LOCAL AUTHORITY` rather than claiming a server outage, and matches run on the
embedded local authority. Run `npm run server` (or `npm run dev`) for the real WebSocket server.

---

## 5. Testing & verification

```bash
npm test                       # 233 tests across 10 suites
npx vitest run --reporter=verbose
npm run verify                 # typecheck + test + build + deploy + boot checks
npm run verify:deploy          # serves dist/ under /CS2/, checks every URL + MIME
npm run verify:boot            # boots the built bundle in jsdom with no GPU
node scripts/verify-server.mjs # requires `npm run dev` running
```

Verified end-to-end against the live server:

```
PASS welcome handshake
PASS ping/pong latency
PASS legit input acked (no false positives)
PASS exactly one reconcile (the teleport only)
PASS legit hit confirmed
PASS rapid-fire rejected
PASS teleport rejected
PASS unaffordable buy denied
PASS affordable buy approved
```

Workshop API verification:

```
valid community map          status=200 valid=true
malicious <script> payload   status=400 valid=false  (security violation)
oversized object list        status=400 valid=false  (object count limit)
```

Test coverage by suite:

| Suite | Focus |
| --- | --- |
| `weapons.test.ts` | Roster integrity, damage model, fire gating, reloads, scoping, spread, hitboxes |
| `movement.test.ts` | Acceleration, max speed, friction, crouch/walk, jump, gravity, ramps, LOS, grenades |
| `roundLogic.test.ts` | Economy ladder, round resolution, match completion, mode configs, retakes |
| `culling.test.ts` | Rear-hemisphere, frustum, occlusion, distance, LOD, **gameplay-critical player visibility** |
| `security.test.ts` | Workshop validation (XSS/prototype/size/limits), anti-cheat validators |
| `settings.test.ts` | Defaults, keybinds, presets, optimization pass, distances, crosshair, sensitivity, config I/O |
| `gameState.test.ts` | Regions, presets, match lifecycle, veto, workshop, party, inventory, replays |
| `matchSimulation.test.ts` | Headless vertical slice: navigate → acquire → hitscan → eliminate → resolve → payout |

---

## 6. Backend requirements

Only services that genuinely cannot run in a browser are isolated backend-side.

| Service | Responsibility | Provided |
| --- | --- | --- |
| **Authoritative game server** | 64-tick simulation, input validation, damage resolution, economy, round state, reconciliation | `src/server/gameServer.ts` (Express + `ws`), embedded in the Vite dev server |
| **Matchmaking service** | Region/skill/party bucketing, latency validation, lobby allocation | Interface implemented in the client (`PlayPanel` + `gameStateStore`); local deterministic implementation ships today. Production swap point is `startQueue()` → a matchmaking RPC. |
| **Session/account service** | Auth, JWT, session lifetime, roles (User/Creator/Moderator/Admin) | Schema + role checks defined in `database/schema.sql`; client uses a seeded local session |
| **Statistics/rating service** | Authoritative match results → career stats, Premier Rating | Result recording is server-shaped (`recordCompletedMatch` consumes a server payload); rating deltas are never client-computed in production |
| **Workshop service** | Package ingestion, validation, versioning, checksums, moderation queue | `POST /api/workshop/validate` implemented and verified |
| **Party/social service** | Friends, party, invites, presence | Architected in the client store; needs a presence WebSocket in production |

> **Honesty note:** the browser client *never* claims authority. When a real backend is unavailable, the launcher clearly reports `SERVER UNREACHABLE — LOCAL AUTHORITY` and the engine runs an authoritative local simulation for single-player/practice. All multiplayer-shaped operations (damage confirmation, purchases, results) are routed through the same packet contract the real server accepts, so wiring a production fleet requires no client rewrite.

Environment variables — see `.env.example`:

```
PORT, SERVER_PORT, NODE_ENV
DATABASE_URL, REDIS_URL
SERVER_TICK_RATE, MAX_PLAYERS_PER_MATCH
ANTI_CHEAT_STRICT_MODE, WORKSHOP_MAX_PACKAGE_BYTES, JWT_SECRET
```

---

## 7. Database requirements

`database/schema.sql` defines 16 tables with indexes and constraints; `database/seed.sql` provides initial operatives and profiles.

`users` · `profiles` · `settings` (versioned JSONB per category) · `ratings` · `statistics` · `matches` · `match_players` · `inventory` · `workshop_maps` · `workshop_versions` · `workshop_ratings` · `friends` · `parties` · `reports` · `bans` · `replays`

Indexes are declared for the hot query paths: leaderboard ordering (`ratings(mode, premier_csr DESC)`), match history (`matches(mode, ended_at DESC)`), workshop sorting (downloads/rating/created), player lookups (`match_players(user_id)`), and moderation queues (`reports(status, created_at DESC)`).

Apply with:

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
```

Redis is used for matchmaking queues, session tokens, presence, and short-lived match state.

---

## 8. Performance engineering

**Frame budget**

* Fixed 128 Hz internal simulation, decoupled from the render rate (max 8 catch-up steps per frame).
* Raw mouse deltas are consumed **once per displayed frame**, before the fixed-step loop, so aim latency tracks the display refresh instead of the simulation step.
* Zero input smoothing by default. Pointer Lock requests `unadjustedMovement: true` for OS-acceleration bypass where supported.
* Configurable FPS cap (30/60/120/144/165/240/360/Unlimited/Custom) and VSync toggle.

**Culling (Smart Occlusion / "Behind Me")**

1. **Rear-hemisphere cull** — geometry whose bounding sphere is entirely behind the camera plane is dropped first. This is the cheapest and highest-yield pass.
2. **Frustum cull** — bounding-sphere cone test with FOV + aspect + margin.
3. **Solid-wall occlusion** — centre ray plus a top-corner verification ray against large occluder volumes. Requiring both rays to be blocked prevents pop-in at edges.
4. **Distance ring** — separate budgets for player visibility and object visibility, scaled per LOD tier.
5. **Portal/room visibility** — room-graph restriction for interiors.
6. **3-tier LOD** — high (<22 m), medium (<48 m), low (beyond).

The full solve runs at ~20 Hz (deterministic, slow-moving inputs); distance/frustum toggles still apply every frame.

**The gameplay-critical guarantee:** culling is a *graphical* concern only. `evaluatePlayerVisibility()` **never** hides an opponent who has verified line of sight, regardless of the configured distance slider. Only opponents that are simultaneously wall-occluded *and* behind the camera plane can have their cosmetic mesh skipped — and their audio, AI, and hitboxes remain fully active. This is enforced by dedicated tests in `tests/culling.test.ts`.

**Other optimisations**

* Fully pooled effects: 96 decals, 48 tracers, 260 particles, 32 shells — zero runtime allocation during firefights.
* Procedural assets: the entire arsenal and every operator model are code-generated, so there are no model/texture downloads at all.
* Shared material cache keyed by colour + surface + emissive, collapsing draw calls.
* Per-frame allocation avoided in the hot path; `renderer.info.autoReset = false` with explicit reset.
* Bot cognition throttled to 32 Hz while movement interpolates every tick.
* A Web Worker (`workers/cullingWorker.ts`) is available for batch visibility evaluation off the main thread.

**Telemetry** — OFF / MINIMAL / FULL, with FPS, 1% low, 0.1% low, frame/CPU/GPU time graphs, ping, jitter, packet loss, tick rate, heap estimate, draw calls, triangles, visible vs culled entity counts, and a per-reason culling breakdown.

---

## 9. Anti-cheat & security model

**Server authority.** The client is never trusted for damage, money, weapon ownership, kills, score, rank, inventory, or match results.

| Validator | Behaviour |
| --- | --- |
| `validateMovementBudget` | Leaky-bucket movement budget. Tolerates packet jitter and coalescing; drains on sustained impossible speed (teleport / speed hack / fly). |
| `validateFireInterval` | Per-weapon minimum interval with 18% jitter tolerance; rejects unknown weapon IDs outright. |
| `validateViewAngles` | Finite-only, pitch clamped to the gimbal limit; non-finite angles are critical violations. |
| `validateAimSnap` | Flags an instant >145° single-tick snap that immediately produces a headshot. |
| Economy validation | Purchases are re-priced server-side; unaffordable requests are denied (verified). |
| Workshop validation | Size cap, object cap (1500), type and material whitelists, coordinate bounds, hex-colour enforcement, and detection of `<script>`, `javascript:`, `eval`, `Function`, `setTimeout`, `__proto__`, `constructor`, `onload=`, `document.cookie`, `window.location`, and dynamic `import()` — all before acceptance. |

**Explicit non-goals.** No kernel drivers, no file-system scanning, no arbitrary code execution from uploads. Workshop content is pure declarative JSON — no JavaScript, shaders, or binary payloads are ever executed.

**Permissions** (`User`, `Creator`, `Moderator`, `Admin`) are enforced server-side. Server administration commands (`kick`, `ban`, `sv_cheats`, `rcon`, `map`) are **deliberately unavailable** from the client console and return an explicit denial.

---

## 10. Browser support & the renderer hierarchy

### 10.1 No capability ever blocks the application

The previous build gated the entire product on `getContext('webgl2')` and printed "This application
requires a modern browser with WebGL2" when it returned null. That was wrong on two counts: it
rejected hardware that could still run the game, and it misattributed a deployment fault to the
user's browser.

Detection now lives in `src/game/rendering/browser-capabilities.ts`. Every capability is probed
**independently** and every failure records a reason:

JavaScript · ES modules · dynamic `import()` · DOM · canvas · 2D canvas · WebGL1 · WebGL2 ·
GPU vendor/renderer and class · max texture size · max renderbuffer size · max viewport dims ·
max vertex attribs · max MSAA samples · max anisotropy · supported extensions · GLSL version ·
float/half-float colour buffers · depth textures · derivatives · instancing · VAOs · sRGB
framebuffers · device pixel ratio · screen and viewport · mobile/touch · reduced motion ·
hardware concurrency · device memory · storage availability · Web Workers · WebAssembly ·
SharedArrayBuffer · WebSocket · WebRTC · gamepad · pointer lock · raw mouse input · AudioContext ·
WebGPU.

The renderer hierarchy, first available wins:

| Level | Tier | What you get |
| --- | --- | --- |
| 1 | **WebGL2** | The full three.js 3D engine. |
| 2 | **WebGL1** | three.js has been WebGL2-only since r163, so this runs the same match on the **2D tactical renderer**: real map geometry, live line-of-sight occlusion, team positions, the objective, score, economy, kill feed and round flow. |
| 3 | **Canvas2D** | The same tactical renderer, software-rasterised. |
| 4 | **DOM** | The launcher, settings, workshop, map editor and diagnostics remain fully usable. |

Selection, context lifecycle, pixel ratio and quality all belong to
`src/game/rendering/renderer-manager.ts`; nothing else in the codebase probes WebGL.

### 10.2 Boot diagnostics

`bootDiagnostics` records each stage independently and is mirrored to `window.__vanguardBoot`:

```
BOOT -> RUNTIME -> ENVIRONMENT -> MODULES -> RENDERER -> GPU -> SHADERS -> ASSETS -> APPLICATION -> READY
```

The static shell in `index.html` reads the same report. If something genuinely fails, the screen
names the subsystem and offers **Continue in compatibility mode**, **Run graphics test**,
**View diagnostics** and **Reload** — it never says only "your browser is unsupported", and it
never prevents entry when a renderer is usable.

### 10.3 Capability behaviour

| Capability | Behaviour when unavailable |
| --- | --- |
| **WebGL2** | Falls back to the tactical 2D renderer; the reason is shown in the launcher banner and diagnostics. |
| **WebGL1 / no WebGL** | 2D tactical renderer, or DOM-only mode. The match remains playable. |
| **Context loss** | `webglcontextlost` is `preventDefault()`ed (without which the browser never fires `restored`), the UI shows "Graphics context lost — recovering…", and GPU resources are reallocated on restore. |
| **Pointer Lock** | Detected and surfaced; the enter-match prompt explains the limitation. |
| **`unadjustedMovement`** | Attempted first, then falls back to a plain `requestPointerLock()`. No artificial smoothing either way. |
| **WebGPU** | Detected and reported. The renderer targets WebGL2 (broader support, mature Three.js path). |
| **Web Workers / OffscreenCanvas** | Optional; culling falls back to the main thread. |
| **HRTF spatial audio** | Falls back to `equalpower` panning. |
| **AudioContext autoplay policy** | Context is resumed on the first user gesture. |
| **Software rasterizer** | Detected, quality capped to LOW, Low-End preset recommended. |
| **GPU name hidden** (Firefox blocks `WEBGL_debug_renderer_info` by default) | Reported as "hidden by browser privacy" rather than faked; all other detection still works. |
| **`localStorage` blocked** (Safari private mode) | Settings fall back to in-memory; the app still runs. |
| **Mobile / touch** | The launcher is fully responsive. The 3D match deliberately targets desktop. |
| **Reduced motion** | Honoured by CSS, plus an explicit in-app setting. |

### 10.4 Honest telemetry

`PerformanceMonitor.getSnapshot()` previously returned a hardcoded `144 / 120 / 98 FPS` before any
frame had been rendered, and derived a "GPU time" from a fixed multiple of frame time. Both are
gone: with no samples the values are `0`, GPU time is `0` (web pages cannot read it without a
timer-query extension) and the UI labels it "not exposed". The graphics benchmark in
`graphicsBenchmark.ts` renders a real scene for a fixed wall-clock window and reports the frame
times it actually measured — it compiles its shaders individually first so a compile failure is
reported as a shader failure rather than a black canvas.

### 10.5 Service worker

There is none, deliberately. With hashed asset filenames and an Actions-built artifact there is
nothing for a service worker to do, and one could only serve stale bundles after a deploy.

---

## 11. Known gaps / honest remaining work

These are the things that are genuinely **not** finished, stated plainly:

1. **Production matchmaking cluster.** Queueing, region selection, and the Premier veto are fully implemented and playable, but currently resolve to a local authoritative simulation instead of allocating a remote dedicated server. The packet contract is server-shaped so the swap is a service call, not a rewrite.
2. **Real-time human multiplayer.** The transport, tick model, prediction, reconciliation, and validation are all implemented and verified by `scripts/verify-server.mjs`, but a full production deployment needs the matchmaking + session services above and a scalable server fleet (Redis presence, per-match process or worker).
3. **Voice chat.** Push-to-talk is fully bindable and the audio mixer reserves a voice channel and volume control, but no Opus/SFU transport is shipped. Nothing is faked — the binding simply has no media pipeline behind it yet.
4. **True portal/room traversal.** Portal volumes are authored, stored, and available to the culling system, and the room-id data is present on every map object. The current shipped maps are open-plan enough that the frustum + solid-wall passes dominate; the portal graph is wired but not the primary win on these four layouts.
5. **Vertex-level mesh LOD.** LOD currently switches by tier group and distance rather than generating decimated meshes; procedural primitive geometry is cheap enough that decimation is not yet the bottleneck.
6. **Windows/texture/decals persistence across rounds.** Decals persist for the match; they are cleared on map unload rather than aged out.
7. **Localisation.** The language selector stores a preference and the UI is structured for it, but only English strings are authored.
8. **Automated visual regression.** Verification was done through type checking, 233 automated tests, the live server/anti-cheat harness, `verify:deploy` (which serves `dist/` under `/CS2/` and checks every URL, MIME type and preload) and `verify:boot` (which loads the built module graph in jsdom with no WebGL and asserts the UI mounts and the boot report succeeds). A real browser engine (Chromium/Firefox/WebKit) is **not** part of the automated suite, so pixel-level visual regression and real GPU behaviour are still verified manually. The renderer hierarchy, the sub-path URL resolution and the boot report are covered by unit tests; the actual 3D output is not.

Everything else in the feature list is implemented and functional. There are no "Coming Soon" buttons.

---

## Licence / attribution

Original work. All weapon names, map layouts, geometry, audio synthesis, UI artwork, and code were authored for this project. Vanguard Protocol is not affiliated with, endorsed by, or derived from any existing commercial tactical shooter.
