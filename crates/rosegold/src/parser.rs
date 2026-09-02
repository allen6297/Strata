#[derive(Debug, Clone, PartialEq)]
pub enum Item {
  Import(Import),
  FnDecl(FnDecl),
  VarDecl(VarDecl),
  ConstDecl(ConstDecl),
  StructDecl(StructDecl),
  ClassDecl(ClassDecl),
  TraitDecl(TraitDecl),
  EnumDecl(EnumDecl),
  ImplDecl {
    type_name: String,
    trait_name: Option<String>,
    methods: Vec<FnDecl>,
    trailing: Vec<String>,
    span: crate::Span,
  },
  Mod(ModDecl),
  SignalDecl(SignalDecl),
  Comment(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModDecl {
  pub name: String,
  pub items: Vec<Item>,
  pub span: crate::Span,
  pub doc: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldDecl {
  pub name: String,
  pub ty: Type,
  pub leading: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NestedImpl {
  pub trait_name: String,
  pub methods: Vec<FnDecl>,
  pub leading: Vec<String>,
  pub trailing: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructDecl {
  pub name: String,
  pub fields: Vec<FieldDecl>,
  pub trailing: Vec<String>,
  pub doc: Option<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClassDecl {
  pub name: String,
  pub parent: Option<String>,
  pub fields: Vec<FieldDecl>,
  pub defaults: Vec<(String, Expr)>,
  pub methods: Vec<FnDecl>,
  /// `class Foo impl Named, Drawable` — traits this class claims.
  pub impl_traits: Vec<String>,
  /// Nested `impl Trait { … }` inside the class body.
  pub trait_impls: Vec<NestedImpl>,
  pub trailing: Vec<String>,
  pub doc: Option<String>,
  pub span: crate::Span,
  pub is_pub: bool,
  /// `@node` — this class is a scene node the editor can insert.
  pub is_node: bool,
  /// `@export var` fields in this class (Inspector).
  pub exported_fields: Vec<VarDecl>,
}

impl ClassDecl {
  pub fn all_methods(&self) -> impl Iterator<Item = &FnDecl> {
    self
      .methods
      .iter()
      .chain(self.trait_impls.iter().flat_map(|b| b.methods.iter()))
  }

  /// `impl Trait` on the class header plus nested `impl Trait { … }`.
  pub fn implemented_traits(&self) -> Vec<String> {
    let mut names = self.impl_traits.clone();
    for b in &self.trait_impls {
      if !names.iter().any(|n| n == &b.trait_name) {
        names.push(b.trait_name.clone());
      }
    }
    names
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TraitDecl {
  pub name: String,
  pub methods: Vec<TraitMethod>,
  /// `signal` contract: implementing types expose these to Inspector / `.emit`.
  pub signals: Vec<SignalDecl>,
  pub trailing: Vec<String>,
  pub doc: Option<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TraitMethod {
  pub name: String,
  pub params: Vec<Param>,
  pub return_type: Option<Type>,
  pub leading: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumDecl {
  pub name: String,
  pub variants: Vec<EnumVariant>,
  pub trailing: Vec<String>,
  pub doc: Option<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumVariant {
  pub name: String,
  pub value_types: Vec<Type>,
  /// Parallel to `value_types`. Empty string when the field is positional-only.
  pub field_names: Vec<String>,
  pub leading: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Import {
  pub path: Vec<String>,
  pub alias: Option<String>,
  /// `true` for `from module import item`, `false` for `import module.path`
  pub is_from: bool,
  pub span: crate::Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FnDecl {
  pub name: String,
  pub params: Vec<Param>,
  pub return_type: Option<Type>,
  pub body: Block,
  pub is_test: bool,
  pub is_ufcs: bool,
  pub doc: Option<String>,
  pub leading: Vec<String>,
  pub is_pub: bool,
}

/// Parameters after an explicit `self`. Class / trait methods may omit `self`;
/// the receiver is still bound as `self` when the method is called.
pub fn params_after_self(params: &[Param]) -> &[Param] {
  if params.first().is_some_and(|p| p.name == "self") {
    &params[1..]
  } else {
    params
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SignalDecl {
  pub name: String,
  pub params: Vec<Param>,
  pub span: crate::Span,
  pub doc: Option<String>,
  pub leading: Vec<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Param {
  pub name: String,
  pub ty: Type,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Type {
  pub name: String,
  pub args: Vec<Type>,
  pub optional: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VarDecl {
  pub name: String,
  pub ty: Type,
  pub value: Option<Expr>,
  pub exported: bool,
  pub export_group: Option<String>,
  pub doc: Option<String>,
  pub leading: Vec<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConstDecl {
  pub name: String,
  pub ty: Option<Type>,
  pub value: Expr,
  pub doc: Option<String>,
  pub is_pub: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Block {
  pub stmts: Vec<Stmt>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Stmt {
  pub kind: StmtKind,
  pub span: crate::Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StmtKind {
  Expr(Expr),
  Return(Option<Expr>),
  If { cond: Expr, then_block: Block, elif_blocks: Vec<(Expr, Block)>, else_block: Option<Block> },
  While { cond: Expr, body: Block },
  For { name: String, iter: Expr, body: Block },
  VarDecl(VarDecl),
  ConstDecl(ConstDecl),
  Break,
  Continue,
  Pass,
  Comment(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Expr {
  pub kind: ExprKind,
  pub span: crate::Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExprKind {
  Literal(Literal),
  Ident(String),
  Binary { op: BinOp, left: Box<Expr>, right: Box<Expr> },
  Unary { op: UnaryOp, expr: Box<Expr> },
  Call { callee: Box<Expr>, args: Vec<Expr> },
  Member { object: Box<Expr>, name: String },
  Index { object: Box<Expr>, index: Box<Expr> },
  StructLiteral { name: String, fields: Vec<(String, Expr)> },
  Assign { op: AssignOp, left: Box<Expr>, right: Box<Expr> },
  FString(Vec<FStringPart>),
  Range { start: Box<Expr>, end: Box<Expr>, inclusive: bool },
  Match { expr: Box<Expr>, arms: Vec<MatchArm> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct MatchArm {
  pub pattern: Pattern,
  pub body: Block,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Pattern {
  Wildcard,
  Variant {
    name: String,
    binds: Vec<String>,
    field_binds: Vec<(String, String)>,
  },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Literal {
  Int(i64),
  Float(f64),
  String(String),
  Bool(bool),
  None,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FStringPart {
  Text(String),
  Expr { expr: Expr, format: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum BinOp {
  Add, Sub, Mul, Div, IDiv, Mod,
  Eq, Neq, Lt, Lte, Gt, Gte,
  And, Or,
  BitAnd, BitOr, BitXor, Shl, Shr,
}

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum UnaryOp { Neg, Not, BitNot }

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum AssignOp { Assign, Add, Sub, Mul, Div, Mod, BitAnd, BitOr, BitXor }

use crate::lexer::{Token, TokenKind};

pub struct Parser {
  tokens: Vec<Token>,
  pos: usize,
  /// Sticky `@export_group("…")` for following `@export var`s.
  export_group: Option<String>,
}

impl Parser {
  pub fn new(tokens: Vec<Token>) -> Self {
    Self {
      tokens,
      pos: 0,
      export_group: None,
    }
  }

  fn peek(&self) -> &TokenKind {
    &self.tokens[self.pos].kind
  }

  fn at(&self, kind: TokenKind) -> bool {
    std::mem::discriminant(self.peek()) == std::mem::discriminant(&kind)
  }

  fn advance(&mut self) -> Token {
    let t = self.tokens[self.pos].clone();
    if !self.at(TokenKind::Eof) {
      self.pos += 1;
    }
    t
  }

  fn expect(&mut self, kind: TokenKind, msg: &str) -> Result<Token, String> {
    if self.at(kind.clone()) {
      Ok(self.advance())
    } else {
      let t = &self.tokens[self.pos];
      Err(format!("{} at {}:{} (got {:?})", msg, t.span.line, t.span.col, t.kind))
    }
  }

  fn consume(&mut self, kind: TokenKind) -> bool {
    if self.at(kind) {
      self.advance();
      true
    } else {
      false
    }
  }

  fn at_ident(&self) -> bool {
    matches!(self.peek(), TokenKind::Ident(_))
  }

  fn peek_kind_at(&self, offset: usize) -> Option<&TokenKind> {
    self.tokens.get(self.pos + offset).map(|t| &t.kind)
  }

  fn span(&self) -> crate::Span {
    self.tokens[self.pos].span
  }

  fn expr(kind: ExprKind, span: crate::Span) -> Expr {
    Expr { kind, span }
  }

  fn stmt(kind: StmtKind, span: crate::Span) -> Stmt {
    Stmt { kind, span }
  }

  fn ident_from(&mut self, token: Token) -> Result<String, String> {
    match token.kind {
      TokenKind::Ident(s) | TokenKind::StringLit(s) | TokenKind::FStringLit(s) => Ok(s),
      _ => Err(format!("expected identifier, got {:?}", token.kind)),
    }
  }

  fn skip_docs(&mut self) {
    while matches!(self.peek(), TokenKind::DocComment(_)) {
      self.advance();
    }
  }

  fn take_line_comments(&mut self) -> Vec<String> {
    let mut out = Vec::new();
    while let TokenKind::Comment(text) = self.peek() {
      out.push(text.clone());
      self.advance();
    }
    out
  }

  /// True when only `##` lines remain before `closer` (`}` or EOF).
  fn only_docs_before(&self, closer: TokenKind) -> bool {
    let closer_d = std::mem::discriminant(&closer);
    for t in &self.tokens[self.pos..] {
      match &t.kind {
        TokenKind::DocComment(_) => continue,
        k if std::mem::discriminant(k) == closer_d => return true,
        _ => return false,
      }
    }
    false
  }

  pub fn parse(&mut self) -> Result<Vec<Item>, String> {
    let mut items = Vec::new();
    while !self.at(TokenKind::Eof) {
      if self.only_docs_before(TokenKind::Eof) {
        self.skip_docs();
        break;
      }
      items.push(self.parse_item(false)?);
    }
    Ok(items)
  }

  fn parse_item(&mut self, _in_mod: bool) -> Result<Item, String> {
    if let TokenKind::Comment(text) = self.peek() {
      let text = text.clone();
      self.advance();
      return Ok(Item::Comment(text));
    }
    let mut is_test = false;
    let mut is_ufcs = false;
    let mut is_node = false;
    let mut exported = false;
    let mut is_pub = false;
    let mut doc_lines = Vec::new();
    loop {
      match self.peek() {
        TokenKind::DocComment(text) => {
          doc_lines.push(text.clone());
          self.advance();
        }
        TokenKind::Comment(_) => {
          self.advance();
        }
        TokenKind::At => {
          self.advance();
          let attr = self.expect_ident("expected attribute name after '@'")?;
          let arg = self.parse_attr_arg();
          match attr.as_str() {
            "test" => is_test = true,
            "ufcs" => is_ufcs = true,
            "node" => is_node = true,
            "export" => exported = true,
            "export_group" => {
              self.export_group = arg.filter(|s| !s.is_empty());
            }
            _ => {}
          }
        }
        TokenKind::Pub => {
          is_pub = true;
          self.advance();
        }
        _ => break,
      }
    }
    let doc = if doc_lines.is_empty() {
      None
    } else {
      Some(doc_lines.join("\n"))
    };
    match self.peek() {
      TokenKind::Import | TokenKind::From => Ok(Item::Import(self.parse_import()?)),
      TokenKind::Fn => {
        let mut decl = self.parse_fn_decl()?;
        decl.is_test = is_test;
        decl.is_ufcs = is_ufcs;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::FnDecl(decl))
      }
      TokenKind::Var => {
        let mut decl = self.parse_var_decl()?;
        decl.exported = exported;
        decl.export_group = if exported {
          self.export_group.clone()
        } else {
          None
        };
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::VarDecl(decl))
      }
      TokenKind::Const => {
        let mut decl = self.parse_const_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::ConstDecl(decl))
      }
      TokenKind::Struct => {
        let mut decl = self.parse_struct_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::StructDecl(decl))
      }
      TokenKind::Class => {
        let mut decl = self.parse_class_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        decl.is_node = is_node;
        Ok(Item::ClassDecl(decl))
      }
      TokenKind::Trait => {
        let mut decl = self.parse_trait_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::TraitDecl(decl))
      }
      TokenKind::Enum => {
        let mut decl = self.parse_enum_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::EnumDecl(decl))
      }
      TokenKind::Impl => Ok(self.parse_impl_decl()?),
      TokenKind::Mod => {
        let mut decl = self.parse_mod_decl()?;
        decl.doc = doc;
        Ok(Item::Mod(decl))
      }
      TokenKind::Signal => {
        let mut decl = self.parse_signal_decl()?;
        decl.doc = doc;
        decl.is_pub = is_pub;
        Ok(Item::SignalDecl(decl))
      }
      _ => {
        let t = &self.tokens[self.pos];
        Err(format!("expected top-level item at {}:{}", t.span.line, t.span.col))
      }
    }
  }

  /// `@name` or `@name("arg")`. Returns the string argument when present.
  fn parse_attr_arg(&mut self) -> Option<String> {
    if !self.consume(TokenKind::LParen) {
      return None;
    }
    let mut arg = None;
    let mut depth = 1;
    while depth > 0 && !self.at(TokenKind::Eof) {
      if self.at(TokenKind::LParen) {
        depth += 1;
        self.advance();
        continue;
      }
      if self.at(TokenKind::RParen) {
        depth -= 1;
        self.advance();
        continue;
      }
      if arg.is_none() {
        if let TokenKind::StringLit(s) = self.peek() {
          arg = Some(s.clone());
        }
      }
      self.advance();
    }
    arg
  }

  fn parse_mod_decl(&mut self) -> Result<ModDecl, String> {
    self.advance(); // mod
    let span = self.tokens.get(self.pos).map(|t| t.span).unwrap_or_default();
    let name = self.expect_ident("expected module name after mod")?;
    self.expect(TokenKind::LBrace, "expected '{' after module name")?;
    let mut items = Vec::new();
    while !self.at(TokenKind::RBrace) && !self.at(TokenKind::Eof) {
      if self.only_docs_before(TokenKind::RBrace) {
        self.skip_docs();
        break;
      }
      items.push(self.parse_item(true)?);
    }
    self.expect(TokenKind::RBrace, "expected '}' after module body")?;
    Ok(ModDecl { name, items, span, doc: None })
  }

  fn parse_impl_decl(&mut self) -> Result<Item, String> {
    let span = self.span();
    self.advance(); // impl
    let first = self.expect_ident("expected type or trait name after impl")?;
    let (trait_name, type_name) = if self.consume(TokenKind::For) {
      let ty = self.expect_ident("expected type name after 'impl Trait for'")?;
      (Some(first), ty)
    } else {
      (None, first)
    };
    self.expect(TokenKind::LBrace, "expected '{' after impl type name")?;
    let (methods, trailing) = self.parse_impl_methods()?;
    Ok(Item::ImplDecl {
      type_name,
      trait_name,
      methods,
      trailing,
      span,
    })
  }

  fn parse_impl_methods(&mut self) -> Result<(Vec<FnDecl>, Vec<String>), String> {
    let mut methods = Vec::new();
    loop {
      let leading = self.take_line_comments();
      if self.at(TokenKind::RBrace) || self.at(TokenKind::Eof) {
        self.expect(TokenKind::RBrace, "expected '}' after impl body")?;
        return Ok((methods, leading));
      }
      if self.only_docs_before(TokenKind::RBrace) {
        self.skip_docs();
        self.expect(TokenKind::RBrace, "expected '}' after impl body")?;
        return Ok((methods, leading));
      }
      let mut is_test = false;
      let mut doc_lines = Vec::new();
      loop {
        match self.peek() {
          TokenKind::DocComment(text) => {
            doc_lines.push(text.clone());
            self.advance();
          }
          TokenKind::At => {
            self.advance();
            let attr = self.expect_ident("expected attribute name after '@'")?;
            let _ = self.parse_attr_arg();
            if attr == "test" {
              is_test = true;
            }
          }
          TokenKind::Pub => {
            self.advance();
          }
          _ => break,
        }
      }
      if !self.at(TokenKind::Fn) {
        let t = &self.tokens[self.pos];
        return Err(format!(
          "expected fn in impl body at {}:{}",
          t.span.line, t.span.col
        ));
      }
      let mut decl = self.parse_fn_decl()?;
      decl.is_test = is_test;
      decl.leading = leading;
      decl.doc = if doc_lines.is_empty() {
        None
      } else {
        Some(doc_lines.join("\n"))
      };
      methods.push(decl);
    }
  }

  fn parse_struct_decl(&mut self) -> Result<StructDecl, String> {
    self.advance(); // struct
    let name = self.expect_ident("expected struct name")?;
    self.expect(TokenKind::LBrace, "expected '{' before struct fields")?;
    let mut fields = Vec::new();
    loop {
      let leading = self.take_line_comments();
      self.skip_docs();
      if self.at(TokenKind::RBrace) || self.at(TokenKind::Eof) {
        self.expect(TokenKind::RBrace, "expected '}' after struct fields")?;
        return Ok(StructDecl {
          name,
          fields,
          trailing: leading,
          doc: None,
          is_pub: false,
        });
      }
      let field_name = self.expect_ident("expected field name")?;
      self.expect(TokenKind::Colon, "expected ':' after field name")?;
      let ty = self.parse_type()?;
      fields.push(FieldDecl {
        name: field_name,
        ty,
        leading,
      });
      if !self.consume(TokenKind::Comma) {
        let trailing = self.take_line_comments();
        self.expect(TokenKind::RBrace, "expected '}' after struct fields")?;
        return Ok(StructDecl {
          name,
          fields,
          trailing,
          doc: None,
          is_pub: false,
        });
      }
    }
  }

  fn parse_class_decl(&mut self) -> Result<ClassDecl, String> {
    let span = self.span();
    self.advance(); // class
    let name = self.expect_ident("expected class name")?;
    let parent = if self.consume(TokenKind::Extends) {
      Some(self.expect_ident("expected parent class name after extends")?)
    } else {
      None
    };
    let mut impl_traits = Vec::new();
    if self.consume(TokenKind::Impl) {
      loop {
        impl_traits.push(self.expect_ident("expected trait name after impl")?);
        if !self.consume(TokenKind::Comma) {
          break;
        }
      }
      if impl_traits.is_empty() {
        let t = &self.tokens[self.pos];
        return Err(format!(
          "expected trait name after impl at {}:{}",
          t.span.line, t.span.col
        ));
      }
    }
    self.expect(TokenKind::LBrace, "expected '{' before class body")?;
    let mut fields = Vec::new();
    let mut defaults = Vec::new();
    let mut methods = Vec::new();
    let mut trait_impls = Vec::new();
    let mut exported_fields = Vec::new();
    loop {
      let leading = self.take_line_comments();
      if self.at(TokenKind::RBrace) || self.at(TokenKind::Eof) {
        self.expect(TokenKind::RBrace, "expected '}' after class body")?;
        return Ok(ClassDecl {
          name,
          parent,
          fields,
          defaults,
          methods,
          impl_traits,
          trait_impls,
          trailing: leading,
          doc: None,
          span,
          is_pub: false,
          is_node: false,
          exported_fields,
        });
      }
      if self.only_docs_before(TokenKind::RBrace) {
        self.skip_docs();
        self.expect(TokenKind::RBrace, "expected '}' after class body")?;
        return Ok(ClassDecl {
          name,
          parent,
          fields,
          defaults,
          methods,
          impl_traits,
          trait_impls,
          trailing: leading,
          doc: None,
          span,
          is_pub: false,
          is_node: false,
          exported_fields,
        });
      }
      let mut doc_lines = Vec::new();
      let mut exported = false;
      loop {
        match self.peek() {
          TokenKind::DocComment(text) => {
            doc_lines.push(text.clone());
            self.advance();
          }
          TokenKind::Pub => {
            self.advance();
          }
          TokenKind::At => {
            self.advance();
            let attr = self.expect_ident("expected attribute name after '@'")?;
            let arg = self.parse_attr_arg();
            match attr.as_str() {
              "export" => exported = true,
              "export_group" => {
                self.export_group = arg.filter(|s| !s.is_empty());
              }
              _ => {}
            }
          }
          _ => break,
        }
      }
      let doc = if doc_lines.is_empty() {
        None
      } else {
        Some(doc_lines.join("\n"))
      };
      match self.peek() {
        TokenKind::Var => {
          let mut decl = self.parse_var_decl()?;
          decl.doc = doc;
          decl.leading = leading.clone();
          decl.exported = exported;
          decl.export_group = if exported {
            self.export_group.clone()
          } else {
            None
          };
          if exported {
            exported_fields.push(decl.clone());
          }
          if let Some(value) = &decl.value {
            defaults.push((decl.name.clone(), value.clone()));
          }
          fields.push(FieldDecl {
            name: decl.name,
            ty: decl.ty,
            leading,
          });
        }
        TokenKind::Fn => {
          let mut decl = self.parse_fn_decl()?;
          decl.doc = doc;
          decl.leading = leading;
          methods.push(decl);
        }
        TokenKind::Impl => {
          self.advance();
          let trait_name = self.expect_ident("expected trait name after impl")?;
          if self.consume(TokenKind::For) {
            let t = &self.tokens[self.pos];
            return Err(format!(
              "impl inside a class is `impl Trait {{ … }}` (no `for`) at {}:{}",
              t.span.line, t.span.col
            ));
          }
          self.expect(TokenKind::LBrace, "expected '{' after trait name")?;
          let (impl_methods, trailing) = self.parse_impl_methods()?;
          trait_impls.push(NestedImpl {
            trait_name,
            methods: impl_methods,
            leading,
            trailing,
          });
        }
        TokenKind::Const => {
          let t = &self.tokens[self.pos];
          return Err(format!(
            "class const is not v1 at {}:{} (use a module-level const)",
            t.span.line, t.span.col
          ));
        }
        _ => {
          let t = &self.tokens[self.pos];
          return Err(format!(
            "expected var, fn, or impl in class body at {}:{}",
            t.span.line, t.span.col
          ));
        }
      }
    }
  }

  fn parse_trait_decl(&mut self) -> Result<TraitDecl, String> {
    self.advance(); // trait
    let name = self.expect_ident("expected trait name")?;
    self.expect(TokenKind::LBrace, "expected '{' before trait body")?;
    let mut methods = Vec::new();
    let mut signals = Vec::new();
    loop {
      let leading = self.take_line_comments();
      if self.at(TokenKind::RBrace) || self.at(TokenKind::Eof) {
        self.expect(TokenKind::RBrace, "expected '}' after trait body")?;
        return Ok(TraitDecl {
          name,
          methods,
          signals,
          trailing: leading,
          doc: None,
          is_pub: false,
        });
      }
      if self.only_docs_before(TokenKind::RBrace) {
        self.skip_docs();
        self.expect(TokenKind::RBrace, "expected '}' after trait body")?;
        return Ok(TraitDecl {
          name,
          methods,
          signals,
          trailing: leading,
          doc: None,
          is_pub: false,
        });
      }
      self.skip_docs();
      let _ = self.consume(TokenKind::Pub);
      if self.at(TokenKind::Signal) {
        let mut sig = self.parse_signal_decl()?;
        sig.leading = leading;
        signals.push(sig);
        continue;
      }
      if self.at(TokenKind::Fn) {
        let mut method = self.parse_fn_signature()?;
        method.leading = leading;
        methods.push(method);
        continue;
      }
      let t = &self.tokens[self.pos];
      if self.at(TokenKind::Var) || self.at(TokenKind::Const) {
        return Err(format!(
          "traits cannot declare vars or consts at {}:{}",
          t.span.line, t.span.col
        ));
      }
      return Err(format!(
        "expected fn signature or signal in trait at {}:{}",
        t.span.line, t.span.col
      ));
    }
  }

  fn parse_fn_signature(&mut self) -> Result<TraitMethod, String> {
    self.advance(); // fn
    let name = self.expect_ident("expected function name")?;
    self.expect(TokenKind::LParen, "expected '(' after function name")?;
    let params = self.parse_params()?;
    self.expect(TokenKind::RParen, "expected ')' after parameters")?;
    let return_type = self.parse_return_type()?;
    self.expect(TokenKind::Semicolon, "expected ';' after trait method (signatures only)")?;
    Ok(TraitMethod {
      name,
      params,
      return_type,
      leading: Vec::new(),
    })
  }

  fn parse_enum_decl(&mut self) -> Result<EnumDecl, String> {
    self.advance(); // enum
    let name = self.expect_ident("expected enum name")?;
    // Optional type parameters: Result<T, E> — ignored by the runtime
    if self.consume(TokenKind::Lt) {
      let mut depth = 1;
      while depth > 0 && !self.at(TokenKind::Eof) {
        if self.at(TokenKind::Lt) {
          depth += 1;
        } else if self.at(TokenKind::Gt) {
          depth -= 1;
        }
        self.advance();
      }
    }
    self.expect(TokenKind::LBrace, "expected '{' before enum variants")?;
    let mut variants = Vec::new();
    loop {
      let leading = self.take_line_comments();
      self.skip_docs();
      if self.at(TokenKind::RBrace) || self.at(TokenKind::Eof) {
        self.expect(TokenKind::RBrace, "expected '}' after enum variants")?;
        return Ok(EnumDecl {
          name,
          variants,
          trailing: leading,
          doc: None,
          is_pub: false,
        });
      }
      let _ = self.consume(TokenKind::Pub);
      if self.at(TokenKind::Fn) {
        let _ = self.parse_fn_decl()?;
        let _ = self.consume(TokenKind::Comma);
        continue;
      }
      let variant_name = self.expect_ident("expected variant name")?;
      let mut value_types = Vec::new();
      let mut field_names = Vec::new();
      if self.consume(TokenKind::LParen) {
        if !self.at(TokenKind::RParen) {
          loop {
            if self.at_ident()
              && matches!(self.peek_kind_at(1), Some(TokenKind::Colon))
            {
              field_names.push(self.expect_ident("expected field name")?);
              self.expect(TokenKind::Colon, "expected ':' after field name")?;
            } else {
              field_names.push(String::new());
            }
            value_types.push(self.parse_type()?);
            if !self.consume(TokenKind::Comma) || self.at(TokenKind::RParen) {
              break;
            }
          }
        }
        self.expect(TokenKind::RParen, "expected ')' after variant types")?;
      }
      variants.push(EnumVariant {
        name: variant_name,
        value_types,
        field_names,
        leading,
      });
      if !self.consume(TokenKind::Comma) {
        let trailing = self.take_line_comments();
        self.expect(TokenKind::RBrace, "expected '}' after enum variants")?;
        return Ok(EnumDecl {
          name,
          variants,
          trailing,
          doc: None,
          is_pub: false,
        });
      }
    }
  }

  fn parse_import(&mut self) -> Result<Import, String> {
    let span = self.span();
    if self.consume(TokenKind::From) {
      let module = self.expect_ident("expected module name")?;
      self.expect(TokenKind::Import, "expected 'import' after module name")?;
      let item = self.expect_ident("expected imported name")?;
      let mut path = vec![module, item];
      while self.consume(TokenKind::Dot) {
        path.push(self.expect_ident("expected name after '.'")?);
      }
      let alias = if self.consume(TokenKind::As) {
        Some(self.expect_ident("expected alias")?)
      } else {
        None
      };
      self.expect(TokenKind::Semicolon, "expected ';' after import")?;
      return Ok(Import { path, alias, is_from: true, span });
    }
    self.advance(); // import
    let first = self.expect_ident("expected module name")?;
    let mut path = vec![first];
    while self.consume(TokenKind::Dot) {
      path.push(self.expect_ident("expected module name after '.'")?);
    }
    let alias = if self.consume(TokenKind::As) {
      Some(self.expect_ident("expected alias")?)
    } else {
      None
    };
    self.expect(TokenKind::Semicolon, "expected ';' after import")?;
    Ok(Import { path, alias, is_from: false, span })
  }

  fn parse_signal_decl(&mut self) -> Result<SignalDecl, String> {
    let span = self.span();
    self.advance(); // signal
    let name = self.expect_ident("expected signal name")?;
    self.expect(TokenKind::LParen, "expected '(' after signal name")?;
    let params = self.parse_params()?;
    self.expect(TokenKind::RParen, "expected ')' after signal parameters")?;
    self.expect(TokenKind::Semicolon, "expected ';' after signal declaration")?;
    Ok(SignalDecl {
      name,
      params,
      span,
      doc: None,
      leading: Vec::new(),
      is_pub: false,
    })
  }

  fn parse_fn_decl(&mut self) -> Result<FnDecl, String> {
    self.advance(); // fn
    let name = self.expect_ident("expected function name")?;
    self.expect(TokenKind::LParen, "expected '(' after function name")?;
    let params = self.parse_params()?;
    self.expect(TokenKind::RParen, "expected ')' after parameters")?;
    let return_type = self.parse_return_type()?;
    let body = self.parse_block()?;
    Ok(FnDecl {
      name,
      params,
      return_type,
      body,
      is_test: false,
      is_ufcs: false,
      doc: None,
      leading: Vec::new(),
      is_pub: false,
    })
  }

  fn parse_return_type(&mut self) -> Result<Option<Type>, String> {
    if self.consume(TokenKind::Colon) || self.consume(TokenKind::Arrow) {
      Ok(Some(self.parse_type()?))
    } else {
      Ok(None)
    }
  }

  fn parse_params(&mut self) -> Result<Vec<Param>, String> {
    let mut params = Vec::new();
    if self.at(TokenKind::RParen) {
      return Ok(params);
    }
    loop {
      if self.consume(TokenKind::Self_) {
        let ty = if self.consume(TokenKind::Colon) {
          self.parse_type()?
        } else {
          Type { name: "Self".to_string(), args: Vec::new(), optional: false }
        };
        params.push(Param { name: "self".to_string(), ty });
      } else {
        let name = self.expect_ident("expected parameter name")?;
        self.expect(TokenKind::Colon, "expected ':' after parameter name")?;
        let ty = self.parse_type()?;
        params.push(Param { name, ty });
      }
      if !self.consume(TokenKind::Comma) {
        break;
      }
    }
    Ok(params)
  }

  fn parse_type(&mut self) -> Result<Type, String> {
    let name = self.expect_type_name()?;
    let mut args = Vec::new();
    if self.consume(TokenKind::Lt) {
      loop {
        args.push(self.parse_type()?);
        if !self.consume(TokenKind::Comma) {
          break;
        }
      }
      self.expect(TokenKind::Gt, "expected '>' after type arguments")?;
    }
    let optional = self.consume(TokenKind::Question);
    Ok(Type { name, args, optional })
  }

  fn parse_var_decl(&mut self) -> Result<VarDecl, String> {
    self.advance(); // var
    let name = self.expect_ident("expected variable name")?;
    let ty = if self.consume(TokenKind::Colon) {
      self.parse_type()?
    } else {
      Type { name: "None".to_string(), args: Vec::new(), optional: false }
    };
    let value = if self.consume(TokenKind::Assign) {
      Some(self.parse_expr()?)
    } else {
      None
    };
    self.expect(TokenKind::Semicolon, "expected ';' after variable declaration")?;
    Ok(VarDecl {
      name,
      ty,
      value,
      exported: false,
      export_group: None,
      doc: None,
      leading: Vec::new(),
      is_pub: false,
    })
  }

  fn parse_const_decl(&mut self) -> Result<ConstDecl, String> {
    self.advance(); // const
    let name = self.expect_ident("expected constant name")?;
    let ty = if self.consume(TokenKind::Colon) {
      Some(self.parse_type()?)
    } else {
      None
    };
    self.expect(TokenKind::Assign, "expected '=' after constant name")?;
    let value = self.parse_expr()?;
    self.expect(TokenKind::Semicolon, "expected ';' after constant declaration")?;
    Ok(ConstDecl {
      name,
      ty,
      value,
      doc: None,
      is_pub: false,
    })
  }

  fn parse_block(&mut self) -> Result<Block, String> {
    self.expect(TokenKind::LBrace, "expected '{'")?;
    let mut stmts = Vec::new();
    while !self.at(TokenKind::RBrace) && !self.at(TokenKind::Eof) {
      if self.only_docs_before(TokenKind::RBrace) {
        self.skip_docs();
        break;
      }
      stmts.push(self.parse_stmt()?);
    }
    self.expect(TokenKind::RBrace, "expected '}'")?;
    Ok(Block { stmts })
  }

  fn parse_stmt(&mut self) -> Result<Stmt, String> {
    if let TokenKind::Comment(text) = self.peek() {
      let span = self.span();
      let text = text.clone();
      self.advance();
      return Ok(Self::stmt(StmtKind::Comment(text), span));
    }
    self.skip_docs();
    let span = self.span();
    match self.peek() {
      TokenKind::If => self.parse_if(),
      TokenKind::While => self.parse_while(),
      TokenKind::For => self.parse_for(),
      TokenKind::Return => self.parse_return(),
      TokenKind::Var => Ok(Self::stmt(StmtKind::VarDecl(self.parse_var_decl()?), span)),
      TokenKind::Const => Ok(Self::stmt(StmtKind::ConstDecl(self.parse_const_decl()?), span)),
      TokenKind::Break => { self.advance(); self.expect(TokenKind::Semicolon, "expected ';' after break")?; Ok(Self::stmt(StmtKind::Break, span)) }
      TokenKind::Continue => { self.advance(); self.expect(TokenKind::Semicolon, "expected ';' after continue")?; Ok(Self::stmt(StmtKind::Continue, span)) }
      TokenKind::Pass => { self.advance(); self.expect(TokenKind::Semicolon, "expected ';' after pass")?; Ok(Self::stmt(StmtKind::Pass, span)) }
      _ => {
        let expr = self.parse_expr()?;
        let is_block_expr = matches!(expr.kind, ExprKind::Match { .. });
        if is_block_expr {
          self.consume(TokenKind::Semicolon); // optional
        } else {
          self.expect(TokenKind::Semicolon, "expected ';' after expression")?;
        }
        Ok(Self::stmt(StmtKind::Expr(expr), span))
      }
    }
  }

  fn parse_if(&mut self) -> Result<Stmt, String> {
    let span = self.span();
    self.advance(); // if
    let cond = self.parse_expr()?;
    let then_block = self.parse_block()?;
    let mut elif_blocks = Vec::new();
    let mut else_block = None;
    while self.consume(TokenKind::Elif) {
      let elif_cond = self.parse_expr()?;
      let elif_block = self.parse_block()?;
      elif_blocks.push((elif_cond, elif_block));
    }
    if self.consume(TokenKind::Else) {
      else_block = Some(self.parse_block()?);
    }
    Ok(Self::stmt(StmtKind::If { cond, then_block, elif_blocks, else_block }, span))
  }

  fn parse_while(&mut self) -> Result<Stmt, String> {
    let span = self.span();
    self.advance(); // while
    let cond = self.parse_expr()?;
    let body = self.parse_block()?;
    Ok(Self::stmt(StmtKind::While { cond, body }, span))
  }

  fn parse_for(&mut self) -> Result<Stmt, String> {
    let span = self.span();
    self.advance(); // for
    let name = self.expect_ident("expected loop variable")?;
    self.expect(TokenKind::In, "expected 'in' after loop variable")?;
    let iter = self.parse_expr()?;
    let body = self.parse_block()?;
    Ok(Self::stmt(StmtKind::For { name, iter, body }, span))
  }

  fn parse_return(&mut self) -> Result<Stmt, String> {
    let span = self.span();
    self.advance(); // return
    let value = if self.at(TokenKind::Semicolon) {
      None
    } else {
      Some(self.parse_expr()?)
    };
    self.expect(TokenKind::Semicolon, "expected ';' after return")?;
    Ok(Self::stmt(StmtKind::Return(value), span))
  }

  fn expect_ident(&mut self, msg: &str) -> Result<String, String> {
    let t = self.advance();
    self.ident_from(t.clone()).map_err(|_| {
      let err = format!("{} at {}:{} (got {:?})", msg, t.span.line, t.span.col, t.kind);
      err
    })
  }

  fn expect_type_name(&mut self) -> Result<String, String> {
    let t = self.advance();
    match &t.kind {
      TokenKind::Ident(s) if s == "Str" => Ok("String".to_string()),
      TokenKind::Ident(s) => Ok(s.clone()),
      TokenKind::Int => Ok("Int".to_string()),
      TokenKind::Float => Ok("Float".to_string()),
      TokenKind::StringType => Ok("String".to_string()),
      TokenKind::Bool => Ok("Bool".to_string()),
      TokenKind::Void => Ok("Void".to_string()),
      TokenKind::Array => Ok("Array".to_string()),
      TokenKind::Map => Ok("Map".to_string()),
      _ => Err(format!("expected type name at {}:{} (got {:?})", t.span.line, t.span.col, t.kind)),
    }
  }

  pub fn parse_expr(&mut self) -> Result<Expr, String> {
    self.parse_assign()
  }

  fn parse_range(&mut self) -> Result<Expr, String> {
    let start = self.parse_or()?;
    let span = start.span;
    if self.consume(TokenKind::Range) {
      let end = self.parse_or()?;
      return Ok(Self::expr(ExprKind::Range { start: Box::new(start), end: Box::new(end), inclusive: false }, span));
    }
    if self.consume(TokenKind::RangeInclusive) {
      let end = self.parse_or()?;
      return Ok(Self::expr(ExprKind::Range { start: Box::new(start), end: Box::new(end), inclusive: true }, span));
    }
    Ok(start)
  }

  fn parse_assign_op(&mut self) -> Option<AssignOp> {
    if self.consume(TokenKind::Assign) {
      Some(AssignOp::Assign)
    } else if self.consume(TokenKind::PlusAssign) {
      Some(AssignOp::Add)
    } else if self.consume(TokenKind::MinusAssign) {
      Some(AssignOp::Sub)
    } else if self.consume(TokenKind::StarAssign) {
      Some(AssignOp::Mul)
    } else if self.consume(TokenKind::SlashAssign) {
      Some(AssignOp::Div)
    } else if self.consume(TokenKind::PercentAssign) {
      Some(AssignOp::Mod)
    } else if self.consume(TokenKind::AmpAssign) {
      Some(AssignOp::BitAnd)
    } else if self.consume(TokenKind::PipeAssign) {
      Some(AssignOp::BitOr)
    } else if self.consume(TokenKind::CaretAssign) {
      Some(AssignOp::BitXor)
    } else {
      None
    }
  }

  fn parse_assign(&mut self) -> Result<Expr, String> {
    let left = self.parse_range()?;
    let span = left.span;
    if let Some(op) = self.parse_assign_op() {
      let right = self.parse_assign()?;
      return Ok(Self::expr(ExprKind::Assign {
        op,
        left: Box::new(left),
        right: Box::new(right),
      }, span));
    }
    Ok(left)
  }

  fn parse_or(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_and()?;
    while self.consume(TokenKind::OrOr) {
      let span = left.span;
      let right = self.parse_and()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::Or, left: Box::new(left), right: Box::new(right) }, span);
    }
    Ok(left)
  }

  fn parse_and(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_bitor()?;
    while self.consume(TokenKind::AndAnd) {
      let span = left.span;
      let right = self.parse_bitor()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::And, left: Box::new(left), right: Box::new(right) }, span);
    }
    Ok(left)
  }

  fn parse_bitor(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_bitxor()?;
    while self.consume(TokenKind::Pipe) {
      let span = left.span;
      let right = self.parse_bitxor()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::BitOr, left: Box::new(left), right: Box::new(right) }, span);
    }
    Ok(left)
  }

  fn parse_bitxor(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_bitand()?;
    while self.consume(TokenKind::Caret) {
      let span = left.span;
      let right = self.parse_bitand()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::BitXor, left: Box::new(left), right: Box::new(right) }, span);
    }
    Ok(left)
  }

  fn parse_bitand(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_equality()?;
    while self.consume(TokenKind::Amp) {
      let span = left.span;
      let right = self.parse_equality()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::BitAnd, left: Box::new(left), right: Box::new(right) }, span);
    }
    Ok(left)
  }

  fn parse_equality(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_compare()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::EqEq) {
        let right = self.parse_compare()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Eq, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::NotEq) {
        let right = self.parse_compare()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Neq, left: Box::new(left), right: Box::new(right) }, span);
      } else {
        break;
      }
    }
    Ok(left)
  }

  fn parse_compare(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_shift()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::Lt) {
        let right = self.parse_shift()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Lt, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::LtEq) {
        let right = self.parse_shift()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Lte, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Gt) {
        let right = self.parse_shift()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Gt, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::GtEq) {
        let right = self.parse_shift()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Gte, left: Box::new(left), right: Box::new(right) }, span);
      } else {
        break;
      }
    }
    Ok(left)
  }

  fn parse_shift(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_add()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::Shl) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Shl, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Shr) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Shr, left: Box::new(left), right: Box::new(right) }, span);
      } else {
        break;
      }
    }
    Ok(left)
  }

  fn parse_add(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_mul()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::Plus) {
        let right = self.parse_mul()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Add, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Minus) {
        let right = self.parse_mul()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Sub, left: Box::new(left), right: Box::new(right) }, span);
      } else {
        break;
      }
    }
    Ok(left)
  }

  fn parse_mul(&mut self) -> Result<Expr, String> {
    let mut left = self.parse_unary()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::Star) {
        let right = self.parse_unary()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Mul, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Slash) {
        let right = self.parse_unary()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Div, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::SlashSlash) {
        let right = self.parse_unary()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::IDiv, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Percent) {
        let right = self.parse_unary()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Mod, left: Box::new(left), right: Box::new(right) }, span);
      } else {
        break;
      }
    }
    Ok(left)
  }

  fn parse_unary(&mut self) -> Result<Expr, String> {
    let span = self.span();
    if self.consume(TokenKind::Minus) {
      let expr = self.parse_unary()?;
      return Ok(Self::expr(ExprKind::Unary { op: UnaryOp::Neg, expr: Box::new(expr) }, span));
    }
    if self.consume(TokenKind::Bang) {
      let expr = self.parse_unary()?;
      return Ok(Self::expr(ExprKind::Unary { op: UnaryOp::Not, expr: Box::new(expr) }, span));
    }
    if self.consume(TokenKind::Tilde) {
      let expr = self.parse_unary()?;
      return Ok(Self::expr(ExprKind::Unary { op: UnaryOp::BitNot, expr: Box::new(expr) }, span));
    }
    self.parse_postfix()
  }

  fn is_struct_literal_start(&self) -> bool {
    if !self.at(TokenKind::LBrace) {
      return false;
    }
    // Empty struct literal: Type {}
    if let Some(t) = self.tokens.get(self.pos + 1) {
      if t.kind == TokenKind::RBrace {
        return true;
      }
    }
    // Non-empty: Type { field: value, ... }
    if let Some(t1) = self.tokens.get(self.pos + 1) {
      if let TokenKind::Ident(_) = &t1.kind {
        if let Some(t2) = self.tokens.get(self.pos + 2) {
          if t2.kind == TokenKind::Colon {
            return true;
          }
        }
      }
    }
    false
  }

  fn parse_postfix(&mut self) -> Result<Expr, String> {
    let mut expr = self.parse_primary()?;
    loop {
      let span = expr.span;
      if self.consume(TokenKind::LParen) {
        let args = self.parse_args()?;
        self.expect(TokenKind::RParen, "expected ')' after arguments")?;
        expr = Self::expr(ExprKind::Call { callee: Box::new(expr), args }, span);
      } else if self.consume(TokenKind::Dot) {
        let name = self.expect_ident("expected member name after '.'")?;
        expr = Self::expr(ExprKind::Member { object: Box::new(expr), name }, span);
      } else if self.consume(TokenKind::LBracket) {
        let index = self.parse_expr()?;
        self.expect(TokenKind::RBracket, "expected ']' after index")?;
        expr = Self::expr(ExprKind::Index { object: Box::new(expr), index: Box::new(index) }, span);
      } else if self.is_struct_literal_start() {
        if let ExprKind::Ident(name) = &expr.kind {
          let name = name.clone();
          self.advance(); // {
          let mut fields = Vec::new();
          if !self.at(TokenKind::RBrace) {
            loop {
              let field_name = self.expect_ident("expected field name")?;
              self.expect(TokenKind::Colon, "expected ':' after field name")?;
              let value = self.parse_expr()?;
              fields.push((field_name, value));
              if !self.consume(TokenKind::Comma) || self.at(TokenKind::RBrace) {
                break;
              }
            }
          }
          self.expect(TokenKind::RBrace, "expected '}' after struct fields")?;
          expr = Self::expr(ExprKind::StructLiteral { name, fields }, span);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    Ok(expr)
  }

  fn parse_primary(&mut self) -> Result<Expr, String> {
    let t = self.advance();
    let span = t.span;
    match t.kind {
      TokenKind::IntLit(n) => Ok(Self::expr(ExprKind::Literal(Literal::Int(n)), span)),
      TokenKind::FloatLit(n) => Ok(Self::expr(ExprKind::Literal(Literal::Float(n)), span)),
      TokenKind::StringLit(s) => Ok(Self::expr(ExprKind::Literal(Literal::String(s)), span)),
      TokenKind::FStringLit(s) => {
        let parts = parse_fstring(&s)?;
        Ok(Self::expr(ExprKind::FString(parts), span))
      }
      TokenKind::True => Ok(Self::expr(ExprKind::Literal(Literal::Bool(true)), span)),
      TokenKind::False => Ok(Self::expr(ExprKind::Literal(Literal::Bool(false)), span)),
      TokenKind::None => Ok(Self::expr(ExprKind::Literal(Literal::None), span)),
      TokenKind::Self_ => Ok(Self::expr(ExprKind::Ident("self".to_string()), span)),
      TokenKind::Super => Ok(Self::expr(ExprKind::Ident("super".to_string()), span)),
      TokenKind::Ident(name) => Ok(Self::expr(ExprKind::Ident(name), span)),
      TokenKind::Array => Ok(Self::expr(ExprKind::Ident("Array".to_string()), span)),
      TokenKind::Map => Ok(Self::expr(ExprKind::Ident("Map".to_string()), span)),
      TokenKind::Int => Ok(Self::expr(ExprKind::Ident("Int".to_string()), span)),
      TokenKind::Float => Ok(Self::expr(ExprKind::Ident("Float".to_string()), span)),
      TokenKind::StringType => Ok(Self::expr(ExprKind::Ident("String".to_string()), span)),
      TokenKind::Bool => Ok(Self::expr(ExprKind::Ident("Bool".to_string()), span)),
      TokenKind::Void => Ok(Self::expr(ExprKind::Ident("Void".to_string()), span)),
      TokenKind::LParen => {
        let expr = self.parse_expr()?;
        self.expect(TokenKind::RParen, "expected ')' after expression")?;
        Ok(expr)
      }
      TokenKind::LBracket => {
        let mut elements = Vec::new();
        if !self.at(TokenKind::RBracket) {
          loop {
            elements.push(self.parse_expr()?);
            if !self.consume(TokenKind::Comma) {
              break;
            }
          }
        }
        self.expect(TokenKind::RBracket, "expected ']' after array literal")?;
        // Array literal represented as call to Array constructor
        Ok(Self::expr(ExprKind::Call { callee: Box::new(Self::expr(ExprKind::Ident("Array".to_string()), span)), args: elements }, span))
      }
      TokenKind::LBrace => {
        let mut entries = Vec::new();
        if !self.at(TokenKind::RBrace) {
          loop {
            let key = self.parse_expr()?;
            self.expect(TokenKind::Colon, "expected ':' after map key")?;
            let value = self.parse_expr()?;
            entries.push(key);
            entries.push(value);
            if !self.consume(TokenKind::Comma) {
              break;
            }
          }
        }
        self.expect(TokenKind::RBrace, "expected '}' after map literal")?;
        // Map literal represented as call to Map constructor with alternating key/value args
        Ok(Self::expr(ExprKind::Call { callee: Box::new(Self::expr(ExprKind::Ident("Map".to_string()), span)), args: entries }, span))
      }
      TokenKind::Match => {
        let expr = self.parse_expr()?;
        self.expect(TokenKind::LBrace, "expected '{' before match arms")?;
        let mut arms = Vec::new();
        while !self.at(TokenKind::RBrace) && !self.at(TokenKind::Eof) {
          let pattern = self.parse_pattern()?;
          let body = self.parse_block()?;
          arms.push(MatchArm { pattern, body });
        }
        self.expect(TokenKind::RBrace, "expected '}' after match arms")?;
        Ok(Self::expr(ExprKind::Match { expr: Box::new(expr), arms }, span))
      }
      _ => Err(format!("expected expression at {}:{} (got {:?})", t.span.line, t.span.col, t.kind)),
    }
  }

  fn parse_args(&mut self) -> Result<Vec<Expr>, String> {
    let mut args = Vec::new();
    if self.at(TokenKind::RParen) {
      return Ok(args);
    }
    loop {
      args.push(self.parse_expr()?);
      if !self.consume(TokenKind::Comma) {
        break;
      }
    }
    Ok(args)
  }

  fn parse_pattern(&mut self) -> Result<Pattern, String> {
    let mut name = self.expect_pattern_name()?;
    if name == "_" {
      return Ok(Pattern::Wildcard);
    }
    // Allow qualified patterns: Shape.Circle(radius)
    while self.consume(TokenKind::Dot) {
      name = self.expect_pattern_name()?;
    }
    if self.consume(TokenKind::LParen) {
      let mut binds = Vec::new();
      let mut field_binds = Vec::new();
      if !self.at(TokenKind::RParen) {
        loop {
          if self.at_ident() && matches!(self.peek_kind_at(1), Some(TokenKind::Colon)) {
            let field = self.expect_pattern_name()?;
            self.expect(TokenKind::Colon, "expected ':' after field name")?;
            let bind = self.expect_pattern_name()?;
            field_binds.push((field, bind));
          } else {
            let inner = self.expect_pattern_name()?;
            binds.push(inner);
          }
          if !self.consume(TokenKind::Comma) || self.at(TokenKind::RParen) {
            break;
          }
        }
      }
      self.expect(TokenKind::RParen, "expected ')' after pattern binding")?;
      return Ok(Pattern::Variant {
        name,
        binds,
        field_binds,
      });
    }
    Ok(Pattern::Variant {
      name,
      binds: Vec::new(),
      field_binds: Vec::new(),
    })
  }

  fn expect_pattern_name(&mut self) -> Result<String, String> {
    let t = self.advance();
    match t.kind {
      TokenKind::Ident(s) => Ok(s),
      TokenKind::None => Ok("None".to_string()),
      TokenKind::True => Ok("True".to_string()),
      TokenKind::False => Ok("False".to_string()),
      TokenKind::StringLit(s) => Ok(s),
      _ => Err(format!("expected pattern name at {}:{} (got {:?})", t.span.line, t.span.col, t.kind)),
    }
  }
}

fn find_format_delim(s: &str) -> Option<usize> {
  let mut depth = 0i32;
  let mut in_string = false;
  let mut string_char = '\0';
  let mut chars = s.chars().enumerate().peekable();
  while let Some((i, c)) = chars.next() {
    if in_string {
      if c == '\\' {
        chars.next();
      } else if c == string_char {
        in_string = false;
      }
    } else if c == '"' || c == '\'' {
      in_string = true;
      string_char = c;
    } else if c == '{' || c == '[' || c == '(' {
      depth += 1;
    } else if c == '}' || c == ']' || c == ')' {
      depth -= 1;
    } else if c == ':' && depth == 0 {
      return Some(i);
    }
  }
  None
}

pub fn parse_expr_from_str(source: &str) -> Result<Expr, String> {
  let mut lexer = crate::lexer::Lexer::new(source);
  let tokens = lexer.tokenize()?;
  let mut parser = Parser::new(tokens);
  parser.parse_expr()
}

pub fn parse_fstring(source: &str) -> Result<Vec<FStringPart>, String> {
  let mut parts = Vec::new();
  let mut text = String::new();
  let mut chars = source.char_indices().peekable();

  while let Some((i, c)) = chars.next() {
    if c == '{' {
      if chars.peek().map(|(_, c)| *c) == Some('{') {
        chars.next();
        text.push('{');
        continue;
      }
      if !text.is_empty() {
        parts.push(FStringPart::Text(text.clone()));
        text.clear();
      }
      // Find matching '}' respecting nested braces
      let expr_start = i + c.len_utf8();
      let mut depth = 1;
      let mut expr_end = expr_start;
      while let Some((j, c2)) = chars.next() {
        if c2 == '{' {
          depth += 1;
        } else if c2 == '}' {
          depth -= 1;
          if depth == 0 {
            expr_end = j;
            break;
          }
        }
      }
      if depth != 0 {
        return Err("unterminated f-string expression".to_string());
      }
      let expr_source = &source[expr_start..expr_end];
      if let Some(pos) = find_format_delim(expr_source) {
        let expr_str = &expr_source[..pos];
        let format_str = expr_source[pos + 1..].trim();
        let expr = parse_expr_from_str(expr_str)?;
        parts.push(FStringPart::Expr { expr, format: Some(format_str.to_string()) });
      } else {
        let expr = parse_expr_from_str(expr_source)?;
        parts.push(FStringPart::Expr { expr, format: None });
      }
    } else if c == '}' {
      if chars.peek().map(|(_, c)| *c) == Some('}') {
        chars.next();
        text.push('}');
        continue;
      }
      return Err("unescaped '}' in f-string".to_string());
    } else {
      text.push(c);
    }
  }

  if !text.is_empty() {
    parts.push(FStringPart::Text(text));
  }

  Ok(parts)
}

fn module_stem(name: &str) -> &str {
  name.strip_suffix(".rg").unwrap_or(name)
}

/// Items exported by `import name` — the matching `mod name { ... }` body if
/// present, otherwise top-level items (legacy filename modules).
pub fn module_items<'a>(program: &'a [Item], name: &str) -> Vec<&'a Item> {
  let stem = module_stem(name);
  let mut from_mod = Vec::new();
  for item in program {
    if let Item::Mod(m) = item {
      if m.name == stem || m.name == name {
        from_mod.extend(m.items.iter());
      }
    }
  }
  if !from_mod.is_empty() {
    return from_mod;
  }
  let wrapping: Vec<&ModDecl> = program
    .iter()
    .filter_map(|item| match item {
      Item::Mod(m) => Some(m),
      _ => None,
    })
    .collect();
    let has_other = program
      .iter()
      .any(|item| !matches!(item, Item::Mod(_) | Item::Import(_) | Item::Comment(_)));
  if wrapping.len() == 1 && !has_other {
    return wrapping[0].items.iter().collect();
  }
  program
    .iter()
    .filter(|item| !matches!(item, Item::Mod(_)))
    .collect()
}

