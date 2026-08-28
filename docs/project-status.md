# Strata Project Status & Next Steps

Snapshot: **Friday, Aug 28, 2026**

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
- Script editor with RoseGold syntax highlighting via the vendored VS Code extension (`vendor/RoseGold-PY/editors/vscode`).

Known rough edges are mostly React-side linter warnings (refs accessed during render, set-state-in-effect, etc.) rather than hard blockers.

## 3. RoseGold Interpreter Rewrite (Rust)

The interpreter is in `crates/rosegold`. It is a tree-walking interpreter with a hand-written lexer, recursive-descent parser, and AST evaluator.

### Completed phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Minimal working interpreter: functions, variables, `if`/`while`/`for`, `print`, basic math, `str` stdlib, script hooks (`on_ready`, `on_update`) | Done |
| 2 | F-strings, range expressions (`0..n`, `0..=n`), `math` stdlib, `checks` stdlib | Done |
| 3 | **Runtime errors with line/col** + broader language coverage | Done |

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

## 4. What is still missing / next steps

The interpreter is getting close to feature parity with the Python version, but several pieces remain before the Python fallback can be removed.

### 4.1 RoseGold language gaps

1. **Array mutation** — `push`, `pop`, and in-place index assignment are still placeholders. Requires moving `Value` from pure `Clone` semantics to a reference-based model (e.g. `Rc<RefCell<Value>>` or interned handles) so methods can mutate the original array.
2. **Real module import resolution** — `from module import Item;` and `import module;` are parsed, but they do not yet load `.rg` files from disk. The `Option` and `Result` modules are currently hard-coded in the interpreter.
3. **Structs / classes / enums with custom definitions** — only built-in `Option` and `Result` exist; user-defined `struct`/`enum` types are not parsed.
4. **Type checker** — type annotations are parsed and ignored at runtime. A static check phase is needed for safer scripts.
5. **More stdlib parity** — `io` (file I/O), full `Array` module, and any remaining `str`/`math`/`checks` functions that the Python examples rely on.
6. **Full example compatibility** — the Python examples under `vendor/RoseGold-PY/examples/` still exercise features the Rust interpreter does not yet support. Running them one by one is the best way to find the next gaps.

### 4.2 Engine / editor next steps

1. **Script host bridge** — the Rust engine currently uses a `NullScriptHost` stub. Wire `rosegold` into the engine so scripts can read/write scene state during `on_update`.
2. **Remove Python fallback** — once the Rust interpreter runs the full Strata script surface and the Python examples pass, delete the vendored Python fallback and the editable install in `setup-rosegold.sh`.
3. **Browser preview parity** — the browser preview applies RoseGold directives without the real interpreter. Decide whether to keep it as a preview-only stub or compile the Rust interpreter to WASM.

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

The fastest way to extend the interpreter is to pick a RoseGold-PY example that currently fails and implement the missing feature:

```bash
vendor/RoseGold-PY/.venv/bin/rosegold vendor/RoseGold-PY/examples/tour/main.rg
vendor/RoseGold-PY/.venv/bin/rosegold vendor/RoseGold-PY/examples/tests/main.rg
vendor/RoseGold-PY/.venv/bin/rosegold vendor/RoseGold-PY/examples/map_result/main.rg
```

Alternatively, the next highest-impact items are:

- **Array mutation** (unblocks many real scripts).
- **File-based module imports** (unlocks the standard library files in `vendor/RoseGold-PY/rosegold/stdlib/`).
- **Struct/enum definitions** (unlocks user-defined data types).

All code changes are currently uncommitted in the working tree.