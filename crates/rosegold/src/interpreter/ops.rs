//! Runtime helpers: arithmetic, bitwise ops, equality, formatting, and `io`.

use std::collections::HashMap;

use crate::host::HostEffect;
use crate::parser::AssignOp;
use crate::{RuntimeError, Span};

use super::value::*;

pub(super) fn runtime_err(message: impl Into<String>, span: Span) -> RuntimeError {
    RuntimeError {
        message: message.into(),
        span,
    }
}

pub(super) fn value_as_float(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Float(n)) => Some(*n),
        Some(Value::Int(n)) => Some(*n as f64),
        _ => None,
    }
}

pub(super) fn as_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Float(n) => Some(*n),
        Value::Int(n) => Some(*n as f64),
        _ => None,
    }
}

pub(super) fn csv_has(csv: &str, code: &str) -> bool {
    if code.is_empty() {
        return false;
    }
    csv.split(',').any(|token| token.trim() == code)
}

pub(super) fn value_to_json(value: &Value) -> serde_json::Value {
    match value {
        Value::Int(n) => serde_json::json!(n),
        Value::Float(n) => serde_json::json!(n),
        Value::Bool(b) => serde_json::json!(b),
        Value::String(s) => serde_json::json!(s),
        _ => serde_json::Value::Null,
    }
}

pub(super) fn map_string(map: &HashMap<String, Value>, key: &str) -> Option<String> {
    match map.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}

pub(super) fn map_f64(map: &HashMap<String, Value>, key: &str) -> Option<f64> {
    map.get(key).and_then(as_f64)
}

pub(super) fn spawn_from_map(map: &HashMap<String, Value>) -> HostEffect {
    HostEffect::Spawn {
        name: map_string(map, "name").unwrap_or_else(|| "Entity".into()),
        kind: map_string(map, "kind").unwrap_or_else(|| "sprite".into()),
        x: map_f64(map, "x").unwrap_or(0.0),
        y: map_f64(map, "y").unwrap_or(0.0),
        width: map_f64(map, "w")
            .or_else(|| map_f64(map, "width"))
            .unwrap_or(32.0),
        height: map_f64(map, "h")
            .or_else(|| map_f64(map, "height"))
            .unwrap_or(32.0),
        color: map_string(map, "color").unwrap_or_else(|| "#61afef".into()),
        script: map_string(map, "script"),
    }
}

pub(super) fn value_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Int(a), Value::Int(b)) => a == b,
        (Value::Float(a), Value::Float(b)) => (a - b).abs() < f64::EPSILON,
        (Value::Int(a), Value::Float(b)) => (*a as f64 - b).abs() < f64::EPSILON,
        (Value::Float(a), Value::Int(b)) => (a - *b as f64).abs() < f64::EPSILON,
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
            a.len() == b.len()
                && a.iter()
                    .all(|(k, v)| b.get(k).map(|bv| value_eq(v, bv)).unwrap_or(false))
        }
        (
            Value::Enum {
                module: ma,
                variant: va,
                value: a,
            },
            Value::Enum {
                module: mb,
                variant: vb,
                value: b,
            },
        ) => {
            ma == mb
                && va == vb
                && match (a, b) {
                    (None, None) => true,
                    (Some(a), Some(b)) => value_eq(a, b),
                    _ => false,
                }
        }
        _ => false,
    }
}

pub(super) fn format_value(
    value: &Value,
    format: Option<&str>,
    span: Span,
) -> Result<String, RuntimeError> {
    if let Some(spec) = format {
        if spec.ends_with('f') {
            let prec_str = spec.trim_start_matches('.').trim_end_matches('f');
            if let Ok(prec) = prec_str.parse::<usize>() {
                let n = match value {
                    Value::Int(n) => *n as f64,
                    Value::Float(n) => *n,
                    _ => {
                        return Err(runtime_err(
                            format!(
                                "format {:?} requires numeric value, got {}",
                                spec,
                                value.type_name()
                            ),
                            span,
                        ));
                    }
                };
                return Ok(format!("{:.prec$}", n, prec = prec));
            }
        }
        return Err(runtime_err(
            format!("unsupported format spec {:?}", spec),
            span,
        ));
    }
    Ok(value.to_string())
}

pub(super) fn int_bitwise<F: FnOnce(i64, i64) -> i64>(
    l: Value,
    r: Value,
    op: F,
    span: Span,
) -> Result<Value, RuntimeError> {
    match (l, r) {
        (Value::Int(a), Value::Int(b)) => Ok(Value::Int(op(a, b))),
        (l, r) => Err(runtime_err(
            format!(
                "bitwise operators require Int, got {} and {}",
                l.type_name(),
                r.type_name()
            ),
            span,
        )),
    }
}

pub(super) fn int_shift(l: Value, r: Value, left: bool, span: Span) -> Result<Value, RuntimeError> {
    match (l, r) {
        (Value::Int(a), Value::Int(b)) => {
            if b < 0 || b >= 64 {
                return Err(runtime_err(
                    format!("shift count {b} is out of range"),
                    span,
                ));
            }
            let n = if left {
                a.wrapping_shl(b as u32)
            } else {
                a.wrapping_shr(b as u32)
            };
            Ok(Value::Int(n))
        }
        (l, r) => Err(runtime_err(
            format!(
                "shift requires Int, got {} and {}",
                l.type_name(),
                r.type_name()
            ),
            span,
        )),
    }
}

