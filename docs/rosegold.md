# RoseGold Plan

Snapshot: **Tuesday, Sep 1, 2026**

Related: [crates/rosegold/README.md](../crates/rosegold/README.md) · [plan.md](./plan.md) · [project-status.md](./project-status.md)

RoseGold is Strata’s gameplay scripting language: a small, Python-like language with C-style braces, implemented as a Rust crate (`crates/rosegold`) with a hand-written lexer, recursive-descent parser, lenient type check, and tree-walking interpreter.

This doc is the language/runtime roadmap. Engine play architecture (snapshots, 2D-only, WASM engine) stays in [plan.md](./plan.md).

---

## Strategic direction


| Decision          | Choice                                            | Planning implication                                                  |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| **Job**           | Gameplay hooks, not a general-purpose language    | Features earn their way by making `on_ready` / `on_update` better     |
| **Runtime**       | Stay interpreted                                  | Tree-walker is fine until many entities + heavy scripts actually hurt |
| **Parity**        | Desktop is source of truth; browser matches later | Same `.rg` files; WASM must not grow a second dialect                 |
| **Host contract** | Engine owns the world                             | Scripts request effects; they do not own entity lists                 |


**One-line goal:** Write a `.rg` file, attach it to an entity, press Play, and the **engine** runs it — with script-local state, clear errors, and the same behavior in the browser.

---

## Current state

The language is already past “hello world.” Core syntax, stdlib, modules, a play-ready host, CLI diagnostics, project-module imports, a **WASM play session**, Inspector `@export`, **signals**, **host QoL** (`on_destroy`, `input`, `strata.after`, `math.lerp`), and a **crate-embedded `.rg` stdlib** exist. RG1–RG10 are done. Do not add syntax for its own sake.

### Implemented


| Area             | What works                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline         | Lex → parse → `typecheck` → eval (`main` or `EvalContext::call`)                                                                                                                                                                                                |
| Functions / vars | `fn`, `var`, `const`, optional types, `return`, `@test`, `@ufcs`                                                                                                                                                                                               |
| Control flow     | `if` / `elif` / `else`, `while`, `for` over ranges and collections, `break` / `continue`                                                                                                                                                                        |
| Collections      | Arrays and maps, shared mutability, index assign                                                                                                                                                                                                                |
| Types            | User `struct` / `class` / `enum` / `impl` / `trait` + `impl Trait for Type` or nested `impl Trait` in a class, `@node class Foo extends Sprite`, `match`, crate `Option` / `Result` / `Vec2` / `Vec3` / node types (`.rg`); `Str` aliases `String` |
| Modules          | `mod name { … }` is the namespace; same name **merges across files**. `import x;` / `from x import y;` (filename modules still work). Play host uses the script library                                                                                         |
| Stdlib           | Public `math` / `str` / `option` / `result` / `checks` / `vec` (`Vec2`, `Vec3`) / `node` (`Sprite`, …) are crate `stdlib/*.rg`. Trig and string search stay `__math` / `__str`. Host forever: `io`, `strata` (`move`/`rot`/`set`/`spawn`/`destroy`/`play_sound`/`after`/`find`), `input` (`pressed`/`held`) |
| Builtins         | `print`, `len`, `assert`, `Array(...)`, `Map(...)`                                                                                                                                                                                                              |
| Operators        | Arithmetic, `//` integer division, `&&` / `\|\|`, bitwise `&` `\|` `^` `<<` `>>` `~` and `&=` `\|=` `^=` on `Int`                                                                                                                                              |
| UFCS             | `@ufcs` on a free `fn`; `x.foo(y)` → `foo(x, y)` when no inherent method `foo` exists                                                                                                                                                                           |
| Host             | Play: compile once per source; one `EvalContext` per entity; `HostEffect` from `strata.*` plus stdout `strata:` compatibility; `input.pressed` / `input.held` (CSV hook args still work); `on_destroy`; `strata.after` timers; `import` from the script library |
| WASM             | `crates/rosegold-wasm` → `src/wasm/rosegold`: `check`, `run` / `run_hooks` (preview), `format_source`, `**engine_load_scene` / `engine_tick**` (`PlaySession`, same hook path as desktop) |
| Tests            | `cargo test -p rosegold` includes ports of several RoseGold-PY examples                                                                                                                                                                                         |


### Known gaps (do these before new syntax)

