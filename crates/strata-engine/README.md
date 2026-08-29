# strata-engine

Custom 2D/3D runtime for Strata. The React editor is the authoring UI; this crate is the scene/runtime source of truth.

## Modules

| Module | Role |
|--------|------|
| `scene` | `SceneFile` v2, `Entity`, `Mode` (`2d` / `3d`), mesh/light enums |
| `world` | `World` — load scene, snapshot, `tick(dt)` |
| `script` | `ScriptHost` trait, `NullScriptHost`, `RoseGoldScriptHost` |

## Script host

Play mode always calls `ScriptHost::on_load` / `on_update`.

[`RoseGoldScriptHost`](src/script.rs) is the real host:

1. Attach script source per entity with `set_script(entity_id, source)`.
2. On load, run each entity’s `on_ready(name, x, y)` (arity-flexible).
3. On each tick, run `on_update(name, x, y, dt[, keys])`.
4. Parse `strata:` lines from stdout and apply them to the world (`move`, `rot`, `set`). Side effects like `play_sound` are collected on `last_side_effects`.

[`NullScriptHost`](src/script.rs) remains a no-op for tests that do not need scripting.

See `crates/rosegold/README.md` for language details and directive examples.

## Editor view

Three.js in the desktop app is an **editor display adapter**. It is not the game renderer. Native wgpu in the editor window is a later milestone.
