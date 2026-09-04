# rosegold

A small, interpreted scripting language used by the Strata engine for gameplay hooks and event scripting.

`rosegold` is a Rust crate with a hand-written lexer, recursive-descent parser, optional static type check, and tree-walking interpreter. The language is Python-like in feel with C-style braces, first-class maps and arrays, user-defined structs/classes/enums, `impl` / `trait`, opt-in `@ufcs`, bitwise operators on `Int`, modules, and a small standard library.

## Quick start

```rust
use rosegold::run_source;

let result = run_source(r#"
fn main(): Int {
    print("hello, rosegold!");
    return 0;
}
"#);

assert!(result.ok);
assert_eq!(result.stdout, "hello, rosegold!\n");
```

## Running a file

```rust
use std::path::Path;
use rosegold::run_file;

let result = run_file(Path::new("game/main.rg"));
```

CLI (from the workspace root):

```bash
cargo run -p rosegold -- check examples/demo-project/scripts/Hero.rg
cargo run -p rosegold -- run examples/class_trait.rg
cargo run -p rosegold -- run path/to/script.rg
cargo run -p rosegold -- test path/to/script.rg
cargo run -p rosegold -- fmt path/to/script.rg
cargo run -p rosegold -- check --json path/to/script.rg
```

`check` prints `file:line:col: error: …` (or JSON with `--json`) and exits `1` if there are findings.

`fmt` reprints the AST to stdout (`--write` updates the file; `--check` exits `1` if it would change). `#` line comments and `##` docs are kept.

Files are loaded relative to the script’s directory. `import` resolves sibling `.rg` files (or `name/main.rg`).

For tests or embedded hosts, supply modules in memory:

```rust
use std::collections::HashMap;
use rosegold::run_source_with_modules;

let mut modules = HashMap::new();
modules.insert("calc".into(), "fn add(a: Int, b: Int): Int { return a + b; }".into());
let result = run_source_with_modules("import calc;\nfn main(): Int { print(calc.add(1, 2)); return 0; }", modules);
```

## Language features

### Functions and variables

```rg
fn add(a: Int, b: Int) -> Int {
    return a + b;
}

fn main(): Int {
    var x: Int = 10;
    const y = 5;             // type optional
    print(add(x, y));
    return 0;
}
```

Return types use `:` or `->` (`fn add(a: Int, b: Int): Int` is the same as `-> Int`).

Inspector-visible vars use `@export` (not `pub`). `@export_group` is sticky until the next group:

```rg
@export_group("Movement")
@export var speed: Float = 120.0;
var frames: Int = 0;   // hidden
```

Signals are fired with `.emit`. Connections are Inspector data, not closures. Declare them at module scope, or on a trait so every implementing class gets the signal:

```rg
signal collected(amount: Int);
collected.emit(1);

trait Damageable {
    signal died();
    fn take_damage(damage: Float): Float;
}

class Player impl Damageable {
    fn take_damage(damage: Float): Float {
        died.emit();
        return 0.0;
    }
}
```

### Comments

`#` is a line comment (rest of that line). The compiler ignores it; `fmt` keeps it at file, function, class, trait, struct, impl, and enum scope. Hover does not use `#`.

`##` is a documentation comment: consecutive `##` lines join with newlines and attach to the **next** item (`fn`, `var`, `@export var`, `signal`, …). Hover and Inspector tooltips use that text.

Do **not** use `///` — `//` is integer division.

```rg
# ordinary note; fmt reprints this
## Degrees per second. Shown on the Coin Inspector card.
@export var spin: Float = 8.0;
```

### UFCS

`@ufcs` on a free `fn` lets you call it as a method. The receiver is the first parameter. Inherent methods (`impl`, Array/String/Map helpers) win if the name matches.

```rg
import math;

@ufcs
fn clamp(n: Float, lo: Float, hi: Float): Float {
    return math.clamp(n, lo, hi);
}

fn main(): Int {
    print(400.0.clamp(0.0, 200.0));
    return 0;
}
```

### Bitwise operators

Integers only (`&&` / `||` stay logical and short-circuit). Float at either side is a type error.