pub(super) fn string_char_len(s: &str) -> i64 {
    s.chars().count() as i64
}

pub(super) fn int_div(a: i64, b: i64, span: Span) -> Result<Value, RuntimeError> {
    if b == 0 {
        Err(runtime_err("division by zero".to_string(), span))
    } else {
        Ok(Value::Int(a / b))
    }
}

pub(super) fn is_numeric_zero(v: &Value) -> bool {
    match v {
        Value::Int(0) => true,
        Value::Float(n) if *n == 0.0 => true,
        _ => false,
    }
}

pub(super) fn checked_mod(l: Value, r: Value, span: Span) -> Result<Value, RuntimeError> {
    if is_numeric_zero(&r) {
        return Err(runtime_err("division by zero".to_string(), span));
    }
    numeric_binop(l, r, |a, b| a % b, span)
}

pub(super) fn numeric_binop<F: FnOnce(f64, f64) -> f64>(
    l: Value,
    r: Value,
    op: F,
    span: Span,
) -> Result<Value, RuntimeError> {
    let a = to_float(&l, span)?;
    let b = to_float(&r, span)?;
    let result = op(a, b);
    if result.fract() == 0.0 && result.is_finite() {
        Ok(Value::Int(result as i64))
    } else {
        Ok(Value::Float(result))
    }
}

pub(super) fn to_float(v: &Value, span: Span) -> Result<f64, RuntimeError> {
    match v {
        Value::Int(n) => Ok(*n as f64),
        Value::Float(n) => Ok(*n),
        _ => Err(runtime_err(
            format!("expected numeric, got {}", v.type_name()),
            span,
        )),
    }
}

pub(super) fn compare_op<F: FnOnce(f64, f64) -> bool>(
    l: Value,
    r: Value,
    op: F,
    span: Span,
) -> Result<Value, RuntimeError> {
    let a = to_float(&l, span)?;
    let b = to_float(&r, span)?;
    Ok(Value::Bool(op(a, b)))
}

pub(super) fn apply_assign_op(
    old: Value,
    new: &Value,
    op: &AssignOp,
    span: Span,
) -> Result<Value, RuntimeError> {
    match op {
        AssignOp::Assign => Ok(new.clone()),
        AssignOp::Add => numeric_binop(old, new.clone(), |a, b| a + b, span),
        AssignOp::Sub => numeric_binop(old, new.clone(), |a, b| a - b, span),
        AssignOp::Mul => numeric_binop(old, new.clone(), |a, b| a * b, span),
        AssignOp::Div => numeric_binop(old, new.clone(), |a, b| a / b, span),
        AssignOp::Mod => checked_mod(old, new.clone(), span),
        AssignOp::BitAnd => int_bitwise(old, new.clone(), |a, b| a & b, span),
        AssignOp::BitOr => int_bitwise(old, new.clone(), |a, b| a | b, span),
        AssignOp::BitXor => int_bitwise(old, new.clone(), |a, b| a ^ b, span),
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm_fs {
    use std::cell::RefCell;
    use std::collections::HashMap;

    thread_local! {
      static FILES: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
    }

    pub fn read(path: &str) -> Result<String, String> {
        FILES.with(|fs| {
            fs.borrow()
                .get(path)
                .cloned()
                .ok_or_else(|| format!("file not found: {path}"))
        })
    }

    pub fn write(path: &str, content: &str) -> Result<(), String> {
        FILES.with(|fs| {
            fs.borrow_mut()
                .insert(path.to_string(), content.to_string());
            Ok(())
        })
    }

    pub fn append(path: &str, content: &str) -> Result<(), String> {
        FILES.with(|fs| {
            let mut map = fs.borrow_mut();
            let entry = map.entry(path.to_string()).or_default();
            entry.push_str(content);
            Ok(())
        })
    }

    pub fn remove(path: &str) -> Result<(), String> {
        FILES.with(|fs| {
            if fs.borrow_mut().remove(path).is_some() {
                Ok(())
            } else {
                Err(format!("file not found: {path}"))
            }
        })
    }

    pub fn exists(path: &str) -> bool {
        FILES.with(|fs| fs.borrow().contains_key(path))
    }
}

pub(super) fn io_read_text(path: &str) -> Result<String, String> {
    #[cfg(target_arch = "wasm32")]
    {
        wasm_fs::read(path)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }
}

pub(super) fn io_write_text(path: &str, content: &str) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        wasm_fs::write(path, content)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::write(path, content).map_err(|e| e.to_string())
    }
}

pub(super) fn io_append_text(path: &str, content: &str) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        wasm_fs::append(path, content)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::fs::OpenOptions;
        use std::io::Write;
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .and_then(|mut f| f.write_all(content.as_bytes()))
            .map_err(|e| e.to_string())
    }
}

pub(super) fn io_remove(path: &str) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        wasm_fs::remove(path)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

pub(super) fn io_exists(path: &str) -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        wasm_fs::exists(path)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::path::Path::new(path).exists()
    }
}

pub(super) fn result_ok(value: Value) -> Value {
    Value::Enum {
        module: "Result".to_string(),
        variant: "Ok".to_string(),
        value: Some(Box::new(value)),
    }
}

pub(super) fn result_err(message: String) -> Value {
    Value::Enum {
        module: "Result".to_string(),
        variant: "Err".to_string(),
        value: Some(Box::new(Value::String(message))),
    }
}
