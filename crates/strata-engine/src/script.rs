use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rosegold::{EvalContext, FileModuleResolver, Lexer, Parser, Value};

use crate::scene::Entity;
use crate::world::World;

/// Language / script runtime attached to a [`World`].
pub trait ScriptHost {
  fn on_load(&mut self, world: &mut World);
  fn on_update(&mut self, world: &mut World, dt: f32);
}

/// Placeholder until RoseGold scripts are attached.
#[derive(Debug, Default)]
pub struct NullScriptHost;

impl ScriptHost for NullScriptHost {
  fn on_load(&mut self, _world: &mut World) {}
  fn on_update(&mut self, _world: &mut World, _dt: f32) {}
}

/// Parsed `strata:` directive emitted by a script.
#[derive(Debug, Clone, PartialEq)]
pub enum StrataDirective {
  Move { entity_id: String, dx: f32, dy: f32 },
  Rot { entity_id: String, degrees: f32 },
  Set {
    entity_id: String,
    x: Option<f32>,
    y: Option<f32>,
    rot: Option<f32>,
  },
  PlaySound { name: Option<String> },
}

/// Native RoseGold host: loads entity scripts, runs hooks, applies stdout directives.
pub struct RoseGoldScriptHost {
  /// Entity id → script source
  scripts: HashMap<String, String>,
  /// Optional base directory for file-based imports
  module_base: Option<PathBuf>,
  /// Held keys CSV passed into on_update when the hook accepts `keys`
  pub keys: String,
  /// Accumulated stdout from the last tick (for logging / UI)
  pub last_stdout: String,
  /// Directives from the last tick that the host could not apply locally (e.g. play_sound)
  pub last_side_effects: Vec<StrataDirective>,
}

impl Default for RoseGoldScriptHost {
  fn default() -> Self {
    Self::new()
  }
}

impl RoseGoldScriptHost {
  pub fn new() -> Self {
    Self {
      scripts: HashMap::new(),
      module_base: None,
      keys: String::new(),
      last_stdout: String::new(),
      last_side_effects: Vec::new(),
    }
  }

  pub fn set_module_base(&mut self, base: impl AsRef<Path>) {
    self.module_base = Some(base.as_ref().to_path_buf());
  }

  pub fn set_script(&mut self, entity_id: impl Into<String>, source: impl Into<String>) {
    self.scripts.insert(entity_id.into(), source.into());
  }

  pub fn clear_scripts(&mut self) {
    self.scripts.clear();
  }

  pub fn set_keys(&mut self, keys: impl Into<String>) {
    self.keys = keys.into();
  }

  fn make_context(&self) -> EvalContext {
    if let Some(base) = &self.module_base {
      EvalContext::with_resolver(std::rc::Rc::new(std::cell::RefCell::new(
        FileModuleResolver::new(base),
      )))
    } else {
      EvalContext::new()
    }
  }

  fn run_hook(
    &mut self,
    entity: &Entity,
    hook: &str,
    dt: f32,
  ) -> Result<(String, Vec<StrataDirective>), String> {
    let source = self
      .scripts
      .get(&entity.id)
      .ok_or_else(|| format!("no script for entity {}", entity.id))?
      .clone();

    let tokens = Lexer::new(&source).tokenize().map_err(|e| e)?;
    let program = Parser::new(tokens).parse().map_err(|e| e)?;
    let _ = rosegold::typecheck(&program).map_err(|e| e)?;

    let mut ctx = self.make_context();
    ctx.load_program(&program).map_err(|e| e.to_string())?;
    if !ctx.has_fn(hook) {
      return Ok((String::new(), Vec::new()));
    }

    let before = ctx.stdout.len();
    let args = hook_args(&ctx, hook, entity, dt, &self.keys);
    ctx.call(hook, args).map_err(|e| e.to_string())?;
    let stdout = ctx.stdout[before..].to_string();
    let directives = parse_strata_directives(&stdout, &entity.id);
    Ok((stdout, directives))
  }

