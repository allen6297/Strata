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

## Live Play

On **Play**, Strata runs `on_ready` once, then ticks `on_update` while playing. The viewport follows **Main Camera**, hides editor gizmos, and restores your edit camera when you stop.

### Input (browser preview + desktop)

Add a fifth `keys` parameter to `on_update` to read held keys (comma-separated codes):

```rg
fn on_update(name: Str, x: Float, y: Float, dt: Float, keys: Str): Int {
    if keys.contains("ArrowRight") { print("strata:move dx=3 dy=0"); }
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

Desktop uses real `rosegold`; the browser applies the same directives from script source as a preview.

## Textures

Assign a texture in the Inspector, or **double-click** a texture asset. Sample images live in `public/textures/` and `examples/demo-project/`.

## Project folders

- **Open Project** — recursive scan for `.rg`, `.scene`, textures, audio (skips `.git` / `node_modules` / etc.)
- **Asset explorer** — folders, search, type filters, grid/list, refresh, keyboard nav
- **Save Project** — writes scene + scripts (including nested `scripts/` paths)
- Sample: `examples/demo-project/` (`textures/`, `scripts/`, `demo.scene`)

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
