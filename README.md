# Strata — Scene Editor

A lightweight **2D game engine editor**: hierarchy, canvas viewport, inspector, RoseGold scripts, and asset browser.

Local path: `/Users/kalob/Code/strata`. UI is Vite + React + TypeScript + Tailwind, wrapped with **Tauri** for desktop.

## Browser (quick)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4521](http://127.0.0.1:4521).

## Desktop (Tauri)

Requires [Rust](https://rustup.rs/) (Xcode CLT on macOS).

```bash
npm install
npm run tauri:dev
```

Ship a release build:

```bash
npm run tauri:build
```

## RoseGold scripts

Strata treats `.rg` as the gameplay scripting language ([RoseGold-PY](https://github.com/allen6297/RoseGold-PY)).

1. Edit scripts in the **RoseGold** panel (or select a `.rg` asset).
2. Attach a script on an entity in the **Inspector**.
3. Press **Play** — viewport animates; on desktop, Strata also runs `rosegold` and shows stdout in the play log.

```bash
# once, for desktop Play bridge
cd /path/to/RoseGold-PY
python -m venv .venv && source .venv/bin/activate
pip install -e .
# ensure `rosegold` is on PATH
```

## Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `H` | Pan tool |
| `Delete` / `Backspace` | Delete selection (incl. subtree) |
| `Ctrl/Cmd+D` | Duplicate selection |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl/Cmd+S` | Save scene |
| `Space` | Play / Stop |
| `Ctrl/Cmd+click` | Multi-select |
| `Shift+click` | Range-select in hierarchy |

## Features

- **Hierarchy** — tree parenting (drag-and-drop), visibility/lock, multi-select
- **Viewport** — pan/zoom, world transforms for children, drag-to-move
- **Inspector** — transform, parent, RoseGold script attach
- **RoseGold panel** — edit `.rg`, Play log
- **Scenes** — JSON `.scene` save/load + localStorage

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Browser editor |
| `npm run tauri:dev` | Desktop app |
| `npm run tauri:build` | Desktop installers |
| `npm run build` | Frontend production build |
