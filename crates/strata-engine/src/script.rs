use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use rosegold::{compile_source, CombinedResolver, EvalContext, HostEffect, Value, WorldEntry};

use crate::collisions::{local_positions, moved_ids, overlap_pairs, resolve_solid_movers, world_xy};
use crate::scene::Entity;
use crate::world::World;

static SPAWN_SEQ: AtomicU32 = AtomicU32::new(1);

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
    z: Option<f32>,
  },
  Spawn {
    /// Script entity that emitted the directive (unused for placement; for tracing)
    entity_id: String,
    name: String,
    kind: String,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    color: String,
    /// Optional script asset name to attach (stored on `script_path`)
    script: Option<String>,
  },
  SpawnPrefab {
    entity_id: String,
    prefab: String,
    x: Option<f32>,
    y: Option<f32>,
  },
  Destroy {
    entity_id: String,
    target_name: Option<String>,
  },
  PlaySound {
    name: Option<String>,
    url: Option<String>,
  },
  Emit {
    entity_id: String,
    signal: String,
    args: Vec<serde_json::Value>,
  },
  After {
    entity_id: String,
    delay: f32,
    method: String,
  },
  UiText {
    x: f32,
    y: f32,
    text: String,
  },
}

/// Per-entity interpreter. `EvalContext` is Rc/RefCell (not `Send`);
/// play commands only touch this while `EngineState`'s mutex is held.
struct EntityVm {
  ctx: EvalContext,
}

unsafe impl Send for EntityVm {}

struct AfterTimer {
  entity_id: String,
  remaining: f32,
  method: String,
}

/// Native RoseGold host: loads entity scripts, runs hooks, applies host effects
/// (and stdout `strata:` directives for older scripts).
pub struct RoseGoldScriptHost {
  /// Entity id → script source
  scripts: HashMap<String, String>,
  /// Live interpreters (created on first hook; kept across ticks)
  vms: HashMap<String, EntityVm>,
  /// Parsed programs keyed by source (shared across entities with the same script)
  program_cache: HashMap<String, Result<Arc<Vec<rosegold::Item>>, String>>,
  /// Optional base directory for file-based imports
  module_base: Option<PathBuf>,
  /// Held keys CSV passed into on_update when the hook accepts `keys`
  pub keys: String,
  /// Just-pressed keys CSV for the current tick (`pressed` hook arg)
  pub pressed: String,
  /// Previous tick's held keys (used when UI does not send an explicit edge list)
  prev_keys: String,
  /// Explicit edge list from the editor; `None` means derive from `keys` vs `prev_keys`
  pressed_from_ui: Option<String>,
  /// Accumulated stdout from the last tick (for logging / UI)
  pub last_stdout: String,
  /// Directives from the last tick that the host could not apply locally (e.g. play_sound)
  pub last_side_effects: Vec<StrataDirective>,
  /// True if any hook failed during the last load/tick
  pub last_had_error: bool,
  /// Script sources keyed by asset/script name (for spawn `script=…`)
  script_library: HashMap<String, String>,
  /// Clip name (lowercase) → playable URL (webview `convertFileSrc` / `/audio/…`)
  audio_library: HashMap<String, String>,
  /// Entity ids that received a script via spawn this directive pass
  pending_spawn_ready: Vec<String>,
  /// `strata.after(delay, method)` timers
  after_timers: Vec<AfterTimer>,
  /// Overlap pairs from the previous collision pass
  overlaps: HashSet<(String, String)>,
  /// World snapshot for `strata.find` (refreshed each tick)
  find_catalog: Vec<WorldEntry>,
}

impl Default for RoseGoldScriptHost {
  fn default() -> Self {
    Self::new()
  }
}

/// Index a library script under `Foo.rg` and `foo` so `import foo` resolves.
fn insert_library_keys(library: &mut HashMap<String, String>, name: &str, source: String) {
  let lower = name.to_lowercase();
  if let Some(stem) = lower.strip_suffix(".rg") {
    if !stem.is_empty() {
      library.insert(stem.to_string(), source.clone());
    }
  }
  library.insert(lower, source);
}

impl RoseGoldScriptHost {
  pub fn new() -> Self {
    Self {
      scripts: HashMap::new(),
      vms: HashMap::new(),
      program_cache: HashMap::new(),
      module_base: None,
      keys: String::new(),
      pressed: String::new(),
      prev_keys: String::new(),
      pressed_from_ui: None,
      last_stdout: String::new(),
      last_side_effects: Vec::new(),
      last_had_error: false,
      script_library: HashMap::new(),
      audio_library: HashMap::new(),
      pending_spawn_ready: Vec::new(),
      after_timers: Vec::new(),
      overlaps: HashSet::new(),
      find_catalog: Vec::new(),
    }
  }

  pub fn set_module_base(&mut self, base: impl AsRef<Path>) {
    self.module_base = Some(base.as_ref().to_path_buf());
  }

  /// Register named clips so `strata.play_sound("jump.wav")` resolves to a URL.
  pub fn set_audio(&mut self, clips: impl IntoIterator<Item = (String, String)>) {
    self.audio_library.clear();
    for (name, url) in clips {
      if name.is_empty() || url.is_empty() {
        continue;
      }
      self.audio_library.insert(name.to_lowercase(), url.clone());
      if let Some(file) = Path::new(&name).file_name() {
        self
          .audio_library
          .insert(file.to_string_lossy().to_lowercase(), url);
      }
    }
  }

  fn resolve_audio(&self, name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if let Some(url) = self.audio_library.get(&lower) {
      return Some(url.clone());
    }
    Path::new(name)
      .file_name()
      .and_then(|f| {
        self
          .audio_library
          .get(&f.to_string_lossy().to_lowercase())
          .cloned()
      })
  }

  pub fn set_script(&mut self, entity_id: impl Into<String>, source: impl Into<String>) {
    let entity_id = entity_id.into();
    let source = source.into();
    if self.scripts.get(&entity_id) == Some(&source) && self.vms.contains_key(&entity_id) {
      return;
    }
    self.vms.remove(&entity_id);
    self.scripts.insert(entity_id, source);
  }

  /// Keep VMs whose source did not change; drop the rest. Used by Tauri re-bind.
  pub fn sync_scripts(
    &mut self,
    scripts: impl IntoIterator<Item = (String, String, Option<String>)>,
  ) {
    let mut next_library = HashMap::new();
    let mut next_ids = HashSet::new();
    let mut next_sources = HashMap::new();
    for (id, source, name) in scripts {
      if let Some(n) = name.filter(|n| !n.is_empty()) {
        insert_library_keys(&mut next_library, &n, source.clone());
      }
      if id.starts_with("__lib_") {
        continue;
      }
      next_ids.insert(id.clone());
      next_sources.insert(id, source);
    }
    self.script_library = next_library;
    self.scripts.retain(|id, _| next_ids.contains(id));
    self.vms.retain(|id, _| next_ids.contains(id));
    for (id, source) in next_sources {
      self.set_script(id, source);
    }
  }

  /// Register a named script source so `strata:spawn script=Name` can attach it.
  pub fn register_script(&mut self, name: impl Into<String>, source: impl Into<String>) {
    let name = name.into();
    let source = source.into();
    insert_library_keys(&mut self.script_library, &name, source);
  }

  pub fn clear_scripts(&mut self) {
    self.scripts.clear();
    self.script_library.clear();
    self.audio_library.clear();
    self.vms.clear();
    self.program_cache.clear();
    self.overlaps.clear();
    self.after_timers.clear();
  }