  fn apply_directives(world: &mut World, directives: &[StrataDirective]) -> Vec<StrataDirective> {
    let mut side_effects = Vec::new();
    for d in directives {
      match d {
        StrataDirective::Move { entity_id, dx, dy } => {
          if let Some(e) = world.entities_mut().iter_mut().find(|e| e.id == *entity_id) {
            e.x += dx;
            e.y += dy;
          }
        }
        StrataDirective::Rot { entity_id, degrees } => {
          if let Some(e) = world.entities_mut().iter_mut().find(|e| e.id == *entity_id) {
            e.rotation_z += degrees;
            e.sync_rotation_alias();
          }
        }
        StrataDirective::Set {
          entity_id,
          x,
          y,
          rot,
        } => {
          if let Some(e) = world.entities_mut().iter_mut().find(|e| e.id == *entity_id) {
            if let Some(x) = x {
              e.x = *x;
            }
            if let Some(y) = y {
              e.y = *y;
            }
            if let Some(rot) = rot {
              e.rotation_z = *rot;
              e.sync_rotation_alias();
            }
          }
        }
        StrataDirective::PlaySound { .. } => side_effects.push(d.clone()),
      }
    }
    side_effects
  }
}

impl ScriptHost for RoseGoldScriptHost {
  fn on_load(&mut self, world: &mut World) {
    self.last_stdout.clear();
    self.last_side_effects.clear();
    let entities: Vec<Entity> = world.entities().to_vec();
    for e in entities {
      if !self.scripts.contains_key(&e.id) {
        continue;
      }
      match self.run_hook(&e, "on_ready", 0.0) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = Self::apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_stdout.push_str(&format!("[script error {}] {}\n", e.name, err));
        }
      }
    }
  }

  fn on_update(&mut self, world: &mut World, dt: f32) {
    self.last_stdout.clear();
    self.last_side_effects.clear();
    let entities: Vec<Entity> = world.entities().to_vec();
    for e in entities {
      if e.locked || !self.scripts.contains_key(&e.id) {
        continue;
      }
      match self.run_hook(&e, "on_update", dt) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = Self::apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_stdout.push_str(&format!("[script error {}] {}\n", e.name, err));
        }
      }
    }
  }
}

fn hook_args(
  ctx: &EvalContext,
  hook: &str,
  entity: &Entity,
  dt: f32,
  keys: &str,
) -> Vec<Value> {
  let Some(decl) = ctx.functions.get(hook) else {
    return vec![];
  };
  let n = decl.params.len();
  let mut args = Vec::new();
  if n >= 1 {
    args.push(Value::String(entity.name.clone()));
  }
  if n >= 2 {
    args.push(Value::Float(entity.x as f64));
  }
  if n >= 3 {
    args.push(Value::Float(entity.y as f64));
  }
  if hook == "on_update" {
    if n >= 4 {
      args.push(Value::Float(dt as f64));
    }
    if n >= 5 {
      args.push(Value::String(keys.to_string()));
    }
  }
  // Pad if script expects fewer/more than we filled
  while args.len() < n {
    args.push(Value::None);
  }
  if args.len() > n {
    args.truncate(n);
  }
  args
}

fn parse_kv(payload: &str) -> HashMap<String, String> {
  let mut out = HashMap::new();
  let re = regex_lite_kv(payload);
  for (k, v) in re {
    out.insert(k, v);
  }
  out
}

