# Strata Roadmap

Snapshot: **Sunday, Aug 30, 2026**

Related: [project-status.md](./project-status.md) · [rosegold.md](./rosegold.md) · [script-editor.md](./script-editor.md)

This doc is the **engine + editor** roadmap. Language work stays in [rosegold.md](./rosegold.md). In-app Script mode stays in [script-editor.md](./script-editor.md).

---

## Strategic direction


| Decision       | Choice                      | Planning implication                                                                                    |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| **North star** | Engine credibility          | Rust owns play; the editor is a client of the engine                                                    |
| **3D**         | Toy only for now            | No wgpu, no 3D runtime, no 3D script hooks — Three.js is an editor viewport                             |
| **Browser**    | 2D play matches desktop     | Same `PlaySession` via WASM; do not grow a TS play loop again                                           |
| **Nodes**      | Godot-shaped, not Unity ECS | Entity is a bag of properties. Inspector groups are chrome. No `Add Component` until a system forces it |


**One-line goal:** Press Play anywhere and the **engine** runs RoseGold, mutates the world, and the UI reflects that — not the other way around.

---



## Target architecture

```
┌──────────────────────────────────────────┐
│  Editor (React)                          │
│  Hierarchy · Inspector · Files · Log     │
│  Viewport (Canvas 2D / Three.js / CM6)   │
│         ↕ load / play / input            │
│         ↕ snapshot + events              │
└──────────────────────────────────────────┘
                   ↕
┌──────────────────────────────────────────┐
│  Engine (Rust)                           │
│  Tauri commands  ·  WASM exports         │
│  World + PlaySession + RoseGoldScriptHost│
│  AABB · solids · tilemaps · prefabs · HostEffect │
└──────────────────────────────────────────┘
```

**Principles**

1. **Engine is source of truth during play** — positions, spawns, and destroys come from `World`. The viewport draws the snapshot.
2. **Same contract everywhere** — Tauri or WASM; React should not care which backend runs.
3. **3D is display-only** — scene JSON may contain 3D entities for editing; play in the engine is **2D-only**.
4. **Host effects are structured** — scripts call `strata.move` (etc.); `print("strata:…")` remains a compatibility path.
5. **Editor chrome is not a component system** — identity, transform, appearance, flags, and (later) exports/signals are properties on the node.

---



## Current state

M1–M4 and the first slice of M5 are **done**. Play is engine-owned on desktop and in the browser. The demo walks, jumps, collects a coin (`on_enter`), and spawns a prefab.

### Implemented


| Area        | What works                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Play        | `PlaySession`: compile once, one VM per entity, Stop restores the edit scene                             |
| Host        | `HostEffect` (`move` / `rot` / `set` / `spawn` / `destroy` / `play_sound`); stdout `strata:` still works |
| Collisions  | World-space AABB (parent offsets); `on_enter` / `on_exit`; cameras/lights skipped                        |
| Prefabs     | Scene `prefabs` catalog; live instances update when you edit the template; `strata.spawn("Orb")` clones the current catalog |
| Audio       | Play-session clip library; frame carries a URL; **webview** plays it                                     |
| Input       | Held `keys` + just-pressed `pressed`; play camera follow (`runtime-camera.ts`)                           |
| WASM        | `engine_load_scene` / `engine_tick`; in-memory script library                                            |
| 2D viewport | `RenderFrame` → WebGL2 sprite/tile batch (Canvas 2D fallback); gizmos/names overlay; play camera; **layer/sort** |
| Editor      | Dock, Hierarchy, Godot-shaped Inspector (layer + sort), Files, context menus, drag-onto-Inspector      |
| Script mode | CodeMirror 6 — see [script-editor.md](./script-editor.md)                                                |




### Known gaps (engine / editor)

1. **Solids ignore rotation.** Walls and tile cells are axis-aligned AABB; sprite `rotation` does not turn the hitbox.
2. **World XY sums parent offsets only** — same as `getWorldPosition` today (no scale).

---



## Milestone map

Language and Script-mode are **parallel tracks**. RG1–RG10 are done.

### M1 — Engine-owned play (desktop)

**Status: done.** Desktop Play ticks `World` in Rust; the viewport renders snapshots. Stop restores the edit scene. One `EvalContext` per entity.

**Out of scope then (now done elsewhere):** imports (RG3), WASM play (M4), collisions (M5).

---



### M2 — Engine API stability (desktop)

**Status: done.** `HostEffect`, play log on the frame, project scripts resolved for Play. Snapshot JSON is the contract; `lib/engine.ts` is the adapter.

