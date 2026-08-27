# Strata — Scene Editor

A lightweight **2D game engine editor** UI: hierarchy, canvas viewport, inspector, and asset browser.

Intended local path: `usr/kalob/CODE/Strata`. Built with Vite, React, TypeScript, and Tailwind. Designed as a desktop-style editor shell you can later wrap with Tauri.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default [http://127.0.0.1:4521](http://127.0.0.1:4521)).

## What you can do

- **Hierarchy** — select entities, toggle visibility/lock
- **Viewport** — pan (hand tool / Alt / middle mouse), zoom (scroll), drag sprites to move
- **Inspector** — edit name, transform, color, visibility, lock
- **Toolbar** — add Sprite / Empty / Camera, delete selection, Play/Stop preview bob
- **Assets** — browse mock project textures, scripts, audio, and scenes

## Scripts

| Command           | Description                |
|-------------------|----------------------------|
| `npm run dev`     | Start the editor           |
| `npm run build`   | Production build           |
| `npm run preview` | Preview production build   |

## Stack note

For a shipped desktop app, package this UI with **Tauri** (recommended) or Electron. The editor itself is a web canvas + React chrome so it runs in the browser during development.
