# strata-engine

Custom 2D/3D runtime for Strata. The React editor is the authoring UI; this crate is the scene/runtime source of truth.

## Modules

| Module | Role |
|--------|------|
| `scene` | `SceneFile` v2, `Entity`, `Mode` (`2d` / `3d`), mesh/light enums |
| `world` | `World` — load scene, snapshot, `tick(dt)` |
| `script` | `ScriptHost` trait + `NullScriptHost` |

## Script host

Play mode always calls `ScriptHost::on_load` / `on_update`. Today that is [`NullScriptHost`](src/script.rs) (no-op).

A **RoseGold** host (the native `rosegold` interpreter in `crates/rosegold`) should implement `ScriptHost` and attach `.rg` files from each entity’s `scriptPath`. The Python fallback has been removed.

## Editor view

Three.js in the desktop app is an **editor display adapter**. It is not the game renderer. Native wgpu in the editor window is a later milestone.