---



### M3 — Script ecosystem

**Status: done** as language work — see [rosegold.md](./rosegold.md) RG2–RG3. Demo `import utils;`; `check` has `line:col`. Stdlib-as-`.rg` is **RG9** (done).

---



### M4 — Browser parity with desktop

**Status: done (Aug 30, 2026) for 2D play.** `npm run dev` uses the same `PlaySession` path as `tauri:dev`.

Snapshot-diff / throttle remains **optional** if a dense scene hurts (see M10).

**Still out of scope:** 3D play in browser, native file I/O in scripts (`io` on wasm32 stays stubbed).

---



### M5 — Gameplay systems (first slice)

**Status: done (Aug 30, 2026)** for collisions + prefabs + URL audio.


| Shipped                         | Notes                                |
| ------------------------------- | ------------------------------------ |
| AABB `on_enter` / `on_exit`     | World space; parent offsets          |
| Prefab catalog + `strata.spawn` | Name or map with `"prefab"`          |
| Audio from engine               | Library of name → URL; webview plays |


**Left for later milestones:** engine-decoded audio (not now).

3D remains **editor toy only**.

---



### M6 — Scene contract + draw order

**Status: done (Aug 30, 2026).** Engine snapshots carry asset ids. Viewport sorts by project layers.

**Outcome:** A Coin spawned at runtime keeps its texture. A “UI” layer draws on top of “World” because you set it, not because of list order. Inspector shows Layer + optional Sort.

This is the layer/sort design already in **Render pipelines** below — implement it here, do not wait for WebGL2.


| Work item               | Notes                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Engine `Entity` parity  | `textureId`, `scriptId`, `audioId` (and `scriptPath`) on the Rust entity; WASM + Tauri snapshots include them |
| `layerId` + `sortOrder` | On entity; default layer on migrate. Viewport **and** any future `RenderFrame` use the sort pipeline          |
| Project settings        | `renderLayers[]` in project JSON (not per-scene names). New project: one `"Default"` layer                    |
| Inspector               | Layer dropdown; optional sort order. Hierarchy does not become a layer editor                                 |
| **Acceptance**          | Spawned Orb keeps the prefab texture; two sprites on different layers always draw in layer order              |


**Out of scope for M6:** WebGL2, tilemaps. `scriptProps` shipped with RG6.

**Editor vs engine:** crate/scene schema first; Viewport consumes `layerId`. Do not invent a second sort in TypeScript that the engine does not know about.

---



### M7 — Prefab authoring

**Status: done (Aug 31, 2026).** Catalog is a forest in `prefabs[]`. Hierarchy Prefabs section; drag or Place copies into the scene. Placed copies keep a link (`prefabId` / `prefabSourceId`) and live-update when you edit the template. Spawn clones the current catalog.

**Outcome:** Save a node (with children) as a prefab; place an instance in the scene; edit the Orb color and already-placed copies follow. Dropped position stays put.


| Work item          | Notes                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Prefab as template | Catalog entry stores a root + children (local transforms)                                     |
| Hierarchy          | Prefabs section — not mixed into play entities unmarked                                       |
| Place instance     | Drag from the prefab list into the viewport; stamp is linked, not a detached copy             |
| Live update        | Catalog edits rebuild linked subtrees. Root transform/name stay instance-local                |
| Overrides          | Inspector/move keys on an instance stick; **Reset to prefab** clears them                     |
| **Acceptance**     | Edit Orb prefab color; already-placed copies update; next `strata.spawn("Orb")` uses it too   |


**Out of scope for M7:** nested prefab packing, Unity-style prefab variants, live-update during Play. Copies placed before this link existed stay detached until you re-place them.

---



### M8 — Collision that can be a wall

**Status: done (Aug 30, 2026).** Area vs solid AABB; 8-bit layer/mask; resolve after scripts, before overlap hooks. Sprite rotation is ignored.

**Outcome:** A `ground` sprite can stop the hero. A coin can still overlap without blocking. You pick that in the Inspector, not with a query language.


| Work item       | Notes                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Body vs area    | Entity flag or mode: **area** (today’s overlaps) vs **solid** (resolve against solids)                  |
| Collision layer | Small set of layers/masks (Godot-style bits), not a scripting API. Default: everything meets everything |
| Resolve         | Axis-separated AABB, no rotation. Run after scripts move, before the snapshot                           |
| **Acceptance**  | Hero stands on a floor sprite; walking into Coin still fires `on_enter` and does not shove the coin     |