  pub fn set_keys(&mut self, keys: impl Into<String>) {
    self.keys = keys.into();
  }

  /// Just-pressed keys for the next tick. Empty string is a real edge list (no presses).
  pub fn set_pressed(&mut self, pressed: impl Into<String>) {
    self.pressed_from_ui = Some(pressed.into());
  }

  pub fn reset_input(&mut self) {
    self.keys.clear();
    self.pressed.clear();
    self.prev_keys.clear();
    self.pressed_from_ui = None;
  }

  fn begin_input_tick(&mut self) {
    self.pressed = match self.pressed_from_ui.take() {
      Some(p) => p,
      None => csv_just_pressed(&self.prev_keys, &self.keys),
    };
  }

  fn end_input_tick(&mut self) {
    self.prev_keys = self.keys.clone();
  }

  fn make_context(&self) -> EvalContext {
    EvalContext::with_resolver(std::rc::Rc::new(std::cell::RefCell::new(
      CombinedResolver::new(self.script_library.clone(), self.module_base.clone()),
    )))
  }

  fn refresh_find_catalog(&mut self, world: &World) {
    let entities = world.entities();
    let by_id: HashMap<&str, &Entity> = entities.iter().map(|e| (e.id.as_str(), e)).collect();
    self.find_catalog = entities
      .iter()
      .map(|e| {
        let (x, y) = world_xy(e, &by_id);
        WorldEntry {
          name: e.name.clone(),
          x: x as f64,
          y: y as f64,
        }
      })
      .collect();
  }

  fn compile(&mut self, source: &str) -> Result<Arc<Vec<rosegold::Item>>, String> {
    if let Some(cached) = self.program_cache.get(source) {
      return cached.clone();
    }
    let compiled = compile_source(source).map(Arc::new);
    self
      .program_cache
      .insert(source.to_string(), compiled.clone());
    compiled
  }

  fn ensure_vm(&mut self, entity: &Entity) -> Result<(), String> {
    if self.vms.contains_key(&entity.id) {
      return Ok(());
    }
    let source = self
      .scripts
      .get(&entity.id)
      .ok_or_else(|| format!("no script for entity {}", entity.id))?
      .clone();
    let program = self.compile(&source)?;
    let mut ctx = self.make_context();
    ctx.load_program(program.as_slice()).map_err(|e| e.to_string())?;
    let exports = rosegold::list_exports(&source);
    if !exports.is_empty() {
      ctx.apply_exports(&exports, &entity.script_props);
    }
    self.vms.insert(entity.id.clone(), EntityVm { ctx });
    Ok(())
  }

  fn run_hook(
    &mut self,
    entity: &Entity,
    hook: &str,
    dt: f32,
  ) -> Result<(String, Vec<StrataDirective>), String> {
    self.run_hook_with(entity, hook, dt, None)
  }

  fn run_hook_with(
    &mut self,
    entity: &Entity,
    hook: &str,
    dt: f32,
    other: Option<&str>,
  ) -> Result<(String, Vec<StrataDirective>), String> {
    self.ensure_vm(entity)?;
    let keys = self.keys.clone();
    let pressed = self.pressed.clone();
    let catalog = self.find_catalog.clone();
    let self_name = entity.name.clone();
    let (sx, sy) = catalog
      .iter()
      .find(|e| e.name == entity.name)
      .map(|e| (e.x, e.y))
      .unwrap_or((entity.x as f64, entity.y as f64));
    let vm = self
      .vms
      .get_mut(&entity.id)
      .ok_or_else(|| format!("no vm for entity {}", entity.id))?;
    vm.ctx.set_input(&keys, &pressed);
    vm.ctx.set_world(self_name, sx, sy, catalog);
    vm.ctx.sync_node_transform(
      &entity.name,
      entity.x as f64,
      entity.y as f64,
      entity.z as f64,
    );
    if vm.ctx.has_node() {
      if !vm.ctx.has_hook(hook) {
        return Ok((String::new(), Vec::new()));
      }
      let extra = node_hook_args(hook, dt, other);
      vm.ctx.call_hook(hook, extra).map_err(|e| e.to_string())?;
    } else {
      if !vm.ctx.has_fn(hook) {
        return Ok((String::new(), Vec::new()));
      }
      let args = hook_args(&vm.ctx, hook, entity, dt, &keys, &pressed, other);
      vm.ctx.call(hook, args).map_err(|e| e.to_string())?;
    }
    let stdout = std::mem::take(&mut vm.ctx.stdout);
    let mut directives = parse_strata_directives(&stdout, &entity.id);
    for effect in vm.ctx.take_effects() {
      directives.push(host_effect_to_directive(effect, &entity.id));
    }
    if let Some((x, y, z)) = vm.ctx.read_node_transform() {
      let changed = (x - entity.x as f64).abs() > 1e-9
        || (y - entity.y as f64).abs() > 1e-9
        || (z - entity.z as f64).abs() > 1e-9;
      if changed {
        directives.push(StrataDirective::Set {
          entity_id: entity.id.clone(),
          x: Some(x as f32),
          y: Some(y as f32),
          rot: None,
          z: Some(z as f32),
        });
      }
    }
    Ok((stdout, directives))
  }

