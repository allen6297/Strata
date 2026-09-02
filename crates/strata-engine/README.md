# strata-engine

Custom 2D/3D runtime for Strata. The React editor is the authoring UI; this crate is the scene/runtime source of truth.

## Modules

| Module | Role |
|--------|------|
| `scene` | `SceneFile` v2, `Entity` (incl. `tilemap` / `tiles` / `tileSize` / collision bits), `RenderLayer` |
| `prefab` | `instantiate_prefab` — clone catalog subtree (root + children) into the play world |
| `draw` | `sort_entities_for_draw` — layer order, then `sortOrder`, then hierarchy DFS. Editor builds a `RenderFrame` from the snapshot (WebGL2 / Canvas). |
| `collisions` | World-space AABB overlaps; solid resolve (axis of least penetration, no rotation) |
| `world` | `World` — load scene, snapshot, `tick(dt)` |
| `script` | `ScriptHost` trait, `NullScriptHost`, `RoseGoldScriptHost`, `PlaySession` |

## Script host

Play mode always calls `ScriptHost::on_load` / `on_update`.

[`PlaySession`](src/script.rs) is the play loop (desktop Tauri and browser WASM). It owns a `World` plus [`RoseGoldScriptHost`](src/script.rs):

1. Attach script source per entity with `set_script(entity_id, source)`.
2. On first hook, the host compiles the source once and keeps an `EvalContext` per entity (module `var`s survive ticks). Re-bind with the same source does not reset that VM.
3. On load, run each entity’s `on_ready(name, x, y)` (arity-flexible).
4. On each tick, run `on_update(name, x, y, dt[, keys[, pressed]])`. Prefer `input.held` / `input.pressed` over CSV args. Held keys stay in `keys`; `pressed` is the just-down edge (once per press).
5. After `on_ready` / `on_update` moves, **solids** are pushed out of other solids and solid tilemap cells (AABB, no rotation). Then overlap pairs fire `on_enter` / `on_exit` (cameras/lights/tilemaps skipped as bodies). Areas do not block. `other` is the other entity’s name.
6. After each hook, take `HostEffect`s (`strata.move`, `strata.spawn("Prefab")`, `strata.after`, …) and parse leftover stdout `strata:` lines (compatibility). Apply them to the world. `strata.after(delay, "method")` fires that method once. Destroy runs `on_destroy` once before the entity is removed.
7. `strata.play_sound(name)` resolves against the play-session audio library (`set_audio`). The frame carries `{ type: "play_sound", name, url }`; the editor webview plays the URL (same adapter role as the canvas). Missing names log `[audio not found …]` when the library is non-empty.

Scene JSON may include a `prefabs` catalog (not placed in the play world). `strata.spawn("Name")` or `strata.spawn({ "prefab": "Name", … })` clones the catalog subtree (root + children).

[`NullScriptHost`](src/script.rs) remains a no-op for tests that do not need scripting.

See `crates/rosegold/README.md` for language details and directive examples.

## Editor view

Three.js in the desktop app is an **editor display adapter**. It is not the game renderer. Native wgpu in the editor window is a later milestone.
