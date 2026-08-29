# Strata Roadmap

Snapshot: **Friday, Aug 28, 2026** (render pipelines added **Saturday, Aug 29, 2026**)

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

## Render pipelines

Planning snapshot from render pipeline discussion. **No Rust renderer exists today** — the engine owns scene data; React draws pixels.

### Current state

| Mode | Component | Backend | Role |
|------|-----------|---------|------|
| **2D** | `Viewport.tsx` | Canvas 2D | Edit + play (sprites, grid, gizmos, textures) |
| **3D** | `EditorView.tsx` | Three.js WebGL | Edit only (orbit camera, placeholder meshes) |
| **Engine** | — | None | `World` ticks scripts; no draw calls |

**Adapter rule:** keep **separate renderers per mode** (`Viewport` for 2D, `EditorView` for 3D). Share a **scene → render description** conversion; do not merge Canvas and Three.js into one component. Remove the unused ortho-2D path in `EditorView` when cleaning up.

**Editor rendering ≠ game rendering.** Long-term the game renderer may live in Rust (wgpu, TBD). The editor stays a display adapter that consumes engine snapshots.

### 2D pipeline

**Perf target:** ~1000 textured sprites.

**Phases**

| Phase | When | Executor |
|-------|------|----------|
| **A** | M1 engine play | Introduce `RenderFrame`; keep Canvas 2D |
| **B** | Before perf pain (~500–1000 sprites) | WebGL2 batching (same `RenderFrame`) |
| **C** | If/when wgpu is committed | Rust render backend; editor blits or separate window |

WebGL2 batching hits the perf target without committing to wgpu embedding. wgpu remains **probable long-term, integration pattern TBD** (texture → WebView, separate game window, or viewport-only native surface).

**`RenderFrame` (planning shape)**

```
World snapshot → build RenderFrame → executor (Canvas → WebGL2 → wgpu)
                                      ↑
                              editor overlays (gizmos, selection — edit only)
```

Stages: cull → sort (see below) → collect draw commands → execute → overlay.

### Draw sort — layers + hierarchy + optional sort order

Three mechanisms work together:

| Mechanism | Who sets it | Role |
|-----------|-------------|------|
| **Layer** | Project layer list | Which group draws before/after another |
| **Hierarchy** | User (parent/child) | Default order *within* a layer |
| **Sort order** | User, optional | Manual override *within* a layer |

**Sort pipeline**

1. Sort entities by **layer order** (from project settings, low = back).
2. Within each layer:
   - Entities **with** `sortOrder` → sort by number ascending (low = back).
   - Entities **without** `sortOrder` → **hierarchy** depth-first order.
3. Draw back to front.

`sortOrder` is **never auto-filled** — blank means hierarchy wins. When set, it competes **globally within that layer** (not sibling-only).

### Project-defined layer list

Layers are **project-scoped** (shared across scenes in a project). Scenes store `layerId` on entities, not layer name.

```typescript
interface RenderLayer {
  id: string      // stable uuid
  name: string    // "World", "UI", "Parallax"
  order: number   // 0 = back, higher = front
}

interface ProjectSettings {
  renderLayers: RenderLayer[]
}

// Entity (scene v2 — new fields)
layerId: string       // default: project's default layer
sortOrder?: number    // optional; user-set only
```

**New project default:** one layer named `"Default"` at order `0`.

**Editing layers:** Project → Render Layers (add, rename, reorder, delete). Inspector shows a layer dropdown per entity; optional sort order field.

**Edge cases**

| Situation | Behavior |
|-----------|----------|
| Delete layer in use | Prompt to reassign entities, or block delete |
| New entity | Assign to project default layer |
| Old scene / missing `layerId` | Migrate to default layer on load |
| Rename layer | Safe — entities reference `id`, not name |

**Storage:** layer list in project settings JSON; `layerId` + optional `sortOrder` on entities in `.scene` v2.

### 3D pipeline (placeholder track)

No investment in 3D play, real lights, mesh textures, or script hooks for now.

**Allowed:** orbit, select, drag, placeholder boxes/planes, scene JSON export.

**Frozen until 2D engine is credible:** play mode, PBR, texture mapping, light entities → Three.js lights.

Long-term 3D runtime (wgpu) is a separate decision — default stance is **editor toy only** unless explicitly reopened.

### Render pipeline vs milestones

```
M1   RenderFrame type; Canvas executor; sort uses layers + hierarchy
M2   Pull draw logic out of Viewport.tsx; snapshot drives draw list
M3   —
M4   WebGL2 batch executor (browser + desktop parity)
Later  wgpu in strata-engine if committed (embedding TBD)
```

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