```rg
fn layer_bit(n: Int): Int {
    return 1 << n;
}

fn main(): Int {
    var mask = layer_bit(0) | layer_bit(2);
    print(1 << 3);
    print(mask & layer_bit(2));
    print(mask ^ 255);
    print(~0);
    return 0;
}
```

`&` `|` `^` `<<` `>>` `~`, plus `&=` `|=` `^=`.

### Control flow

```rg
if x == 1 {
    print("one");
} elif x == 2 {
    print("two");
} else {
    print("other");
}

while x > 0 {
    x = x - 1;
}

for i in 0..5 {   // half-open
    print(i);
}

for j in 1..=3 {  // inclusive
    print(j);
}
```

### Collections

```rg
var a = [1, 2, 3];
a.push(4);
print(a[0]);
print(a.len());
print(a.first());
print(a.last());
print(a.contains(2));

var m: Map<String, Int> = {"alice": 10, "bob": 7};
m["carol"] = 5;
print(m.has("alice"));
print(m.keys());
print(m.remove("bob"));
```

Arrays and maps use shared mutability: assigning `var b = a` shares the same storage, so `b.push(...)` mutates `a` as well.

### Strings and interpolation

```rg
const name = "world";
print(f"hello, {name}!");

const pi: Float = 3.14159;
print(f"pi ≈ {pi:.2f}");

print(str.upper("hi"));
print(str.lower("HI"));
print(str.trim("  yo  "));
print(str.split("a,b", ",")[0]);
print(str.slice("rosegold", 4, 8));
print("é".len);   # 1 — character count, same as `"é"[0]`
```

### Structs, enums, and methods

```rg
struct Point {
    x: Float,
    y: Float,
}

impl Point {
    fn length(self): Float {
        return self.x;   // illustrative
    }
}

enum Color {
    Red,
    Green,
    Blue,
}

enum Shape {
    Circle(Float),
    Rect(Float, Float),
}

fn main(): Int {
    var p = Point { x: 1.5, y: 2.5 };
    print(p.x);
    print(p.length());

    var c = Color.Red;
    match c {
        Red { print("red"); }
        Green { print("green"); }
        Blue { print("blue"); }
    }

    var s = Shape.Circle(5.0);
    match s {
        Circle(r) { print(r); }
        Rect(w, h) { print(w); print(h); }
    }
    return 0;
}
```

Missing struct fields default to `none`. Multi-argument enum payloads unpack in `match` (`Rect(w, h)`). A single bind still gets the whole payload (`Rect(dims)` is an array). Named binds work when the enum declares names: `Circle(radius: r)`.

### Classes and traits

`class` is a struct with fields and methods in one block. Field defaults apply when a field is omitted. `class Child extends Parent` copies the parent's fields and methods; the child may override a method and call `super.method(args)`. Inside a method, `self` is the instance: you can write `self.x` or just `x` for a field, and `self.hurt(d)` or just `hurt(d)` for a method. Methods may omit the `self` parameter (`fn hurt(dmg: Float)` is the same as `fn hurt(self, dmg: Float)`). `trait` is method signatures plus optional `signal` contracts — no vars or consts. Types opt in with `class Foo impl Named, Drawable` (methods live in the class body), nested `impl Trait { … }`, or `impl Trait for Type`. Implementing a trait with `signal died()` gives the class that signal for Inspector wiring and `died.emit()`. No multiple inheritance, no `private`.

```rg
import math;

trait HasLength {
    fn length(self): Float;
}

class Vec2 impl HasLength {
    var x: Float = 0.0;
    var y: Float = 0.0;

    fn length(self): Float {
        return math.sqrt(self.x * self.x + self.y * self.y);
    }
}

class Vec3 extends Vec2 impl HasLength {
    var z: Float = 0.0;
    fn length(self): Float {
        return super.length();
    }
}
```

`impl HasLength for Vec2 { … }` at module scope still works. Nested `impl HasLength { … }` in the class body still works. Trait methods are callable on the instance (`v.length()`).

A crate `Vec2` / `Vec3` (same shape) is always available from `stdlib/vec.rg`.

