# Strata — Scene Editor

A **2D/3D** custom engine with a React editor shell. Runtime lives in Rust (`crates/strata-engine`); the 2D viewport uses canvas with textures and gizmos; 3D mode uses Three.js as an **editor view only**. Desktop packaging is **Tauri 2**.

Scripting language: **RoseGold** (native Rust interpreter in `crates/rosegold`). Play runs `on_ready` once, then ticks `on_update` while playing. Desktop and browser (after `npm run build:wasm`) use the same engine host; without WASM the browser falls back to a source-scan preview.

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

Browser Play (`npm run dev`) uses the same engine host when `src/wasm/rosegold` is built (`npm run build:wasm`). Without that package it falls back to a source-scan preview.

## Live Play

On **Play**, Strata runs `on_ready` once, then ticks `on_update` while playing. The 2D viewport follows **Main Camera**, hides editor gizmos, and restores your edit camera when you stop. Desktop and WASM Play both tick `PlaySession` (compile once, one VM per entity).

### Input (browser preview + desktop)

Prefer `input.held` for movement and `input.pressed` for one-shot actions so holding a key does not retrigger them. Codes match the browser `KeyboardEvent.code` (`"Space"`, `"KeyQ"`, `"ArrowRight"`, …).

```rg
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    if input.held("ArrowRight") { strata.move(3.0, 0.0); }
    if input.pressed("Space") { strata.play_sound("jump.wav"); }
    return 0;
}
```

CSV `keys` / `pressed` hook arguments still work. Arrow keys, WASD, Space, and Q are tracked during play.

### Host API (`strata`)

Scripts move entities and trigger runtime effects by calling `strata.*` (structured host effects). `print("strata:…")` still works for older scripts.

```rg
strata.move(1.5, 0.0);
strata.rot(8);
strata.set(0.0, 10.0);
strata.play_sound("jump.wav");
strata.spawn({ "name": "Bullet", "kind": "sprite", "x": 120.0, "y": 0.0, "w": 8.0, "h": 8.0, "color": "#e5c07b" });
strata.destroy("Coin");
```

| Call | Effect |
|-----------|--------|
| `strata.move` | Nudge entity by `dx` / `dy` |
| `strata.rot` | Add rotation degrees |
| `strata.set` | Set `x`, `y` |
| `strata.play_sound` | Play audio asset by name |
| `strata.spawn` | Create entity (`name`, `kind`, `x`, `y`, `w`/`h`, `color`, optional `script`) |
| `strata.destroy` | Remove entity by name (or this entity with no args) |
| `strata.after` | Call a method on this entity once after a delay |

## Scene modes

Switch modes from the floating tab over the viewport, **Scene** menu, or keys **1** / **2** / **3**.

- **2D** — canvas viewport with snap, textures, parenting, and RoseGold play
- **3D** — Three.js editor adapter with orbit camera, mesh/light entities, and euler transforms
- **Script** — full-viewport RoseGold editor; select or double-click a `.rg` asset in the explorer to open it

The dock layout is customizable: drag panel headers or tabs to rearrange zones. While dragging, edge drop targets appear so you can dock into collapsed columns. Close a panel with **×** on its header/tab, or toggle **View → Hierarchy / Inspector / Files**. **View → Reset Layout** restores the default.

Scenes are JSON `.scene` v2 (`mode` + 3D fields); v1 files migrate on open. Scenes are mirrored to `localStorage`; desktop **Save** / **Open** use native file dialogs.

## Textures

Assign a texture in the Inspector, or **double-click** a texture asset. Sample images live in `public/textures/` and `examples/demo-project/`.

## Project folders

On launch you pick a **projects folder**. Child directories that contain `strata.json` or a `.scene` file are listed; **New project** creates a starter scene. **Continue with demo** skips the folder and uses the built-in scratch scene. Chromium can remember the folder (File System Access API); Firefox and Safari keep the same screen with demo-only entry. Desktop (Tauri) uses a real filesystem path.

- **Open Project** (toolbar / File menu) — return to the project home
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
