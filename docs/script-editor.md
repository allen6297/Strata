# Script Editor Plan

Snapshot: **Wednesday, Sep 2, 2026**

Related: [rosegold.md](./rosegold.md) · [plan.md](./plan.md) · [project-status.md](./project-status.md)

The in-app Script mode is where you write RoseGold. Today it is a **textarea with a line-number gutter** sitting in the viewport. The bar is Godot-style: a real code editor inside the engine, not a second IDE and not a form field.

**One-line goal:** Open a `.rg` file in Strata and it feels like editing code — highlighting, tabs, find, indent, undo that undoes *text*, errors on the right line — without leaving the engine.

---

## Strategic direction


| Decision        | Choice                                  | Planning implication                                                                                     |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Kernel**      | [CodeMirror 6](https://codemirror.net/) | Smaller and easier to theme than Monaco; find, multi-cursor, history, and indent come for free           |
| **Look**        | Strata chrome, not VS Code              | Wine/peach tokens, IBM Plex Mono; do not drop in a default One Dark clone                                |
| **Workspace**   | Script stays a **viewport mode**        | Do not add a fifth dock panel in the first pass; make the center column *be* an editor                   |
| **Language**    | RoseGold only for now                   | No generic JSON/TS modes until `.rg` feels done                                                          |
| **Diagnostics** | After RG2                               | Squiggles wait on a `check` API ([rosegold.md](./rosegold.md) RG2); the editor can look real before that |


**Why not Monaco.** Monaco is VS Code’s editor. It is large, fights custom theming, and would make Strata’s script mode look like a foreign app. CodeMirror 6 is what most embedded editors (including many game tools) use now.

**Why not keep the textarea.** Overlay highlighting on a textarea never quite matches scroll, selection, or wrap. You would reimplement find, indent, and history anyway.

---



## Current state



### What exists


| Piece              | Behavior                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `ScriptEditor.tsx` | Controlled `<textarea>`, synced gutter, Tab → 2 spaces, Cmd/Ctrl+Enter runs |
| Status strip       | Ln/Col, char count, run hint                                                |
| `ScriptPanel.tsx`  | One open file, 50/50 split with Play log, Run + New .rg                     |
| Selection          | Active script = selected asset, else selected entity’s `scriptId`           |
| Save               | Cmd/Ctrl+S saves the scene (scripts included)                               |
| Font               | `text-xs` mono on the wine theme                                            |




### Why it does not feel like an editor

1. **No highlighting.** Keywords, strings, `f"…"`, comments, and `strata:` directives are all the same color.
2. **Mode chrome sits on the code.** `SceneModeTab` is `absolute top-3` over the viewport, so 2D / 3D / Script covers the first lines.
3. **Play log is a second editor.** Equal columns, hardcoded `#0c0e12` / `#9aa3b5` (ignores light theme). A real editor keeps a **console** under the buffer, collapsible.
4. **One buffer.** Opening Hero then Coin replaces the file; no tabs, no dirty dot, no “open editors” list.
5. **Cmd/Ctrl+Z undoes the scene.** App-level undo always calls entity history, even while the textarea is focused — it never undoes typing.
6. **No editor keys.** No Shift+Tab, no `#` comment toggle, no auto-indent on Enter, no auto-close `{}`, no Find (Cmd+F), no matching brackets.
7. **Gutter is a fake.** Line numbers are a second scrollable `div`; wrapping or font-size mismatch desyncs them.
8. **Empty state is a placeholder in the buffer.** Real editors use a splash / “no file open” — not a 10-line comment inside the textarea.



### What we can reuse

- TextMate grammar: `editors/vscode/syntaxes/rosegold.tmLanguage.json` (highlight rules)
- Language config: `editors/vscode/language-configuration.json` (comments `#`, brackets, indent on `{`)
- Snippets: `on_ready` / `on_update` / `fn` / `struct` / `class` / `class extends` / `trait` / `@ufcs`
- WASM `run` / `run_hooks` for Run; parse errors already return `line:col` in stderr

---



## Target shape

```
┌─────────────────────────────────────────────────────────────┐
│  [Hero.rg ●] [CoinSpin.rg]                         [Run] [+] │  tab bar
├─────────────────────────────────────────────────────────────┤
│  1  import str;                                               │
│  2                                                            │
│  3  fn on_update(...) {                          ← highlight  │
│  4      strata.move(3.0, 0.0);                                │
│  5  }                                                         │
├─────────────────────────────────────────────────────────────┤
│  Play log                                          [▾] [🗑]  │  console
│  [ready] Player                                                │
├─────────────────────────────────────────────────────────────┤
│  Ln 17, Col 8   RoseGold   spaces:2   UTF-8                   │  status
└─────────────────────────────────────────────────────────────┘
     2D / 3D / Script lives in the *toolbar* or tab bar, not on the text
```

**Principles**

1. **The buffer is sacred.** No floating widgets on top of line 1.
2. **Console is a pane, not a sibling editor.** Default ~30% height, collapsible; user can still drag a split.
3. **Editor owns text undo.** Scene undo is for entities; it must not steal Cmd+Z while the editor is focused.
4. **Theme tokens only.** Highlight colors are CSS variables so dark/light both work.
5. **Ship look before intelligence.** Highlighting + keys + tabs beat a perfect typechecker in a textarea.

---



## Milestone map



### SE1 — Looks like an editor

**Priority: first.** Visual + layout. Still one file is OK if it *looks* like a code surface.


| Work item                       | Notes                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adopt CodeMirror 6              | `@codemirror/view`, `state`, `commands`, `search`, `language`, `autocomplete` (autocomplete unused until SE3)                                                                                 |
| RoseGold highlighter            | Stream parser or Lezer: keywords, types, numbers, strings, f-strings, `#` / `/* */` comments, `@test`, `fn` names. Start from the TextMate scopes; do not need 100% TM fidelity               |
| Strata highlight theme          | Map scopes → `--accent`, `--accent-dim`, `--warn`, `--text`, `--text-muted`, a string green/peach, a comment mute. Light theme must not stay “dark editor”                                    |
| IBM Plex Mono ~13px             | `leading` that matches the gutter (CM6 owns both)                                                                                                                                             |
| Current line                    | Subtle `--bg-hover` on the active line; gutter emphasizes current number                                                                                                                      |
| Move mode toggle off the buffer | Put 2D / 3D / Script in the viewport **header** (next to panel chrome) or pad the editor so the floating pill never covers text. Preferred: header row, pill not `absolute` over the document |
| Console chrome                  | Play log uses `--bg-input` / `--text-muted`; vertical split (editor top, log bottom); collapse control                                                                                        |
| Empty state                     | When no script is selected: centered “No script open” + New .rg — not a fake buffer                                                                                                           |
| **Acceptance**                  | Hero.rg is clearly colored; light theme still readable; first line is not under the mode pill; Play log matches Strata, not a second VS Code                                                  |


**Out of scope for SE1:** tabs, find UI polish (CM6 default Find is OK), diagnostics, completions.

---



### SE2 — Acts like an editor

**Outcome:** Muscle memory from any code editor mostly works.


| Work item          | Notes                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop stealing undo | If focus is in the script editor, Cmd/Ctrl+Z / Shift+Z / Y go to CodeMirror, **not** `useEntityHistory`                                                               |
| Indent             | Tab / Shift+Tab on selection; Enter indents after `{`; `elif` / `else` outdent (mirror `language-configuration.json`)                                                 |
| Toggle comment     | Cmd/Ctrl+/ → `#` on selected lines                                                                                                                                    |
| Auto-close         | `{` `(` `[` `"` pairs                                                                                                                                                 |
| Find / replace     | Cmd/Ctrl+F, Cmd/Ctrl+H (CodeMirror search panel, styled to Strata)                                                                                                    |
| Go to line         | Cmd/Ctrl+G (nice-to-have in the same milestone if cheap)                                                                                                              |
| Bracket match      | Highlight matching `{}`                                                                                                                                               |
| Run                | Keep Cmd/Ctrl+Enter; do not bind Play-space while the editor is focused (already skipped when `sceneMode === 'script'` for Space — confirm CM6 does not eat it oddly) |
| **Acceptance**     | Type a function, hit Enter, next line is indented; Cmd+Z reverts the last keystroke, not a sprite move; Cmd+F finds `on_update`                                       |


---



### SE3 — Multi-file workspace

**Outcome:** You work on Hero and Coin without losing your place.


| Work item          | Notes                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open editors       | Tabs for scripts you opened; click asset → open/focus tab; close tab does not delete the asset                                                                                                                                         |
| Dirty indicator    | `●` on tab when content ≠ last saved (scene dirty already exists globally)                                                                                                                                                             |
| Open from Assets   | “Open in script editor” focuses the tab; do not auto-attach to the selected entity unless the user is dropping onto it (today activate-on-asset **assigns** the script — keep attach as a distinct action: drag to entity / Inspector) |
| Cursor restore     | Remember line/col per script id while the session lasts                                                                                                                                                                                |
| Split with console | Remember collapsed vs open in `localStorage`                                                                                                                                                                                           |
| **Acceptance**     | Open two `.rg` files, switch tabs, each keeps scroll position; closing a tab returns to the previous file                                                                                                                              |


**Open design question:** Opening a script from Assets currently **assigns it to the selected entity**. That is surprising for an editor. SE3 should split “edit” vs “attach.”

---



### SE4 — Diagnostics in the buffer

**Depends on** RoseGold RG2 (`check` / JSON diagnostics) or WASM `typecheck` exposed to JS.


| Work item       | Notes                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Debounced check | 300–400ms after last keystroke (same idea as the VS Code extension)                           |
| Squiggles       | Red underline + gutter mark; hover shows `runtime/type/parse error at L:C`                    |
| Status          | Error/warning counts on the editor status strip                                               |
| Play log link   | Click `runtime error at 7:11` → jump to that line                                             |
| **Acceptance**  | `add(1)` with a 2-arg `fn add` shows a squiggle on the call; click-to-line from the log works |


Until RG2 exists, a **minimal** path is: call existing WASM `run` is too heavy; instead export `diagnostics(source) -> { line, col, message }[]` from `rosegold-wasm` (parse + typecheck only, no eval). That can ship with SE4 even before a CLI.

---



### SE5 — Completions and snippets (first pass)

**Status: done (Aug 30, 2026).** Catalog + snippets + a cheap local scan. Enough to start a hook. **SE8** is the language-aware pass (`self.`, fields, traits, signals).


| Work item        | Notes                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Snippets         | `fn`, `on_ready`, `on_update`, `on_enter`, `on_exit`, `struct`, `class`, `trait`, `match`, `strata.move(`, `@ufcs` |
| Keyword / stdlib | `import str;` then `str.` → `contains`, `upper`, …                                             |
| Hook signatures  | Completing `on_update` inserts the 6-arg form used by the engine                               |
| **Acceptance**   | Typing `on_` offers `on_update`; Tab expands a body with `return 0;`                           |


Do not build a language server. Completions can be static lists plus local `fn` / `var` names from a cheap line scan.

---



### SE6 — Native IDE feel (no LSP)

**Done (Aug 30, 2026).** Hover, docs, in-file jump, and a problems list **inside CodeMirror**, using the same check/complete path — not JSON-RPC, not a language server process.

**Why not LSP in the panel.** Squiggles already come from `check_rosegold`. Completions are a catalog. An LSP would wrap those in stdio for *other* editors. Browser Play cannot host a stdio server. A later `rosegold lsp` is for the VS Code grammar, after name resolution exists.

One catalog (`src/lib/rosegold-docs.ts`): hooks, `strata.*`, `str.*`, `math.*`, `print` / `len`. Completions, hover, and signature help all read it so docs do not drift.


| Work item | Notes |
|-----------|--------|
| **SE6a — Chrome** | **Done.** Cmd/Ctrl+G → CodeMirror go-to-line (F3 still finds next). Click a `.rg` in Assets opens the tab and switches to Script mode; drag / Inspector / context “Attach” assigns. |
| **Hover** | **Done.** `hoverTooltip` on `strata.move`, `on_update`, `str.contains`, etc. Signature + 1–2 sentences. Same copy as completion `info`. Local `fn` / `var` names show “in this file”. |
| **Signature help** | **Done.** Cursor inside `strata.move(` shows `(dx, dy)` until `)`. |
| **In-file jump** | **Done.** Cmd/Ctrl-click or F12 on a name in *this* buffer → that `fn` / `var` / `struct`. Status strip outline of `fn` names. |
| **Problems strip** | **Done.** Clickable diagnostic list under the buffer (same `check` array as squiggles). |
| **Acceptance** | Hover `strata.play_sound` shows the clip-name contract; Cmd+G jumps; click `Hero.rg` in Assets does **not** attach it to the selected sprite; F12 on `on_ready` from `main` lands on the hook. |

**Out of scope for SE6:** rename, find-all-references, `impl` method hover, cross-file go-to-def, LSP. Formatter is `rosegold fmt` (CLI / VS Code Format Document).

---



### SE7 — Cross-file symbols (still not LSP)

**Done (Aug 30, 2026).** Cross-file jump and hover via `def_at` / `hover_at` (parse + import map). Not JSON-RPC, not an LSP.

**Depends on** `def_at` / `hover_at(source, line, col, modules)` from `rosegold`. Shallow: free functions and `import utils;` binds, **not** `impl` methods.


| Work item | Notes |
|-----------|--------|
| Jump to module | **Done.** Cmd-click `utils` on `import utils;` lands on `mod utils` |
| Jump to imported fn | **Done.** `utils.move_line` → that `fn` in the module file |
| Hover imported fn | **Done.** Signature from the parsed module, not only the static catalog |
| **Acceptance** | From Hero, jump to `utils.move_line` lands on the helper |


If the typechecker cannot answer, show the static catalog and do not fake a definition. Stdlib (`strata.move`) stays catalog-only.

---



### SE8 — Flesh out autocomplete

**Status: done (Sep 3, 2026).** Completions know classes, traits, signals, `self` / `super`, and `@node` hooks. Still **not** an LSP.

**Today** (`src/lib/rosegold-complete.ts`, VS Code `extension.js` + `catalog.json`):

- Word complete: keywords, types (`Sprite`, `Vec2`, …), snippets, catalog modules (`strata`, `math`, `str`, `input`), builtins, hooks, **local `fn` / `signal` / `const` / `struct` / `enum` names**.
- After `mod.`: catalog members (`math.sqrt`, `strata.move`). Any other `name.` only offers `emit`.
- **Missing:** `var` (module or class field), `class` / `trait` names, methods, `self.` / `super.`, `extends` / `impl` lists, trait `signal`s, `@node` hook snippets that match the class form (`on_create()`, `on_update(dt)`).

Still **not** an LSP. Prefer a deeper scan of the open buffers (and the same `catalog.json` for host/stdlib). A WASM `complete` that reuses the parser is fine later if the regex scan lies; do not add JSON-RPC.

**In-app and VS Code stay in lockstep.** One catalog, same member rules. Snippets in `editors/vscode/snippets/rosegold.json` and `rosegold-complete.ts` should not drift (trait + `signal`, `@node` hooks without a required `self` param).


| Work item | Notes |
|-----------|--------|
| Local decls | Scan `var` / `@export var`, `class`, `trait`, `mod`. Offer them at word complete with the right kind (`variable` / `type` / `namespace`). |
| `self.` | Inside a method: this class’s fields (and parent `Node` / `Sprite` fields: `name`, `x`, `y`, `z`) + methods (own, nested `impl`, inherited). Bare `take_damage` already typechecks; complete should offer the method name without requiring `self.`. |
| `super.` | Parent methods only. |
| After `.` on a signal | `died.` → `emit` (already the fallback). Prefer this when the name is a `signal` in this file or a trait this class `impl`s. |
| After `extends` | Node bases: `Node`, `Empty`, `Sprite`, `Tilemap`, `Camera`, `Mesh`, `Light`. |
| After `impl` | Trait names from this file (and open tabs). |
| Snippets | Trait template includes `signal event();`. `@node` / `on_create` / `on_update(dt)` match class hooks (no extra `name, x, y`). Nested `impl Trait { }`. |
| Catalog | Keep host/stdlib (`strata.*`, `math.*`, `Option.is_some`, …) in `catalog.json`. Do not duplicate that list in TS. |
| **Acceptance** | In `class Player impl Damageable { fn take_damage… }`, typing `take_` offers `take_damage`; `self.` lists `current_health` and `take_damage`; `died.` offers `emit`; `extends ` offers `Sprite`; `impl ` offers `Damageable`. |


**Out of scope for SE8:** completing arbitrary `expr.method` with a full typechecker (every local’s type), rename, find-all-refs, generating missing trait methods as a code action. If `p.` after `var p = Player {}` is easy from a parse, take it; do not block the milestone on it.

---


## Phase order

```
SE1–SE8 are done.
  later  rosegold lsp for VS Code only
```

---



## Highlight token sketch

Keep the set small so light/dark both work:


| Scope                                    | Role                          | Dark (approx.)                |
| ---------------------------------------- | ----------------------------- | ----------------------------- |
| keyword (`fn`, `if`, `return`, `import`) | `--accent`                    | peach                         |
| type (`Int`, `Float`, `String`, `Map`)   | `--accent-dim`                | rose                          |
| string / f-string                        | new `--syntax-string`         | warm gold                     |
| number                                   | `--accent-warm`               |                               |
| comment                                  | `--text-muted`                |                               |
| function name                            | `--text` + slightly brighter  |                               |
| `strata:` in strings                     | optional `--syntax-directive` | same as keyword, low priority |


Add `--syntax-*` variables next to the existing theme block in `index.css`. Do not hardcode hex in the CM6 theme module only.

---



## Keyboard contract


| Keys                     | Script editor focused              | Rest of app        |
| ------------------------ | ---------------------------------- | ------------------ |
| Cmd/Ctrl+Z / Shift+Z / Y | Text undo/redo                     | Entity undo/redo   |
| Cmd/Ctrl+S               | Save scene (unchanged)             | Save scene         |
| Cmd/Ctrl+F / H           | Find / replace                     | (none today)       |
| Cmd/Ctrl+G               | Go to line                         | (ignored; does not toggle snap) |
| Cmd/Ctrl+/               | Toggle `#` comment                 | —                  |
| Cmd/Ctrl-click, F12      | Go to definition (this file or import) | —              |
| Cmd/Ctrl+Enter           | Run current script                 | —                  |
| Tab / Shift+Tab          | Indent                             | Focus next control |
| 1 / 2 / 3                | **Ignored** while typing (already) | Mode switch        |
| Space                    | Insert space                       | Play/Stop          |


App `keydown` must treat CodeMirror’s content as “typing” (contenteditable / `.cm-editor`), not only `TEXTAREA`.

---



## Explicit “not now”

- Monaco / embedding VS Code
- Full LSP or the Python VS Code extension inside Strata
- Vim bindings, minimap, sticky scroll
- Diff editor / git blame
- Debugging (breakpoints, step)
- Editing non-`.rg` files
- Formatter (wait for a Rust `rosegold fmt`)
- Moving Script to a dockable panel (revisit if people want 2D + code side by side)
- LSP **inside** Script mode (JSON-RPC). A future `rosegold lsp` is for external editors only, after SE7.

---



## Success metrics


| Checkpoint | You know you’re there when…                                               |
| ---------- | ------------------------------------------------------------------------- |
| **SE1**    | A screenshot of Script mode is obviously a code editor, not a notes field |
| **SE2**    | You can write a 40-line hook without reaching for an external IDE         |
| **SE3**    | Two scripts stay open while you Play-test                                 |
| **SE4**    | A typo is visible *before* you press Play                                 |
| **SE5**    | New scripts start from snippets, not a blank page                         |
| **SE6**    | Hover on `strata.move` shows docs; Assets click opens instead of attaching |
| **SE7**    | Cmd-click `utils.move_line` opens the helper                              |
| **SE8**    | In a `@node` class, `self.` lists fields and methods; `impl ` offers the trait |


---



## Decisions to make before SE1


| #             | Question                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| 1 header      | **Mode toggle placement:** viewport header row vs keep the floating pill with top padding? Header is cleaner.  |
| 2 recommended | **Assets click:** open-for-edit vs attach-to-entity? Recommend: click opens; Inspector / drag attaches.        |
| 3 recommended | **Play log default:** ~30% height vs collapsed until Run/Play? Recommend: visible but shorter than the buffer. |


---



## How to use this doc

1. SE1–SE8 are in. Next editor work is a `rosegold lsp` for VS Code only, if you want it.
2. Language runtime work stays in [rosegold.md](./rosegold.md); this doc only consumes `check` / WASM diagnostics in SE4.
3. Engine Play loop stays in [plan.md](./plan.md).

