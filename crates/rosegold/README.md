# rosegold

A small, interpreted scripting language used by the Strata engine for gameplay hooks and event scripting.

`rosegold` is a Rust crate that provides a lexer, parser, and tree-walking interpreter for a simple language with C-style syntax, first-class maps and arrays, algebraic enums, and a minimal standard library.

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

Files are loaded relative to the script's directory, and `import` will resolve sibling `.rg` files.

## Language features

### Functions and variables

```rg
fn add(a: Int, b: Int): Int {
    return a + b;
}

fn main(): Int {
    var x: Int = 10;
    const y = 5;             // inferred type
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

for i in 0..5 {   // half-open range
    print(i);
}

for j in 1..=3 {  // inclusive range
    print(j);
}
```

### Collections

```rg
var a = [1, 2, 3];
a.push(4);
print(a[0]);
print(a.len());

var m: Map<String, Int> = {"alice": 10, "bob": 7};
m["carol"] = 5;
print(m["alice"]);
print(m.len());
print(m.has("dave"));
```

### Strings and interpolation

```rg
const name = "world";
print(f"hello, {name}!");

const pi: Float = 3.14159;
print(f"pi ≈ {pi:.2f}");
```

### Enums and pattern matching

```rg
from option import Option;

fn main(): Int {
    const maybe: Option<Int> = Option.Some(42);

    match maybe {
        Some(v) { print(v); }
        None    { print("none"); }
    }

    print(maybe.unwrap_or(0));
    return 0;
}
```

### Modules

```rg
import math;
import str;
from option import Option;

fn main(): Int {
    print(math.clamp(5, 0, 3));
    print(str.contains("hello", "ell"));
    return 0;
}
```

`import` loads a module by name; `from ... import ...` brings specific names into scope. Modules can be supplied in memory or loaded from `.rg` files next to the running script.

## Standard library modules

| Module | Description |
| ------ | ----------- |
| `math` | `abs`, `clamp`, `pow`, `sign`, `min`, `max`, `to_int`, etc. |
| `str`  | String helpers such as `contains`. |
| `checks` | Assertion helpers: `that`, `eq`, `eq_string`. |
| `option` | `Option<T>` enum with `Some`, `None`, and `unwrap_or`. |
| `result` | `Result<T, E>` enum with `Ok`, `Err`, `is_err`, etc. |

## Strata integration

`rosegold` is designed to power Strata's scripting hooks. Scripts can emit engine commands by printing specially formatted strings, for example:

```rg
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

The engine calls these hook functions and interprets the stdout stream as game actions.

## Crate layout

- `src/lexer.rs` — tokenizes source code into `Token`s.
- `src/parser.rs` — builds an AST from tokens.
- `src/interpreter.rs` — evaluates the AST with an `EvalContext`, a `ModuleResolver`, and a `Value` runtime model.
- `src/lib.rs` — convenience helpers like `run_source`, `run_file`, and `run_source_with_modules`.
