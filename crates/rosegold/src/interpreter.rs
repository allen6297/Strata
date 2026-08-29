use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;

use crate::parser::*;
use crate::{RuntimeError, Span};

type ArrayRef = Rc<RefCell<Vec<Value>>>;
type MapRef = Rc<RefCell<HashMap<String, Value>>>;
type ModuleRef = Rc<RefCell<Module>>;
type StructDefRef = Rc<StructDef>;
type EnumDefRef = Rc<EnumDef>;

pub trait ModuleResolver {
  fn resolve(&self, name: &str) -> Option<String>;
}

pub struct HashMapResolver {
  sources: HashMap<String, String>,
}

impl HashMapResolver {
  pub fn new(sources: HashMap<String, String>) -> Self {
    Self { sources }
  }
}

impl ModuleResolver for HashMapResolver {
  fn resolve(&self, name: &str) -> Option<String> {
    self.sources.get(name).cloned()
  }
}

pub struct FileModuleResolver {
  base: PathBuf,
}

impl FileModuleResolver {
  pub fn new(base: impl AsRef<Path>) -> Self {
    Self { base: base.as_ref().to_path_buf() }
  }
}

impl ModuleResolver for FileModuleResolver {
  fn resolve(&self, name: &str) -> Option<String> {
    let dotted = name.replace('.', std::path::MAIN_SEPARATOR_STR);
    let candidates = [
      self.base.join(format!("{}.rg", name)),
      self.base.join(format!("{}.rg", dotted)),
      self.base.join(&dotted).join("lib.rg"),
      self.base.join(&dotted).join("main.rg"),
      self.base.join(name).join("lib.rg"),
      self.base.join(name).join("main.rg"),
    ];
    for path in &candidates {
      if path.exists() {
        return std::fs::read_to_string(path).ok();
      }
    }
    None
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Module {
  pub functions: HashMap<String, FnDecl>,
  pub values: HashMap<String, Value>,
  pub native: Option<String>,
}

impl Module {
  pub fn new() -> Self {
    Self { functions: HashMap::new(), values: HashMap::new(), native: None }
  }

  pub fn native(module: impl Into<String>) -> Self {
    Self { functions: HashMap::new(), values: HashMap::new(), native: Some(module.into()) }
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructDef {
  pub name: String,
  pub fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumDef {
  pub name: String,
  pub variants: HashMap<String, EnumVariantDef>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumVariantDef {
  pub arity: usize,
}

fn runtime_err(message: impl Into<String>, span: Span) -> RuntimeError {
  RuntimeError { message: message.into(), span }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
  Int(i64),
  Float(f64),
  String(String),
  Bool(bool),
  Void,
  None,
  Array(ArrayRef),
  Map(MapRef),
  Range(i64, i64, bool),
  Enum { module: String, variant: String, value: Option<Box<Value>> },
  Module(ModuleRef),
  NativeFn { module: String, name: String },
  Struct { name: String, fields: Rc<RefCell<HashMap<String, Value>>> },
  StructType(StructDefRef),
  EnumType(EnumDefRef),
}

impl Value {
  pub fn truthy(&self) -> bool {
    match self {
      Value::Bool(b) => *b,
      Value::Int(n) => *n != 0,
      Value::Float(n) => *n != 0.0,
      Value::String(s) => !s.is_empty(),
      Value::Array(a) => !a.borrow().is_empty(),
      Value::Map(m) => !m.borrow().is_empty(),
      Value::Range(start, end, inclusive) => {
        if *inclusive { start <= end } else { start < end }
      }
      Value::Enum { value, .. } => value.is_some(),
      Value::Module(_) => true,
      Value::NativeFn { .. } => true,
      Value::Struct { .. } => true,
      Value::StructType(_) => true,
      Value::EnumType(_) => true,
      Value::None => false,
      Value::Void => false,
    }
  }

  pub fn type_name(&self) -> String {
    match self {
      Value::Int(_) => "Int".to_string(),
      Value::Float(_) => "Float".to_string(),
      Value::String(_) => "String".to_string(),
      Value::Bool(_) => "Bool".to_string(),
      Value::Void => "Void".to_string(),
      Value::None => "none".to_string(),
      Value::Array(_) => "Array".to_string(),
      Value::Map(_) => "Map".to_string(),
      Value::Range(_, _, _) => "Range".to_string(),
      Value::Enum { module, variant, .. } => format!("{}.{}", module, variant),
      Value::Module(_) => "Module".to_string(),
      Value::NativeFn { module, name } => format!("{}.{}", module, name),
      Value::Struct { name, .. } => name.clone(),
      Value::StructType(s) => s.name.clone(),
      Value::EnumType(e) => e.name.clone(),
    }
  }

  pub fn to_string(&self) -> String {
    match self {
      Value::Int(n) => n.to_string(),
      Value::Float(n) => n.to_string(),
      Value::String(s) => s.clone(),
      Value::Bool(b) => b.to_string(),
      Value::Void => "void".to_string(),
      Value::None => "none".to_string(),
      Value::Array(a) => {
        let parts: Vec<String> = a.borrow().iter().map(Value::to_string).collect();
        format!("[{}]", parts.join(", "))
      }
      Value::Map(m) => {
        let parts: Vec<String> = m.borrow().iter().map(|(k, v)| format!("{}: {}", k, v.to_string())).collect();
        format!("{{{}}}", parts.join(", "))
      }
      Value::Range(start, end, inclusive) => {
        if *inclusive { format!("{}..={}", start, end) } else { format!("{}..{}", start, end) }
      }
      Value::Enum { module, variant, value } => {
        if let Some(v) = value { format!("{}.{}({})", module, variant, v.to_string()) } else { format!("{}.{}", module, variant) }
      }
      Value::Module(m) => format!("module({})", m.borrow().functions.keys().cloned().collect::<Vec<_>>().join(", ")),
      Value::NativeFn { module, name } => format!("{}.{}", module, name),
      Value::Struct { name, fields } => {
        let parts: Vec<String> = fields.borrow().iter().map(|(k, v)| format!("{}: {}", k, v.to_string())).collect();
        format!("{} {{{}}}", name, parts.join(", "))
      }
      Value::StructType(s) => format!("struct {}", s.name),
      Value::EnumType(e) => format!("enum {}", e.name),
    }
  }
}

pub struct EvalContext {
  pub stdout: String,
  pub env: Environment,
  pub functions: HashMap<String, FnDecl>,
  pub methods: HashMap<String, HashMap<String, FnDecl>>,
  pub stdlib: HashMap<String, HashMap<String, Value>>,
  pub structs: HashMap<String, StructDefRef>,
  pub enums: HashMap<String, EnumDefRef>,
  module_resolver: Rc<RefCell<dyn ModuleResolver>>,
  loaded_modules: Rc<RefCell<HashMap<String, ModuleRef>>>,
  /// Set when `return` runs inside a `match` expression so the enclosing function exits.
  pending_return: Option<Value>,
}

pub struct Environment {
  scopes: Vec<HashMap<String, Value>>,
}

impl Environment {
  pub fn new() -> Self {
    Self { scopes: vec![HashMap::new()] }
  }

  pub fn push_scope(&mut self) {
    self.scopes.push(HashMap::new());
  }

  pub fn pop_scope(&mut self) {
    self.scopes.pop();
  }

  pub fn define(&mut self, name: &str, value: Value) {
    if let Some(scope) = self.scopes.last_mut() {
      scope.insert(name.to_string(), value);
    }
  }

  pub fn get(&self, name: &str) -> Option<Value> {
    for scope in self.scopes.iter().rev() {
      if let Some(v) = scope.get(name) {
        return Some(v.clone());
      }
    }
    None
  }

  pub fn set(&mut self, name: &str, value: Value, span: Span) -> Result<(), RuntimeError> {
    for scope in self.scopes.iter_mut().rev() {
      if scope.contains_key(name) {
        scope.insert(name.to_string(), value);
        return Ok(());
      }
    }
    Err(runtime_err(format!("undefined variable '{}'", name), span))
  }
}

impl EvalContext {
  pub fn new() -> Self {
    Self::with_resolver(Rc::new(RefCell::new(HashMapResolver::new(HashMap::new()))))
  }

  pub fn with_resolver(resolver: Rc<RefCell<dyn ModuleResolver>>) -> Self {
    let mut ctx = Self {
      stdout: String::new(),
      env: Environment::new(),
      functions: HashMap::new(),
      methods: HashMap::new(),
      stdlib: HashMap::new(),
      structs: HashMap::new(),
      enums: HashMap::new(),
      module_resolver: resolver,
      loaded_modules: Rc::new(RefCell::new(HashMap::new())),
      pending_return: None,
    };
    ctx.init_stdlib();
    ctx
  }

  fn init_stdlib(&mut self) {
    let mut str_mod = HashMap::new();
    str_mod.insert("contains".to_string(), Value::String("str.contains".to_string()));
    str_mod.insert("starts_with".to_string(), Value::String("str.starts_with".to_string()));
    str_mod.insert("ends_with".to_string(), Value::String("str.ends_with".to_string()));
    str_mod.insert("length".to_string(), Value::String("str.length".to_string()));
    str_mod.insert("is_empty".to_string(), Value::String("str.is_empty".to_string()));
    str_mod.insert("repeat".to_string(), Value::String("str.repeat".to_string()));
    str_mod.insert("upper".to_string(), Value::String("str.upper".to_string()));
    str_mod.insert("lower".to_string(), Value::String("str.lower".to_string()));
    str_mod.insert("trim".to_string(), Value::String("str.trim".to_string()));
    self.stdlib.insert("str".to_string(), str_mod);
    self.stdlib.insert("math".to_string(), HashMap::new());
    self.stdlib.insert("checks".to_string(), HashMap::new());
    self.stdlib.insert("io".to_string(), HashMap::new());
    self.stdlib.insert("Array".to_string(), HashMap::new());
    self.stdlib.insert("option".to_string(), HashMap::new());
    self.stdlib.insert("Option".to_string(), HashMap::new());
    self.stdlib.insert("result".to_string(), HashMap::new());
    self.stdlib.insert("Result".to_string(), HashMap::new());

    let mut option_variants = HashMap::new();
    option_variants.insert("Some".to_string(), EnumVariantDef { arity: 1 });
    option_variants.insert("None".to_string(), EnumVariantDef { arity: 0 });
    let option_def = Rc::new(EnumDef { name: "Option".to_string(), variants: option_variants });
    self.enums.insert("Option".to_string(), option_def.clone());
    self.enums.insert("option".to_string(), option_def);

    let mut result_variants = HashMap::new();
    result_variants.insert("Ok".to_string(), EnumVariantDef { arity: 1 });
    result_variants.insert("Err".to_string(), EnumVariantDef { arity: 1 });
    let result_def = Rc::new(EnumDef { name: "Result".to_string(), variants: result_variants });
    self.enums.insert("Result".to_string(), result_def.clone());
    self.enums.insert("result".to_string(), result_def);
  }

  pub fn run(&mut self, program: &[Item]) -> Result<Value, RuntimeError> {
    self.load_program(program)?;
    if self.functions.contains_key("main") {
      self.call_fn("main", vec![], Span::default())
    } else {
      Ok(Value::Void)
    }
  }

  /// Register declarations and evaluate top-level consts/vars without calling `main`.
  pub fn load_program(&mut self, program: &[Item]) -> Result<(), RuntimeError> {
    // First pass: register declarations
    for item in program {
      match item {
        Item::FnDecl(f) => {
          self.functions.insert(f.name.clone(), f.clone());
        }
        Item::StructDecl(s) => {
          let fields = s.fields.iter().map(|(n, _)| n.clone()).collect();
          self.structs.insert(s.name.clone(), Rc::new(StructDef { name: s.name.clone(), fields }));
        }
        Item::EnumDecl(e) => {
          let mut variants = HashMap::new();
          for v in &e.variants {
            variants.insert(v.name.clone(), EnumVariantDef { arity: v.value_types.len() });
          }
          self.enums.insert(e.name.clone(), Rc::new(EnumDef { name: e.name.clone(), variants }));
        }
        Item::ImplDecl { type_name, methods } => {
          let entry = self.methods.entry(type_name.clone()).or_insert_with(HashMap::new);
          for m in methods {
            entry.insert(m.name.clone(), m.clone());
          }
        }
        Item::Import(i) => {
          self.eval_import(i, Span::default())?;
        }
        _ => {}
      }
    }

    // Second pass: evaluate top-level consts and vars
    for item in program {
      match item {
        Item::ConstDecl(c) => {
          let value = self.eval_expr(&c.value)?;
          self.env.define(&c.name, value);
        }
        Item::VarDecl(v) => {
          let value = match &v.value {
            Some(e) => self.eval_expr(e)?,
            None => Value::None,
          };
          self.env.define(&v.name, value);
        }
        _ => {}
      }
    }
    Ok(())
  }

  /// Call a registered function by name (e.g. `on_ready`, `on_update`).
  pub fn call(&mut self, name: &str, args: Vec<Value>) -> Result<Value, RuntimeError> {
    self.call_fn(name, args, Span::default())
  }

  pub fn has_fn(&self, name: &str) -> bool {
    self.functions.contains_key(name)
  }

  fn eval_import(&mut self, import: &Import, span: Span) -> Result<(), RuntimeError> {
    if import.path.is_empty() {
      return Err(runtime_err("empty import path", span));
    }
    let module_name = &import.path[0];

    // Native stdlib modules are already wired via call_qualified / enums.
    if self.stdlib.contains_key(module_name) {
      if import.path.len() == 1 {
        // import module; — no-op for native stdlib modules
      } else if import.is_from && import.path.len() == 2 {
        let item_name = &import.path[1];
        let alias = import.alias.as_ref().unwrap_or(item_name).clone();
        if let Some(e) = self.enums.get(item_name).cloned() {
          self.env.define(&alias, Value::EnumType(e));
        } else if let Some(e) = self.enums.get(module_name).cloned() {
          // from option import Option / from result import Result
          self.env.define(&alias, Value::EnumType(e));
        } else {
          self.env.define(
            &alias,
            Value::NativeFn {
              module: module_name.clone(),
              name: item_name.clone(),
            },
          );
        }
      } else if !import.is_from && import.path.len() >= 2 {
        // import option.something — treat like from-import of last segment when stdlib
        let item_name = import.path.last().unwrap();
        let alias = import.alias.as_ref().unwrap_or(item_name).clone();
        if let Some(e) = self.enums.get(item_name).cloned() {
          self.env.define(&alias, Value::EnumType(e));
        } else {
          self.env.define(
            &alias,
            Value::NativeFn {
              module: module_name.clone(),
              name: item_name.clone(),
            },
          );
        }
      } else {
        return Err(runtime_err(
          format!("unsupported stdlib import: {:?}", import.path),
          span,
        ));
      }
      return Ok(());
    }

    if import.is_from {
      let module = self.load_module(module_name, span)?;
      if import.path.len() == 1 {
        let name = import.alias.as_ref().unwrap_or(module_name);
        self.env.define(name, Value::Module(module));
      } else if import.path.len() == 2 {
        let item_name = &import.path[1];
        let m = module.borrow();
        let alias = import.alias.as_ref().unwrap_or(item_name).clone();
        if let Some(decl) = m.functions.get(item_name) {
          self.functions.insert(alias.clone(), decl.clone());
        } else if let Some(value) = m.values.get(item_name) {
          self.env.define(&alias, value.clone());
        } else {
          return Err(runtime_err(
            format!("module '{}' has no export '{}'", module_name, item_name),
            span,
          ));
        }
      } else {
        return Err(runtime_err(
          format!(
            "nested from-imports longer than 2 segments are not supported: {:?}",
            import.path
          ),
          span,
        ));
      }
      return Ok(());
    }

    // import a.b.c; → resolve dotted module path, bind last segment
    let full_name = import.path.join(".");
    let module = self.load_module(&full_name, span)?;
    let bind = import
      .alias
      .as_ref()
      .unwrap_or_else(|| import.path.last().unwrap());
    self.env.define(bind, Value::Module(module));
    Ok(())
  }

  fn load_module(&mut self, name: &str, span: Span) -> Result<ModuleRef, RuntimeError> {
    {
      if let Some(m) = self.loaded_modules.borrow().get(name) {
        return Ok(m.clone());
      }
    }
    let source = self
      .module_resolver
      .borrow()
      .resolve(name)
      .ok_or_else(|| runtime_err(format!("module '{}' not found", name), span))?;
    let tokens = crate::lexer::Lexer::new(&source)
      .tokenize()
      .map_err(|e| runtime_err(e, span))?;
    let program = crate::parser::Parser::new(tokens)
      .parse()
      .map_err(|e| runtime_err(e, span))?;

    let mut module = Module::new();
    let mut module_ctx = EvalContext::with_resolver(self.module_resolver.clone());
    module_ctx.loaded_modules = self.loaded_modules.clone();

    for item in &program {
      match item {
        Item::FnDecl(f) => {
          module.functions.insert(f.name.clone(), f.clone());
          module_ctx.functions.insert(f.name.clone(), f.clone());
        }
        Item::StructDecl(s) => {
          let fields = s.fields.iter().map(|(n, _)| n.clone()).collect();
          let def = Rc::new(StructDef {
            name: s.name.clone(),
            fields,
          });
          module_ctx.structs.insert(s.name.clone(), def.clone());
          module
            .values
            .insert(s.name.clone(), Value::StructType(def));
        }
        Item::EnumDecl(e) => {
          let mut variants = HashMap::new();
          for v in &e.variants {
            variants.insert(
              v.name.clone(),
              EnumVariantDef {
                arity: v.value_types.len(),
              },
            );
          }
          let def = Rc::new(EnumDef {
            name: e.name.clone(),
            variants,
          });
          module_ctx.enums.insert(e.name.clone(), def.clone());
          // Also register on the caller so match arms in imported fns resolve
          self.enums.insert(e.name.clone(), def.clone());
          module
            .values
            .insert(e.name.clone(), Value::EnumType(def));
        }
        Item::ImplDecl { type_name, methods } => {
          let entry = module_ctx
            .methods
            .entry(type_name.clone())
            .or_insert_with(HashMap::new);
          for m in methods {
            entry.insert(m.name.clone(), m.clone());
          }
          let parent_entry = self
            .methods
            .entry(type_name.clone())
            .or_insert_with(HashMap::new);
          for m in methods {
            parent_entry.insert(m.name.clone(), m.clone());
          }
        }
        _ => {}
      }
    }

    for item in &program {
      if let Item::Import(i) = item {
        module_ctx.eval_import(i, span)?;
      }
    }

    for item in &program {
      match item {
        Item::ConstDecl(c) => {
          let value = module_ctx.eval_expr(&c.value)?;
          module.values.insert(c.name.clone(), value);
        }
        Item::VarDecl(v) => {
          let value = match &v.value {
            Some(e) => module_ctx.eval_expr(e)?,
            None => Value::None,
          };
          module.values.insert(v.name.clone(), value);
        }
        _ => {}
      }
    }

    let rc = Rc::new(RefCell::new(module));
    self.loaded_modules.borrow_mut().insert(name.to_string(), rc.clone());
    Ok(rc)
  }

  fn call_fn(&mut self, name: &str, args: Vec<Value>, span: Span) -> Result<Value, RuntimeError> {
    let decl = self.functions.get(name).ok_or_else(|| runtime_err(format!("undefined function '{}'", name), span))?.clone();
    self.call_fn_decl(&decl, args, span)
  }

  fn call_fn_decl(&mut self, decl: &FnDecl, args: Vec<Value>, span: Span) -> Result<Value, RuntimeError> {
    if args.len() != decl.params.len() {
      return Err(runtime_err(format!("{} expected {} args, got {}", decl.name, decl.params.len(), args.len()), span));
    }
    self.env.push_scope();
    for (param, arg) in decl.params.iter().zip(args) {
      self.env.define(&param.name, arg);
    }
    let result = self.exec_block(&decl.body)?;
    self.env.pop_scope();
    match result {
      ControlFlow::Return(v) => Ok(v),
      ControlFlow::Normal => Ok(Value::Void),
      _ => Err(runtime_err("break/continue outside loop", span)),
    }
  }

  fn exec_block(&mut self, block: &Block) -> Result<ControlFlow, RuntimeError> {
    for stmt in &block.stmts {
      match self.exec_stmt(stmt)? {
        ControlFlow::Normal => {}
        flow => return Ok(flow),
      }
    }
    Ok(ControlFlow::Normal)
  }

  fn exec_stmt(&mut self, stmt: &Stmt) -> Result<ControlFlow, RuntimeError> {
    let span = stmt.span;
    match &stmt.kind {
      StmtKind::Expr(e) => {
        let _ = self.eval_expr(e)?;
        if let Some(v) = self.pending_return.take() {
          return Ok(ControlFlow::Return(v));
        }
        Ok(ControlFlow::Normal)
      }
      StmtKind::Return(e) => {
        let value = match e {
          Some(expr) => self.eval_expr(expr)?,
          None => Value::Void,
        };
        Ok(ControlFlow::Return(value))
      }
      StmtKind::If { cond, then_block, elif_blocks, else_block } => {
        if self.eval_expr(cond)?.truthy() {
          return self.exec_block(then_block);
        }
        for (elif_cond, elif_block) in elif_blocks {
          if self.eval_expr(elif_cond)?.truthy() {
            return self.exec_block(elif_block);
          }
        }
        if let Some(else_block) = else_block {
          self.exec_block(else_block)
        } else {
          Ok(ControlFlow::Normal)
        }
      }
      StmtKind::While { cond, body } => {
        loop {
          if !self.eval_expr(cond)?.truthy() {
            break;
          }
          match self.exec_block(body)? {
            ControlFlow::Break => break,
            ControlFlow::Continue => continue,
            ControlFlow::Return(v) => return Ok(ControlFlow::Return(v)),
            ControlFlow::Normal => {}
          }
        }
        Ok(ControlFlow::Normal)
      }
      StmtKind::For { name, iter, body } => {
        let iter_value = self.eval_expr(iter)?;
        let items = match &iter_value {
          Value::String(s) => s.chars().map(|c| Value::String(c.to_string())).collect::<Vec<_>>(),
          Value::Array(a) => a.borrow().iter().cloned().collect::<Vec<_>>(),
          Value::Map(m) => m.borrow().keys().map(|k| Value::String(k.clone())).collect::<Vec<_>>(),
          Value::Int(n) => (0..*n).map(Value::Int).collect::<Vec<_>>(),
          Value::Range(start, end, inclusive) => {
            if *inclusive {
              (*start..=*end).map(Value::Int).collect::<Vec<_>>()
            } else {
              (*start..*end).map(Value::Int).collect::<Vec<_>>()
            }
          }
          _ => return Err(runtime_err(format!("cannot iterate over {}", iter_value.type_name()), span)),
        };
        for item in items {
          self.env.push_scope();
          self.env.define(name, item);
          match self.exec_block(body)? {
            ControlFlow::Break => { self.env.pop_scope(); break; }
            ControlFlow::Continue => { self.env.pop_scope(); continue; }
            ControlFlow::Return(v) => { self.env.pop_scope(); return Ok(ControlFlow::Return(v)); }
            ControlFlow::Normal => {}
          }
          self.env.pop_scope();
        }
        Ok(ControlFlow::Normal)
      }
      StmtKind::VarDecl(v) => {
        let value = match &v.value {
          Some(e) => self.eval_expr(e)?,
          None => Value::None,
        };
        self.env.define(&v.name, value);
        Ok(ControlFlow::Normal)
      }
      StmtKind::ConstDecl(c) => {
        let value = self.eval_expr(&c.value)?;
        self.env.define(&c.name, value);
        Ok(ControlFlow::Normal)
      }
      StmtKind::Break => Ok(ControlFlow::Break),
      StmtKind::Continue => Ok(ControlFlow::Continue),
      StmtKind::Pass => Ok(ControlFlow::Normal),
    }
  }

  fn eval_expr(&mut self, expr: &Expr) -> Result<Value, RuntimeError> {
    let span = expr.span;
    match &expr.kind {
      ExprKind::Literal(l) => match l {
        Literal::Int(n) => Ok(Value::Int(*n)),
        Literal::Float(n) => Ok(Value::Float(*n)),
        Literal::String(s) => Ok(Value::String(s.clone())),
        Literal::Bool(b) => Ok(Value::Bool(*b)),
        Literal::None => Ok(Value::None),
      },
      ExprKind::FString(parts) => {
        let mut result = String::new();
        for part in parts {
          match part {
            FStringPart::Text(t) => result.push_str(t),
            FStringPart::Expr { expr, format } => {
              let value = self.eval_expr(expr)?;
              result.push_str(&format_value(&value, format.as_deref(), span)?);
            }
          }
        }
        Ok(Value::String(result))
      }
      ExprKind::Range { start, end, inclusive } => {
        let s = match self.eval_expr(start)? {
          Value::Int(n) => n,
          Value::Float(n) => n as i64,
          v => return Err(runtime_err(format!("range start must be Int, got {}", v.type_name()), span)),
        };
        let e = match self.eval_expr(end)? {
          Value::Int(n) => n,
          Value::Float(n) => n as i64,
          v => return Err(runtime_err(format!("range end must be Int, got {}", v.type_name()), span)),
        };
        Ok(Value::Range(s, e, *inclusive))
      }
      ExprKind::Ident(name) => {
        if let Some(v) = self.env.get(name) {
          return Ok(v);
        }
        if let Some(s) = self.structs.get(name) {
          return Ok(Value::StructType(s.clone()));
        }
        if let Some(e) = self.enums.get(name) {
          return Ok(Value::EnumType(e.clone()));
        }
        Err(runtime_err(format!("undefined variable '{}'", name), span))
      }
      ExprKind::Unary { op, expr } => {
        let value = self.eval_expr(expr)?;
        match op {
          UnaryOp::Neg => match value {
            Value::Int(n) => Ok(Value::Int(-n)),
            Value::Float(n) => Ok(Value::Float(-n)),
            _ => Err(runtime_err(format!("cannot negate {}", value.type_name()), span)),
          },
          UnaryOp::Not => Ok(Value::Bool(!value.truthy())),
        }
      }
      ExprKind::Binary { op, left, right } => {
        let l = self.eval_expr(left)?;
        let r = self.eval_expr(right)?;
        match op {
          BinOp::Add => match (&l, &r) {
            (Value::Int(a), Value::Int(b)) => Ok(Value::Int(a + b)),
            (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a + b)),
            (Value::Float(a), Value::Int(b)) => Ok(Value::Float(a + *b as f64)),
            (Value::Int(a), Value::Float(b)) => Ok(Value::Float(*a as f64 + b)),
            (Value::String(a), Value::String(b)) => Ok(Value::String(format!("{}{}", a, b))),
            _ => Err(runtime_err(format!("cannot add {} and {}", l.type_name(), r.type_name()), span)),
          },
          BinOp::Sub => numeric_binop(l, r, |a, b| a - b, span),
          BinOp::Mul => numeric_binop(l, r, |a, b| a * b, span),
          BinOp::Div => numeric_binop(l, r, |a, b| a / b, span),
          BinOp::IDiv => match (&l, &r) {
            (Value::Int(a), Value::Int(b)) => Ok(Value::Int(a / b)),
            _ => Err(runtime_err(format!("integer division requires Int, got {} and {}", l.type_name(), r.type_name()), span)),
          },
          BinOp::Mod => numeric_binop(l, r, |a, b| a % b, span),
          BinOp::Eq => Ok(Value::Bool(value_eq(&l, &r))),
          BinOp::Neq => Ok(Value::Bool(!value_eq(&l, &r))),
          BinOp::Lt => compare_op(l, r, |a, b| a < b, span),
          BinOp::Lte => compare_op(l, r, |a, b| a <= b, span),
          BinOp::Gt => compare_op(l, r, |a, b| a > b, span),
          BinOp::Gte => compare_op(l, r, |a, b| a >= b, span),
          BinOp::And => Ok(Value::Bool(l.truthy() && r.truthy())),
          BinOp::Or => Ok(Value::Bool(l.truthy() || r.truthy())),
        }
      }
      ExprKind::Call { callee, args } => {
        let arg_values: Result<Vec<_>, _> = args.iter().map(|a| self.eval_expr(a)).collect();
        let arg_values = arg_values?;
        match &callee.kind {
          ExprKind::Ident(name) => self.call_builtin_or_fn(name, arg_values, span),
          ExprKind::Member { object, name } => {
            // Qualified stdlib call: Module.name(args) — but prefer a bound Module value
            // so `import util.math` (bound as `math`) is not shadowed by the math stdlib.
            if let ExprKind::Ident(module) = &object.kind {
              let bound_module = matches!(self.env.get(module), Some(Value::Module(_)));
              if !bound_module && self.stdlib.contains_key(module) {
                return self.call_qualified(module, name, arg_values, span);
              }
            }
            let obj = self.eval_expr(object)?;
            self.call_member(&obj, name, arg_values, span)
          }
          _ => Err(runtime_err("invalid callee", span)),
        }
      }
      ExprKind::Member { object, name } => {
        let obj = self.eval_expr(object)?;
        match obj {
          Value::String(s) => {
            match name.as_str() {
              "len" => Ok(Value::Int(s.len() as i64)),
              _ => Err(runtime_err(format!("String has no member '{}'", name), span)),
            }
          }
          Value::Array(a) => {
            match name.as_str() {
              "len" => Ok(Value::Int(a.borrow().len() as i64)),
              _ => Err(runtime_err(format!("Array has no member '{}'", name), span)),
            }
          }
          Value::Map(m) => {
            match name.as_str() {
              "len" => Ok(Value::Int(m.borrow().len() as i64)),
              _ => Err(runtime_err(format!("Map has no member '{}'", name), span)),
            }
          }
          Value::Struct { name: struct_name, fields } => {
            if let Some(v) = fields.borrow().get(name) {
              return Ok(v.clone());
            }
            Err(runtime_err(format!("struct {} has no field '{}'", struct_name, name), span))
          }
          Value::EnumType(e) => {
            if let Some(v) = e.variants.get(name) {
              if v.arity == 0 {
                return Ok(Value::Enum { module: e.name.clone(), variant: name.clone(), value: None });
              }
              return Err(runtime_err(format!("{}.{} is a constructor and must be called with an argument", e.name, name), span));
            }
            Err(runtime_err(format!("enum {} has no variant '{}'", e.name, name), span))
          }
          Value::Module(m) => {
            let m = m.borrow();
            if m.functions.contains_key(name) {
              return Err(runtime_err(format!("function '{}' must be called with arguments", name), span));
            }
            if let Some(value) = m.values.get(name) {
              return Ok(value.clone());
            }
            Err(runtime_err(format!("module has no member '{}'", name), span))
          }
          _ => {
            Err(runtime_err(format!("type {} has no member '{}'", obj.type_name(), name), span))
          }
        }
      }
      ExprKind::Index { object, index } => {
        let obj = self.eval_expr(object)?;
        let idx = self.eval_expr(index)?;
        match (&obj, &idx) {
          (Value::Array(a), Value::Int(n)) => {
            let i = *n as usize;
            a.borrow().get(i).cloned().ok_or_else(|| runtime_err(format!("index {} out of bounds", i), span))
          }
          (Value::String(s), Value::Int(n)) => {
            let i = *n as usize;
            s.chars().nth(i).map(|c| Value::String(c.to_string())).ok_or_else(|| runtime_err(format!("index {} out of bounds", i), span))
          }
          (Value::Map(m), Value::String(k)) => {
            m.borrow().get(k).cloned().ok_or_else(|| runtime_err(format!("key '{}' not found", k), span))
          }
          _ => Err(runtime_err(format!("cannot index {} with {}", obj.type_name(), idx.type_name()), span)),
        }
      }
      ExprKind::Match { expr, arms } => {
        let value = self.eval_expr(expr)?;
        for arm in arms {
          let matched = match (&arm.pattern, &value) {
            (Pattern::Wildcard, _) => true,
            (
              Pattern::Variant {
                name,
                binds: binding,
              },
              Value::Enum {
                module: _,
                variant,
                value: inner,
              },
            ) => {
              if name == variant {
                self.env.push_scope();
                if let Some(v) = inner {
                  match binding.len() {
                    0 => {}
                    1 => {
                      if binding[0] != "_" {
                        self.env.define(&binding[0], (**v).clone());
                      }
                    }
                    _ => {
                      if let Value::Array(a) = &**v {
                        for (i, b) in binding.iter().enumerate() {
                          if b == "_" {
                            continue;
                          }
                          if let Some(item) = a.borrow().get(i) {
                            self.env.define(b, item.clone());
                          }
                        }
                      } else if binding[0] != "_" {
                        self.env.define(&binding[0], (**v).clone());
                      }
                    }
                  }
                }
                let result = self.exec_block(&arm.body)?;
                self.env.pop_scope();
                match result {
                  ControlFlow::Return(v) => {
                    self.pending_return = Some(v.clone());
                    return Ok(v);
                  }
                  ControlFlow::Normal => return Ok(Value::Void),
                  ControlFlow::Break => return Err(runtime_err("break outside loop", span)),
                  ControlFlow::Continue => return Err(runtime_err("continue outside loop", span)),
                }
              } else {
                false
              }
            }
            (Pattern::Variant { name, .. }, _) => {
              return Err(runtime_err(format!("match pattern '{}' does not match value of type {}", name, value.type_name()), span));
            }
          };
          if matched {
            let result = self.exec_block(&arm.body)?;
            match result {
              ControlFlow::Return(v) => {
                self.pending_return = Some(v.clone());
                return Ok(v);
              }
              ControlFlow::Normal => return Ok(Value::Void),
              ControlFlow::Break => return Err(runtime_err("break outside loop", span)),
              ControlFlow::Continue => return Err(runtime_err("continue outside loop", span)),
            }
          }
        }
        Ok(Value::Void)
      }
      ExprKind::StructLiteral { name, fields } => {
        let def = self.structs.get(name).ok_or_else(|| runtime_err(format!("undefined struct '{}'", name), span))?;
        let field_names = def.fields.clone();
        let mut values = HashMap::new();
        for (field_name, expr) in fields {
          values.insert(field_name.clone(), self.eval_expr(expr)?);
        }
        // Ensure all declared fields are present (default missing ones to None)
        for field in field_names {
          values.entry(field).or_insert(Value::None);
        }
        Ok(Value::Struct { name: name.clone(), fields: Rc::new(RefCell::new(values)) })
      }
      ExprKind::Assign { op, left, right } => {
        let value = self.eval_expr(right)?;
        match &left.kind {
          ExprKind::Ident(name) => {
            let new_value = if *op == AssignOp::Assign { value.clone() } else {
              let old = self.env.get(name).ok_or_else(|| runtime_err(format!("undefined variable '{}'", name), span))?;
              apply_assign_op(old, &value, op, span)?
            };
            self.env.set(name, new_value, span)?;
            Ok(value)
          }
          ExprKind::Index { object, index } => {
            let obj = self.eval_expr(object)?;
            let idx = self.eval_expr(index)?;
            match obj {
              Value::Array(a) => {
                let i = match idx { Value::Int(n) => n as usize, _ => return Err(runtime_err("array index must be Int".to_string(), span)) };
                let new_value = if *op == AssignOp::Assign { value.clone() } else {
                  let old = a.borrow().get(i).ok_or_else(|| runtime_err("index out of bounds".to_string(), span))?.clone();
                  apply_assign_op(old, &value, op, span)?
                };
                if i < a.borrow().len() { a.borrow_mut()[i] = new_value; } else { return Err(runtime_err("index out of bounds".to_string(), span)); }
                Ok(value)
              }
              Value::Map(m) => {
                let k = match idx { Value::String(s) => s, _ => return Err(runtime_err("map key must be String".to_string(), span)) };
                let new_value = if *op == AssignOp::Assign { value.clone() } else {
                  let old = m.borrow().get(&k).cloned().unwrap_or(Value::None);
                  apply_assign_op(old, &value, op, span)?
                };
                m.borrow_mut().insert(k, new_value);
                Ok(value)
              }
              _ => Err(runtime_err(format!("cannot assign to {}", obj.type_name()), span)),
            }
          }
          _ => Err(runtime_err("invalid assignment target".to_string(), span)),
        }
      }
    }
  }

  fn call_builtin_or_fn(&mut self, name: &str, args: Vec<Value>, span: Span) -> Result<Value, RuntimeError> {
    if let Some(Value::NativeFn { module, name: fn_name }) = self.env.get(name) {
      return self.call_qualified(&module, &fn_name, args, span);
    }
    match name {
      "print" => {
        let parts: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        self.stdout.push_str(&parts.join(" "));
        self.stdout.push('\n');
        Ok(Value::Void)
      }
      "len" => {
        if args.len() != 1 {
          return Err(runtime_err("len takes 1 argument".to_string(), span));
        }
        match &args[0] {
          Value::String(s) => Ok(Value::Int(s.len() as i64)),
          Value::Array(a) => Ok(Value::Int(a.borrow().len() as i64)),
          Value::Map(m) => Ok(Value::Int(m.borrow().len() as i64)),
          _ => Err(runtime_err(format!("len expects String, Array, or Map, got {}", args[0].type_name()), span)),
        }
      }
      "assert" => {
        if args.len() != 1 {
          return Err(runtime_err("assert takes 1 argument".to_string(), span));
        }
        if !args[0].truthy() {
          return Err(runtime_err("assertion failed".to_string(), span));
        }
        Ok(Value::Void)
      }
      "Array" => Ok(Value::Array(Rc::new(RefCell::new(args)))),
      "Map" => {
        if args.len() % 2 != 0 {
          return Err(runtime_err("Map literal requires even number of key/value arguments".to_string(), span));
        }
        let mut map = HashMap::new();
        for chunk in args.chunks(2) {
          let key = match &chunk[0] {
            Value::String(s) => s.clone(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => return Err(runtime_err(format!("Map key must be scalar, got {}", chunk[0].type_name()), span)),
          };
          map.insert(key, chunk[1].clone());
        }
        Ok(Value::Map(Rc::new(RefCell::new(map))))
      }
      _ => {
        if self.functions.contains_key(name) {
          self.call_fn(name, args, span)
        } else {
          Err(runtime_err(format!("undefined function '{}'", name), span))
        }
      }
    }
  }

  fn call_member(&mut self, object: &Value, name: &str, _args: Vec<Value>, span: Span) -> Result<Value, RuntimeError> {
    // User-defined methods on structs/enums (impl blocks)
    let type_key = match object {
      Value::Struct { name: n, .. } => Some(n.clone()),
      Value::Enum { module, .. } => Some(module.clone()),
      _ => None,
    };
    if let Some(type_name) = type_key {
      if let Some(type_methods) = self.methods.get(&type_name) {
        if let Some(decl) = type_methods.get(name) {
          let decl = decl.clone();
          let mut args = _args;
          if decl.params.first().map(|p| p.name == "self").unwrap_or(false) {
            args.insert(0, object.clone());
          }
          return self.call_fn_decl(&decl, args, span);
        }
      }
    }

    // Method dispatch: String, Array, Map
    match object {
      Value::String(s) => match name {
        "len" => Ok(Value::Int(s.len() as i64)),
        "push" | "pop" => Err(runtime_err(format!("String has no method '{}'", name), span)),
        _ => Err(runtime_err(format!("String has no method '{}'", name), span)),
      },
      Value::Array(a) => match name {
        "len" => Ok(Value::Int(a.borrow().len() as i64)),
        "push" => {
          if _args.len() != 1 {
            return Err(runtime_err("Array.push takes 1 argument".to_string(), span));
          }
          a.borrow_mut().push(_args[0].clone());
          Ok(Value::Void)
        }
        "pop" => Ok(a.borrow_mut().pop().unwrap_or(Value::None)),
        "first" => {
          if !_args.is_empty() {
            return Err(runtime_err("Array.first takes 0 arguments".to_string(), span));
          }
          Ok(a.borrow().first().cloned().unwrap_or(Value::None))
        }
        "last" => {
          if !_args.is_empty() {
            return Err(runtime_err("Array.last takes 0 arguments".to_string(), span));
          }
          Ok(a.borrow().last().cloned().unwrap_or(Value::None))
        }
        "contains" => {
          if _args.len() != 1 {
            return Err(runtime_err("Array.contains takes 1 argument".to_string(), span));
          }
          let found = a.borrow().iter().any(|v| value_eq(v, &_args[0]));
          Ok(Value::Bool(found))
        }
        _ => Err(runtime_err(format!("Array has no method '{}'", name), span)),
      },
      Value::Map(m) => match name {
        "len" => Ok(Value::Int(m.borrow().len() as i64)),
        "has" => {
          if _args.len() != 1 {
            return Err(runtime_err("Map.has takes 1 argument".to_string(), span));
          }
          let key = match &_args[0] {
            Value::String(s) => s.clone(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => return Err(runtime_err(format!("Map key must be scalar, got {}", _args[0].type_name()), span)),
          };
          Ok(Value::Bool(m.borrow().contains_key(&key)))
        }
        "keys" => Ok(Value::Array(Rc::new(RefCell::new(m.borrow().keys().map(|k| Value::String(k.clone())).collect::<Vec<_>>())))),
        "remove" => {
          if _args.len() != 1 {
            return Err(runtime_err("Map.remove takes 1 argument".to_string(), span));
          }
          let key = match &_args[0] {
            Value::String(s) => s.clone(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => return Err(runtime_err(format!("Map key must be scalar, got {}", _args[0].type_name()), span)),
          };
          Ok(m.borrow_mut().remove(&key).unwrap_or(Value::None))
        }
        "insert" => {
          if _args.len() != 2 {
            return Err(runtime_err("Map.insert takes 2 arguments".to_string(), span));
          }
          let key = match &_args[0] {
            Value::String(s) => s.clone(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => return Err(runtime_err(format!("Map key must be scalar, got {}", _args[0].type_name()), span)),
          };
          m.borrow_mut().insert(key, _args[1].clone());
          Ok(Value::Void)
        }
        _ => Err(runtime_err(format!("Map has no method '{}'", name), span)),
      },
      Value::Enum { module, variant, value } => match name {
        "is_some" => Ok(Value::Bool(*module == "Option" && *variant == "Some")),
        "is_none" => Ok(Value::Bool(*module == "Option" && *variant == "None")),
        "is_ok" => Ok(Value::Bool(*module == "Result" && *variant == "Ok")),
        "is_err" => Ok(Value::Bool(*module == "Result" && *variant == "Err")),
        "unwrap" => match value { Some(v) => Ok((**v).clone()), None => Err(runtime_err(format!("called unwrap on {}.{}", module, variant), span)) },
        "unwrap_or" => {
          if _args.len() != 1 { return Err(runtime_err("unwrap_or takes 1 argument".to_string(), span)); }
          match value { Some(v) => Ok((**v).clone()), None => Ok(_args[0].clone()) }
        }
        _ => Err(runtime_err(format!("Enum {} has no method '{}'", module, variant), span)),
      },
      Value::EnumType(e) => {
        if let Some(v) = e.variants.get(name) {
          if v.arity == 0 {
            if !_args.is_empty() {
              return Err(runtime_err(format!("{}.{} does not take arguments", e.name, name), span));
            }
            return Ok(Value::Enum { module: e.name.clone(), variant: name.to_string(), value: None });
          }
          let value = if _args.len() == 1 { _args[0].clone() } else { Value::Array(Rc::new(RefCell::new(_args))) };
          return Ok(Value::Enum { module: e.name.clone(), variant: name.to_string(), value: Some(Box::new(value)) });
        }
        Err(runtime_err(format!("enum {} has no variant '{}'", e.name, name), span))
      },
      Value::Module(m) => {
        let decl = {
          let m = m.borrow();
          m.functions.get(name).cloned()
        };
        if let Some(decl) = decl {
          return self.call_fn_decl(&decl, _args, span);
        }
        if _args.is_empty() {
          if let Some(value) = m.borrow().values.get(name) {
            return Ok(value.clone());
          }
        }
        Err(runtime_err(format!("module has no member '{}'", name), span))
      }
      Value::Struct { name: struct_name, .. } => {
        Err(runtime_err(format!("struct {} has no method '{}'", struct_name, name), span))
      }
      _ => Err(runtime_err(format!("type {} has no method '{}'", object.type_name(), name), span)),
    }
  }

  pub fn call_qualified(&mut self, module: &str, name: &str, args: Vec<Value>, span: Span) -> Result<Value, RuntimeError> {
    match (module, name) {
      ("str", "contains") => {
        if args.len() != 2 {
          return Err(runtime_err("str.contains takes 2 arguments".to_string(), span));
        }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("str.contains first arg must be String".to_string(), span)) };
        let sub = match &args[1] { Value::String(s) => s.clone(), _ => return Err(runtime_err("str.contains second arg must be String".to_string(), span)) };
        Ok(Value::Bool(s.contains(&sub)))
      }
      ("str", "starts_with") => {
        if args.len() != 2 { return Err(runtime_err("str.starts_with takes 2 arguments".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        let sub = match &args[1] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::Bool(s.starts_with(&sub)))
      }
      ("str", "ends_with") => {
        if args.len() != 2 { return Err(runtime_err("str.ends_with takes 2 arguments".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        let sub = match &args[1] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::Bool(s.ends_with(&sub)))
      }
      ("str", "length") => {
        if args.len() != 1 { return Err(runtime_err("str.length takes 1 argument".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::Int(s.len() as i64))
      }
      ("str", "is_empty") => {
        if args.len() != 1 { return Err(runtime_err("str.is_empty takes 1 argument".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::Bool(s.is_empty()))
      }
      ("str", "repeat") => {
        if args.len() != 2 { return Err(runtime_err("str.repeat takes 2 arguments".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        let n = match &args[1] { Value::Int(n) => *n, _ => return Err(runtime_err("expected Int".to_string(), span)) };
        Ok(Value::String(s.repeat(n.max(0) as usize)))
      }
      ("str", "upper") => {
        if args.len() != 1 { return Err(runtime_err("str.upper takes 1 argument".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::String(s.to_uppercase()))
      }
      ("str", "lower") => {
        if args.len() != 1 { return Err(runtime_err("str.lower takes 1 argument".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::String(s.to_lowercase()))
      }
      ("str", "trim") => {
        if args.len() != 1 { return Err(runtime_err("str.trim takes 1 argument".to_string(), span)); }
        let s = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("expected String".to_string(), span)) };
        Ok(Value::String(s.trim().to_string()))
      }
      ("io", "read_text") => {
        if args.len() != 1 { return Err(runtime_err("io.read_text takes 1 argument".to_string(), span)); }
        let path = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("io.read_text expects String path".to_string(), span)) };
        match std::fs::read_to_string(&path) {
          Ok(content) => Ok(Value::String(content)),
          Err(e) => Ok(Value::Enum {
            module: "Result".to_string(),
            variant: "Err".to_string(),
            value: Some(Box::new(Value::String(e.to_string()))),
          }),
        }
      }
      ("io", "write_text") => {
        if args.len() != 2 { return Err(runtime_err("io.write_text takes 2 arguments".to_string(), span)); }
        let path = match &args[0] { Value::String(s) => s.clone(), _ => return Err(runtime_err("io.write_text expects String path".to_string(), span)) };
        let content = match &args[1] { Value::String(s) => s.clone(), _ => return Err(runtime_err("io.write_text expects String content".to_string(), span)) };
        match std::fs::write(&path, content) {
          Ok(()) => Ok(Value::Enum {
            module: "Result".to_string(),
            variant: "Ok".to_string(),
            value: Some(Box::new(Value::Void)),
          }),
          Err(e) => Ok(Value::Enum {
            module: "Result".to_string(),
            variant: "Err".to_string(),
            value: Some(Box::new(Value::String(e.to_string()))),
          }),
        }
      }
      ("io", "exists") => {
        if args.len() != 1 {
          return Err(runtime_err("io.exists takes 1 argument".to_string(), span));
        }
        let path = match &args[0] {
          Value::String(s) => s.clone(),
          _ => return Err(runtime_err("io.exists expects String path".to_string(), span)),
        };
        Ok(Value::Bool(std::path::Path::new(&path).exists()))
      }
      ("Array", "first") => {
        if args.len() != 1 { return Err(runtime_err("Array.first takes 1 argument".to_string(), span)); }
        match &args[0] {
          Value::Array(a) => Ok(a.borrow().first().cloned().unwrap_or(Value::None)),
          _ => Err(runtime_err("Array.first expects Array".to_string(), span)),
        }
      }
      ("Array", "last") => {
        if args.len() != 1 { return Err(runtime_err("Array.last takes 1 argument".to_string(), span)); }
        match &args[0] {
          Value::Array(a) => Ok(a.borrow().last().cloned().unwrap_or(Value::None)),
          _ => Err(runtime_err("Array.last expects Array".to_string(), span)),
        }
      }
      ("Array", "contains") => {
        if args.len() != 2 { return Err(runtime_err("Array.contains takes 2 arguments".to_string(), span)); }
        match &args[0] {
          Value::Array(a) => Ok(Value::Bool(a.borrow().iter().any(|v| value_eq(v, &args[1])))),
          _ => Err(runtime_err("Array.contains expects Array".to_string(), span)),
        }
      }
      ("math", "abs") => {
        if args.len() != 1 { return Err(runtime_err("math.abs takes 1 argument".to_string(), span)); }
        match &args[0] {
          Value::Int(n) => Ok(Value::Int(n.abs())),
          Value::Float(n) => Ok(Value::Float(n.abs())),
          _ => Err(runtime_err("math.abs expects Int or Float".to_string(), span)),
        }
      }
      ("math", "abs_float") => {
        if args.len() != 1 { return Err(runtime_err("math.abs_float takes 1 argument".to_string(), span)); }
        match &args[0] { Value::Float(n) => Ok(Value::Float(n.abs())), _ => Err(runtime_err("math.abs_float expects Float".to_string(), span)) }
      }
      ("math", "sign") => {
        if args.len() != 1 { return Err(runtime_err("math.sign takes 1 argument".to_string(), span)); }
        match &args[0] {
          Value::Int(n) => Ok(Value::Int(if *n > 0 { 1 } else if *n < 0 { -1 } else { 0 })),
          Value::Float(n) => Ok(Value::Int(if *n > 0.0 { 1 } else if *n < 0.0 { -1 } else { 0 })),
          _ => Err(runtime_err("math.sign expects Int or Float".to_string(), span)),
        }
      }
      ("math", "min") => {
        if args.len() != 2 { return Err(runtime_err("math.min takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Int(a), Value::Int(b)) => Ok(Value::Int(*a.min(b))),
          (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a.min(*b))),
          (Value::Int(a), Value::Float(b)) => Ok(Value::Float((*a as f64).min(*b))),
          (Value::Float(a), Value::Int(b)) => Ok(Value::Float(a.min(*b as f64))),
          _ => Err(runtime_err("math.min expects Int or Float".to_string(), span)),
        }
      }
      ("math", "max") => {
        if args.len() != 2 { return Err(runtime_err("math.max takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Int(a), Value::Int(b)) => Ok(Value::Int(*a.max(b))),
          (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a.max(*b))),
          (Value::Int(a), Value::Float(b)) => Ok(Value::Float((*a as f64).max(*b))),
          (Value::Float(a), Value::Int(b)) => Ok(Value::Float(a.max(*b as f64))),
          _ => Err(runtime_err("math.max expects Int or Float".to_string(), span)),
        }
      }
      ("math", "min_float") => {
        if args.len() != 2 { return Err(runtime_err("math.min_float takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) { (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a.min(*b))), _ => Err(runtime_err("math.min_float expects Float".to_string(), span)) }
      }
      ("math", "max_float") => {
        if args.len() != 2 { return Err(runtime_err("math.max_float takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) { (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a.max(*b))), _ => Err(runtime_err("math.max_float expects Float".to_string(), span)) }
      }
      ("math", "clamp") => {
        if args.len() != 3 { return Err(runtime_err("math.clamp takes 3 arguments".to_string(), span)); }
        match (&args[0], &args[1], &args[2]) {
          (Value::Int(v), Value::Int(lo), Value::Int(hi)) => Ok(Value::Int(*v.max(lo).min(hi))),
          (Value::Float(v), Value::Float(lo), Value::Float(hi)) => Ok(Value::Float((*v).max(*lo).min(*hi))),
          (Value::Int(v), Value::Float(lo), Value::Float(hi)) => Ok(Value::Float((*v as f64).max(*lo).min(*hi))),
          (Value::Float(v), Value::Int(lo), Value::Int(hi)) => Ok(Value::Float((*v).max(*lo as f64).min(*hi as f64))),
          _ => Err(runtime_err("math.clamp expects consistent Int or Float arguments".to_string(), span)),
        }
      }
      ("math", "clamp_float") => {
        if args.len() != 3 { return Err(runtime_err("math.clamp_float takes 3 arguments".to_string(), span)); }
        match (&args[0], &args[1], &args[2]) { (Value::Float(v), Value::Float(lo), Value::Float(hi)) => Ok(Value::Float((*v).max(*lo).min(*hi))), _ => Err(runtime_err("math.clamp_float expects Float".to_string(), span)) }
      }
      ("math", "pow") => {
        if args.len() != 2 { return Err(runtime_err("math.pow takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Int(base), Value::Int(exp)) => {
            if *exp < 0 { Ok(Value::Int(0)) } else { Ok(Value::Int(base.pow(*exp as u32))) }
          }
          (Value::Float(base), Value::Int(exp)) => {
            if *exp < 0 { Ok(Value::Float(0.0)) } else { Ok(Value::Float(base.powi(*exp as i32))) }
          }
          (Value::Float(base), Value::Float(exp)) => Ok(Value::Float(base.powf(*exp))),
          (Value::Int(base), Value::Float(exp)) => Ok(Value::Float((*base as f64).powf(*exp))),
          _ => Err(runtime_err("math.pow expects numeric arguments".to_string(), span)),
        }
      }
      ("math", "gcd") => {
        if args.len() != 2 { return Err(runtime_err("math.gcd takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Int(a), Value::Int(b)) => {
            let mut x = a.abs();
            let mut y = b.abs();
            while y != 0 {
              let t = y;
              y = x % y;
              x = t;
            }
            Ok(Value::Int(x))
          }
          _ => Err(runtime_err("math.gcd expects Int arguments".to_string(), span)),
        }
      }
      ("math", "to_int") => {
        if args.len() != 1 { return Err(runtime_err("math.to_int takes 1 argument".to_string(), span)); }
        match &args[0] { Value::Float(n) => Ok(Value::Int(*n as i64)), Value::Int(n) => Ok(Value::Int(*n)), _ => Err(runtime_err("math.to_int expects Float or Int".to_string(), span)) }
      }
      ("math", "to_float") => {
        if args.len() != 1 { return Err(runtime_err("math.to_float takes 1 argument".to_string(), span)); }
        match &args[0] { Value::Int(n) => Ok(Value::Float(*n as f64)), Value::Float(n) => Ok(Value::Float(*n)), _ => Err(runtime_err("math.to_float expects Float or Int".to_string(), span)) }
      }
      ("checks", "that") | ("checks", "truthy") => {
        if args.len() != 1 { return Err(runtime_err("checks.that takes 1 argument".to_string(), span)); }
        if !args[0].truthy() { return Err(runtime_err("checks.that failed".to_string(), span)); }
        Ok(Value::Void)
      }
      ("checks", "falsey") => {
        if args.len() != 1 { return Err(runtime_err("checks.falsey takes 1 argument".to_string(), span)); }
        if args[0].truthy() { return Err(runtime_err("checks.falsey failed".to_string(), span)); }
        Ok(Value::Void)
      }
      ("checks", "eq") => {
        if args.len() != 2 { return Err(runtime_err("checks.eq takes 2 arguments".to_string(), span)); }
        if !value_eq(&args[0], &args[1]) { return Err(runtime_err(format!("checks.eq failed: {} != {}", args[0].to_string(), args[1].to_string()), span)); }
        Ok(Value::Void)
      }
      ("checks", "neq") => {
        if args.len() != 2 { return Err(runtime_err("checks.neq takes 2 arguments".to_string(), span)); }
        if value_eq(&args[0], &args[1]) { return Err(runtime_err(format!("checks.neq failed: {} == {}", args[0].to_string(), args[1].to_string()), span)); }
        Ok(Value::Void)
      }
      ("checks", "eq_bool") => {
        if args.len() != 2 { return Err(runtime_err("checks.eq_bool takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Bool(a), Value::Bool(b)) if a == b => Ok(Value::Void),
          _ => Err(runtime_err(format!("checks.eq_bool failed: {} != {}", args[0].to_string(), args[1].to_string()), span)),
        }
      }
      ("checks", "eq_float") => {
        if args.len() != 2 { return Err(runtime_err("checks.eq_float takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::Float(a), Value::Float(b)) if (a - b).abs() < f64::EPSILON => Ok(Value::Void),
          (Value::Int(a), Value::Int(b)) if a == b => Ok(Value::Void),
          _ => Err(runtime_err(format!("checks.eq_float failed: {} != {}", args[0].to_string(), args[1].to_string()), span)),
        }
      }
      ("checks", "eq_string") => {
        if args.len() != 2 { return Err(runtime_err("checks.eq_string takes 2 arguments".to_string(), span)); }
        match (&args[0], &args[1]) {
          (Value::String(a), Value::String(b)) if a == b => Ok(Value::Void),
          _ => Err(runtime_err(format!("checks.eq_string failed: {} != {}", args[0].to_string(), args[1].to_string()), span)),
        }
      }
      ("Option" | "option", "Some") => {
        if args.len() != 1 { return Err(runtime_err("Option.Some takes 1 argument".to_string(), span)); }
        Ok(Value::Enum { module: "Option".to_string(), variant: "Some".to_string(), value: Some(Box::new(args[0].clone())) })
      }
      ("Option" | "option", "None") => {
        if !args.is_empty() { return Err(runtime_err("Option.None takes 0 arguments".to_string(), span)); }
        Ok(Value::Enum { module: "Option".to_string(), variant: "None".to_string(), value: None })
      }
      ("Result" | "result", "Ok") => {
        if args.len() != 1 { return Err(runtime_err("Result.Ok takes 1 argument".to_string(), span)); }
        Ok(Value::Enum { module: "Result".to_string(), variant: "Ok".to_string(), value: Some(Box::new(args[0].clone())) })
      }
      ("Result" | "result", "Err") => {
        if args.len() != 1 { return Err(runtime_err("Result.Err takes 1 argument".to_string(), span)); }
        Ok(Value::Enum { module: "Result".to_string(), variant: "Err".to_string(), value: Some(Box::new(args[0].clone())) })
      }
      _ => Err(runtime_err(format!("unknown stdlib function {}.{}", module, name), span)),
    }
  }
}

#[derive(Debug, Clone, PartialEq)]
enum ControlFlow {
  Normal,
  Return(Value),
  Break,
  Continue,
}

fn value_eq(a: &Value, b: &Value) -> bool {
  match (a, b) {
    (Value::Int(a), Value::Int(b)) => a == b,
    (Value::Float(a), Value::Float(b)) => (a - b).abs() < f64::EPSILON,
    (Value::String(a), Value::String(b)) => a == b,
    (Value::Bool(a), Value::Bool(b)) => a == b,
    (Value::None, Value::None) => true,
    (Value::Void, Value::Void) => true,
    (Value::Array(a), Value::Array(b)) => {
      let a = a.borrow();
      let b = b.borrow();
      a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| value_eq(x, y))
    }
    (Value::Map(a), Value::Map(b)) => {
      let a = a.borrow();
      let b = b.borrow();
      a.len() == b.len() && a.iter().all(|(k, v)| b.get(k).map(|bv| value_eq(v, bv)).unwrap_or(false))
    }
    (Value::Enum { module: ma, variant: va, value: a }, Value::Enum { module: mb, variant: vb, value: b }) => {
      ma == mb && va == vb && match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => value_eq(a, b),
        _ => false,
      }
    }
    _ => false,
  }
}

fn format_value(value: &Value, format: Option<&str>, span: Span) -> Result<String, RuntimeError> {
  if let Some(spec) = format {
    if spec.ends_with('f') {
      let prec_str = spec.trim_start_matches('.').trim_end_matches('f');
      if let Ok(prec) = prec_str.parse::<usize>() {
        let n = match value {
          Value::Int(n) => *n as f64,
          Value::Float(n) => *n,
          _ => return Err(runtime_err(format!("format {:?} requires numeric value, got {}", spec, value.type_name()), span)),
        };
        return Ok(format!("{:.prec$}", n, prec = prec));
      }
    }
    return Err(runtime_err(format!("unsupported format spec {:?}", spec), span));
  }
  Ok(value.to_string())
}

fn numeric_binop<F: FnOnce(f64, f64) -> f64>(l: Value, r: Value, op: F, span: Span) -> Result<Value, RuntimeError> {
  let a = to_float(&l, span)?;
  let b = to_float(&r, span)?;
  let result = op(a, b);
  if result.fract() == 0.0 && result.is_finite() {
    Ok(Value::Int(result as i64))
  } else {
    Ok(Value::Float(result))
  }
}

fn to_float(v: &Value, span: Span) -> Result<f64, RuntimeError> {
  match v {
    Value::Int(n) => Ok(*n as f64),
    Value::Float(n) => Ok(*n),
    _ => Err(runtime_err(format!("expected numeric, got {}", v.type_name()), span)),
  }
}

fn compare_op<F: FnOnce(f64, f64) -> bool>(l: Value, r: Value, op: F, span: Span) -> Result<Value, RuntimeError> {
  let a = to_float(&l, span)?;
  let b = to_float(&r, span)?;
  Ok(Value::Bool(op(a, b)))
}

fn apply_assign_op(old: Value, new: &Value, op: &AssignOp, span: Span) -> Result<Value, RuntimeError> {
  match op {
    AssignOp::Assign => Ok(new.clone()),
    AssignOp::Add => numeric_binop(old, new.clone(), |a, b| a + b, span),
    AssignOp::Sub => numeric_binop(old, new.clone(), |a, b| a - b, span),
    AssignOp::Mul => numeric_binop(old, new.clone(), |a, b| a * b, span),
    AssignOp::Div => numeric_binop(old, new.clone(), |a, b| a / b, span),
    AssignOp::Mod => numeric_binop(old, new.clone(), |a, b| a % b, span),
  }
}