  fn apply_directives(&mut self, world: &mut World, directives: &[StrataDirective]) -> Vec<StrataDirective> {
    let emit_jobs: Vec<(String, String, Vec<serde_json::Value>)> = directives
      .iter()
      .filter_map(|d| match d {
        StrataDirective::Emit {
          entity_id,
          signal,
          args,
        } => Some((entity_id.clone(), signal.clone(), args.clone())),
        _ => None,
      })
      .collect();
    let mut conn_snap: HashMap<String, Vec<crate::scene::ScriptConnection>> = HashMap::new();
    for (id, _, _) in &emit_jobs {
      if conn_snap.contains_key(id) {
        continue;
      }
      if let Some(e) = world.entities().iter().find(|e| e.id == *id) {
        conn_snap.insert(id.clone(), e.connections.clone());
      }
    }

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
          z,
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
            if let Some(z) = z {
              e.z = *z;
            }
          }
        }
        StrataDirective::Spawn {
          name,
          kind,
          x,
          y,
          width,
          height,
          color,
          script,
          ..
        } => {
          let seq = SPAWN_SEQ.fetch_add(1, Ordering::Relaxed);
          let id = format!("spawn_{seq}");
          let kind = match kind.to_lowercase().as_str() {
            "mesh" => crate::scene::EntityKind::Mesh,
            "empty" => crate::scene::EntityKind::Empty,
            "camera" => crate::scene::EntityKind::Camera,
            "light" => crate::scene::EntityKind::Light,
            "script" => crate::scene::EntityKind::Script,
            "tilemap" => crate::scene::EntityKind::Tilemap,
            _ => crate::scene::EntityKind::Sprite,
          };
          let script_path = script.clone().unwrap_or_default();
          let mut e = Entity {
            id: id.clone(),
            name: name.clone(),
            kind,
            x: *x,
            y: *y,
            width: *width,
            height: *height,
            color: color.clone(),
            script_path: script_path.clone(),
            ..Default::default()
          };
          e.sync_rotation_alias();
          world.entities_mut().push(e);
          if let Some(script_name) = script {
            if let Some(source) = self
              .script_library
              .get(&script_name.to_lowercase())
              .cloned()
            {
              self.scripts.insert(id.clone(), source);
              self.pending_spawn_ready.push(id);
            }
          }
        }
        StrataDirective::SpawnPrefab {
          entity_id,
          prefab,
          x,
          y,
        } => {
          let Some(template) = crate::prefab::find_prefab_root(world.prefabs(), prefab).cloned()
          else {
            self.last_stdout.push_str(&format!("[prefab not found {prefab}]\n"));
            continue;
          };
          let caller = world.entities().iter().find(|e| e.id == *entity_id);
          let px = if let Some(x) = x {
            *x
          } else {
            caller.map(|c| c.x + template.x).unwrap_or(template.x)
          };
          let py = if let Some(y) = y {
            *y
          } else {
            caller.map(|c| c.y + template.y).unwrap_or(template.y)
          };
          let seq = SPAWN_SEQ.fetch_add(1, Ordering::Relaxed);
          let root_id = format!("spawn_{seq}");
          let spawned = crate::prefab::instantiate_prefab(
            world.prefabs(),
            &template,
            root_id,
            px,
            py,
            || {
              let seq = SPAWN_SEQ.fetch_add(1, Ordering::Relaxed);
              format!("spawn_{seq}")
            },
          );
          for e in spawned {
            let script_path = e.script_path.clone();
            let id = e.id.clone();
            world.entities_mut().push(e);
            if !script_path.is_empty() {
              if let Some(source) = self
                .script_library
                .get(&script_path.to_lowercase())
                .cloned()
              {
                self.scripts.insert(id.clone(), source);
                self.pending_spawn_ready.push(id);
              }
            }
          }
        }
        StrataDirective::Destroy {
          entity_id,
          target_name,
        } => {
          let target_id = if let Some(name) = target_name {
            world
              .entities()
              .iter()
              .find(|e| e.name.eq_ignore_ascii_case(name))
              .map(|e| e.id.clone())
          } else {
            Some(entity_id.clone())
          };
          if let Some(id) = target_id {
            if let Some(entity) = world.entities().iter().find(|e| e.id == id).cloned() {
              self.run_on_destroy(world, &entity);
            }
            world.entities_mut().retain(|e| e.id != id);
            self.scripts.remove(&id);
            self.vms.remove(&id);
            self.after_timers.retain(|t| t.entity_id != id);
          }
        }
        StrataDirective::PlaySound { name, .. } => {
          let url = name.as_ref().and_then(|n| self.resolve_audio(n));
          if url.is_none() && !self.audio_library.is_empty() {
            if let Some(n) = name.as_deref() {
              self.last_stdout.push_str(&format!("[audio not found {n}]\n"));
            }
          }
          side_effects.push(StrataDirective::PlaySound {
            name: name.clone(),
            url,
          });
        }
        StrataDirective::Emit { .. } => {}
        StrataDirective::After {
          entity_id,
          delay,
          method,
        } => {
          self.after_timers.push(AfterTimer {
            entity_id: entity_id.clone(),
            remaining: *delay,
            method: method.clone(),
          });
        }
        StrataDirective::UiText { x, y, text } => {
          side_effects.push(StrataDirective::UiText {
            x: *x,
            y: *y,
            text: text.clone(),
          });
        }
      }
    }
    self.dispatch_signals(world, emit_jobs, conn_snap);
    side_effects
  }

  fn run_on_destroy(&mut self, world: &mut World, entity: &Entity) {
    if !self.scripts.contains_key(&entity.id) {
      return;
    }
    match self.run_hook(entity, "on_destroy", 0.0) {
      Ok((out, dirs)) => {
        self.last_stdout.push_str(&out);
        let filtered: Vec<StrataDirective> = dirs
          .into_iter()
          .filter(|d| match d {
            StrataDirective::Destroy {
              entity_id,
              target_name,
            } => {
              if target_name.is_none() && entity_id == &entity.id {
                return false;
              }
              if target_name
                .as_deref()
                .is_some_and(|n| entity.name.eq_ignore_ascii_case(n))
              {
                return false;
              }
              true
            }
            _ => true,
          })
          .collect();
        let side = self.apply_directives(world, &filtered);
        self.last_side_effects.extend(side);
      }
      Err(err) => {
        self.last_had_error = true;
        self.last_stdout.push_str(&format!(
          "[script error {}] {}\n",
          entity.name, err
        ));
      }
    }
  }

  fn fire_after_timers(&mut self, world: &mut World, dt: f32) {
    let mut due = Vec::new();
    self.after_timers.retain_mut(|t| {
      t.remaining -= dt;
      if t.remaining <= 0.0 {
        due.push((t.entity_id.clone(), t.method.clone()));
        false
      } else {
        true
      }
    });
    for (id, method) in due {
      let Some(entity) = world.entities().iter().find(|e| e.id == id).cloned() else {
        continue;
      };
      match self.invoke_method(&entity, &method, &[]) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = self.apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_had_error = true;
          self.last_stdout.push_str(&format!(
            "[script error {}] {}\n",
            entity.name, err
          ));
        }
      }
    }
  }

  fn dispatch_signals(
    &mut self,
    world: &mut World,
    jobs: Vec<(String, String, Vec<serde_json::Value>)>,
    snap: HashMap<String, Vec<crate::scene::ScriptConnection>>,
  ) {
    for (from_id, signal, args) in jobs {
      let Some(conns) = snap.get(&from_id) else {
        continue;
      };
      let targets: Vec<(crate::scene::ScriptConnection, Entity)> = conns
        .iter()
        .filter(|c| c.signal == signal)
        .filter_map(|c| {
          world
            .entities()
            .iter()
            .find(|e| e.id == c.to || e.name.eq_ignore_ascii_case(&c.to))
            .cloned()
            .map(|e| (c.clone(), e))
        })
        .collect();
      for (conn, target) in targets {
        match self.invoke_method(&target, &conn.method, &args) {
          Ok((out, dirs)) => {
            self.last_stdout.push_str(&out);
            let side = self.apply_directives(world, &dirs);
            self.last_side_effects.extend(side);
          }
          Err(err) => {
            self.last_had_error = true;
            self.last_stdout.push_str(&format!(
              "[script error {}] {}\n",
              target.name, err
            ));
          }
        }
      }
    }
  }

  fn invoke_method(
    &mut self,
    entity: &Entity,
    method: &str,
    raw: &[serde_json::Value],
  ) -> Result<(String, Vec<StrataDirective>), String> {
    self.ensure_vm(entity)?;
    let keys = self.keys.clone();
    let pressed = self.pressed.clone();
    let vm = self
      .vms
      .get_mut(&entity.id)
      .ok_or_else(|| format!("no vm for entity {}", entity.id))?;
    vm.ctx.set_input(&keys, &pressed);
    vm.ctx.sync_node_transform(
      &entity.name,
      entity.x as f64,
      entity.y as f64,
      entity.z as f64,
    );
    if vm.ctx.has_node() {
      if !vm.ctx.has_hook(method) {
        return Ok((String::new(), Vec::new()));
      }
      let args = node_method_args(raw);
      vm.ctx.call_hook(method, args).map_err(|e| e.to_string())?;
    } else {
      if !vm.ctx.has_fn(method) {
        return Ok((String::new(), Vec::new()));
      }
      let args = method_args(&vm.ctx, method, raw);
      vm.ctx.call(method, args).map_err(|e| e.to_string())?;
    }
    let stdout = std::mem::take(&mut vm.ctx.stdout);
    let mut directives = parse_strata_directives(&stdout, &entity.id);
    for effect in vm.ctx.take_effects() {
      directives.push(host_effect_to_directive(effect, &entity.id));
    }
    if let Some((x, y, z)) = vm.ctx.read_node_transform() {
      let changed = (x - entity.x as f64).abs() > 1e-9
        || (y - entity.y as f64).abs() > 1e-9
        || (z - entity.z as f64).abs() > 1e-9;
      if changed {
        directives.push(StrataDirective::Set {
          entity_id: entity.id.clone(),
          x: Some(x as f32),
          y: Some(y as f32),
          rot: None,
          z: Some(z as f32),
        });
      }
    }
    Ok((stdout, directives))
  }

  fn run_pending_spawn_ready(&mut self, world: &mut World) {
    self.refresh_find_catalog(world);
    let ids = std::mem::take(&mut self.pending_spawn_ready);
    for id in ids {
      let Some(entity) = world.entities().iter().find(|e| e.id == id).cloned() else {
        continue;
      };
      match self.run_hook(&entity, "on_ready", 0.0) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = self.apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_had_error = true;
          self
            .last_stdout
            .push_str(&format!("[script error {}] {}\n", entity.name, err));
        }
      }
    }
    // Nested spawns from on_ready
    if !self.pending_spawn_ready.is_empty() {
      self.run_pending_spawn_ready(world);
    }
  }

  fn resolve_solids(world: &mut World, before: &HashMap<String, (f32, f32)>) {
    let moved = moved_ids(world.entities(), before);
    resolve_solid_movers(world.entities_mut(), &moved);
  }

  fn dispatch_overlaps(&mut self, world: &mut World) {
    let current = overlap_pairs(world.entities());
    let entered: Vec<(String, String)> = current.difference(&self.overlaps).cloned().collect();
    let exited: Vec<(String, String)> = self.overlaps.difference(&current).cloned().collect();
    self.overlaps = current;

    let lookup: HashMap<String, Entity> = world
      .entities()
      .iter()
      .cloned()
      .map(|e| (e.id.clone(), e))
      .collect();

    let mut fire = |id: &str, other: &str, hook: &str| {
      let Some(entity) = lookup.get(id) else {
        return;
      };
      if !self.scripts.contains_key(id) {
        return;
      }
      match self.run_hook_with(entity, hook, 0.0, Some(other)) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = self.apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_had_error = true;
          self
            .last_stdout
            .push_str(&format!("[script error {}] {}\n", entity.name, err));
        }
      }
    };

    for (a, b) in entered {
      let name_a = lookup.get(&a).map(|e| e.name.clone());
      let name_b = lookup.get(&b).map(|e| e.name.clone());
      if let Some(nb) = name_b.as_deref() {
        fire(&a, nb, "on_enter");
      }
      if let Some(na) = name_a.as_deref() {
        fire(&b, na, "on_enter");
      }
    }
    for (a, b) in exited {
      let name_a = lookup.get(&a).map(|e| e.name.clone());
      let name_b = lookup.get(&b).map(|e| e.name.clone());
      if let Some(nb) = name_b.as_deref() {
        fire(&a, nb, "on_exit");
      }
      if let Some(na) = name_a.as_deref() {
        fire(&b, na, "on_exit");
      }
    }
    if !self.pending_spawn_ready.is_empty() {
      self.run_pending_spawn_ready(world);
    }
  }
}