`@node class MyNode extends Sprite` marks a scene node. Import the base first (`import strata.Sprite;` or `import strata.Node;`). Bases (`Node`, `Empty`, `Sprite`, `Tilemap`, `Camera`, `Mesh`, `Light`) live in `stdlib/node.rg` (`name`, `x`, `y`, `z`, plus empty `on_create` / `on_update` / `on_destroy` / `on_enter` / `on_exit`). Play constructs the class and calls those methods. `@export var` / `@export_group` on class fields show in the Inspector (same as module-level `@export var`). Free-function `on_ready` / `on_update` scripts still work. One `@node` class per file.

```rg
class Enemy {
    var hp: Float = 10.0;
    fn hurt(self, dmg: Float): Float {
        self.hp = self.hp - dmg;
        return self.hp;
    }
}

class Slime extends Enemy {
    fn hurt(self, dmg: Float): Float {
        return super.hurt(dmg * 0.5);
    }
}
```

Instance fields have no `private`. Module `pub` is required inside `mod { }` to export a name. Inspector-visible vars stay `@export`.

Built-in sum types `Option` and `Result` work the same way:

```rg
fn main(): Int {
    const maybe = Option.Some(42);
    print(maybe.unwrap_or(0));
    match maybe {
        Some(v) { print(v); }
        None { print("none"); }
    }

    const ok = Result.Ok(10);
    print(ok.is_ok());
    return 0;
}
```

### Modules

```rg
import math;
import str;
import io;

fn main(): Int {
    print(math.clamp(5, 0, 3));
    print(str.contains("hello", "ell"));
    return 0;
}
```

```rg
from strings import repeat;   // loads strings.rg next to the script (legacy: file stem is the module)

fn main(): Int {
    print(repeat("a", 3));
    return 0;
}
```

```rg
# helpers.rg — the module name is the `mod` block, not the file name
mod utils {
    pub fn add(a: Int, b: Int): Int {
        return a + b;
    }
}
```

`import module;` binds a module value; `from module import Item;` brings a function or value into the current scope. A `mod name { ... }` block is the public namespace: `import utils` finds every `mod utils` in the project and **merges** them. Two files can each declare `mod utils { }` with different functions. The same export name in two blocks is an error. Files with only top-level `fn`s still work as a filename module. Public stdlib (`math`, `str`, `checks`, `option`/`Option`, `result`/`Result`) is crate-embedded `.rg` (`crates/rosegold/stdlib/`); every resolver injects it, so projects do not vendor copies. Trig and string search go through `__math` / `__str`. Host modules (`io`, `strata`, `input`) stay native. `check` / `check_file` resolve sibling user modules the same way Play does. Functions inside an imported module can call each other by name. `rosegold test` / `run_tests_file` use the same sibling resolver.

The `pub` keyword is required to export an item from a `mod { }` block. Filename modules (top-level `fn`s with no `mod`) still export everything. Inspector-visible vars stay `@export`, not `pub`.

### Type checking

Before evaluation, `run_source` / `run_file` run a lenient static pass (`typecheck`):

- Unknown function names and undefined identifiers
- Wrong call arity for free functions, crate `.rg` stdlib (`math.clamp`, …), host `io.*` / `time.*` / `ui.*` / `strata.*` / `input.*`, and instance/`impl` methods (`v.length(1)`, `Array.push()`, crate `Vec2`)
- Unknown methods on known types (`Point` / `Vec2` / `Array` / `Int`, …), and method calls on values with no inferred type (`foo.bar()`)
- `impl Trait for Type` missing methods, and arity / return mismatches vs the trait
- `import m` / `from m import foo` so `m.fn` and imported names get arity when the module is resolvable
- Unknown struct / class literal fields (`Point { yy: 1.0 }`); omitted known fields still default to `none`

Missing or `None` annotations are skipped so existing scripts keep working. `Str` is accepted as an alias for `String`. Failures surface as `RunResult { ok: false, stderr: ... }` with a clear message.

