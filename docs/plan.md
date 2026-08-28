# Strata Roadmap

Snapshot: **Friday, Aug 28, 2026**

Related: [project-status.md](./project-status.md)

---

## Strategic direction

| Decision | Choice | Planning implication |
|----------|--------|----------------------|
| **North star** | Engine credibility | Rust owns play; the editor is a client of the engine |
| **3D** | Toy only for now | No wgpu, no 3D runtime, no 3D script hooks — Three.js stays an editor viewport |
| **Browser** | Eventually match desktop | Plan for WASM RoseGold + the same engine API; browser is not second-class forever |

**One-line goal:** Press Play anywhere (desktop first, browser later) and the **engine** runs RoseGold, mutates the world, and the UI reflects that — not the other way around.

---

## Target architecture

```
┌─────────────────────────────────────┐
│  Editor (React)                     │
│  Panels · Viewport · Script editor  │
│         ↕ load / play / input       │
│         ↕ snapshot + events         │
└─────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────┐
│  Engine (Rust)                      │
│  Tauri commands → WASM exports      │
│  World + RoseGoldScriptHost         │
│  rosegold interpreter               │
└─────────────────────────────────────┘
```

**Principles**

1. **Engine is source of truth during play** — entity positions, spawns, and destroys come from `World`, not TypeScript directive replay.
2. **Same contract everywhere** — Tauri commands today, WASM exports tomorrow; React should not care which backend runs.
3. **3D is display-only** — scene JSON may contain 3D entities for editing; play mode in the engine is **2D-only** for now.
4. **Directives are an implementation detail** — keep `print("strata:…")` internally at first; plan structured host callbacks after the credibility milestone.

---

## Milestone map

### M1 — Engine-owned play (desktop)

**Priority: first**

**Outcome:** Desktop Play runs entirely in Rust; the React viewport renders engine snapshots.

| Work item | Notes |
|-----------|--------|
| `RoseGoldScriptHost` | Implements `ScriptHost`; loads `.rg` per entity `scriptPath` |
| Hook lifecycle | `on_ready` once per entity on load; `on_update(dt, keys)` each tick |
| Directive application | Parse stdout → mutate `World` (move, set, spawn, destroy, …) |
| Input forwarding | Keys held during play passed into `on_update` (same CSV model as today) |
| Snapshot API | `engine_tick(dt, keys)` returns `{ entities, log, playing }` |
| Frontend play loop | Stop applying directives in TS on desktop; consume engine snapshot |
| **Acceptance** | `examples/demo-project`: Hero moves via engine; Stop restores edit camera/state |

**Out of scope for M1:** module imports, collisions, new editor panels, browser, 3D runtime.

**Open design questions**

- **Edit vs play state:** Snapshot-and-restore on stop, or two worlds (edit + runtime)?
- **Script errors during play:** Pause + log, or skip entity and continue?
- **Spawned entities:** Do snapshot IDs match what the viewport expects?

---

### M2 — Engine API stability (desktop)

**Outcome:** The React ↔ Rust boundary is stable enough to WASM-wrap later.

| Work item | Notes |
|-----------|--------|
| Versioned play protocol | Document snapshot JSON shape |
| Structured effects (optional) | `HostEffect` enum instead of print-parsing only |
| Project root in engine | Engine knows project path for script resolution |
| Play log channel | stdout/stderr as first-class snapshot fields |
| **Acceptance** | Same play behavior with a mock backend in tests |

---

### M3 — Script ecosystem

**Outcome:** Scripts can share code and fail clearly — still engine-first.

| Work item | Notes |
|-----------|--------|
| File-based imports | `import utils;` resolves `.rg` from project / script directory |
| Stdlib as `.rg` files | Move hard-coded `Option` / `Result` out of interpreter |
| Script diagnostics | RoseGold `line:col` → squiggles in Script panel (desktop) |
| **Acceptance** | Demo uses at least one imported module; errors at correct line |

Language features (structs, type checker, full `io`) stay **backlog** until M1–M3 are solid unless a demo script blocks progress.

---

### M4 — Browser parity with desktop

**Outcome:** `npm run dev` Play behaves like `npm run tauri:dev` for 2D scenes.

| Work item | Notes |
|-----------|--------|
| WASM build | `rosegold` + minimal `strata-engine` → WASM |
| Shared TS adapter | `lib/engine.ts` calls Tauri *or* WASM with same types |
| Performance | Snapshot diff or throttle if full entity list each frame is heavy |
| **Acceptance** | Same demo: play, move, spawn, destroy in browser without directive preview hack |

**Still out of scope:** 3D play in browser, native file I/O in scripts (`io` stdlib).

**Risks to plan for:** WASM bundle size, `wasm32` toolchain, single-threaded interpreter is OK.

---

### M5 — Gameplay systems

**After engine is trusted**

| Feature | Why later |
|---------|-----------|
| Collisions / triggers | Needs stable entity lifecycle from engine |
| Prefabs | Needs spawn API in engine |
| Tilemaps | Large editor + runtime surface |
| Audio from engine | Consistent ownership: engine or delegated adapter |

3D remains **editor toy only**: orbit camera, mesh placement, scene JSON — no 3D tick in `World`.

---

## Phase order

```
M1 Engine play (desktop)
  → M2 Stable engine API
    → M3 Imports + diagnostics
      → M4 WASM / browser parity
        → M5 Gameplay (collision, prefabs, …)
```

3D: parallel **editor-only** track — small UX fixes OK, no engine investment.

---

## Explicit “not now”

- wgpu / native 3D renderer
- 3D script hooks or 3D physics
- Full RoseGold-PY parity sprint before M1 (structs, type checker, `io`)
- VS Code extension rewrite (after Rust CLI is stable)
- Tilemaps, prefabs, collision — until engine play is boringly reliable

---

## Success metrics

| Checkpoint | You know you’re there when… |
|------------|------------------------------|
| **M1** | Play is “engine ticks, UI draws” with no asterisk |
| **M2** | Someone could build a second client from the snapshot schema |
| **M3** | Demo uses `import` and a shared util module |
| **M4** | Same scene demos in browser and desktop without “preview mode” |
| **M5** | Designing game mechanics, not fighting the play loop |

---

## M1 decisions to make before implementation

| # | Question |
|---|----------|
| 1 | On **Stop**: restore pre-play snapshot, or merge runtime changes into the edit scene? |
| 2 | **Multi-entity scripts**: one interpreter per entity, or one program with multiple hooks? |
| 3 | **Browser timeline**: WASM right after M2, or ship desktop M1–M3 first and accept temporary divergence? |

---

## Current state (summary)

| Layer | Status |
|-------|--------|
| Editor UI | Dockable panels, hierarchy, inspector, assets, 2D/3D/script modes, play, undo |
| 2D runtime (UI) | Canvas, textures, gizmos, Strata directives |
| 3D editor | Three.js view only |
| RoseGold (Rust) | Phases 1–4.1 done (see [project-status.md](./project-status.md)) |
| Desktop | Real interpreter via Tauri; engine still uses `NullScriptHost` |
| Browser | Directive preview only — target is M4 parity |

---

## How to use this doc

1. Resolve the three **M1 decisions** above when ready to implement.
2. Track detailed interpreter progress in [project-status.md](./project-status.md).
3. Pick the next failing [RoseGold-PY](https://github.com/allen6297/RoseGold-PY) example only when M3 module work begins — not before M1.