impl ScriptHost for RoseGoldScriptHost {
  fn on_load(&mut self, world: &mut World) {
    self.last_stdout.clear();
    self.last_side_effects.clear();
    self.last_had_error = false;
    self.pending_spawn_ready.clear();
    self.pressed.clear();
    self.prev_keys.clear();
    self.refresh_find_catalog(world);
    let before = local_positions(world.entities());
    let entities: Vec<Entity> = world.entities().to_vec();
    for e in entities {
      if !self.scripts.contains_key(&e.id) {
        continue;
      }
      match self.run_hook(&e, "on_ready", 0.0) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = self.apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_had_error = true;
          self.last_stdout.push_str(&format!("[script error {}] {}\n", e.name, err));
        }
      }
    }
    self.run_pending_spawn_ready(world);
    Self::resolve_solids(world, &before);
    let after_ready = local_positions(world.entities());
    self.dispatch_overlaps(world);
    Self::resolve_solids(world, &after_ready);
  }

  fn on_update(&mut self, world: &mut World, dt: f32) {
    self.last_stdout.clear();
    self.last_side_effects.clear();
    self.last_had_error = false;
    self.pending_spawn_ready.clear();
    self.begin_input_tick();
    self.fire_after_timers(world, dt);
    self.refresh_find_catalog(world);
    let before = local_positions(world.entities());
    let entities: Vec<Entity> = world.entities().to_vec();
    for e in entities {
      if e.locked || !self.scripts.contains_key(&e.id) {
        continue;
      }
      match self.run_hook(&e, "on_update", dt) {
        Ok((out, dirs)) => {
          self.last_stdout.push_str(&out);
          let side = self.apply_directives(world, &dirs);
          self.last_side_effects.extend(side);
        }
        Err(err) => {
          self.last_had_error = true;
          self.last_stdout.push_str(&format!("[script error {}] {}\n", e.name, err));
        }
      }
    }
    self.run_pending_spawn_ready(world);
    Self::resolve_solids(world, &before);
    let after_move = local_positions(world.entities());
    self.dispatch_overlaps(world);
    Self::resolve_solids(world, &after_move);
    self.end_input_tick();
  }
}

/// Serialized play snapshot (Tauri IPC + WASM).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayFrame {
  pub scene: crate::scene::SceneFile,
  pub stdout: String,
  pub side_effects: Vec<PlaySideEffect>,
  pub hud: Vec<HudText>,
  pub had_error: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudText {
  pub x: f32,
  pub y: f32,
  pub text: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlaySideEffect {
  PlaySound {
    name: Option<String>,
    url: Option<String>,
  },
}

impl PlayFrame {
  pub fn from_host(world: &World, host: &RoseGoldScriptHost) -> Self {
    Self {
      scene: world.to_scene(),
      stdout: host.last_stdout.clone(),
      side_effects: host
        .last_side_effects
        .iter()
        .filter_map(|d| match d {
          StrataDirective::PlaySound { name, url } => Some(PlaySideEffect::PlaySound {
            name: name.clone(),
            url: url.clone(),
          }),
          _ => None,
        })
        .collect(),
      hud: host
        .last_side_effects
        .iter()
        .filter_map(|d| match d {
          StrataDirective::UiText { x, y, text } => Some(HudText {
            x: *x,
            y: *y,
            text: text.clone(),
          }),
          _ => None,
        })
        .collect(),
      had_error: host.last_had_error,
    }
  }
}

/// World + script host for one play session (desktop Tauri or browser WASM).
pub struct PlaySession {
  world: World,
  host: RoseGoldScriptHost,
}

impl Default for PlaySession {
  fn default() -> Self {
    Self::new()
  }
}

impl PlaySession {
  pub fn new() -> Self {
    Self {
      world: World::new(),
      host: RoseGoldScriptHost::new(),
    }
  }

  pub fn set_scripts(
    &mut self,
    scripts: impl IntoIterator<Item = (String, String, Option<String>)>,
  ) {
    self.host.sync_scripts(scripts);
  }

  pub fn set_audio(&mut self, clips: impl IntoIterator<Item = (String, String)>) {
    self.host.set_audio(clips);
  }

  pub fn set_keys(&mut self, keys: impl Into<String>, pressed: Option<String>) {
    self.host.set_keys(keys);
    if let Some(pressed) = pressed {
      self.host.set_pressed(pressed);
    }
  }

  pub fn clear_play(&mut self) {
    self.host.clear_scripts();
    self.host.reset_input();
    self.world = World::new();
  }

  pub fn load_scene(&mut self, scene: crate::scene::SceneFile) -> PlayFrame {
    self.world = World::from_scene(scene);
    self.world.load(&mut self.host);
    PlayFrame::from_host(&self.world, &self.host)
  }

  pub fn tick(&mut self, dt: f32) -> PlayFrame {
    self.world.tick(dt, &mut self.host);
    PlayFrame::from_host(&self.world, &self.host)
  }

  pub fn snapshot(&self) -> crate::scene::SceneFile {
    self.world.to_scene()
  }
}

fn hook_args(
  ctx: &EvalContext,
  hook: &str,
  entity: &Entity,
  dt: f32,
  keys: &str,
  pressed: &str,
  other: Option<&str>,
) -> Vec<Value> {
  let Some(decl) = ctx.functions.get(hook) else {
    return vec![];
  };
  let n = decl.params.len();
  let mut args = Vec::new();
  if hook == "on_enter" || hook == "on_exit" {
    if n >= 1 {
      args.push(Value::String(other.unwrap_or("").to_string()));
    }
    if n >= 2 {
      args.push(Value::Float(entity.x as f64));
    }
    if n >= 3 {
      args.push(Value::Float(entity.y as f64));
    }
  } else {
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
      if n >= 6 {
        args.push(Value::String(pressed.to_string()));
      }
    }
  }
  while args.len() < n {
    args.push(Value::None);
  }
  if args.len() > n {
    args.truncate(n);
  }
  args
}