/// True when `import name` uses a `mod name { ... }` body rather than the file stem.
pub fn module_body_from_mod(program: &[Item], name: &str) -> bool {
  let stem = module_stem(name);
  program.iter().any(|item| {
    matches!(item, Item::Mod(m) if m.name == stem || m.name == name)
  })
}

/// `pub` inside `mod { }` is required to export. Filename modules export everything.
pub fn item_is_exported(item: &Item, from_mod_block: bool) -> bool {
  if !from_mod_block {
    return true;
  }
  match item {
    Item::FnDecl(f) => f.is_pub,
    Item::StructDecl(s) => s.is_pub,
    Item::ClassDecl(c) => c.is_pub,
    Item::EnumDecl(e) => e.is_pub,
    Item::TraitDecl(t) => t.is_pub,
    Item::ConstDecl(c) => c.is_pub,
    Item::VarDecl(v) => v.is_pub,
    Item::SignalDecl(s) => s.is_pub,
    Item::ImplDecl { .. } | Item::Import(_) | Item::Mod(_) => true,
    Item::Comment(_) => false,
  }
}

/// True when `source` declares `mod name {`.
pub fn source_has_mod(source: &str, name: &str) -> bool {
  let stem = module_stem(name);
  let Ok(tokens) = crate::lexer::Lexer::new(source).tokenize() else {
    return false;
  };
  tokens.iter().filter(|t| {
    !matches!(t.kind, TokenKind::Comment(_) | TokenKind::DocComment(_))
  }).collect::<Vec<_>>().windows(3).any(|w| {
    w[0].kind == TokenKind::Mod
      && matches!(&w[1].kind, TokenKind::Ident(n) if n == stem || n == name)
      && w[2].kind == TokenKind::LBrace
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::lexer::Lexer;

  fn parse(src: &str) -> Vec<Item> {
    let tokens = Lexer::new(src).tokenize().unwrap();
    Parser::new(tokens).parse().unwrap()
  }

  #[test]
  fn docs_attach_to_export_var() {
    let items = parse("## Degrees per second.\n@export var spin: Float = 8.0;\n");
    let Item::VarDecl(v) = &items[0] else { panic!("{:?}", items[0]) };
    assert_eq!(v.name, "spin");
    assert_eq!(v.doc.as_deref(), Some("Degrees per second."));
    assert!(v.exported);
  }

  #[test]
  fn docs_join_consecutive_lines() {
    let items = parse("## a\n## b\nfn foo(): Int { return 0; }\n");
    let Item::FnDecl(f) = &items[0] else { panic!("{:?}", items[0]) };
    assert_eq!(f.doc.as_deref(), Some("a\nb"));
  }

  #[test]
  fn hash_comment_does_not_attach() {
    let items = parse("# not a doc\nfn foo(): Int { return 0; }\n");
    assert!(matches!(&items[0], Item::Comment(s) if s == "not a doc"));
    let Item::FnDecl(f) = &items[1] else { panic!("{:?}", items[1]) };
    assert_eq!(f.doc, None);
  }

  #[test]
  fn docs_inside_body_do_not_fail_parse() {
    let items = parse("fn foo(): Int {\n    ## ignored\n    return 0;\n}\n");
    assert!(matches!(&items[0], Item::FnDecl(_)));
  }

  #[test]
  fn ufcs_attr_sets_flag() {
    let items = parse("@ufcs\nfn clamp(n: Float): Float { return n; }\n");
    let Item::FnDecl(f) = &items[0] else { panic!("{:?}", items[0]) };
    assert!(f.is_ufcs);
    assert_eq!(f.name, "clamp");
  }

  #[test]
  fn node_attr_sets_flag() {
    let items = parse("@node\nclass MyNode extends Sprite {\n    fn on_create(self) { pass; }\n}\n");
    let Item::ClassDecl(c) = &items[0] else {
      panic!("{:?}", items[0])
    };
    assert!(c.is_node);
    assert_eq!(c.name, "MyNode");
    assert_eq!(c.parent.as_deref(), Some("Sprite"));
  }

  #[test]
  fn class_export_fields_parse() {
    let items = parse(
      r#"
@node
class Player extends Node {
    @export_group("Health")
    @export var max_health: Float;
    @export var current_health: Float = 10.0;
}
"#,
    );
    let Item::ClassDecl(c) = &items[0] else {
      panic!("{:?}", items[0])
    };
    assert_eq!(c.exported_fields.len(), 2);
    assert!(c.exported_fields[0].exported);
    assert_eq!(c.exported_fields[0].name, "max_health");
    assert_eq!(
      c.exported_fields[0].export_group.as_deref(),
      Some("Health")
    );
    assert_eq!(c.exported_fields[1].name, "current_health");
  }

  #[test]
  fn class_and_trait_parse() {
    let items = parse(
      r#"
class Vec2 {
    var x: Float = 0.0;
    var y: Float = 0.0;
    fn length(self): Float { return self.x; }
}

trait HasLength {
    fn length(self): Float;
}

impl HasLength for Vec2 {
    fn length(self): Float { return self.x; }
}
"#,
    );
    assert!(matches!(&items[0], Item::ClassDecl(c) if c.name == "Vec2" && c.methods.len() == 1 && c.parent.is_none()));
    assert!(matches!(&items[1], Item::TraitDecl(t) if t.name == "HasLength" && t.methods.len() == 1 && t.signals.is_empty()));
    assert!(matches!(
      &items[2],
      Item::ImplDecl {
        type_name,
        trait_name: Some(tr),
        ..
      } if type_name == "Vec2" && tr == "HasLength"
    ));
  }

  #[test]
  fn trait_signal_parse() {
    let items = parse(
      r#"
trait Damageable {
    signal died();
    signal hurt(amount: Float);
    fn take_damage(damage: Float): Float;
}
"#,
    );
    let Item::TraitDecl(t) = &items[0] else {
      panic!("{:?}", items[0]);
    };
    assert_eq!(t.name, "Damageable");
    assert_eq!(t.methods.len(), 1);
    assert_eq!(t.signals.len(), 2);
    assert_eq!(t.signals[0].name, "died");
    assert_eq!(t.signals[1].name, "hurt");
    assert_eq!(t.signals[1].params.len(), 1);
  }

  #[test]
  fn trait_rejects_var() {
    let tokens = Lexer::new("trait Damageable { var hp: Float; }\n")
      .tokenize()
      .unwrap();
    let err = Parser::new(tokens).parse().unwrap_err();
    assert!(err.contains("vars or consts"), "{err}");
  }

  #[test]
  fn class_nested_trait_impl_parse() {
    let items = parse(
      r#"
class Point {
    var x: Float = 0.0;
    impl Named {
        fn label(self): String { return "point"; }
    }
}
"#,
    );
    let Item::ClassDecl(c) = &items[0] else {
      panic!("{:?}", items[0])
    };
    assert_eq!(c.name, "Point");
    assert_eq!(c.methods.len(), 0);
    assert_eq!(c.trait_impls.len(), 1);
    assert_eq!(c.trait_impls[0].trait_name, "Named");
    assert_eq!(c.trait_impls[0].methods[0].name, "label");
  }

  #[test]
  fn class_header_impl_traits_parse() {
    let items = parse(
      r#"
class Vec3 extends Point impl Named, Drawable {
    var z: Float = 0.0;
    fn label(self): String { return "vec3"; }
}
"#,
    );
    let Item::ClassDecl(c) = &items[0] else {
      panic!("{:?}", items[0])
    };
    assert_eq!(c.parent.as_deref(), Some("Point"));
    assert_eq!(c.impl_traits, vec!["Named".to_string(), "Drawable".to_string()]);
    assert_eq!(c.methods.len(), 1);
  }

  #[test]
  fn class_extends_parse() {
    let items = parse(
      r#"
class Enemy {
    var hp: Float = 10.0;
}
class Slime extends Enemy {
    var goo: Float = 1.0;
}
"#,
    );
    assert!(matches!(&items[0], Item::ClassDecl(c) if c.name == "Enemy" && c.parent.is_none()));
    assert!(matches!(
      &items[1],
      Item::ClassDecl(c) if c.name == "Slime" && c.parent.as_deref() == Some("Enemy") && c.fields.len() == 1
    ));
  }

  #[test]
  fn arrow_return_type_parses() {
    let items = parse("fn foo() -> Int { return 1; }\n");
    let Item::FnDecl(f) = &items[0] else {
      panic!("{:?}", items[0])
    };
    assert_eq!(f.return_type.as_ref().map(|t| t.name.as_str()), Some("Int"));
  }

  #[test]
  fn pub_and_named_enum_fields() {
    let items = parse(
      r#"
mod shapes {
    pub enum Shape {
        Circle(radius: Float),
        Rect(Float, Float),
    }
    fn helper() {}
    pub fn area() {}
}
"#,
    );
    let Item::Mod(m) = &items[0] else {
      panic!("{:?}", items[0])
    };
    let Item::EnumDecl(e) = &m.items[0] else {
      panic!("{:?}", m.items[0])
    };
    assert!(e.is_pub);
    assert_eq!(e.variants[0].field_names, vec!["radius".to_string()]);
    assert_eq!(e.variants[1].field_names, vec!["".to_string(), "".to_string()]);
    let Item::FnDecl(helper) = &m.items[1] else {
      panic!("{:?}", m.items[1])
    };
    assert!(!helper.is_pub);
    let Item::FnDecl(area) = &m.items[2] else {
      panic!("{:?}", m.items[2])
    };
    assert!(area.is_pub);
  }
}

