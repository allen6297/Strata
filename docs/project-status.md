# Project Status — Strata

Snapshot: **Thursday, Sep 3, 2026**

## Done recently

- SE8: language-aware autocomplete (`self.` / `super.` / `extends` / `impl` / trait signals / `@node` hooks); in-app and VS Code stay in lockstep
- RoseGold eval/tooling: `&&` / `||` short-circuit; `n // 0` is a runtime error; `Result.Err` / `Option.None` are falsy; unknown struct fields error; `"é".len` is characters; imported trait signals and class methods show in Inspector; `@test` resolves sibling modules; `fmt` keeps `#` comments
- Project home: choose a projects folder, list child projects, create a new one, or continue with the demo. Chromium web uses the File System Access API; Firefox/Safari keep the same screen with demo-only entry.

- M7: prefab instances live-update when you edit the catalog; Inspector overrides + Reset to prefab
- VS Code 0.6.3: F12 / Cmd-click on `import` lines; `@node` snippet/completions, crate `Sprite`/`Node` in the catalog
- Single inheritance: `class Child extends Parent`; `super.method(args)`; child gets parent fields + methods
- Nested `impl Trait { … }` in a class body; `class Vec3 extends Point impl Named, Drawable`; `impl Trait for Type` still works
- `@node class MyNode extends Sprite`: stdlib `node.rg`, Play instance hooks, Add Node Scripts group
- Method calls on untyped values (`foo.bar()`) and unknown methods on primitives (`1.nope()`) are type errors
- Module `pub` (required inside `mod { }`); `->` return types; `match Rect(w, h)` / named payload binds; undefined identifiers; `rosegold fmt`; WASM `io` in-memory VFS
- `strata.find("Coin")` / `strata.find()` (nearest other); returns a name or `none`
- `str.split` / `str.slice`; crate `Vec2` class (`stdlib/vec.rg`)
- RoseGold-PY class example: `examples/class_trait.rg`
- RG10 `@ufcs`: `x.foo(y)` → `foo(x, y)` when `foo` is marked `@ufcs` and there is no inherent method
- RG10 bitwise: `&` `|` `^` `<<` `>>` `~` and `&=` `|=` `^=` on `Int` (`&&` / `||` stay logical)
- RG10 `##` docs: attach to the next item; hover + Inspector tooltip; `#` is a line comment (`fmt` keeps both)
- M10: `RenderFrame` (cull + M6 sort); WebGL2 sprite/tile batch; Canvas 2D fallback; gizmos stay overlay
- RG8: `on_destroy`, `input.pressed` / `input.held`, `strata.after`, `math.lerp` / `move_toward`
- RG7: `signal` + `.emit`; Inspector connections; Coin `collected` runs Player `on_coin`
- RG6: `@export` / `@export_group` → Inspector cards; per-entity `scriptProps`; Play injects overrides before `on_ready`
- M9: tilemap node; paint in the 2D viewport; solid cells are M8 walls
- M8: solid vs area AABB; Inspector Body/Layer/Mask; walls resolve, coins stay areas
- M7: prefab catalog in Hierarchy; save subtree; drag/place copies; spawn clones children; placed copies follow template edits
- SE7: `def_at` / `hover_at` — Cmd-click `utils.move_line` opens the helper; hover shows the parsed signature
- M6: engine `Entity` carries `textureId` / `scriptId` / `audioId`; project `renderLayers`; Inspector layer + sort; viewport draw order
- SE6: hover/signature catalog, Cmd+G, in-file F12/Cmd-click, function outline, clickable problems strip; Assets click opens instead of attaching
- M5: world-space AABB overlaps (parent offsets); play-session audio library + resolved `play_sound` URLs; walk into Coin to collect
- M5: AABB overlaps fire `on_enter` / `on_exit`; scene `prefabs` + `strata.spawn("Orb")` / `{ "prefab": "Orb", … }`
- RG5: browser Play uses the same `PlaySession` cached-hook host as desktop (`import utils` via the in-memory script library)
- RG4: `strata.move` / `rot` / `set` / `spawn` / `destroy` / `play_sound` as structured host effects; demo scripts no longer print `strata:` lines
- RG3: Hero `import utils;`, stdlib/user-module arity at the call span, `math.sqrt`/`sin`/`cos`/`atan2`, `pub` required to export from `mod { }`
- RG2 CLI + diagnostics: `rosegold check|run|test|fmt`, `file:line:col` errors, Script-panel squiggles
- RG1 play-ready runtime: compile once, one VM per entity, module `var`s persist, `Str` = `String`
- Key edge-trigger: `on_update` `pressed` arg; Space/Q fire once per press; Q is tracked
- RoseGold-PY examples ported into `cargo test -p rosegold`
- Engine `spawn` / `destroy`, unique spawn IDs, script library for `script=Name`
- Play restores edit state on Stop; clears host scripts/keys
- Host errors surface in play log (`hadError`)
- Demo Player/Coin scripts (move, jump sound, spawn Orb on ready, Q destroys Coin)
- Browser WASM RoseGold (`npm run build:wasm` → `src/wasm/rosegold`)
- `@test` runner via `rosegold::run_tests`

## Next (optional)

- Snapshot-diff / throttle if WASM play of large scenes is heavy

## Commands

```bash
cargo test -p rosegold -p strata-engine
cargo run -p rosegold -- check examples/demo-project/scripts/Hero.rg
npm run build:wasm
npx tsc -b
npm run tauri:dev   # desktop Play
npm run dev         # browser + WASM when built
```