fn node_hook_args(hook: &str, dt: f32, other: Option<&str>) -> Vec<Value> {
  match hook {
    "on_update" => vec![Value::Float(dt as f64)],
    "on_enter" | "on_exit" => vec![Value::String(other.unwrap_or("").to_string())],
    _ => Vec::new(),
  }
}

fn node_method_args(raw: &[serde_json::Value]) -> Vec<Value> {
  raw.iter().map(json_to_value).collect()
}

fn method_args(ctx: &EvalContext, method: &str, raw: &[serde_json::Value]) -> Vec<Value> {
  let Some(decl) = ctx.functions.get(method) else {
    return Vec::new();
  };
  let mut args = Vec::new();
  for (i, p) in decl.params.iter().enumerate() {
    let json = raw.get(i).cloned().unwrap_or(serde_json::Value::Null);
    let ty = if p.ty.name == "String" {
      "Str"
    } else {
      p.ty.name.as_str()
    };
    if let Some(v) = rosegold::export::value_from_json(ty, &json) {
      args.push(v);
    } else {
      args.push(json_to_value(&json));
    }
  }
  args
}

fn json_to_value(raw: &serde_json::Value) -> Value {
  match raw {
    serde_json::Value::Number(n) => {
      if let Some(i) = n.as_i64() {
        Value::Int(i)
      } else if let Some(f) = n.as_f64() {
        Value::Float(f)
      } else {
        Value::None
      }
    }
    serde_json::Value::Bool(b) => Value::Bool(*b),
    serde_json::Value::String(s) => Value::String(s.clone()),
    _ => Value::None,
  }
}

/// Keys in `current` that were not in `prev` (comma-separated codes).
fn csv_just_pressed(prev: &str, current: &str) -> String {
  let prev: HashSet<&str> = prev
    .split(',')
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .collect();
  current
    .split(',')
    .map(str::trim)
    .filter(|s| !s.is_empty() && !prev.contains(s))
    .collect::<Vec<_>>()
    .join(",")
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

fn host_effect_to_directive(effect: HostEffect, entity_id: &str) -> StrataDirective {
  match effect {
    HostEffect::Move { dx, dy } => StrataDirective::Move {
      entity_id: entity_id.to_string(),
      dx: dx as f32,
      dy: dy as f32,
    },
    HostEffect::Rot { degrees } => StrataDirective::Rot {
      entity_id: entity_id.to_string(),
      degrees: degrees as f32,
    },
    HostEffect::Set { x, y, rot } => StrataDirective::Set {
      entity_id: entity_id.to_string(),
      x: x.map(|n| n as f32),
      y: y.map(|n| n as f32),
      rot: rot.map(|n| n as f32),
      z: None,
    },
    HostEffect::Spawn {
      name,
      kind,
      x,
      y,
      width,
      height,
      color,
      script,
    } => StrataDirective::Spawn {
      entity_id: entity_id.to_string(),
      name,
      kind,
      x: x as f32,
      y: y as f32,
      width: width as f32,
      height: height as f32,
      color,
      script,
    },
    HostEffect::SpawnPrefab { prefab, x, y } => StrataDirective::SpawnPrefab {
      entity_id: entity_id.to_string(),
      prefab,
      x: x.map(|n| n as f32),
      y: y.map(|n| n as f32),
    },
    HostEffect::Destroy { name } => StrataDirective::Destroy {
      entity_id: entity_id.to_string(),
      target_name: name,
    },
    HostEffect::PlaySound { name } => StrataDirective::PlaySound { name, url: None },
    HostEffect::Emit { signal, args } => StrataDirective::Emit {
      entity_id: entity_id.to_string(),
      signal,
      args,
    },
    HostEffect::After { delay, method } => StrataDirective::After {
      entity_id: entity_id.to_string(),
      delay: delay as f32,
      method,
    },
    HostEffect::UiText { x, y, text } => StrataDirective::UiText {
      x: x as f32,
      y: y as f32,
      text,
    },
  }
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
          z: kv.get("z").and_then(|s| s.parse().ok()),
        });
      }
      "play_sound" | "sound" => {
        out.push(StrataDirective::PlaySound {
          name: kv.get("name").cloned(),
          url: None,
        });
      }
      "spawn" => {
        if let Some(prefab) = kv.get("prefab") {
          out.push(StrataDirective::SpawnPrefab {
            entity_id: entity_id.to_string(),
            prefab: prefab.clone(),
            x: kv.get("x").and_then(|s| s.parse().ok()),
            y: kv.get("y").and_then(|s| s.parse().ok()),
          });
        } else {
          out.push(StrataDirective::Spawn {
            entity_id: entity_id.to_string(),
            name: kv.get("name").cloned().unwrap_or_else(|| "Entity".into()),
            kind: kv.get("kind").cloned().unwrap_or_else(|| "sprite".into()),
            x: kv.get("x").and_then(|s| s.parse().ok()).unwrap_or(0.0),
            y: kv.get("y").and_then(|s| s.parse().ok()).unwrap_or(0.0),
            width: kv
              .get("w")
              .or_else(|| kv.get("width"))
              .and_then(|s| s.parse().ok())
              .unwrap_or(32.0),
            height: kv
              .get("h")
              .or_else(|| kv.get("height"))
              .and_then(|s| s.parse().ok())
              .unwrap_or(32.0),
            color: kv
              .get("color")
              .cloned()
              .unwrap_or_else(|| "#61afef".into()),
            script: kv.get("script").cloned(),
          });
        }
      }
      "destroy" => {
        out.push(StrataDirective::Destroy {
          entity_id: entity_id.to_string(),
          target_name: kv.get("name").cloned(),
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
      x,
      y,
      ..Default::default()
    }
  }

  #[test]
  fn host_applies_strata_move_without_print() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    strata.move(3.0, 1.0);
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let e = &world.entities()[0];
    assert!((e.x - 3.0).abs() < 0.001);
    assert!((e.y - 1.0).abs() < 0.001);
    assert!(
      !host.last_stdout.contains("strata:"),
      "stdout should not carry directives: {}",
      host.last_stdout
    );
  }

  #[test]
  fn host_strata_find_by_name_and_nearest() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![
        entity("e1", "Hero", 0.0, 0.0),
        entity("e2", "Coin", 10.0, 0.0),
        entity("e3", "Orb", 100.0, 0.0),
      ],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    print(strata.find("Coin"));
    print(strata.find("Missing"));
    print(strata.find());
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    assert!(
      host.last_stdout.contains("Coin"),
      "find by name: {}",
      host.last_stdout
    );
    assert!(
      host.last_stdout.contains("none"),
      "missing name: {}",
      host.last_stdout
    );
    let lines: Vec<&str> = host.last_stdout.lines().collect();
    assert_eq!(lines.get(2).copied(), Some("Coin"), "{:?}", lines);
  }

  #[test]
  fn host_injects_script_props_into_export_var() {
    let mut coin = entity("c1", "Coin", 0.0, 0.0);
    coin.script_props.insert("spin".into(), serde_json::json!(20.0));
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![coin],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "c1",
      r#"
import strata;

@export var spin: Float = 8.0;
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    strata.rot(spin);
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let e = &world.entities()[0];
    assert!(
      (e.rotation_z - 20.0).abs() < 0.001,
      "expected Inspector override 20, got {}",
      e.rotation_z
    );
  }

  #[test]
  fn host_dispatches_signal_to_connected_method() {
    let mut coin = entity("c1", "Coin", 10.0, 0.0);
    coin.connections.push(crate::scene::ScriptConnection {
      signal: "collected".into(),
      to: "e1".into(),
      method: "on_coin".into(),
    });
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0), coin],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
fn on_coin(amount: Int): Int {
    print(f"[coin] {amount}");
    return 0;
}
fn on_enter(other: String, x: Float, y: Float): Int {
    print(f"[enter] {other}");
    return 0;
}
"#,
    );
    host.set_script(
      "c1",
      r#"
signal collected(amount: Int);
fn on_enter(other: String, x: Float, y: Float): Int {
    collected.emit(1);
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("[coin] 1"),
      "Player on_coin should run via connection; stdout={}",
      host.last_stdout
    );
    assert!(
      host.last_stdout.contains("[enter] Coin") || host.last_stdout.contains("[enter] Hero"),
      "stdout={}",
      host.last_stdout
    );
  }

  #[test]
  fn host_on_destroy_runs_before_remove() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.destroy();
    return 0;
}
fn on_destroy(): Int {
    print("[gone] Hero");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("[gone] Hero"),
      "stdout={}",
      host.last_stdout
    );
    assert!(world.entities().is_empty());
  }

  #[test]
  fn host_node_class_hooks() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 3.0, 4.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata.Sprite;

