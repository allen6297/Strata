# rosegold

A small, interpreted scripting language used by the Strata engine for gameplay hooks and event scripting.

`rosegold` is a Rust crate with a hand-written lexer, recursive-descent parser, optional static type check, and tree-walking interpreter. The language is Python-like in feel with C-style braces, first-class maps and arrays, user-defined structs/enums, `impl` methods, modules, and a small standard library.

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
fn add(a: Int, b: Int): Int {
    return a + b;
}

fn main(): Int {
    var x: Int = 10;
    const y = 5;             // type optional
    print(add(x, y));
    return 0;
}
```

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
        Rect(dims) { print(dims[0]); print(dims[1]); }
    }
    return 0;
}
```

Missing struct fields default to `none`. Multi-argument enum payloads are bound as a single value (often an array) in `match` arms.

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
from strings import repeat;   // loads strings.rg next to the script

fn main(): Int {
    print(repeat("a", 3));
    return 0;
}
```

`import module;` binds a module value; `from module import Item;` brings a function or value into the current scope. Native stdlib modules (`str`, `math`, `checks`, `option`/`Option`, `result`/`Result`, `io`) are wired in-process and do not need `.rg` files.

### Type checking

Before evaluation, `run_source` / `run_file` run a lenient static pass (`typecheck`):

- Unknown function names
- Wrong call arity (when known)
- Basic return / var checks when annotations are present

Missing or `None` annotations are skipped so existing scripts keep working. Failures surface as `RunResult { ok: false, stderr: ... }` with a clear message.

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
```

## Standard library

| Module | Highlights |
| ------ | ---------- |
| `math` | `abs`, `abs_float`, `sign`, `min`, `max`, `clamp`, `clamp_float`, `pow`, `to_int`, … |
| `str` | `contains`, `starts_with`, `ends_with`, `length`, `is_empty`, `repeat`, `upper`, `lower`, `trim` |
| `checks` | Assertion helpers (`that`, `eq`, …) |
| `option` / `Option` | `Some`, `None`; methods `is_some`, `is_none`, `unwrap`, `unwrap_or` |
| `result` / `Result` | `Ok`, `Err`; methods `is_ok`, `is_err`, `unwrap`, `unwrap_or` |
| `io` | `read_text(path)`, `write_text(path, content)` |

Builtins (no import): `print`, `len`, `assert`, `Array(...)`, `Map(...)`.

Array methods: `len`, `push`, `pop`, `first`, `last`, `contains`.  
Map methods: `len`, `has`, `keys`, `remove`, `insert`.

## Strata integration

Scripts power Strata’s `on_ready` / `on_update` hooks. Emit engine commands by printing `strata:` directives:

```rg
import str;

fn on_ready(name: String, x: Float, y: Float): Int {
    print("[ready]");
    print("strata:play_sound name=jump.wav");
    return 0;
}

fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String): Int {
    if str.contains(keys, "ArrowRight") || str.contains(keys, "KeyD") {
        print("strata:move dx=3 dy=0");
    }
    if str.contains(keys, "Space") {
        print("strata:play_sound name=jump.wav");
    }
    return 0;
}
```

Common directives: `strata:move`, `strata:rot`, `strata:set`, `strata:spawn`, `strata:destroy`, `strata:play_sound`.

The desktop host runs the native interpreter (no Python). The engine script-host bridge can attach `.rg` sources to entities and apply stdout directives to the scene during play.

## Public API

| API | Role |
| --- | ---- |
| `run_source(src)` | Lex → parse → typecheck → eval (`main` if present) |
| `run_file(path)` | Same, with file-based module resolution |
| `run_source_with_modules(src, map)` | In-memory module map for tests / embeds |
| `typecheck(program)` | Static check only |
| `EvalContext::load_program` | Register decls / top-level without calling `main` |
| `EvalContext::call` / `has_fn` | Invoke hooks like `on_ready` / `on_update` |
| `ModuleResolver` / `HashMapResolver` / `FileModuleResolver` | Pluggable imports |

## Crate layout

- `src/lexer.rs` — tokens
- `src/parser.rs` — AST (`Item`, `Expr`, `Stmt`, structs/enums/`impl`)
- `src/typecheck.rs` — lenient static checks
- `src/interpreter.rs` — `EvalContext`, `Value`, modules, stdlib, hooks (`load_program` / `call`)
- `src/lib.rs` — public runners and unit tests

## Tests

```bash
cargo test -p rosegold
cargo test -p strata-engine
```