1. **VS Code uses the Rust CLI plus `catalog.json`.** The extension calls `rosegold check` / `hover` / `def` / `fmt`. Point `rosegold.cliPath` at the binary if it is not under `target/`.
2. **`fmt` keeps `#` comments and `##` docs.** `->` is accepted as a return-type alias for `:`.
3. **WASM `io` is an in-memory VFS** — `read_text` / `read_lines` / `write_text` / `append_text` / `remove` / `exists` round-trip paths in the Play session; they are not the host disk.
4. **RG10 is done** (`class` / `trait` / `@ufcs` / bitwise / `##` / `extends` / `super`). Multiple inheritance / instance `private` stay out. Module `pub` is required inside `mod { }`.

### Crate map

```
crates/rosegold/          lexer, parser, typecheck, interpreter, host effects, CLI (`check`/`run`/`test`/`fmt`); `stdlib/*.rg` embedded
crates/rosegold-wasm/     wasm-bindgen: check, run, run_hooks (preview), format_source, engine_* play host
crates/strata-engine/     PlaySession / RoseGoldScriptHost (`HostEffect` + stdout directives → World)
editors/vscode/           highlighting + Rust CLI (`check` / `hover` / `def` / `fmt`) + shared `catalog.json`
```

---

## Target shape

```
.rg source
    → lex / parse / typecheck once
    → cached Program + EvalContext  (per entity, lives across ticks)
         ↓ call("on_update", …)
    → HostEffect[]  (print("strata:…") still accepted)
         ↓
    World mutation + side effects (sound, …)
```

**Principles**

1. **Compile once per script change** — never re-lex on the hot path.
2. **One VM per attached script** — locals, `var`s at module scope, and loaded modules survive between ticks.
3. **Same sources everywhere** — `HashMapResolver` is the WASM/embed path; `FileModuleResolver` is desktop.
4. **Keep the language small** — add syntax only when a real gameplay script is blocked.

---

## Milestone map

Aligned with Strata M1–M4, but scoped to the language crate and its host. Engine snapshot protocol stays in [plan.md](./plan.md).

### RG1 — Play-ready runtime

**Status: done (Aug 30, 2026).** Unblocks real gameplay scripts.

**Outcome:** Hooks are cheap and stateful. Demo scripts can keep a cooldown, jump flag, or facing direction without stuffing it into the scene.


| Work item             | Notes                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cache `Program`       | `compile_source` + host `program_cache`; parse + typecheck when source changes                                     |
| Persist `EvalContext` | One VM per entity id; `load_program` once; `call` each tick                                                        |
| Spawned scripts       | New entity gets its own cached program + context; `on_ready` still runs once                                       |
| Error policy          | Failed hook: log + skip that entity this tick; do not tear down the whole play session                             |
| `Str` alias           | `Str` parses as `String`                                                                                           |
| **Acceptance**        | Module `var` persists across ticks (engine tests); default Player has `jump_cd`; `sync_scripts` does not reset VMs |


**Isolation choice:** one `EvalContext` per entity (copied module state). Stop calls `clear_scripts`, which drops all VMs.

---

### RG2 — CLI and diagnostics

**Status: done (Aug 30, 2026).**

**Outcome:** You can check a file from the terminal, and the editor can show `line:col` errors without Python.


| Work item         | Notes                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `rosegold` binary | `run <file>`, `test <file>`, `check <file>` (`--json` optional)                                                        |
| Diagnostic format | `file:line:col: error: …` and JSON `{ file, line, col, severity, message }`                                            |
| Script panel      | Debounced `check` → gutter + line highlight + footer                                                                   |
| VS Code           | `editors/vscode` talks to the Rust binary (`check --json --stdin`, `hover`, `def`) plus `catalog.json` for host/stdlib |
| **Acceptance**    | `check Hero.rg` is clean; `add(1)` reports arity at the **call** site                                                  |


**Out of scope for RG2:** formatter rewrite, LSP server, full language server protocol.

In-app hover/docs: **SE6** is the static catalog; **SE7** adds `hover_at` / `def_at` for imported symbols — not an LSP inside the panel.

---

### RG3 — Language hardening

**Status: done (Aug 30, 2026).**

**Outcome:** Scripts share code and fail at the right line. Still engine-first.


| Work item                | Notes                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| File imports in the demo | Hero `import utils;` binds `mod utils` (demo file `utils.rg`)                                              |
| Typecheck stdlib arity   | Host `io` / `strata` / `input` from a small table; public `math.*` / `str.*` / `checks.*` from crate `.rg` |
| Import graph             | `import m` registers `m.fn`; `from m import foo` binds arity when the module resolves                      |
| Match / enums            | `Rect(w, h)` unpacks; `Rect(dims)` is still the whole payload; named binds when the enum names fields |
| Game math                | `math.sqrt`, `sin`, `cos`, `atan2`                                                                         |
| `pub`                    | Required to export from `mod { }`. Filename modules stay fully public. Inspector is `@export`.              |
| **Acceptance**           | Demo uses a shared module; `check` catches wrong `math.clamp` arity with a span                            |


Language features that stay **backlog** unless a demo blocks: closures, generics beyond `Map<K,V>` syntax sugar, async. **RG10 is done** (`class` / `trait` / `@ufcs` / bitwise / `##`).

---

### RG4 — Host API v2

**Status: done (Aug 30, 2026).**

**Outcome:** Scripts request world changes without string-parsing as the public API. `print("strata:…")` remains as a compatibility path.


| Work item               | Notes                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `HostEffect` enum       | `Move`, `Rot`, `Set`, `Spawn`, `SpawnPrefab`, `Destroy`, `PlaySound` recorded on `EvalContext` |
| Builtin module `strata` | `strata.move(dx, dy)`, `rot`, `set`, `spawn(name                                               |
| Input edges             | just-released (optional); held `keys` + just-pressed `pressed` already exist                   |
| World queries (minimal) | skipped; hook args already pass name/x/y. Collisions/prefabs are Strata M5                     |
| **Acceptance**          | Demo scripts have **zero** `print("strata:…")` lines; old print scripts still work             |


Do not invent a large entity query language here. If you need collisions, that is Strata M5, not a RoseGold feature.

---

### RG5 — Browser / WASM readiness

**Status: done (Aug 30, 2026).** Pairs with Strata M4 (engine WASM play host).

**Outcome:** Browser Play uses the same cached-hook path as desktop. `import utils` works from the in-memory script library. `run_hooks` remains a one-shot preview helper, not the play loop.


| Work item                 | Notes                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| In-memory project modules | `PlaySession` / `CombinedResolver` supplies `{ "utils.rg": "…" }` from the script library        |
| Sandbox `io`              | wasm32 uses an in-memory VFS (`read_text` / `read_lines` / `write_text` / `append_text` / `remove` / `exists`); not the host disk                  |
| Same hook API             | WASM `engine_load_scene` / `engine_tick` call `load_program` / `call`, not `run_source` per tick |
| **Acceptance**            | Same Hero/Coin sources play in `npm run dev` (after `npm run build:wasm`) — no second dialect    |


`rosegold-wasm`’s `run_hooks` (fresh `run_source` per job) is still used only when the WASM engine host is missing.

---

### RG6 — Inspector exports

**Status: done.** Godot-shaped node properties: script vars the author marks, not every module `var`.

**Outcome:** A Coin script can `@export var spin: Float = 8.0;` and the Inspector shows a **Spin** field on that entity. Per-entity overrides live in the scene, not in the `.rg`. Play injects them into the VM after `load_program`, before `on_ready`.

Use **attributes**, same family as `@test`. Do **not** add `export` / `exportgroup` keywords. Do **not** reuse `pub` (that is module visibility: required on items inside `mod { }`).

```rg
@export_group("Movement")
@export var speed: Float = 120.0;
@export var jump: Float = 280.0;

var frames: Int = 0;   // hidden — runtime only
```


| Work item            | Notes                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Parse `@export`      | On module-scope `var` only. Metadata: name, type, default (literal), optional group. `check` / WASM must emit this **without** eval |
| `@export_group("…")` | Applies to following `@export var`s until the next group (Godot-style). Inspector renders one card per group                        |
| Scene overrides      | Entity field e.g. `scriptProps: { "speed": 140 }` in `.scene` v2. Missing key → script default. Reset-to-default later              |
| Play inject          | After `load_program`, write overrides into the entity `EvalContext` before `on_ready`. Same path desktop + WASM                     |
| Inspector UI         | Dynamic cards under the script slot; `Int` / `Float` / `Bool` / `Str` only in this milestone                                        |
| **Acceptance**       | Coin `@export var spin`; two coins can have different spin in the Inspector; Play uses those values; `frames` does not appear       |


**Out of scope for RG6:** ranges/sliders, colors, node/entity refs, enums, arrays, live-updating the Inspector from Play mutations, `@export` on `const` or locals.

**Editor vs language:** crate emits export metadata (JSON from `check` or a dedicated `exports` API). Strata Inspector consumes it. Do not invent a second parser in TypeScript.

---

### RG7 — Signals

**Status: done.** Decoupled events between nodes. `on_enter` / `on_exit` stay collision hooks; signals are “Coin told the HUD” without the HUD being in the overlap.

**Outcome:** A script declares `signal collected(amount: Int);`, emits on collect, and another entity’s method runs because the **Inspector** wired the connection (Godot Node tab). Same path desktop + WASM.

Do **not** add closures so you can `connect(fn (n) { … })`. Connect is host + editor: signal name → other entity’s method name.

```rg
signal collected(amount: Int);

fn on_enter(other: Str, x: Float, y: Float): Int {
    collected.emit(1);
    strata.destroy();
    return 0;
}
```


| Work item                | Notes                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `signal` at module scope | Declaration + payload types. Metadata beside `@export` (name, params). No eval                                |
| `.emit(...)`             | Host effect: fire this entity’s signal with args. Unknown signal is a runtime error at the emit span          |
| Inspector connections    | Scene data: `{ signal, to, method }` (`from` is the emitting entity). Play dispatches after the emitting hook |
| Optional host API        | Thin `strata.connect(...)` later if scripts must wire at runtime. Inspector is the v1 path                    |
| **Acceptance**           | Coin emits `collected`; Player `on_coin` runs without implementing `on_enter` name-matching                   |


**Out of scope for RG7:** closures, signal buses / autoloads, connecting in `.rg` as the only path, typed Callables.

**Depends on RG6** so export metadata and Inspector cards exist; signals are the event half of the same node surface.

---

### RG8 — Lifecycle and host QoL

**Status: done.** Prefer **host / stdlib** over new syntax. Gameplay scripts should not need `async` or CSV key strings.

**Outcome:** Destroy has a hook; input and delays are functions, not string soup.


| Work item       | Notes                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `on_destroy`    | Engine calls it once when this entity is destroyed (`strata.destroy` or host). No new syntax      |
| `input.pressed` | Replace `str.contains(pressed, "Space")` with a small `input` module (held / just-pressed)        |
| `strata.after`  | `strata.after(0.5, "explode")` — timer fires that method once. No `async` / `await`               |
| `math.lerp`     | `lerp` / `lerp_float` (and maybe `move_toward`) when a demo tweens without a `Vec2` type          |
| **Acceptance**  | Coin can `after` a pop then destroy; Player jump uses `input.pressed("Space")`; `on_destroy` logs |


**Out of scope for RG8:** coroutines, `yield`, animation players, `strata.find` (see below).

`strata.find` (nearest / by name) is **done** — `strata.find("Coin")` or `strata.find()` (nearest other). No query language.

---

### RG9 — Stdlib as native `.rg`

**Status: done.** Crate hygiene, not a gameplay block. Host APIs (`io`, `strata`, `input`) stay wired in the interpreter. Types and wrappers live in `.rg`.

**Outcome:** Public stdlib is crate-embedded `.rg` (`crates/rosegold/stdlib/*.rg`, `include_str!`). Every resolver (CLI, desktop Play, WASM) injects those files. `import math;` / `from option import Option` work with **no copies in the project**. Same sources everywhere.

Scripts still cannot implement IEEE `sin` or Unicode `upper` in a tree-walker. Those stay a **thin native primitive table**. `math.rg` / `str.rg` are the public API: they re-export primitives and implement the rest in RoseGold (`clamp`, `lerp`, `gcd`, `repeat`, …).

Do **not** Taylor-series `sin` in `.rg`. Do **not** rewrite `strata` / `io` / `input` as RoseGold.


| Work item                 | Notes                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two layers                | `**.rg` (public):** `option`, `result`, `math`, `str`, then `checks` if pure. **Rust primitives:** `sin`/`cos`/`atan2`/`sqrt`/`pow`, string `contains`/`upper`/`lower`/`trim`. **Rust host forever:** `io`, `strata`, `input` |
| Embed in the crate        | Resolver always sees `stdlib/*.rg` before user modules. Users never vendor copies                                                                                                                                             |
| WASM                      | In-memory map includes embedded stdlib automatically. Do not wait for the script library / Files panel                                                                                                                        |
| Drop interpreter specials | Once `.rg` covers `Option`/`Result` and math/str wrappers, remove hardwired *modules*. Keep the primitive builtins they call                                                                                                  |
| Typecheck                 | Arity from the `.rg` (and a small primitive table). No parallel `stdlib_arity` for `clamp` / `Some`                                                                                                                           |
| Hot path                  | Hero’s per-tick `str.contains(keys, …)` stays a primitive, not a character loop in the interpreter                                                                                                                            |
| **Acceptance**            | Existing tests pass; WASM Play has no `option.rg` / `math.rg` in the demo; `math.lerp` can live in `math.rg`; `math.sin` still hits Rust                                                                                      |


**Out of scope for RG9:** a package manager, user-overridable stdlib paths, moving `strata.`*, writing trig in RoseGold.

**Depends on** imports + in-memory resolvers already working (RG3 / RG5). Do it after RG6–RG8 so Inspector/signals/host QoL ship first.

---

### RG10 — Types, UFCS, docs, bitwise

**Status: done.** `class` and `trait` are in the crate with `@ufcs`, bitwise, and `##` docs. `struct` + `impl` / `#` comments / `&&` `||` were already the current surface.

**Outcome:** A gameplay script can declare a `class` with methods in the same block, share a `trait` across types, call a free function as a method with `@ufcs`, attach hover docs with `##`, and mask bits with `&` `|` `^`. Same sources desktop + WASM.

Crate `Vec2` is the stdlib class. Multiple inheritance / `private` stay out.

#### `class`

**Status: done.** `struct` stays a data record. `class` is the same type with **fields and methods in one declaration** (no separate `impl` required). `impl ClassName { … }` still works for extra methods. Construction stays `Name { field: value }` — no `new` / `init` in v1 (`init` was PY; keep it out).

```rg
class Vec2 {
    var x: Float = 0.0;
    var y: Float = 0.0;

    fn length(self): Float {
        return math.sqrt(self.x * self.x + self.y * self.y);
    }
}

fn main(): Int {
    var v = Vec2 { x: 3.0, y: 4.0 };
    print(v.length());
    return 0;
}
```


| Work item             | Notes                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyword `class`       | Lexer + parser. Body: `var` / `const` / `fn`. Same type namespace as `struct` / `enum`.                                                                                           |
| `self`                | Same as `impl` methods today.                                                                                                                                                     |
| `extends` / `super`   | Single inheritance. Child gets parent fields + methods. `super.method(args)` calls the parent. No `super()` constructor (`init` stays out).                                      |
| Coexist with `struct` | `class Vec2` and `struct Vec2` must not both exist. `impl` applies to either.                                                                                                     |
| **Not v1**            | Multiple inheritance, `private` / `internal` / `static` / `final`. |


#### `@node` class

**Status: done.** A file may declare one `@node class MyNode extends Sprite`. Import the base first (`import strata.Sprite;` or `Node` / `Empty` / …). Bases live in crate `stdlib/node.rg` (`name`, `x`, `y`, `z`). Play constructs the class, calls `on_create` (or `on_ready`) / `on_update(self, dt)` / `on_destroy` as methods, and copies `x` / `y` / `z` back onto the entity. Free-function hooks stay valid. Add Node lists these classes in a Scripts group.

```rg
import strata.Sprite;

@node
class MyNode extends Sprite {
    fn on_create(self) {
        print("MyNode created");
    }
    fn on_update(self, dt: Float) {
        self.x = self.x + 1.0;
    }
    fn on_destroy(self) {
        print("MyNode destroyed");
    }
}
```

| Work item | Notes |
| --------- | ----- |
| One per file | Type error if a second `@node` class appears. |
| Must `extends` | Parent must be a node type (walks `extends`). `@node` without `extends` is out. |
| Hooks | `on_create(self)`, `on_update(self, dt: Float)`, `on_destroy(self)`, optional `on_enter` / `on_exit(self, other: Str)`. Old free-fn arity on these methods is a type error. |


#### `trait`

**Status: done.** A named set of methods. Types opt in with `class Foo impl Named, Drawable` (methods in the class body), nested `impl Trait { … }`, or `impl Trait for Type`. No Java-only `implements` keyword. No trait objects / `dyn` — this is compile-time “does this type have these methods,” enough for `check` and for sharing `length` / `draw` across structs.

```rg
trait HasLength {
    fn length(self): Float;
}

impl HasLength for Vec2 {
    fn length(self): Float {
        return math.sqrt(self.x * self.x + self.y * self.y);
    }
}
```


| Work item              | Notes                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `trait Name { fn …; }` | Signatures only in v1 (no default bodies).                                                     |
| `impl Trait for Type`  | Distinct from inherent `impl Type`. Typecheck: call is valid if inherent or trait impl exists. |
| Nested `impl Trait`    | Inside a `class` body; methods are on the instance. Module-scope `impl Trait for Type` still works. |
| `class Foo impl Trait` | Header list: `class Vec3 extends Point impl Named, Drawable`. Body methods must satisfy each trait. |
| **Not v1**             | Trait bounds on generics, `impl Trait` in signatures, multiple inheritance, mixins.            |


#### `@ufcs`

**Status: done.** Uniform Function Call Syntax. An attribute, same family as `@test` / `@export` — **not** a keyword. `x.foo(y)` may resolve to `foo(x, y)` when `foo` is marked `@ufcs` and there is no inherent method `foo` on `x`.

```rg
@ufcs
fn clamp(n: Float, lo: Float, hi: Float): Float {
    return math.clamp(n, lo, hi);
}

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    var speed = 400.0.clamp(0.0, 200.0);
    return 0;
}
```


| Work item       | Notes                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `@ufcs` on `fn` | First parameter is the receiver. Member lookup: inherent method → UFCS free fn → error.                    |
| `@no_ufcs`      | Opt out if a name would collide (PY had this). Optional; only if `@ufcs` is too sticky.                    |
| Typecheck       | Arity includes the receiver. Span is the call site, same as RG3.                                           |
| **Not v1**      | UFCS on every function by default. That makes `x.len()` vs `len(x)` too magical next to the builtin `len`. |


Scripts already write `str.contains(s, sub)` and `math.clamp(n, lo, hi)`. UFCS is sugar, not a new stdlib.

#### Documentation comments

**Status: done.** Hover docs that belong to the **next** item (`fn`, `var`, `signal`, `@export var`, …). Ordinary comments stay `#`.

**Do not use `///`.** The lexer treats `//` as integer division (`SlashSlash`). `/// spin` would tokenize as divide, not a comment. PY used `///` when `//` was a comment; that is gone.

```rg
## Degrees per second. Shown on the Coin Inspector card.
@export var spin: Float = 8.0;

## Called every Play frame.
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    return 0;
}
```


| Work item             | Notes                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `##` line             | Attaches to the next parsed item. Multiple consecutive `##` lines join with newlines.                             |
| `#` line              | Ordinary comment. `fmt` reprints it. Hover / Inspector ignore it.                                                 |
| `hover_at` / catalog  | User-symbol hover prefers `##` text over a generated signature-only string. Host/stdlib still use `catalog.json`. |
| VS Code / Script mode | Grammar highlights `##` as a doc comment; `#` stays a line comment.                                               |
| Inspector             | `@export var` `##` text is the field tooltip.                                                                      |
| **Not v1**            | `/* */` / `/** */` block comments. `//` stays division. Markdown in docs is fine; no second parser.               |


