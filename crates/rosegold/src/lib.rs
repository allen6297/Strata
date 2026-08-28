pub mod interpreter;
pub mod lexer;
pub mod parser;

use std::collections::HashMap;
use std::path::Path;
use std::rc::Rc;
use std::cell::RefCell;

pub use interpreter::{EvalContext, FileModuleResolver, HashMapResolver, Module, ModuleResolver, Value};
pub use lexer::{Lexer, Token, TokenKind};
pub use parser::{Block, Expr, FnDecl, Item, Literal, Parser, Stmt, Type};

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Span {
  pub line: u32,
  pub col: u32,
}

impl std::fmt::Display for Span {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}:{}", self.line, self.col)
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeError {
  pub message: String,
  pub span: Span,
}

impl std::fmt::Display for RuntimeError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "runtime error at {}: {}", self.span, self.message)
  }
}

pub struct RunResult {
  pub ok: bool,
  pub stdout: String,
  pub stderr: String,
  pub message: String,
}

fn run_with_context(source: &str, ctx: &mut EvalContext) -> RunResult {
  let mut lexer = Lexer::new(source);
  let tokens = match lexer.tokenize() {
    Ok(tokens) => tokens,
    Err(e) => {
      return RunResult {
        ok: false,
        stdout: String::new(),
        stderr: e.clone(),
        message: e,
      }
    }
  };
  let mut parser = Parser::new(tokens);
  let program = match parser.parse() {
    Ok(program) => program,
    Err(e) => {
      return RunResult {
        ok: false,
        stdout: String::new(),
        stderr: e.clone(),
        message: e,
      }
    }
  };
  match ctx.run(&program) {
    Ok(_) => RunResult {
      ok: true,
      stdout: ctx.stdout.clone(),
      stderr: String::new(),
      message: "RoseGold finished".to_string(),
    },
    Err(e) => {
      let msg = e.to_string();
      RunResult {
        ok: false,
        stdout: ctx.stdout.clone(),
        stderr: msg.clone(),
        message: msg,
      }
    }
  }
}

pub fn run_source(source: &str) -> RunResult {
  let mut ctx = EvalContext::new();
  run_with_context(source, &mut ctx)
}

pub fn run_source_with_modules(source: &str, modules: HashMap<String, String>) -> RunResult {
  let resolver = Rc::new(RefCell::new(HashMapResolver::new(modules)));
  let mut ctx = EvalContext::with_resolver(resolver);
  run_with_context(source, &mut ctx)
}

