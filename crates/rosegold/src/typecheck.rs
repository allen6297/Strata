use std::collections::HashMap;

use crate::parser::*;

#[derive(Clone)]
struct FnSig {
  param_count: Option<usize>,
  #[allow(dead_code)]
  return_type: Option<Type>,
}

struct TypeChecker {
  functions: HashMap<String, FnSig>,
  structs: HashMap<String, ()>,
  builtins: HashMap<&'static str, Option<usize>>,
}

impl TypeChecker {
  fn new() -> Self {
    let mut builtins = HashMap::new();
    // None = any arity
    builtins.insert("print", None);
    builtins.insert("len", Some(1));
    builtins.insert("assert", Some(1));
    builtins.insert("Array", None);
    builtins.insert("Map", None);
    Self {
      functions: HashMap::new(),
      structs: HashMap::new(),
      builtins,
    }
  }

  fn check_program(&mut self, program: &[Item]) -> Result<(), String> {
    for item in program {
      match item {
        Item::FnDecl(f) => {
          self.functions.insert(
            f.name.clone(),
            FnSig {
              param_count: Some(f.params.len()),
              return_type: f.return_type.clone(),
            },
          );
        }
        Item::ImplDecl { methods, .. } => {
          for m in methods {
            let _ = m;
          }
        }
        Item::StructDecl(s) => {
          self.structs.insert(s.name.clone(), ());
        }
        Item::Import(i) => {
          // from module import name [as alias] — bind name so it isn't flagged undefined.
          // Arity is unknown until runtime, so skip arity checks (param_count = None).
          if i.path.len() >= 2 {
            let item_name = i.alias.as_ref().unwrap_or(i.path.last().unwrap());
            self.functions.insert(
              item_name.clone(),
              FnSig {
                param_count: None,
                return_type: None,
              },
            );
          }
        }
        _ => {}
      }
    }

    for item in program {
      match item {
        Item::FnDecl(f) => self.check_fn(f)?,
        Item::ImplDecl { methods, .. } => {
          for m in methods {
            self.check_fn(m)?;
          }
        }
        Item::VarDecl(v) => self.check_var_decl(v)?,
        Item::ConstDecl(c) => {
          if let Some(ty) = &c.ty {
            self.check_type_vs_expr(ty, &c.value)?;
          }
          self.walk_expr(&c.value)?;
        }
        _ => {}
      }
    }
    Ok(())
  }

  fn check_fn(&mut self, f: &FnDecl) -> Result<(), String> {
    self.check_block(&f.body, f.return_type.as_ref())?;
    Ok(())
  }

  fn check_var_decl(&mut self, v: &VarDecl) -> Result<(), String> {
    if let Some(expr) = &v.value {
      self.check_type_vs_expr(&v.ty, expr)?;
      self.walk_expr(expr)?;
    }
    Ok(())
  }

  fn type_is_skipped(ty: &Type) -> bool {
    ty.name == "None" || ty.name.is_empty() || ty.name == "Self"
  }

  fn check_type_vs_expr(&self, ty: &Type, expr: &Expr) -> Result<(), String> {
    if Self::type_is_skipped(ty) {
      return Ok(());
    }
    if let Some(inferred) = Self::infer_expr_type(expr) {
      if !Self::types_compatible(&ty.name, &inferred) {
        return Err(format!(
          "type error: variable annotated as {} but initializer looks like {}",
          ty.name, inferred
        ));
      }
    }
    Ok(())
  }

  fn types_compatible(annotated: &str, inferred: &str) -> bool {
    if annotated == inferred {
      return true;
    }
    // Loose numeric compatibility
    matches!((annotated, inferred), ("Float", "Int") | ("Int", "Float"))
  }

  fn infer_expr_type(expr: &Expr) -> Option<String> {
    match &expr.kind {
      ExprKind::Literal(Literal::Int(_)) => Some("Int".to_string()),
      ExprKind::Literal(Literal::Float(_)) => Some("Float".to_string()),
      ExprKind::Literal(Literal::String(_)) => Some("String".to_string()),
      ExprKind::Literal(Literal::Bool(_)) => Some("Bool".to_string()),
      ExprKind::Literal(Literal::None) => Some("None".to_string()),
      ExprKind::StructLiteral { name, .. } => Some(name.clone()),
      ExprKind::Call { callee, .. } => {
        if let ExprKind::Ident(name) = &callee.kind {
          match name.as_str() {
            "Array" => Some("Array".to_string()),
            "Map" => Some("Map".to_string()),
            _ => None,
          }
        } else {
          None
        }
      }
      ExprKind::FString(_) => Some("String".to_string()),
      _ => None,
    }
  }