#### Bitwise operators

**Status: done.** Integers only. Distinct from `&&` / `||`.

```rg
fn layer_bit(n: Int): Int {
    return 1 << n;
}

fn on_ready(name: String, x: Float, y: Float): Int {
    var mask = layer_bit(0) | layer_bit(2);
    var hit = mask & layer_bit(2);
    var flipped = mask ^ 255;
    return 0;
}
```


| Token          | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| `&` `|` `^`    | and / or / xor                                           |
| `<<` `>>`      | shift                                                    |
| `~`            | not (prefix)                                             |
| compound `&=` `\\|=` `^=` | compound assign (shipped) |



| Work item  | Notes                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexer      | Lone `&` / `|` are bitwise (not an error). `&&` / `||` stay logical.                                                                                           |
| Typecheck  | Both sides `Int`. Float is an error at the operator span.                                                                                                           |
| **Not v1** | Bitwise on `Bool`, unsigned types, bitfields as a language feature. Collision **layers / masks** stay scene/Inspector data until a demo must pack them in a script. |


**Acceptance:** `check` accepts the snippets above; `1 << 3` is `8`; `v.length()` works on a `class Vec2`; `400.0.clamp(0.0, 200.0)` works with `@ufcs`. WASM Play runs the same file.

**`##` docs:** hover on `spin` shows the `##` line; `check` still accepts existing scripts; WASM hover JSON includes the doc.

