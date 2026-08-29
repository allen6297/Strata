# Strata Project Status & Next Steps

Snapshot: **Saturday, Aug 29, 2026**

## 1. What is Strata?

Strata is a **2D/3D scene editor** built with:

- **Frontend:** React + TypeScript + Tailwind CSS, packaged as a Tauri 2 desktop app.
- **Viewport:** Canvas-based 2D rendering with textures/gizmos; Three.js for the 3D editor view.
- **Backend:** Rust engine crate (`crates/strata-engine`) and Tauri command layer (`src-tauri/src/lib.rs`).
- **Scripting:** RoseGold, a custom Python-like language originally implemented in Python and being rewritten in Rust so the desktop app can ship without a Python runtime.

The local workspace is at `/Users/kalob/Code/strata`.

## 2. Editor State

The UI shell is mostly functional:

- Dockable panels (Hierarchy, Inspector, Asset Explorer, Viewport, Script Editor) with drag handles and close buttons.
- Native menu bridge for macOS app menus (`src/components/NativeMenuBridge.tsx`).
- Scene hierarchy and inspector wired to the scene model.
- 2D/3D viewport switcher, play mode, and runtime input handling.
- Script editor with RoseGold syntax highlighting via the VS Code extension in `editors/vscode`.

Known rough edges are mostly React-side linter warnings (refs accessed during render, set-state-in-effect, etc.) rather than hard blockers.

## 3. RoseGold Interpreter Rewrite (Rust)

The interpreter is in `crates/rosegold`. It is a tree-walking interpreter with a hand-written lexer, recursive-descent parser, and AST evaluator.

### Completed phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Minimal working interpreter: functions, variables, `if`/`while`/`for`, `print`, basic math, `str` stdlib, script hooks (`on_ready`, `on_update`) | Done |
| 2 | F-strings, range expressions (`0..n`, `0..=n`), `math` stdlib, `checks` stdlib | Done |
| 3 | **Runtime errors with line/col** + broader language coverage | Done |
| 4.1 | Array mutation — `push`, `pop`, and in-place index assignment | Done |

### Phase 3 additions

- **Runtime errors with `line:col` spans:** every AST node now carries a `Span`, and errors report where they happened (e.g. `runtime error at 7:11: undefined variable 'foo'`).
- **`elif` chains** on `if` statements.
- **`from module import Item;`** syntax parsed alongside `import module;`.
- **Map literals** with entries: `{"ada": 10, "grace": 12}`.
- **Map methods:** `.len()`, `.has(key)`, `.keys()`, `.remove(key)`, `.insert(key, value)`.
- **Enum/variant support:** `Option.Some(x)`, `Option.None`, `Result.Ok(x)`, `Result.Err(e)`.
- **Enum methods:** `.unwrap_or(...)`, `.is_some()`, `.is_none()`, `.is_ok()`, `.is_err()`, `.unwrap()`.
- **`match` expressions** with variant and wildcard patterns:
  ```rose
  match maybe {
      Some(v) { print(v); }
      None    { print("none"); }
  }
  ```
- **F-string format specs:** `f"pi≈{pi:.2f}"` → `pi≈3.14`.
- Tests added for all of the above; full workspace `cargo test` passes.

### Phase 4.1 additions

- **`Value::Array` and `Value::Map` use shared mutability** (`Rc<RefCell<...>>`) so assignments and methods mutate the original value.
- **`Array.push(value)`** and **`Array.pop()`** mutate in place.
- **In-place index assignment** works for arrays and maps: `a[0] = 42; scores["key"] = value;`.
- Tests added for shared-reference mutation; `cargo test -p rosegold` passes.

## 4. What is still missing / next steps

The interpreter is getting close to feature parity with the original Python version, but several language and engine pieces remain before it covers the full Strata script surface.

### 4.1 RoseGold language gaps

1. **Real module import resolution** — done.
2. **Structs / enums / `impl` methods** — done (declarations, literals, field access, match, `impl Type { fn ... }`).
3. **Type checker** — done (lenient static pass before eval; catches unknown functions and wrong arity).
4. **More stdlib parity** — done for `io` (`read_text` / `write_text` / `exists`), Array `first`/`last`/`contains`, and `str.upper`/`lower`/`trim`.
5. **Full example compatibility** — ported RoseGold-PY `hello`, `map_result`, `tests`, `tour` (core), and `multi` into `cargo test -p rosegold`. Gaps filled: `pub`, `@test` attributes, dotted module paths (`util.math` → `util/math/lib.rg`), named enum fields, multi-bind match patterns, `return` inside `match`, and `from result/option import`.

### 4.2 Engine / editor next steps

1. **Script host bridge** — done. `RoseGoldScriptHost` in `strata-engine` runs `on_ready` / `on_update` and applies `strata:` directives to the world. Tauri exposes `engine_set_scripts` / `engine_set_keys`.
2. **Remove Python fallback** — done.
3. **spawn / destroy directives** — done in the Rust host; `mergeEngineEntities` adds/removes entities in the editor.
4. **Restore edit state on Stop** — done via `beginTransient` / `discardTransient` around Play.
5. **Browser preview parity** — the browser preview still applies directives without the real interpreter. Decide whether to keep it as a preview-only stub or compile the Rust interpreter to WASM.

## 5. Running tests

```bash
# Rust interpreter tests
cargo test -p rosegold

# Full workspace
cargo test

# TypeScript build
npx tsc -b

# Linter (warnings exist; should report zero errors)
npx oxlint
```

## 6. How to decide the next phase

The fastest way to extend the interpreter is to pick an upstream RoseGold-PY example that currently fails and implement the missing feature. The examples can be cloned from `https://github.com/allen6297/RoseGold-PY` and run with the Python interpreter if you still have it installed; otherwise port the relevant script to `cargo test -p rosegold`.

Alternatively, the next highest-impact items are:

- **Browser preview / WASM** (optional).
- More upstream example chase as needed.

Working tree changes for examples + spawn/destroy/Play restore are ready to commit when you ask.