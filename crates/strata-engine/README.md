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

A future **RoseGold** host ([RoseGold-PY](https://github.com/allen6297/RoseGold-PY)) should implement `ScriptHost` and attach `.rg` files from each entity’s `scriptPath`. No Python / bytecode VM is wired yet.

## Editor view

Three.js in the desktop app is an **editor display adapter**. It is not the game renderer. Native wgpu in the editor window is a later milestone.