**Out of scope for RG10:** closures, `async`, a bytecode VM, instance-level `private`. Multiple inheritance stays out. Module `pub` is implemented (required inside `mod { }`).

**Depends on** RG3 (typecheck spans, imports) and SE7 (`hover_at`). Grammar and `catalog.json` change in the same PR as the crate, not before.

---

## Phase order

```
RG1–RG9 are done.
RG10  class / trait / extends / super / @ufcs / bitwise / ## docs  (done)
```

---

## Stdlib policy

Keep the public stdlib **small and total**. Prefer a new `math.sin` over a new language feature.


| Module              | Now                                                                                          | Next (only if a script needs it) | Not now                           |
| ------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------- |
| `math`              | crate `math.rg`: `lerp`/`clamp`/`gcd`/… in RoseGold; `__math.sin`/`cos`/`atan2`/`sqrt`/`pow` | —                                | Taylor `sin`                      |
| `str`               | crate `str.rg` wrapping `__str.contains`/`upper`/`lower`/`trim`/`split`/`slice`              | —                                | regex; `contains` as a char loop  |
| `vec`               | crate `vec.rg`: `class Vec2` / `class Vec3 extends Vec2` with `length` / `add`                | more vector ops if a demo needs  | a language-level vector type      |
| `node`              | crate `node.rg`: `Node` / `Empty` / `Sprite` / … for `@node class`                            | more node fields if a demo needs | replacing Entity.kind with the class name |
| `io`                | `read_text` / `read_lines` / `write_text` / `append_text` / `remove` / `exists` (native); WASM is in-memory VFS | —                                | network, directories              |
| `checks`            | crate `checks.rg` on `assert`                                                                | keep for `@test`                 | a second test framework           |
| `strata`            | `move`, `rot`, `set`, `spawn` (inline or prefab), `destroy`, `play_sound`, `after`, `find`  | —                                | entity lists, query language      |
| `input`             | `pressed` / `held` (KeyboardEvent codes)                                                     | remapping UI in the language     | action maps as a language feature |
| collections         | push/pop/first/last/contains, map has/keys/remove/insert                                     | `slice`, maybe `sort`            | `map`/`filter` as closures        |
| `option` / `result` | crate `option.rg` / `result.rg`                                                              | —                                | user-vendored copies              |