/// Tiny key=value parser without pulling in the regex crate.
fn regex_lite_kv(payload: &str) -> Vec<(String, String)> {
  let mut out = Vec::new();
  let mut rest = payload;
  while let Some(eq) = rest.find('=') {
    let key_start = rest[..eq]
      .rfind(|c: char| !c.is_alphanumeric() && c != '_')
      .map(|i| i + 1)
      .unwrap_or(0);
    let key = rest[key_start..eq].trim();
    if key.is_empty() {
      rest = &rest[eq + 1..];
      continue;
    }
    let after = &rest[eq + 1..];
    let (val, next) = if after.starts_with('"') {
      if let Some(end) = after[1..].find('"') {
        (&after[1..1 + end], &after[2 + end..])
      } else {
        (after, "")
      }
    } else {
      let end = after
        .find(|c: char| c.is_whitespace())
        .unwrap_or(after.len());
      (&after[..end], &after[end..])
    };
    out.push((key.to_string(), val.to_string()));
    rest = next;
  }
  out
}

pub fn parse_strata_directives(stdout: &str, entity_id: &str) -> Vec<StrataDirective> {
  let mut out = Vec::new();
  for line in stdout.lines() {
    let trimmed = line.trim();
    if !trimmed.starts_with("strata:") {
      continue;
    }
    let payload = trimmed["strata:".len()..].trim();
    let cmd = payload.split_whitespace().next().unwrap_or("");
    let rest = payload[cmd.len()..].trim();
    let kv = parse_kv(rest);

    match cmd {
      "move" => {
        let dx = kv
          .get("dx")
          .and_then(|s| s.parse().ok())
          .unwrap_or(0.0);
        let dy = kv
          .get("dy")
          .and_then(|s| s.parse().ok())
          .unwrap_or(0.0);
        out.push(StrataDirective::Move {
          entity_id: entity_id.to_string(),
          dx,
          dy,
        });
      }
      "rot" => {
        let degrees = kv
          .get("degrees")
          .or_else(|| kv.values().next())
          .and_then(|s| s.parse().ok())
          .or_else(|| {
            rest
              .split_whitespace()
              .next()
              .and_then(|s| s.parse().ok())
          })
          .unwrap_or(0.0);
        out.push(StrataDirective::Rot {
          entity_id: entity_id.to_string(),
          degrees,
        });
      }
      "set" => {
        out.push(StrataDirective::Set {
          entity_id: entity_id.to_string(),
          x: kv.get("x").and_then(|s| s.parse().ok()),
          y: kv.get("y").and_then(|s| s.parse().ok()),
          rot: kv.get("rot").and_then(|s| s.parse().ok()),
        });
      }
      "play_sound" | "sound" => {
        out.push(StrataDirective::PlaySound {
          name: kv.get("name").cloned(),
        });
      }
      _ => {}
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::scene::{EntityKind, Mode, SceneFile};

  fn entity(id: &str, name: &str, x: f32, y: f32) -> Entity {
    Entity {
      id: id.into(),
      name: name.into(),
      kind: EntityKind::Sprite,
      parent_id: None,
      x,
      y,
      z: 0.0,
      width: 32.0,
      height: 32.0,
      depth: 8.0,
      rotation: 0.0,
      rotation_x: 0.0,
      rotation_y: 0.0,
      rotation_z: 0.0,
      scale_x: 1.0,
      scale_y: 1.0,
      scale_z: 1.0,
      color: "#d4848e".into(),
      visible: true,
      locked: false,
      script_path: String::new(),
      mesh_primitive: Default::default(),
      light_kind: Default::default(),
    }
  }

  #[test]
  fn host_applies_move_on_update() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    print("strata:move dx=3 dy=1");
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let e = &world.entities()[0];
    assert!((e.x - 3.0).abs() < 0.001);
    assert!((e.y - 1.0).abs() < 0.001);
  }

  #[test]
  fn parse_move_and_rot() {
    let d = parse_strata_directives("strata:move dx=2 dy=-1\nstrata:rot 8\n", "e1");
    assert_eq!(
      d[0],
      StrataDirective::Move {
        entity_id: "e1".into(),
        dx: 2.0,
        dy: -1.0
      }
    );
    assert_eq!(
      d[1],
      StrataDirective::Rot {
        entity_id: "e1".into(),
        degrees: 8.0
      }
    );
  }
}
