# Strata — Scene Editor

A **2D/3D** custom engine with a React editor shell. Runtime lives in Rust (`crates/strata-engine`); the 2D viewport uses canvas with textures and gizmos; 3D mode uses Three.js as an **editor view only**. Desktop packaging is **Tauri 2**.

Scripting language: **RoseGold** (native Rust interpreter in `crates/rosegold`). Play runs `on_ready` once, then ticks `on_update` while playing. Desktop uses the real interpreter; the browser applies the same directives from script source as a preview.

Local path: `/Users/kalob/Code/strata`.

## Run locally (browser)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4521](http://127.0.0.1:4521).

## Run as desktop (Tauri)

Requires [Rust](https://rustup.rs/) + Xcode CLT on macOS.

```bash
npm install
npm run tauri:dev
```

Production bundle:

```bash
npm run tauri:build
```

## RoseGold scripting

Strata uses a custom Python-like language called **RoseGold**. The native interpreter is implemented in Rust in `crates/rosegold` and is used automatically by the desktop app. No Python runtime or extra setup is required.

```bash
cd /Users/kalob/Code/Strata
npm run tauri:dev
```

Browser preview (`npm run dev`) does not run scripts; it applies Strata directives from the source as a preview.

## Live Play

On **Play**, Strata runs `on_ready` once, then ticks `on_update` while playing. The 2D viewport follows **Main Camera**, hides editor gizmos, and restores your edit camera when you stop. In Tauri, the Rust engine also loads the scene and ticks a `NullScriptHost` stub.

### Input (browser preview + desktop)

Add a fifth `keys` parameter to `on_update` to read held keys (comma-separated codes):

```rg
import str;

fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String): Int {
    if str.contains(keys, "ArrowRight") { print("strata:move dx=3 dy=0"); }
    return 0;
}
```

Arrow keys, WASD, and Space are tracked during play.

### Strata directives

Scripts move entities and trigger runtime effects by printing directives:

```rg
print("strata:move dx=1.5 dy=0");
print("strata:rot 8");
print("strata:set x=0 y=10 rot=0");
print("strata:play_sound name=jump.wav");
print("strata:spawn name=Bullet kind=sprite x=120 y=0 w=8 h=8 color=#e5c07b");
print("strata:destroy");
print("strata:get");
```

| Directive | Effect |
|-----------|--------|
| `strata:move` | Nudge entity by `dx` / `dy` |
| `strata:rot` | Add rotation degrees |
| `strata:set` | Set `x`, `y`, `rot` |
| `strata:play_sound` | Play audio asset (`name=` or `id=`) |
| `strata:spawn` | Create entity (`name`, `kind`, `x`, `y`, `w`, `h`, `color`, optional `texture` / `script`) |
| `strata:destroy` | Remove entity (or `name=Other`) |
| `strata:get` | Log entity state to the play log |

## Scene modes

Switch modes from the floating tab over the viewport, **Scene** menu, or keys **1** / **2** / **3**.

- **2D** — canvas viewport with snap, textures, parenting, and RoseGold play
- **3D** — Three.js editor adapter with orbit camera, mesh/light entities, and euler transforms
- **Script** — full-viewport RoseGold editor; select or double-click a `.rg` asset in the explorer to open it

The dock layout is customizable: drag panel headers or tabs to rearrange zones. While dragging, edge drop targets appear so you can dock into collapsed columns. Close a panel with **×** on its header/tab, or toggle **View → Hierarchy / Inspector / Assets**. **View → Reset Layout** restores the default.

Scenes are JSON `.scene` v2 (`mode` + 3D fields); v1 files migrate on open. Scenes are mirrored to `localStorage`; desktop **Save** / **Open** use native file dialogs.

## Textures

Assign a texture in the Inspector, or **double-click** a texture asset. Sample images live in `public/textures/` and `examples/demo-project/`.

## Project folders

- **Open Project** — recursive scan for `.rg`, `.scene`, textures, audio (skips `.git` / `node_modules` / etc.)
- **Asset explorer** — folders, search, type filters, grid/list, refresh, keyboard nav
- **Save Project** — writes scene + scripts (including nested `scripts/` paths)
- Sample: `examples/demo-project/` (`textures/`, `scripts/`, `demo.scene`)

## Editing

- **Snap (G)** — magnet toggle in 2D; hold Shift while dragging to bypass
- **Gizmo** — red X / green Y handles on the primary selection (2D)
- **Parenting** — drag in Hierarchy or Inspector parent field
- **Multi-select** — ⌘/Ctrl click, Shift range

## Shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | 2D / 3D / Script mode |
| `V` / `H` | Select / Pan (2D) or orbit (3D) |
| `G` | Toggle snap (2D) |
| `Space` | Play / Stop |
| `Ctrl/Cmd+S` | Save scene |
| `Ctrl/Cmd+Z` / `Shift+Z` | Undo / Redo |
| `Ctrl/Cmd+D` | Duplicate |
| `Del` | Delete selection |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Browser editor |
| `npm run tauri:dev` | Desktop app |
| `npm run tauri:build` | Desktop installers |
| `npm run build` | Frontend production build |