**Host** (`io`, `strata`, `input`) stays Rust. **Public** `math` / `str` / `option` / `result` / `checks` are crate `.rg` that wrap a small primitive table. Injected by every resolver so WASM does not need project files.

---

## Explicit “not now”

- Bytecode VM, JIT, or LLVM
- Closures / first-class functions — signals use method names, not `fn (x) { … }`
- Multiple inheritance / `private` — `class Child extends Parent` is single inheritance; `trait` is still the shared method set
- Package manager or versioned `rg` libraries
- Async / await — use `strata.after(dt, "method")`, not coroutines
- Full RoseGold-PY chase as a sprint (port the next example only when it unblocks a demo)
- VS Code extension rewrite (after the Rust CLI exists)
- Formatter, unless `check` is done and you are editing large files by hand
- 3D script hooks
- `export` / `exportgroup` **keywords** — use `@export` / `@export_group` (RG6)
- Entity query language / `find` as a mini-SQL — nearest/by-name only if a demo is stuck
- Implementing `sin` / Unicode casefold in `.rg` — `math.rg` / `str.rg` wrap primitives; they do not replace them
- Rewriting `io` / `strata` / `input` as `.rg` — those are host

---

## Success metrics


| Checkpoint | You know you’re there when…                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **RG1**    | A script can `var jumping = false` at **module scope** and it still matters on the next tick                       |
| **RG2**    | You can `check` a file in CI without opening the editor                                                            |
| **RG3**    | Demo Hero `import`s a shared helper; wrong arity is a type error                                                   |
| **RG4**    | New scripts call `strata.move` (or equivalent) instead of printing strings                                         |
| **RG5**    | Browser Play runs the same cached-hook path as desktop                                                             |
| **RG6**    | An `@export var` on Coin shows in the Inspector; a second Coin can override it without editing the `.rg`           |
| **RG7**    | Coin `collected.emit(1)` runs Player `on_coin` via an Inspector connection, not `on_enter` name checks             |
| **RG8**    | Jump uses `input.pressed`; a delayed `after` + `on_destroy` work without `async`                                   |
| **RG9**    | `import math` / `from option import Option` load crate `.rg` on WASM with no files in the demo; `sin` still native |
| **RG10**   | `class Vec2` with a method; `class Slime extends Enemy`; `super.hurt(d)`; `@ufcs` `x.clamp(lo, hi)`; `##` hover; `1 << 3` is 8 |