pub fn run_file(path: &Path) -> RunResult {
  let source = match std::fs::read_to_string(path) {
    Ok(s) => s,
    Err(e) => {
      let msg = format!("failed to read file: {}", e);
      return RunResult {
        ok: false,
        stdout: String::new(),
        stderr: msg.clone(),
        message: msg,
      }
    }
  };
  let base = path.parent().unwrap_or(Path::new("."));
  let resolver = Rc::new(RefCell::new(FileModuleResolver::new(base)));
  let mut ctx = EvalContext::with_resolver(resolver);
  run_with_context(&source, &mut ctx)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn assert_ok(source: &str) -> String {
    let result = run_source(source);
    assert!(result.ok, "{}\nstderr: {}", result.message, result.stderr);
    result.stdout
  }

  #[test]
  fn hello_main() {
    let out = assert_ok(r#"fn main(): Int { print("hello"); return 0; }"#);
    assert_eq!(out, "hello\n");
  }

  #[test]
  fn on_ready_hook() {
    let out = assert_ok(
      r#"
fn on_ready(name: String, x: Float, y: Float): Int {
    print("[ready]");
    print("strata:play_sound name=jump.wav");
    return 0;
}
fn main(): Int {
    return on_ready("Player", 0.0, 0.0);
}
"#,
    );
    assert!(out.contains("[ready]"));
    assert!(out.contains("strata:play_sound name=jump.wav"));
  }

  #[test]
  fn on_update_keys() {
    let out = assert_ok(
      r#"
import str;

fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String): Int {
    if str.contains(keys, "ArrowRight") || str.contains(keys, "KeyD") {
        print("strata:move dx=3 dy=0");
    }
    if str.contains(keys, "ArrowLeft") || str.contains(keys, "KeyA") {
        print("strata:move dx=-3 dy=0");
    }
    if str.contains(keys, "Space") {
        print("strata:play_sound name=jump.wav");
    }
    return 0;
}

fn main(): Int {
    return on_update("Player", 0.0, 0.0, 0.016, "ArrowRight,Space");
}
"#,
    );
    assert!(out.contains("strata:move dx=3 dy=0"));
    assert!(out.contains("strata:play_sound name=jump.wav"));
  }

  #[test]
  fn arithmetic_and_loops() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var i: Int = 0;
    var sum: Int = 0;
    while i < 5 {
        sum = sum + i;
        i = i + 1;
    }
    print(sum);
    return 0;
}
"#,
    );
    assert_eq!(out, "10\n");
  }

  #[test]
  fn fstring_interpolation() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var x: Int = 7;
    print(f"x = {x}, double = {x + x}");
    return 0;
}
"#,
    );
    assert_eq!(out, "x = 7, double = 14\n");
  }

  #[test]
  fn range_for_loops() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var sum: Int = 0;
    for i in 0..5 {
        sum = sum + i;
    }
    print(sum);
    var prod: Int = 1;
    for j in 1..=3 {
        prod = prod * j;
    }
    print(prod);
    return 0;
}
"#,
    );
    assert!(out.contains("10"));
    assert!(out.contains("6"));
  }

  #[test]
  fn math_stdlib() {
    let out = assert_ok(
      r#"
import math;

fn main(): Int {
    print(math.clamp(5, 0, 3));
    print(math.pow(2, 10));
    print(math.abs(-7));
    print(math.sign(-42));
    print(math.min(3, 8));
    print(math.max(3, 8));
    print(math.to_int(3.14));
    return 0;
}
"#,
    );
    assert!(out.contains("3"));
    assert!(out.contains("1024"));
    assert!(out.contains("7"));
    assert!(out.contains("-1"));
    assert!(out.contains("3"));
    assert!(out.contains("8"));
    assert!(out.contains("3"));
  }

  #[test]
  fn checks_stdlib() {
    let out = assert_ok(
      r#"
import checks;

fn main(): Int {
    checks.that(true);
    checks.eq(2 + 2, 4);
    checks.eq_string("hi", "hi");
    return 0;
}
"#,
    );
    assert_eq!(out, "");
  }

  #[test]
  fn elif_branch() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var x: Int = 2;
    if x == 1 {
        print("one");
    } elif x == 2 {
        print("two");
    } else {
        print("other");
    }
    return 0;
}
"#,
    );
    assert_eq!(out, "two\n");
  }

  #[test]
  fn map_literals_and_methods() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var scores: Map<String, Int> = {"ada": 10, "grace": 12};
    scores["linus"] = 9;
    print(scores.len());
    print(scores.has("ada"));
    print(scores.has("missing"));
    print(scores["grace"]);
    var keys = scores.keys();
    print(keys.len());
    print(scores.remove("ada"));
    print(scores.has("ada"));
    return 0;
}
"#,
    );
    assert!(out.contains("3"));
    assert!(out.contains("true"));
    assert!(out.contains("false"));
    assert!(out.contains("12"));
    assert!(out.contains("10"));
    assert!(out.contains("false"));
  }

  #[test]
  fn match_simple() {
    let out = assert_ok(
      r#"
from option import Option;

fn main(): Int {
    const x = Option.Some(1);
    match x {
        Some(v) { print(v); }
        None { print("none"); }
    }
    return 0;
}
"#,
    );
    assert!(out.contains("1"));
  }

  #[test]
  fn enum_option_and_match() {
    let out = assert_ok(
      r#"
from option import Option;

fn main(): Int {
    const maybe: Option<Int> = Option.Some(42);
    print(maybe.unwrap_or(0));
    print(Option.None.unwrap_or(7));
    match maybe {
        Some(v) { print(v); }
        None { print("none"); }
    }
    return 0;
}
"#,
    );
    assert!(out.contains("42"));
    assert!(out.contains("7"));
  }

  #[test]
  fn enum_result_and_match() {
    let out = assert_ok(
      r#"
from result import Result;

fn lookup(m: Map<String, Int>, key: String): Result<Int, String> {
    if m.has(key) {
        return Result.Ok(m[key]);
    }
    return Result.Err("missing key");
}

fn main(): Int {
    var scores: Map<String, Int> = {"alice": 10, "bob": 7};
    const found = lookup(scores, "alice");
    match found {
        Ok(v) { print(v); }
        Err(_) { print("not found"); }
    }
    const missing = lookup(scores, "zed");
    if missing.is_err() {
        print("err");
    }
    return 0;
}
"#,
    );
    assert!(out.contains("10"));
    assert!(out.contains("err"));
  }

  #[test]
  fn fstring_format_spec() {
    let out = assert_ok(
      r#"
fn main(): Int {
    const pi: Float = 3.14159;
    print(f"pi≈{pi:.2f}");
    return 0;
}
"#,
    );
    assert!(out.contains("pi≈3.14"));
  }

  #[test]
  fn runtime_error_includes_span() {
    let result = run_source(
      r#"
fn main(): Int {
    var x: Int = 5;
    print(x + "hello");
    return 0;
}
"#,
    );
    assert!(!result.ok);
    assert!(result.stderr.contains("runtime error at"), "stderr: {}", result.stderr);
    assert!(result.stderr.contains("cannot add"), "stderr: {}", result.stderr);
  }

  #[test]
  fn array_mutation_and_shared_references() {
    let out = assert_ok(
      r#"
fn main(): Int {
    var a = [1, 2, 3];
    a.push(4);
    print(a.len());
    print(a[3]);
    a[0] = 42;
    print(a[0]);
    var b = a;
    b.push(5);
    print(a.len());
    print(b.pop());
    print(a.len());
    print(b[b.len() - 1]);
    return 0;
}
"#,
    );
    assert!(out.contains("4"));
    assert!(out.contains("4")); // a[3]
    assert!(out.contains("42"));
    assert!(out.contains("5")); // a.len after b.push
    assert!(out.contains("5")); // b.pop()
    assert!(out.contains("4")); // a.len after b.pop
    assert!(out.contains("4")); // b[b.len() - 1]
  }

  #[test]
  fn import_module_in_memory() {
    let mut modules = HashMap::new();
    modules.insert(
      "calc".to_string(),
      r#"
fn add(a: Int, b: Int): Int {
    return a + b;
}

fn double(n: Int): Int {
    return n * 2;
}
"#
      .to_string(),
    );
    let result = run_source_with_modules(
      r#"
import calc;
fn main(): Int {
    print(calc.add(2, 3));
    print(calc.double(4));
    return 0;
}
"#,
      modules,
    );
    assert!(result.ok, "{}", result.stderr);
    assert!(result.stdout.contains("5"));
    assert!(result.stdout.contains("8"));
  }

  #[test]
  fn from_module_import_function() {
    let mut modules = HashMap::new();
    modules.insert(
      "strings".to_string(),
      r#"
fn repeat(s: String, n: Int): String {
    var out: String = "";
    var i: Int = 0;
    while i < n {
        out = out + s;
        i = i + 1;
    }
    return out;
}
"#
      .to_string(),
    );
    let result = run_source_with_modules(
      r#"
from strings import repeat;
fn main(): Int {
    print(repeat("a", 3));
    return 0;
}
"#,
      modules,
    );
    assert!(result.ok, "{}", result.stderr);
    assert!(result.stdout.contains("aaa"));
  }

  #[test]
  fn import_module_from_file() {
    use std::fs;
    let dir = std::env::temp_dir().join("rosegold_module_test");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("greet.rg"),
      r#"
fn greet(name: String): String {
    return f"hello {name}";
}
"#,
    )
    .unwrap();
    fs::write(
      dir.join("main.rg"),
      r#"
import greet;
fn main(): Int {
    print(greet.greet("world"));
    return 0;
}
"#,
    )
    .unwrap();
    let result = run_file(&dir.join("main.rg"));
    assert!(result.ok, "{}", result.stderr);
    assert!(result.stdout.contains("hello world"));
  }
}
