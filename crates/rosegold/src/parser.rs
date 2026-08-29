#[derive(Debug, Clone, PartialEq)]
pub enum Item {
  Import(Import),
  FnDecl(FnDecl),
  VarDecl(VarDecl),
  ConstDecl(ConstDecl),
  StructDecl(StructDecl),
  EnumDecl(EnumDecl),
  ImplDecl { type_name: String, methods: Vec<FnDecl> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructDecl {
  pub name: String,
  pub fields: Vec<(String, Type)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumDecl {
  pub name: String,
  pub variants: Vec<EnumVariant>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumVariant {
  pub name: String,
  pub value_types: Vec<Type>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Import {
  pub path: Vec<String>,
  pub alias: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FnDecl {
  pub name: String,
  pub params: Vec<Param>,
  pub return_type: Option<Type>,
  pub body: Block,
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
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConstDecl {
  pub name: String,
  pub ty: Option<Type>,
  pub value: Expr,
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
  Variant { name: String, bind: Option<String> },
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
}

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum UnaryOp { Neg, Not }

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum AssignOp { Assign, Add, Sub, Mul, Div, Mod }

use crate::lexer::{Token, TokenKind};

pub struct Parser {
  tokens: Vec<Token>,
  pos: usize,
}

impl Parser {
  pub fn new(tokens: Vec<Token>) -> Self {
    Self { tokens, pos: 0 }
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

  pub fn parse(&mut self) -> Result<Vec<Item>, String> {
    let mut items = Vec::new();
    while !self.at(TokenKind::Eof) {
      items.push(self.parse_item()?);
    }
    Ok(items)
  }

  fn parse_item(&mut self) -> Result<Item, String> {
    match self.peek() {
      TokenKind::Import | TokenKind::From => Ok(Item::Import(self.parse_import()?)),
      TokenKind::Fn => Ok(Item::FnDecl(self.parse_fn_decl()?)),
      TokenKind::Var => Ok(Item::VarDecl(self.parse_var_decl()?)),
      TokenKind::Const => Ok(Item::ConstDecl(self.parse_const_decl()?)),
      TokenKind::Struct => Ok(Item::StructDecl(self.parse_struct_decl()?)),
      TokenKind::Enum => Ok(Item::EnumDecl(self.parse_enum_decl()?)),
      TokenKind::Impl => Ok(self.parse_impl_decl()?),
      _ => {
        let t = &self.tokens[self.pos];
        Err(format!("expected top-level item at {}:{}", t.span.line, t.span.col))
      }
    }
  }

  fn parse_impl_decl(&mut self) -> Result<Item, String> {
    self.advance(); // impl
    let type_name = self.expect_ident("expected type name after impl")?;
    self.expect(TokenKind::LBrace, "expected '{' after impl type name")?;
    let mut methods = Vec::new();
    while !self.at(TokenKind::RBrace) && !self.at(TokenKind::Eof) {
      methods.push(self.parse_fn_decl()?);
    }
    self.expect(TokenKind::RBrace, "expected '}' after impl body")?;
    Ok(Item::ImplDecl { type_name, methods })
  }

  fn parse_struct_decl(&mut self) -> Result<StructDecl, String> {
    self.advance(); // struct
    let name = self.expect_ident("expected struct name")?;
    self.expect(TokenKind::LBrace, "expected '{' before struct fields")?;
    let mut fields = Vec::new();
    if !self.at(TokenKind::RBrace) {
      loop {
        let field_name = self.expect_ident("expected field name")?;
        self.expect(TokenKind::Colon, "expected ':' after field name")?;
        let ty = self.parse_type()?;
        fields.push((field_name, ty));
        if !self.consume(TokenKind::Comma) || self.at(TokenKind::RBrace) {
          break;
        }
      }
    }
    self.expect(TokenKind::RBrace, "expected '}' after struct fields")?;
    Ok(StructDecl { name, fields })
  }

  fn parse_enum_decl(&mut self) -> Result<EnumDecl, String> {
    self.advance(); // enum
    let name = self.expect_ident("expected enum name")?;
    self.expect(TokenKind::LBrace, "expected '{' before enum variants")?;
    let mut variants = Vec::new();
    if !self.at(TokenKind::RBrace) {
      loop {
        let variant_name = self.expect_ident("expected variant name")?;
        let mut value_types = Vec::new();
        if self.consume(TokenKind::LParen) {
          if !self.at(TokenKind::RParen) {
            loop {
              value_types.push(self.parse_type()?);
              if !self.consume(TokenKind::Comma) || self.at(TokenKind::RParen) {
                break;
              }
            }
          }
          self.expect(TokenKind::RParen, "expected ')' after variant types")?;
        }
        variants.push(EnumVariant { name: variant_name, value_types });
        if !self.consume(TokenKind::Comma) || self.at(TokenKind::RBrace) {
          break;
        }
      }
    }
    self.expect(TokenKind::RBrace, "expected '}' after enum variants")?;
    Ok(EnumDecl { name, variants })
  }

  fn parse_import(&mut self) -> Result<Import, String> {
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
      return Ok(Import { path, alias });
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
    Ok(Import { path, alias })
  }

  fn parse_fn_decl(&mut self) -> Result<FnDecl, String> {
    self.advance(); // fn
    let name = self.expect_ident("expected function name")?;
    self.expect(TokenKind::LParen, "expected '(' after function name")?;
    let params = self.parse_params()?;
    self.expect(TokenKind::RParen, "expected ')' after parameters")?;
    let return_type = if self.consume(TokenKind::Colon) {
      Some(self.parse_type()?)
    } else {
      None
    };
    let body = self.parse_block()?;
    Ok(FnDecl { name, params, return_type, body })
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
    Ok(VarDecl { name, ty, value })
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
    Ok(ConstDecl { name, ty, value })
  }

  fn parse_block(&mut self) -> Result<Block, String> {
    self.expect(TokenKind::LBrace, "expected '{'")?;
    let mut stmts = Vec::new();
    while !self.at(TokenKind::RBrace) && !self.at(TokenKind::Eof) {
      stmts.push(self.parse_stmt()?);
    }
    self.expect(TokenKind::RBrace, "expected '}'")?;
    Ok(Block { stmts })
  }

  fn parse_stmt(&mut self) -> Result<Stmt, String> {
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
    let mut left = self.parse_equality()?;
    while self.consume(TokenKind::AndAnd) {
      let span = left.span;
      let right = self.parse_equality()?;
      left = Self::expr(ExprKind::Binary { op: BinOp::And, left: Box::new(left), right: Box::new(right) }, span);
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
    let mut left = self.parse_add()?;
    loop {
      let span = left.span;
      if self.consume(TokenKind::Lt) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Lt, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::LtEq) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Lte, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::Gt) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Gt, left: Box::new(left), right: Box::new(right) }, span);
      } else if self.consume(TokenKind::GtEq) {
        let right = self.parse_add()?;
        left = Self::expr(ExprKind::Binary { op: BinOp::Gte, left: Box::new(left), right: Box::new(right) }, span);
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
    let name = self.expect_pattern_name()?;
    if name == "_" {
      return Ok(Pattern::Wildcard);
    }
    if self.consume(TokenKind::LParen) {
      let inner = self.expect_pattern_name()?;
      self.expect(TokenKind::RParen, "expected ')' after pattern binding")?;
      let bind = if inner == "_" { None } else { Some(inner) };
      return Ok(Pattern::Variant { name, bind });
    }
    Ok(Pattern::Variant { name, bind: None })
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