---

## Decisions (RG1)


| #     | Question              | Choice                                                                                 |
| ----- | --------------------- | -------------------------------------------------------------------------------------- |
| 1 no  | **Isolation**         | Isolated `EvalContext` per entity. Shared `import utils;` is loaded separately per VM. |
| 2 yes | **Stop**              | `clear_scripts` drops all VMs. Engine already restores the edit scene.                 |
| 3 yes | `**Str` vs `String**` | Alias: `Str` parses as `String`.                                                       |


---

## Decisions (RG6)


| #                            | Question     | Choice                                                                                  |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| 1 @                          | **Syntax**   | `@export` / `@export_group("Name")`, like `@test`. No `export` / `exportgroup` keywords |
| 2 not sure need more context | `**pub**`    | Module visibility: required inside `mod { }`. Inspector is `@export`.                   |
| 3 yes                        | **Storage**  | Per-entity overrides in scene JSON; `.rg` holds defaults only                           |
| 4 good                       | **v1 types** | `Int`, `Float`, `Bool`, `Str` / `String`. Hints (range, color, node path) later         |


---

## Decisions (RG7)


| #   | Question         | Choice                                                                                  |
| --- | ---------------- | --------------------------------------------------------------------------------------- |
| 1   | **Connect**      | Inspector (scene connections) is v1. `strata.connect` optional later                    |
| 2   | **Callables**    | Method **names**, not closures. `on_enter` stays overlaps; signals are decoupled events |
| 3   | **vs collision** | Do not replace `on_enter` / `on_exit`. Signals are for “told another node,” not AABB    |