**Out of scope for M8:** rigidbody, gravity as an engine force (scripts can keep `jump` until this exists), rotated OBBs, `strata.find`.

Do **not** add a collision query language. Masks are data on the node.

---



### M9 — Tilemaps

**Status: done (Aug 30, 2026).** Tilemap node + tileset image; paint in the 2D viewport; solid cells use M8 AABB resolve.

**Outcome:** Paint tiles on a grid; play treats them as solids or visuals; one mesh of draws, not 500 entities.


| Work item      | Notes                                                           |
| -------------- | --------------------------------------------------------------- |
| Tileset asset  | Image + tile size; lives in Files                               |
| Tilemap node   | Entity kind or a packed resource; layer-aware (M6)              |
| Edit           | Paint in 2D viewport; not a separate app                        |
| Play           | Collision from solid tiles (M8) or generate hidden solids       |
| **Acceptance** | A small platform room is a tilemap + Hero, not 40 floor sprites |


**Out of scope for M9:** autotile 47-blob in v1 if a 16-tile set is enough; isometric.

---



### M10 — Draw list + batching

**Status: done (Aug 30, 2026).** `buildRenderFrame` culls and sorts (M6); Canvas 2D and WebGL2 execute the same commands. Editor overlays stay on a 2D canvas.

**Outcome:** `World` snapshot → `RenderFrame` → executor. Canvas is the fallback; WebGL2 batches sprites/tiles. Gizmos, names, and cameras are edit-only.


| Work item      | Notes                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `RenderFrame`  | Cull → sort (M6 pipeline) → draw commands. Viewport stops owning the list   |
| Snapshot diff  | Optional; skip if full list is cheap. Browser and desktop share the type    |
| WebGL2         | Sprite batch; same `RenderFrame`. Desktop webview and `npm run dev`         |
| **Acceptance** | Demo unchanged; a stress scene of many coins still plays at interactive fps |


wgpu stays **probable long-term, embedding TBD**. Do not start M10 to “get ready for wgpu.”

---



## Phase order

```
M1–M10 done.
```

**Parallel (language / editor, not engine):**

- Language: RG1–RG10 are done — [rosegold.md](./rosegold.md)
- Script mode: SE6 — [script-editor.md](./script-editor.md)
- 3D: editor-only UX only

RG7 Inspector **connections** live on the same `Entity` as M6/`scriptProps`. Inspector cards consume crate metadata; do not parse `.rg` in TypeScript.

---



## Render pipelines

**No Rust renderer exists today** — the engine owns scene data; React draws pixels.

### Current state


| Mode       | Component        | Backend        | Role                                          |
| ---------- | ---------------- | -------------- | --------------------------------------------- |
| **2D**     | `Viewport.tsx`   | WebGL2 batch + Canvas 2D overlay / fallback | Edit + play; `RenderFrame` owns sprites/tiles |
| **3D**     | `EditorView.tsx` | Three.js WebGL | Edit only (orbit camera, placeholder meshes)  |
| **Engine** | —                | None           | `World` ticks scripts; no draw calls          |


**Adapter rule:** keep **separate renderers per mode** (`Viewport` for 2D, `EditorView` for 3D). Share a **scene → render description** conversion; do not merge Canvas and Three.js into one component. Remove the unused ortho-2D path in `EditorView` when cleaning up.

**Editor rendering ≠ game rendering.** Long-term the game renderer may live in Rust (wgpu, TBD). The editor stays a display adapter that consumes engine snapshots.

### 2D pipeline

**Perf target:** ~1000 textured sprites.

**Phases**


| Phase | When                                      | Executor                                                          |
| ----- | ----------------------------------------- | ----------------------------------------------------------------- |
| **A** | M6 (sort exists)                          | Viewport sorted list                                              |
| **B** | M10 **done**                              | `RenderFrame` + WebGL2 batch (Canvas 2D fallback)                 |
| **C** | If/when wgpu is committed                 | Rust render backend; editor blits or separate window              |


WebGL2 batching hits the perf target without committing to wgpu embedding. wgpu remains **probable long-term, integration pattern TBD** (texture → WebView, separate game window, or viewport-only native surface).

`RenderFrame` **(now)**

```
World snapshot → build RenderFrame → executor (Canvas → WebGL2 → wgpu)
                                      ↑
                              editor overlays (gizmos, selection — edit only)
```

Stages: cull → sort (see below) → collect draw commands → execute → overlay.

### Draw sort — layers + hierarchy + optional sort order

Three mechanisms work together:


