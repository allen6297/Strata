# Strata — Scene Editor

A lightweight **2D game engine editor**: hierarchy, canvas viewport, inspector, and asset browser.

Local path: `/Users/kalob/Code/strata`. UI is Vite + React + TypeScript + Tailwind, wrapped with **Tauri** for desktop.

## Browser (quick)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4521](http://127.0.0.1:4521).

## Desktop (Tauri)

Requires [Rust](https://rustup.rs/) on your machine (Xcode CLT on macOS).

```bash
npm install
npm run tauri:dev
```

That starts Vite and opens a native Strata window.

Ship a release build:

```bash
npm run tauri:build
```

Artifacts land under `src-tauri/target/release/bundle/` (`.app` / `.dmg` on macOS).

## Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `H` | Pan tool |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl/Cmd+D` | Duplicate |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl/Cmd+S` | Save scene (downloads `.scene` + localStorage) |
| `Space` | Play / Stop |

## What you can do

- **Hierarchy** — select entities, toggle visibility/lock
- **Viewport** — pan (hand tool / Alt / middle mouse), zoom (scroll), drag sprites to move
- **Inspector** — edit name, transform, color, visibility, lock
- **Toolbar** — add Sprite / Empty / Camera, duplicate, delete, undo/redo, open/save, Play
- **Assets** — browse mock project textures, scripts, audio, and scenes
- **Scenes** — save/load JSON `.scene` files; autosaved copy in `localStorage`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Browser editor (Vite) |
| `npm run build` | Frontend production build |
| `npm run tauri:dev` | Desktop app (dev) |
| `npm run tauri:build` | Desktop installers |
| `npm run preview` | Preview frontend build |

## Stack

- **Frontend:** React + TypeScript + Tailwind
- **Desktop:** Tauri 2 (`src-tauri/`)
- **Future:** RoseGold (`.rg`) as gameplay scripting language