---

## Decisions (RG9)


| #   | Question            | Choice                                                                                                       |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **Public modules**  | `option` / `result` / `math` / `str` (then `checks`) as crate `.rg`. `io` / `strata` / `input` stay host     |
| 2   | **Primitives**      | Trig, `pow`/`sqrt`, string search/case/trim stay Rust. `.rg` re-exports them and implements `clamp`/`lerp`/… |
| 3   | **Where they live** | Embedded in the crate; every resolver injects them. Not sibling files in the user’s project                  |
| 4   | **When**            | After RG8. WASM import already works; this is so you can read/edit stdlib as RoseGold                        |


---

## Decisions (RG10)


| #                          | Question            | Choice                                                                                         |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| 1 kinda v = new classname | **class vs struct** | `class` = fields + methods in one block. `struct` stays a data record. No `new` / `init` in v1 |
| 2 yes                      | **inheritance**     | Single `extends`. `super.method(args)` only. Share extra behavior with `trait`. **Shipped.** |
| 3 correct                  | **UFCS**            | Opt-in `@ufcs` on a `fn`. Inherent methods win. Not every free function. **Shipped.** |
| 4 yes                      | **docs**            | `##` attaches to the next item. Not `///` — `//` is integer division. **Shipped.** |
| 5 yes                      | **bitwise**         | `Int` only. `&&` / `\|\|` stay logical. `&` `\|` `^` `<<` `>>` `~`. **Shipped.** |


---

## How to use this doc

1. Language work through **RG10** is done (`##` docs / `@ufcs` / bitwise / `class` / `trait` / `extends` / `super`). Multiple inheritance stays out.
2. Do not skip ahead to closures or a query-language `find`. Name / nearest `strata.find` is done.
3. Track day-to-day interpreter status in [project-status.md](./project-status.md).
4. Keep engine/viewport/WASM-world work in [plan.md](./plan.md).
5. Language reference for what exists today: [crates/rosegold/README.md](../crates/rosegold/README.md).