| Mechanism      | Who sets it         | Role                                   |
| -------------- | ------------------- | -------------------------------------- |
| **Layer**      | Project layer list  | Which group draws before/after another |
| **Hierarchy**  | User (parent/child) | Default order *within* a layer         |
| **Sort order** | User, optional      | Manual override *within* a layer       |


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


| Situation                     | Behavior                                     |
| ----------------------------- | -------------------------------------------- |
| Delete layer in use           | Prompt to reassign entities, or block delete |
| New entity                    | Assign to project default layer              |
| Old scene / missing `layerId` | Migrate to default layer on load             |
| Rename layer                  | Safe — entities reference `id`, not name     |


**Storage:** layer list in project settings JSON; `layerId` + optional `sortOrder` on entities in `.scene` v2.

### 3D pipeline (placeholder track)

No investment in 3D play, real lights, mesh textures, or script hooks for now.

**Allowed:** orbit, select, drag, placeholder boxes/planes, scene JSON export.

**Frozen until 2D engine is credible:** play mode, PBR, texture mapping, light entities → Three.js lights.

Long-term 3D runtime (wgpu) is a separate decision — default stance is **editor toy only** unless explicitly reopened.

### Render pipeline vs milestones

```
M6    layerId + sortOrder; engine entity asset ids; Canvas still draws
M10   RenderFrame type; pull draw list out of Viewport.tsx
M10   WebGL2 batch executor when sprites hurt (browser + desktop)
Later wgpu in strata-engine if committed (embedding TBD)
```

---



## Explicit “not now”

- wgpu / native 3D renderer
- 3D script hooks or 3D physics
- Unity-style component bags / `Add Component`
- Rigidbody, joints, continuous collision
- Engine-decoded audio (keep webview playback until that is the bug)
- Animation players / spritesheet timeline (scripts can flip textures later)
- Scene streaming / multi-scene additive load
- Entity query language / `strata.find` as mini-SQL (`find` by name / nearest is done)
- VS Code extension uses the Rust CLI (`editors/vscode` 0.6.3)
- Full RoseGold-PY chase as an engine sprint

---



## Success metrics


| Checkpoint | You know you’re there when…                                      |
| ---------- | ---------------------------------------------------------------- |
| **M1**     | Play is “engine ticks, UI draws” with no asterisk                |
| **M2**     | Someone could build a second client from the snapshot schema     |
| **M3**     | Demo uses `import` and a shared util module                      |
| **M4**     | Same scene demos in browser and desktop without “preview mode”   |
| **M5**     | Coin collect is `on_enter`, not a TS overlap hack                |
| **M6**     | Spawned prefab keeps its texture; UI layer draws above World     |
| **M7**     | You place an Orb from the catalog without writing `strata.spawn` |
| **M8**     | Hero stands on a floor; Coin still overlaps as an area           |
| **M9**     | A room is a tilemap, not a stack of floor sprites                |
| **M10**    | A busy scene is still Canvas-or-batch, not a rewrite of Play     |


---



## Decisions (M1 — done)


| #   | Question    | Choice                                                              |
| --- | ----------- | ------------------------------------------------------------------- |
| 1   | **Stop**    | Restore pre-play snapshot. Do not merge runtime into the edit scene |
| 2   | **VMs**     | One interpreter (`EvalContext`) per entity                          |
| 3   | **Browser** | Desktop first, then WASM on the same `PlaySession` (M4)             |


---



## Decisions (M6)


| #     | Question      | Choice                                                                          |
| ----- | ------------- | ------------------------------------------------------------------------------- |
| 1 yes | **Asset ids** | Engine entity owns `textureId` / `scriptId` / `audioId`. TS merge is a fallback |
| 2 yes | **Layers**    | Project-scoped list; entities store `layerId`, not the display name             |
| 3 yes | **Sort**      | Optional `sortOrder` within a layer; blank = hierarchy                          |


---



## Decisions (M8)


| #     | Question  | Choice                                                              |
| ----- | --------- | ------------------------------------------------------------------- |
| 1 yes | **API**   | Flags on the node (solid vs area, mask bits). No `find` / query DSL |
| 2 yes | **Shape** | AABB, no rotation, until a demo is stuck on rotated platforms       |


---



## How to use this doc

1. Next **engine/editor** work is **M10** when Canvas 2D actually hurts. Do not start WebGL2 to “get ready.”
2. Language: [rosegold.md](./rosegold.md) (RG1–RG10 done). Script mode: [script-editor.md](./script-editor.md).
3. Day-to-day shipped list: [project-status.md](./project-status.md).

