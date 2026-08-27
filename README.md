# Strata — Scene Editor

A lightweight **2D game engine editor** with hierarchy, viewport gizmos, RoseGold scripts, project folders, and a Tauri desktop shell.

Local path: `/Users/kalob/Code/strata`.

## Browser

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4521](http://127.0.0.1:4521).

## Desktop (Tauri)

Requires [Rust](https://rustup.rs/) + Xcode CLT on macOS.

```bash
npm install
npm run tauri:dev
```

```bash
npm run tauri:build
```

## RoseGold hooks

Scripts use entity lifecycle hooks:

```rg
fn on_ready(name: Str, x: Float, y: Float): Int { ... }
fn on_update(name: Str, x: Float, y: Float, dt: Float): Int { ... }
```

On **Play**, Strata runs `on_ready` once and a few `on_update` ticks per attached script (desktop requires `rosegold` on PATH). Install from [RoseGold-PY](https://github.com/allen6297/RoseGold-PY).

## Project folders

- **Open Project** — pick a directory; loads `.rg`, `.scene`, textures, audio
- **Save Project** — writes `*.scene` + scripts back into that folder
- Sample: `examples/demo-project/`

## Editing

- **Snap (G)** — magnet toggle; hold Shift while dragging to bypass
- **Gizmo** — red X / green Y handles on the primary selection
- **Parenting** — drag in Hierarchy or Inspector parent field
- **Multi-select** — ⌘/Ctrl click, Shift range

## Shortcuts

| Key | Action |
|-----|--------|
| `V` / `H` | Select / Pan |
| `G` | Toggle snap |
| `Space` | Play / Stop |
| `Ctrl/Cmd+S` | Download `.scene` |
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