```rust
use rosegold::{run_source, typecheck, Lexer, Parser};

let tokens = Lexer::new(src).tokenize().unwrap();
let program = Parser::new(tokens).parse().unwrap();
typecheck(&program)?; // Result<(), String>
```

### Runtime errors

Errors include source location:

```text
runtime error at 7:11: undefined variable 'foo'
runtime error at 3:12: division by zero
```

`n // 0` and `% 0` are runtime errors (not a VM panic). `&&` / `||` do not evaluate the right side when the left already decides the result.

## Standard library

| Module | Highlights |
| ------ | ---------- |
| `math` | `abs`, `abs_float`, `sign`, `min`, `max`, `clamp`, `clamp_float`, `pow`, `gcd`, `to_int`, `to_float`, `sqrt`, `sin`, `cos`, `atan2`, `lerp`, `lerp_float`, `move_toward` |
| `str` | `contains`, `starts_with`, `ends_with`, `length`, `is_empty`, `repeat`, `upper`, `lower`, `trim`, `split`, `slice` |
| `checks` | Assertion helpers (`that`, `eq`, …) |
| `option` / `Option` | `Some`, `None`; methods `is_some`, `is_none`, `unwrap`, `unwrap_or`. `None` is falsy in `if` |
| `result` / `Result` | `Ok`, `Err`; methods `is_ok`, `is_err`, `unwrap`, `unwrap_or`. `Err` is falsy in `if`; unit enums like `Color.Red` are truthy |
| `vec` / `Vec2` / `Vec3` | `class Vec2` / `class Vec3 extends Vec2` with `length` / `add` (always in scope, like `Option`) |
| `node` | `Node` / `Empty` / `Sprite` / … — `import strata.Sprite;` then `@node class Foo extends Sprite` |
| `io` | `read_text(path)`, `read_lines(path)`, `write_text(path, content)`, `append_text(path, content)`, `remove(path)`, `exists(path)`, `mkdir(path)`, `list_dir(path)`, `is_dir(path)` — file/dir ops except `exists` / `is_dir` return `Result` |
| `time` | `now()` Unix seconds as `Float`; `elapsed()` seconds since this VM started. Not frame `dt` |
| `input` | `pressed(code)`, `held(code)` — KeyboardEvent codes (`"Space"`, `"KeyQ"`, `"ArrowRight"`, …) |
| `strata` | `move(dx, dy)`, `rot(deg)`, `set(x, y)`, `spawn(name | {…})`, `destroy(name)`, `play_sound(name)`, `after(delay, method)`, `find(name?)` |

Builtins (no import): `print`, `len`, `assert`, `Array(...)`, `Map(...)`.
Prelude types (no import): `Option`, `Result`, `Vec2`, `Vec3`.

Host and crate modules **must be imported** (`import math;`, `import strata;`, `import input;`, `import time;`, `import str;`). Node bases: `import strata.Sprite;` (or `Node`, `Empty`, …).

Array methods: `len`, `push`, `pop`, `first`, `last`, `contains`.  
Map methods: `len`, `has`, `keys`, `remove`, `insert`.

## Strata integration

Scripts power Strata’s `on_ready` / `on_update` hooks (free functions), or `@node class` methods (`on_create` / `on_update(self, dt)` / `on_destroy`). Request world changes with the `strata` module (effects, not stdout), or assign `self.x` / `self.y` / `self.z`:

```rg
import strata;
import input;

fn on_ready(name: String, x: Float, y: Float): Int {
    print("[ready]");
    strata.play_sound("jump.wav");
    return 0;
}

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    if input.held("ArrowRight") || input.held("KeyD") {
        strata.move(3.0, 0.0);
    }
    if input.pressed("Space") {
        strata.play_sound("jump.wav");
    }
    return 0;
}
```