  fn check_block(&mut self, block: &Block, return_type: Option<&Type>) -> Result<(), String> {
    for stmt in &block.stmts {
      self.check_stmt(stmt, return_type)?;
    }
    Ok(())
  }

  fn check_stmt(&mut self, stmt: &Stmt, return_type: Option<&Type>) -> Result<(), String> {
    match &stmt.kind {
      StmtKind::Expr(e) => self.walk_expr(e)?,
      StmtKind::Return(value) => {
        if let Some(rt) = return_type {
          if !Self::type_is_skipped(rt) && rt.name != "Void" {
            if value.is_none() {
              return Err(format!(
                "type error: function with return type {} must return a value",
                rt.name
              ));
            }
          }
        }
        if let Some(e) = value {
          self.walk_expr(e)?;
        }
      }
      StmtKind::If {
        cond,
        then_block,
        elif_blocks,
        else_block,
      } => {
        self.walk_expr(cond)?;
        self.check_block(then_block, return_type)?;
        for (c, b) in elif_blocks {
          self.walk_expr(c)?;
          self.check_block(b, return_type)?;
        }
        if let Some(b) = else_block {
          self.check_block(b, return_type)?;
        }
      }
      StmtKind::While { cond, body } => {
        self.walk_expr(cond)?;
        self.check_block(body, return_type)?;
      }
      StmtKind::For { iter, body, .. } => {
        self.walk_expr(iter)?;
        self.check_block(body, return_type)?;
      }
      StmtKind::VarDecl(v) => self.check_var_decl(v)?,
      StmtKind::ConstDecl(c) => {
        if let Some(ty) = &c.ty {
          self.check_type_vs_expr(ty, &c.value)?;
        }
        self.walk_expr(&c.value)?;
      }
      StmtKind::Break | StmtKind::Continue | StmtKind::Pass => {}
    }
    Ok(())
  }

  fn walk_expr(&mut self, expr: &Expr) -> Result<(), String> {
    match &expr.kind {
      ExprKind::Literal(_) | ExprKind::Ident(_) => {}
      ExprKind::Binary { left, right, .. } => {
        self.walk_expr(left)?;
        self.walk_expr(right)?;
      }
      ExprKind::Unary { expr: inner, .. } => self.walk_expr(inner)?,
      ExprKind::Call { callee, args } => {
        for a in args {
          self.walk_expr(a)?;
        }
        self.check_call(callee, args.len())?;
        self.walk_expr(callee)?;
      }
      ExprKind::Member { object, .. } => self.walk_expr(object)?,
      ExprKind::Index { object, index } => {
        self.walk_expr(object)?;
        self.walk_expr(index)?;
      }
      ExprKind::StructLiteral { fields, .. } => {
        for (_, e) in fields {
          self.walk_expr(e)?;
        }
      }
      ExprKind::Assign { left, right, .. } => {
        self.walk_expr(left)?;
        self.walk_expr(right)?;
      }
      ExprKind::FString(parts) => {
        for part in parts {
          if let FStringPart::Expr { expr: e, .. } = part {
            self.walk_expr(e)?;
          }
        }
      }
      ExprKind::Range { start, end, .. } => {
        self.walk_expr(start)?;
        self.walk_expr(end)?;
      }
      ExprKind::Match { expr: scrutinee, arms } => {
        self.walk_expr(scrutinee)?;
        for arm in arms {
          self.check_block(&arm.body, None)?;
        }
      }
    }
    Ok(())
  }

  fn check_call(&self, callee: &Expr, arg_count: usize) -> Result<(), String> {
    match &callee.kind {
      ExprKind::Ident(name) => {
        if let Some(arity) = self.builtins.get(name.as_str()) {
          if let Some(expected) = arity {
            if arg_count != *expected {
              return Err(format!(
                "type error: {} expected {} args, got {}",
                name, expected, arg_count
              ));
            }
          }
          return Ok(());
        }
        if let Some(sig) = self.functions.get(name) {
          if let Some(expected) = sig.param_count {
            if arg_count != expected {
              return Err(format!(
                "type error: {} expected {} args, got {}",
                name, expected, arg_count
              ));
            }
          }
          return Ok(());
        }
        // Unknown free function — clear bug
        Err(format!("type error: undefined function '{}'", name))
      }
      // Qualified / method calls: skip (stdlib + dynamic dispatch)
      ExprKind::Member { .. } => Ok(()),
      _ => Ok(()),
    }
  }
}

/// Soft static type check. Hard-fails only on clear bugs (wrong arity, undefined fn).
pub fn typecheck(program: &[Item]) -> Result<(), String> {
  let mut checker = TypeChecker::new();
  checker.check_program(program)
}