@node
class MyNode extends Sprite {
    fn on_create(self) {
        print("MyNode created");
        print(self.x);
    }
    fn on_update(self, dt: Float) {
        self.x = self.x + 1.0;
        print("MyNode updated");
    }
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("MyNode created"),
      "stdout={}",
      host.last_stdout
    );
    assert!(host.last_stdout.contains("3"), "stdout={}", host.last_stdout);
    world.tick(0.016, &mut host);
    assert!(
      host.last_stdout.contains("MyNode updated"),
      "stdout={}",
      host.last_stdout
    );
    let e = world.entities().iter().find(|e| e.id == "e1").unwrap();
    assert!((e.x - 4.0).abs() < 0.001, "x={}", e.x);
  }

  #[test]
  fn host_after_fires_method_once() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("c1", "Coin", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "c1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.after(0.2, "pop");
    return 0;
}
fn pop(): Int {
    print("[pop]");
    strata.destroy();
    return 0;
}
fn on_destroy(): Int {
    print("[gone] coin");
    return 0;
}
"#,
    );
    world.load(&mut host);
    world.tick(0.1, &mut host);
    assert!(
      world.entities().iter().any(|e| e.name == "Coin"),
      "should still exist before the timer"
    );
    assert!(!host.last_stdout.contains("[pop]"));
    world.tick(0.15, &mut host);
    assert!(
      host.last_stdout.contains("[pop]"),
      "stdout={}",
      host.last_stdout
    );
    assert!(
      host.last_stdout.contains("[gone] coin"),
      "stdout={}",
      host.last_stdout
    );
    assert!(!world.entities().iter().any(|e| e.name == "Coin"));
    host.last_stdout.clear();
    world.tick(0.2, &mut host);
    assert!(
      !host.last_stdout.contains("[pop]"),
      "after should fire once; stdout={}",
      host.last_stdout
    );
  }

  #[test]
  fn host_input_pressed_is_edge_not_held() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import input;
import strata;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    if input.held("ArrowRight") {
        strata.move(3.0, 0.0);
    }
    if input.pressed("Space") {
        print("jump");
    }
    return 0;
}
"#,
    );
    host.set_keys("ArrowRight,Space");
    host.set_pressed("Space");
    world.tick(0.016, &mut host);
    assert!(
      host.last_stdout.contains("jump"),
      "stdout={}",
      host.last_stdout
    );
    assert!((world.entities()[0].x - 3.0).abs() < 0.001);
    host.set_keys("ArrowRight,Space");
    host.set_pressed("");
    world.tick(0.016, &mut host);
    assert!(
      !host.last_stdout.contains("jump"),
      "held Space must not retrigger; stdout={}",
      host.last_stdout
    );
    assert!((world.entities()[0].x - 6.0).abs() < 0.001);
  }

  #[test]
  fn host_applies_move_on_update() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
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
  fn host_module_var_persists_across_ticks() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
var n: Int = 0;
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    n = n + 1;
    if n == 1 {
        print("strata:move dx=1 dy=0");
    }
    if n == 3 {
        print("strata:move dx=10 dy=0");
    }
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 1.0).abs() < 0.001);
    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 1.0).abs() < 0.001);
    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 11.0).abs() < 0.001);
  }

  #[test]
  fn host_vms_are_isolated_per_entity() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("a", "A", 0.0, 0.0), entity("b", "B", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    let src = r#"
var n: Int = 0;
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    n = n + 1;
    if n == 1 { print("strata:move dx=1 dy=0"); }
    if n == 2 { print("strata:move dx=2 dy=0"); }
    return 0;
}
"#;
    host.set_script("a", src);
    host.set_script("b", src);
    world.tick(0.016, &mut host);
    world.tick(0.016, &mut host);
    let a = world.entities().iter().find(|e| e.id == "a").unwrap();
    let b = world.entities().iter().find(|e| e.id == "b").unwrap();
    // Isolated: each moves 1 then 2 → x=3. Shared would be 1+3 and 2+4.
    assert!((a.x - 3.0).abs() < 0.001, "a.x={}", a.x);
    assert!((b.x - 3.0).abs() < 0.001, "b.x={}", b.x);
  }

  #[test]
  fn host_sync_same_source_keeps_vars() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    let src = r#"
var n: Int = 0;
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    n = n + 1;
    if n == 2 { print("strata:move dx=5 dy=0"); }
    return 0;
}
"#;
    host.set_script("e1", src);
    world.tick(0.016, &mut host);
    host.sync_scripts(vec![(
      "e1".into(),
      src.into(),
      Some("Hero.rg".into()),
    )]);
    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 5.0).abs() < 0.001);
  }

  #[test]
  fn csv_just_pressed_new_keys_only() {
    assert_eq!(csv_just_pressed("", "Space"), "Space");
    assert_eq!(csv_just_pressed("Space", "Space"), "");
    assert_eq!(csv_just_pressed("ArrowRight", "ArrowRight,Space"), "Space");
    assert_eq!(csv_just_pressed("Space", ""), "");
  }

  #[test]
  fn host_pressed_fires_once_while_held() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import str;
fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String, pressed: String): Int {
    if str.contains(keys, "ArrowRight") {
        print("strata:move dx=1 dy=0");
    }
    if str.contains(pressed, "Space") {
        print("strata:play_sound name=jump.wav");
    }
    return 0;
}
"#,
    );
    host.set_keys("ArrowRight,Space");
    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 1.0).abs() < 0.001);
    assert_eq!(host.last_side_effects.len(), 1);

    world.tick(0.016, &mut host);
    assert!((world.entities()[0].x - 2.0).abs() < 0.001);
    assert!(host.last_side_effects.is_empty());
  }

  #[test]
  fn host_pressed_from_ui_catches_short_tap() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0), entity("e2", "Coin", 4.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import str;
fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String, pressed: String): Int {
    if str.contains(pressed, "KeyQ") {
        print("strata:destroy name=Coin");
    }
    return 0;
}
"#,
    );
    world.load(&mut host);
    host.set_keys("");
    host.set_pressed("KeyQ");
    world.tick(0.016, &mut host);
    assert!(!world.entities().iter().any(|e| e.name == "Coin"));
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

  #[test]
  fn host_strata_spawn_and_destroy() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0), entity("e2", "Foe", 10.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r##"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.spawn({ "name": "Orb", "kind": "sprite", "x": 5.0, "y": 6.0, "w": 16.0, "h": 16.0, "color": "#ff0000" });
    strata.destroy("Foe");
    return 0;
}
"##,
    );
    world.load(&mut host);
    assert_eq!(world.entities().len(), 2);
    assert!(world.entities().iter().any(|e| e.name == "Orb"));
    assert!(!world.entities().iter().any(|e| e.name == "Foe"));
    let orb = world.entities().iter().find(|e| e.name == "Orb").unwrap();
    assert!((orb.x - 5.0).abs() < 0.001);
    assert!((orb.y - 6.0).abs() < 0.001);
  }

  #[test]
  fn host_spawn_and_destroy() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0), entity("e2", "Foe", 10.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
fn on_ready(name: String, x: Float, y: Float): Int {
    print("strata:spawn name=Orb kind=sprite x=5 y=6 w=16 h=16 color=#ff0000");
    print("strata:destroy name=Foe");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert_eq!(world.entities().len(), 2); // Hero + Orb (Foe destroyed)
    assert!(world.entities().iter().any(|e| e.name == "Orb"));
    assert!(!world.entities().iter().any(|e| e.name == "Foe"));
    let orb = world.entities().iter().find(|e| e.name == "Orb").unwrap();
    assert!((orb.x - 5.0).abs() < 0.001);
    assert!((orb.y - 6.0).abs() < 0.001);
  }

  #[test]
  fn host_spawn_with_script_library() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.register_script(
      "CoinSpin.rg",
      r#"
fn on_ready(name: String, x: Float, y: Float): Int {
    print("orb-ready");
    return 0;
}
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    print("strata:rot 1");
    return 0;
}
"#,
    );
    host.set_script(
      "e1",
      r#"
fn on_ready(name: String, x: Float, y: Float): Int {
    print("strata:spawn name=Orb x=1 y=2 script=CoinSpin.rg");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(world.entities().iter().any(|e| e.name == "Orb"));
    assert!(host.last_stdout.contains("orb-ready"));
    world.tick(0.016, &mut host);
    let orb = world.entities().iter().find(|e| e.name == "Orb").unwrap();
    assert!(orb.rotation_z.abs() > 0.0);
  }

  #[test]
  fn host_import_from_script_library() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.register_script(
      "helpers.rg",
      r#"
mod utils {
    pub fn move_line(dx: Float, dy: Float) {
        strata.move(dx, dy);
    }
}
"#,
    );
    host.set_script(
      "e1",
      r#"
import strata;
import utils;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    utils.move_line(2.0, 1.0);
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let e = &world.entities()[0];
    assert!(
      (e.x - 2.0).abs() < 0.001 && (e.y - 1.0).abs() < 0.001,
      "x={} y={} stdout={}",
      e.x,
      e.y,
      host.last_stdout
    );
  }

  #[test]
  fn play_session_demo_hero_imports_utils() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo-project/scripts");
    let hero = std::fs::read_to_string(root.join("Hero.rg")).expect("Hero.rg");
    let utils = std::fs::read_to_string(root.join("utils.rg")).expect("utils.rg");
    let mut session = PlaySession::new();
    session.set_scripts(vec![
      ("e1".into(), hero, Some("Hero.rg".into())),
      ("__lib_utils".into(), utils, Some("utils.rg".into())),
    ]);
    let orb = entity("pfb_orb", "Orb", 80.0, -20.0);
    let scene = SceneFile {
      version: 2,
      name: "demo".into(),
      mode: Mode::D2,
      prefabs: vec![orb],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    session.load_scene(scene);
    let frame = session.tick(0.016);
    assert!(
      frame.scene.entities.iter().any(|e| e.name == "Orb"),
      "Hero on_ready should spawn Orb prefab; stdout={}",
      frame.stdout
    );
    let e = frame
      .scene
      .entities
      .iter()
      .find(|e| e.name == "Hero")
      .expect("Hero");
    assert!(
      (e.x - 1.0).abs() < 0.001,
      "Hero should move via utils.move_line; x={} stdout={}",
      e.x,
      frame.stdout
    );
    assert!(!frame.had_error, "stdout={}", frame.stdout);
    assert_eq!(
      frame.hud.iter().map(|h| h.text.as_str()).collect::<Vec<_>>(),
      vec!["coins 0"],
      "hud={:?}",
      frame.hud
    );
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![
        entity("e1", "Hero", 0.0, 0.0),
        entity("e2", "Coin", 10.0, 0.0),
      ],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_enter(other: String, x: Float, y: Float): Int {
    print(f"[enter] {other}");
    return 0;
}
fn on_exit(other: String, x: Float, y: Float): Int {
    print(f"[exit] {other}");
    return 0;
}
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    strata.move(80.0, 0.0);
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("[enter] Coin"),
      "stdout={}",
      host.last_stdout
    );
    world.tick(0.016, &mut host);
    assert!(
      host.last_stdout.contains("[exit] Coin"),
      "stdout={}",
      host.last_stdout
    );
  }

  #[test]
  fn solid_wall_stops_hero_coin_still_enters() {
    let mut hero = entity("e1", "Hero", 0.0, 0.0);
    hero.solid = true;
    hero.width = 32.0;
    hero.height = 32.0;
    let mut wall = entity("e2", "Wall", 40.0, 0.0);
    wall.solid = true;
    wall.width = 32.0;
    wall.height = 32.0;
    let mut coin = entity("e3", "Coin", 24.0, 0.0);
    coin.width = 16.0;
    coin.height = 16.0;
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![hero, wall, coin],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_enter(other: String, x: Float, y: Float): Int {
    print(f"[enter] {other}");
    return 0;
}
fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    strata.move(20.0, 0.0);
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let h = world.entities().iter().find(|e| e.name == "Hero").unwrap();
    let w = world.entities().iter().find(|e| e.name == "Wall").unwrap();
    let c = world.entities().iter().find(|e| e.name == "Coin").unwrap();
    assert!(
      (h.x - 8.0).abs() < 0.001,
      "hero should stop flush with the wall; x={}",
      h.x
    );
    assert!((w.x - 40.0).abs() < 0.001, "wall must not move");
    assert!((c.x - 24.0).abs() < 0.001, "coin must not be shoved");
    assert!(
      host.last_stdout.contains("[enter] Coin"),
      "walking through the area should still fire on_enter; stdout={}",
      host.last_stdout
    );
    assert!(
      !host.last_stdout.contains("[enter] Wall"),
      "resolved solids should not linger overlapping; stdout={}",
      host.last_stdout
    );
  }

  #[test]
  fn solid_tiles_stop_hero_on_play() {
    use crate::scene::{EntityKind, TileCell};
    let mut hero = entity("e1", "Hero", 8.0, 8.0);
    hero.solid = true;
    hero.width = 16.0;
    hero.height = 16.0;
    let ground = Entity {
      id: "g".into(),
      name: "Ground".into(),
      kind: EntityKind::Tilemap,
      x: 0.0,
      y: 8.0,
      tile_size: 16.0,
      solid: true,
      tiles: vec![TileCell { x: 0, y: 0, i: 0 }],
      ..Default::default()
    };
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![hero, ground],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    strata.move(0.0, 4.0);
    return 0;
}
"#,
    );
    world.tick(0.016, &mut host);
    let h = world.entities().iter().find(|e| e.name == "Hero").unwrap();
    assert!(
      h.y.abs() < 0.001,
      "hero should rest on the tilemap; y={}",
      h.y
    );
  }

  #[test]
  fn spawn_prefab_clones_template() {
    let mut orb = entity("pfb_orb", "Orb", 80.0, -20.0);
    orb.width = 24.0;
    orb.height = 24.0;
    orb.color = "#61afef".into();
    orb.script_path = "CoinSpin.rg".into();
    orb.texture_id = Some("tex_coin".into());
    orb.script_id = Some("scr_coin".into());
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![orb],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.register_script(
      "CoinSpin.rg",
      r#"
fn on_ready(name: String, x: Float, y: Float): Int {
    print("orb-ready");
    return 0;
}
"#,
    );
    host.set_script(
      "e1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.spawn({ "prefab": "Orb", "x": 80.0, "y": -20.0 });
    return 0;
}
"#,
    );
    world.load(&mut host);
    let spawned = world
      .entities()
      .iter()
      .find(|e| e.name == "Orb")
      .expect("prefab instance");
    assert!((spawned.x - 80.0).abs() < 0.001);
    assert!((spawned.y - (-20.0)).abs() < 0.001);
    assert!((spawned.width - 24.0).abs() < 0.001);
    assert_eq!(spawned.texture_id.as_deref(), Some("tex_coin"));
    assert_eq!(spawned.script_id.as_deref(), Some("scr_coin"));
    assert_eq!(world.entities().len(), 2);
    assert!(
      host.last_stdout.contains("orb-ready"),
      "stdout={}",
      host.last_stdout
    );
  }

  #[test]
  fn spawn_prefab_clones_children() {
    let mut orb = entity("pfb_orb", "Orb", 80.0, -20.0);
    orb.script_path = "CoinSpin.rg".into();
    let mut gem = entity("pfb_gem", "Gem", 4.0, 8.0);
    gem.parent_id = Some("pfb_orb".into());
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![orb, gem],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.spawn({ "prefab": "Orb", "x": 10.0, "y": 20.0 });
    return 0;
}
"#,
    );
    world.load(&mut host);
    let root = world
      .entities()
      .iter()
      .find(|e| e.name == "Orb")
      .expect("root");
    let child = world
      .entities()
      .iter()
      .find(|e| e.name == "Gem")
      .expect("child");
    assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
    assert!((root.x - 10.0).abs() < 0.001);
    assert!((child.x - 4.0).abs() < 0.001);
    assert!((child.y - 8.0).abs() < 0.001);
  }

  #[test]
  fn parse_spawn_and_destroy() {
    let d = parse_strata_directives(
      "strata:spawn name=Orb x=1 y=2 w=8 h=8 script=CoinSpin.rg\nstrata:destroy name=Foe\n",
      "e1",
    );
    assert!(matches!(
      &d[0],
      StrataDirective::Spawn { name, x, y, script, .. }
        if name == "Orb"
          && (*x - 1.0).abs() < 0.001
          && (*y - 2.0).abs() < 0.001
          && script.as_deref() == Some("CoinSpin.rg")
    ));
    assert_eq!(
      d[1],
      StrataDirective::Destroy {
        entity_id: "e1".into(),
        target_name: Some("Foe".into()),
      }
    );
  }

  #[test]
  fn parented_coin_collects_on_enter() {
    let mut coin = entity("e2", "Coin", 0.0, 0.0);
    coin.parent_id = Some("e1".into());
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0), coin],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_script(
      "e2",
      r#"
import strata;

fn on_enter(other: String, x: Float, y: Float): Int {
    print(f"[collect] {other}");
    strata.destroy("Coin");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("[collect] Hero"),
      "stdout={}",
      host.last_stdout
    );
    assert!(
      world.entities().iter().all(|e| e.name != "Coin"),
      "coin should be destroyed"
    );
  }

  #[test]
  fn play_sound_resolves_url_from_library() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_audio(vec![("jump.wav".into(), "/audio/jump.wav".into())]);
    host.set_script(
      "e1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.play_sound("jump.wav");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_side_effects.iter().any(|d| matches!(
        d,
        StrataDirective::PlaySound { name, url }
          if name.as_deref() == Some("jump.wav") && url.as_deref() == Some("/audio/jump.wav")
      )),
      "effects={:?}",
      host.last_side_effects
    );
    assert!(!host.last_stdout.contains("audio not found"));
  }

  #[test]
  fn ui_text_reaches_play_frame() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut session = PlaySession::new();
    session.set_scripts(vec![(
      "e1".into(),
      r#"
import ui;

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    ui.text(16.0, 24.0, "coins 3");
    return 0;
}
"#
      .into(),
      Some("Hud.rg".into()),
    )]);
    session.load_scene(scene);
    let frame = session.tick(0.016);
    assert!(!frame.had_error, "stdout={}", frame.stdout);
    assert_eq!(frame.hud.len(), 1, "hud={:?}", frame.hud);
    assert_eq!(frame.hud[0].text, "coins 3");
    assert!((frame.hud[0].x - 16.0).abs() < 0.001);
    assert!((frame.hud[0].y - 24.0).abs() < 0.001);
  }

  #[test]
  fn play_sound_missing_clip_logs() {
    let scene = SceneFile {
      version: 2,
      name: "test".into(),
      mode: Mode::D2,
      prefabs: vec![],
      entities: vec![entity("e1", "Hero", 0.0, 0.0)],
    };
    let mut world = World::from_scene(scene);
    let mut host = RoseGoldScriptHost::new();
    host.set_audio(vec![("jump.wav".into(), "/audio/jump.wav".into())]);
    host.set_script(
      "e1",
      r#"
import strata;

fn on_ready(name: String, x: Float, y: Float): Int {
    strata.play_sound("nope.wav");
    return 0;
}
"#,
    );
    world.load(&mut host);
    assert!(
      host.last_stdout.contains("[audio not found nope.wav]"),
      "stdout={}",
      host.last_stdout
    );
  }
}