| Call | Effect |
| ---- | ------ |
| `strata.move(dx, dy)` | Nudge the calling entity |
| `strata.rot(degrees)` | Add rotation |
| `strata.set(x, y)` | Set position |
| `strata.spawn("Orb")` | Clone a scene prefab at the caller plus the prefab's x/y offset |
| `strata.spawn({ "prefab": "Orb", "x": 80.0, "y": -20.0 })` | Clone a prefab at world coords (`x`/`y` optional; omit to use caller + offset) |
| `strata.spawn({ "name", "x", "y", … })` | Create an entity (`kind`, `w`/`h`, `color`, `script` optional) |
| `strata.destroy(name)` | Remove an entity by name |
| `strata.destroy()` | Remove this entity |
| `strata.play_sound(name)` | Play an audio asset |
| `strata.after(delay, method)` | Call `method` on this entity once after `delay` seconds |
| `strata.find(name)` | Return that scene name if an entity exists, else `none` |
| `strata.find()` | Name of the nearest other entity, or `none` |

Call `ui.text` every `on_update` — the HUD is rebuilt each frame (not world space):

```rg
import ui;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    ui.text(16.0, 16.0, "coins 0");
    return 0;
}
```

| Call | Effect |
| ---- | ------ |
| `ui.text(x, y, text)` | Draw `text` this frame at viewport pixels (top-left origin) |

`print("strata:move dx=…")` still works for older scripts. The desktop host and browser WASM play session both run the native interpreter. The engine applies `HostEffect`s (and leftover stdout directives) during play. `on_destroy` runs once when the entity is removed. `input.pressed` / `input.held` read this tick’s keyboard (CSV `keys` / `pressed` hook args still work).

## Public API

| API | Role |
| --- | ---- |
| `run_source(src)` | Lex → parse → typecheck → eval (`main` if present) |
| `compile_source(src)` | Lex → parse → typecheck only (cache this across ticks) |
| `check_source_with_modules(src, file, map)` | Typecheck with in-memory imports |
| `def_at` / `hover_at` | Symbol at `line:col`. `import utils` / `from utils import move_line` jump to that file; `utils.move_line` to the fn. Stdlib *uses* (`math.sin`) stay `None` so editors use `catalog.json`. |
| `list_exports` | `@export var` metadata (name, type, group, default literal, optional `##` doc) — no eval |
| `list_nodes` | `@node class` metadata (name, parent, kind, optional `##` doc) for Add Node |
| `list_signals` / `list_fns` | `signal` metadata (module-scope, local traits, and imported traits on `impl` types) and free/`class`/`impl` `fn`s for Inspector connections |
| `run_file(path)` | Same, with file-based module resolution |
| `run_source_with_modules(src, map)` | In-memory module map for tests / embeds |
| `typecheck(program)` | Static check only |
| `EvalContext::load_program` | Register decls / top-level without calling `main` (constructs `@node` instance) |
| `EvalContext::call` / `has_fn` | Invoke free-fn hooks like `on_ready` / `on_update` |
| `EvalContext::call_hook` / `has_hook` | Method hooks on the `@node` instance (`on_create` maps from `on_ready`) |
| `ModuleResolver` / `HashMapResolver` / `FileModuleResolver` | Pluggable imports |

## Crate layout

- `src/lexer.rs` — tokens
- `src/parser.rs` — AST (`Item`, `Expr`, `Stmt`, structs/classes/enums/`impl`/`trait`)
- `src/typecheck.rs` — lenient static checks (host arity, `.rg` stdlib, instance methods)
- `src/stdlib.rs` — crate-embedded `stdlib/*.rg` injection
- `stdlib/` — public `math` / `str` / `option` / `result` / `checks` / `vec` / `node` as RoseGold
- `src/interpreter.rs` — `EvalContext`, `Value`, modules, host primitives (`__math` / `__str` / `io` / `time` / `strata` / `input`), hooks (`load_program` / `call`)
- `src/host.rs` — `HostEffect` (structured engine requests)
- `src/navigate.rs` — `def_at` / `hover_at` (in-app jump/hover)
- `src/export.rs` — `list_exports` / `list_nodes` metadata for the Inspector and Add Node
- `src/signal.rs` — `list_signals` / `list_fns` for Inspector connections
- `src/lib.rs` — public runners and unit tests
- `src/main.rs` — CLI (`run` / `test` / `check` / `hover` / `def`)

## Tests

```bash
cargo test -p rosegold
cargo test -p strata-engine
```
