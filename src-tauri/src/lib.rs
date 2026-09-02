use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use strata_engine::{PlayFrame, PlaySession, SceneFile, ENGINE_VERSION};
use tauri::State;

mod menu;
use menu::sync_view_menu;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  message: String,
  effects: Vec<rosegold::HostEffect>,
  hook_effects: Vec<rosegold::LabeledHostEffects>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectEntry {
  name: String,
  path: String,
  scene: Option<String>,
  /// True when this folder is a child of the chosen projects root.
  nested: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
  name: String,
  path: String,
  relative_path: String,
  kind: String,
  size: u64,
  content: Option<String>,
}

pub struct EngineState {
  session: Mutex<PlaySession>,
}

impl Default for EngineState {
  fn default() -> Self {
    Self {
      session: Mutex::new(PlaySession::new()),
    }
  }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
  pub version: String,
  pub script_host: String,
}

static ROSEGOLD_RUN_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_rosegold_dir(base: &str) -> Result<PathBuf, String> {
  let n = ROSEGOLD_RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
  let dir = std::env::temp_dir().join(format!("{base}-{n}"));
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

fn run_rosegold_file(path: &Path) -> Result<RunResult, String> {
  let result = rosegold::run_file(path);
  Ok(RunResult {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.message,
    effects: result.effects,
    hook_effects: Vec::new(),
  })
}


#[tauri::command]
fn check_rosegold(
  source: String,
  file: Option<String>,
  modules: Option<HashMap<String, String>>,
) -> Vec<rosegold::Diagnostic> {
  let file = file.unwrap_or_else(|| "script.rg".into());
  match modules {
    Some(m) if !m.is_empty() => rosegold::check_source_with_modules(&source, &file, m),
    _ => rosegold::check_source(&source, &file),
  }
}

#[tauri::command]
fn def_rosegold(
  source: String,
  file: Option<String>,
  line: u32,
  col: u32,
  modules: Option<HashMap<String, String>>,
) -> Option<rosegold::SymbolInfo> {
  let file = file.unwrap_or_else(|| "script.rg".into());
  let modules = modules.unwrap_or_default();
  rosegold::def_at(&source, &file, line, col, modules)
}

#[tauri::command]
fn hover_rosegold(
  source: String,
  file: Option<String>,
  line: u32,
  col: u32,
  modules: Option<HashMap<String, String>>,
) -> Option<rosegold::SymbolInfo> {
  let file = file.unwrap_or_else(|| "script.rg".into());
  let modules = modules.unwrap_or_default();
  rosegold::hover_at(&source, &file, line, col, modules)
}

#[tauri::command]
fn list_rosegold_exports(source: String) -> Vec<rosegold::ExportField> {
  rosegold::list_exports(&source)
}

#[tauri::command]
fn list_rosegold_signals(
  source: String,
  modules: Option<HashMap<String, String>>,
) -> Vec<rosegold::SignalField> {
  match modules {
    Some(m) if !m.is_empty() => rosegold::list_signals_with_modules(&source, m),
    _ => rosegold::list_signals(&source),
  }
}

#[tauri::command]
fn list_rosegold_fns(source: String) -> Vec<rosegold::FnMeta> {
  rosegold::list_fns(&source)
}

#[tauri::command]
fn list_rosegold_nodes(source: String) -> Vec<rosegold::NodeClass> {
  rosegold::list_nodes(&source)
}

#[tauri::command]
fn stdlib_rosegold(name: String) -> Option<String> {
  rosegold::stdlib::file_source(&name).map(|(_, src)| src.to_string())
}

#[tauri::command]
fn run_rosegold(source: String) -> Result<RunResult, String> {
  let dir = unique_rosegold_dir("strata-rosegold")?;
  let path = dir.join("play.rg");
  {
    let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
    file
      .write_all(source.as_bytes())
      .map_err(|e| e.to_string())?;
  }
  run_rosegold_file(&path)
}

#[tauri::command]
fn run_rosegold_preview(
  source: String,
  name: String,
  x: f64,
  y: f64,
  modules: Option<HashMap<String, String>>,
) -> Result<RunResult, String> {
  let result = match modules {
    Some(m) if !m.is_empty() => rosegold::run_preview_with_modules(&source, &name, x, y, m),
    _ => rosegold::run_preview(&source, &name, x, y),
  };
  Ok(RunResult {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.message,
    effects: result.effects,
    hook_effects: Vec::new(),
  })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HookJob {
  label: String,
  source: String,
}

#[tauri::command]
fn run_rosegold_hooks(jobs: Vec<HookJob>) -> Result<RunResult, String> {
  let mut all_out = String::new();
  let mut all_err = String::new();
  let mut hook_effects = Vec::new();
  let mut ok = true;

  for (i, job) in jobs.iter().enumerate() {
    let dir = unique_rosegold_dir("strata-rosegold-hook")?;
    let path = dir.join(format!("hook_{i}.rg"));
    fs::write(&path, &job.source).map_err(|e| e.to_string())?;
    let mut result = run_rosegold_file(&path)?;
    hook_effects.push(rosegold::LabeledHostEffects {
      label: job.label.clone(),
      effects: std::mem::take(&mut result.effects),
    });
    all_out.push_str(&format!("--- {} ---\n", job.label));
    if !result.stdout.is_empty() {
      all_out.push_str(&result.stdout);
      if !result.stdout.ends_with('\n') {
        all_out.push('\n');
      }
    }
    if !result.stderr.is_empty() {
      all_err.push_str(&format!("--- {} ---\n{}", job.label, result.stderr));
      if !result.stderr.ends_with('\n') {
        all_err.push('\n');
      }
    }
    if !result.ok {
      ok = false;
    }
  }

  Ok(RunResult {
    ok,
    stdout: all_out,
    stderr: all_err,
    message: if ok {
      format!("Ran {} RoseGold hook job(s)", jobs.len())
    } else {
      format!("One or more of {} hook job(s) failed", jobs.len())
    },
    effects: Vec::new(),
    hook_effects,
  })
}

fn classify(name: &str) -> Option<&'static str> {
  let lower = name.to_ascii_lowercase();
  if lower == "strata.json" {
    None
  } else if lower.ends_with(".rg") {
    Some("script")
  } else if lower.ends_with(".scene") || lower.ends_with(".json") {
    Some("scene")
  } else if lower.ends_with(".png")
    || lower.ends_with(".jpg")
    || lower.ends_with(".jpeg")
    || lower.ends_with(".webp")
    || lower.ends_with(".gif")
  {
    Some("texture")
  } else if lower.ends_with(".wav") || lower.ends_with(".mp3") || lower.ends_with(".ogg") {
    Some("audio")
  } else {
    None
  }
}

fn should_skip_dir(name: &str) -> bool {
  matches!(
    name,
    ".git"
      | "node_modules"
      | "target"
      | "dist"
      | ".venv"
      | "venv"
      | "__pycache__"
      | ".strata"
  ) || name.starts_with('.')
}

fn walk_project(
  root: &Path,
  dir: &Path,
  depth: u32,
  out: &mut Vec<ProjectFile>,
) -> Result<(), String> {
  if depth > 6 {
    return Ok(());
  }
  let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let name = entry.file_name().to_string_lossy().to_string();
    let full = entry.path();
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if meta.is_dir() {
      if should_skip_dir(&name) {
        continue;
      }
      let relative = full
        .strip_prefix(root)
        .unwrap_or(&full)
        .to_string_lossy()
        .replace('\\', "/");
      if !relative.is_empty() {
        out.push(ProjectFile {
          name: name.clone(),
          path: full.to_string_lossy().to_string(),
          relative_path: relative,
          kind: "folder".into(),
          size: 0,
          content: None,
        });
      }
      walk_project(root, &full, depth + 1, out)?;
      continue;
    }
    if !meta.is_file() {
      continue;
    }
    let Some(kind) = classify(&name) else {
      continue;
    };
    let relative = full
      .strip_prefix(root)
      .unwrap_or(&full)
      .to_string_lossy()
      .replace('\\', "/");
    let content = if kind == "script" || kind == "scene" {
      match fs::read_to_string(&full) {
        Ok(text) if text.len() <= 512_000 => Some(text),
        Ok(_) => Some("// [file too large to preload]".into()),
        Err(_) => None,
      }
    } else {
      None
    };
    out.push(ProjectFile {
      name,
      path: full.to_string_lossy().to_string(),
      relative_path: relative,
      kind: kind.into(),
      size: meta.len(),
      content,
    });
  }
  Ok(())
}

#[tauri::command]
fn list_project_files(path: String) -> Result<Vec<ProjectFile>, String> {
  let root = PathBuf::from(&path);
  if !root.is_dir() {
    return Err("Not a directory".into());
  }
  let mut out = Vec::new();
  walk_project(&root, &root, 0, &mut out)?;
  out.sort_by(|a, b| {
    a.relative_path
      .to_lowercase()
      .cmp(&b.relative_path.to_lowercase())
  });
  Ok(out)
}

fn dir_is_project(dir: &Path) -> bool {
  let Ok(entries) = fs::read_dir(dir) else {
    return false;
  };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_lowercase();
    if name == "strata.json" || name.ends_with(".scene") {
      return true;
    }
  }
  false
}

fn first_scene_name(dir: &Path) -> Option<String> {
  let entries = fs::read_dir(dir).ok()?;
  let mut scenes: Vec<String> = entries
    .flatten()
    .filter(|e| e.path().is_file())
    .map(|e| e.file_name().to_string_lossy().to_string())
    .filter(|n| n.to_lowercase().ends_with(".scene"))
    .collect();
  scenes.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
  scenes.into_iter().next()
}

fn sanitize_project_name(name: &str) -> Result<String, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("Name is empty".into());
  }
  if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
    return Err("Name cannot contain path separators".into());
  }
  if trimmed.starts_with('.') {
    return Err("Name cannot start with a dot".into());
  }
  Ok(trimmed.to_string())
}

const NEW_PROJECT_SCENE: &str = r#"{
  "version": 2,
  "name": "main.scene",
  "mode": "2d",
  "entities": [
    { "id": "ent_root", "name": "Root", "kind": "empty", "width": 24, "height": 24 }
  ],
  "prefabs": []
}"#;

const NEW_PROJECT_SETTINGS: &str = r#"{
  "renderLayers": [{ "id": "layer_default", "name": "Default", "order": 0 }]
}"#;

#[tauri::command]
fn list_project_entries(root: String) -> Result<Vec<ProjectEntry>, String> {
  let root = PathBuf::from(&root);
  if !root.is_dir() {
    return Err("Not a directory".into());
  }
  let mut children = Vec::new();
  let entries = fs::read_dir(&root).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if !meta.is_dir() {
      continue;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    if should_skip_dir(&name) {
      continue;
    }
    let path = entry.path();
    if !dir_is_project(&path) {
      continue;
    }
    children.push(ProjectEntry {
      name: name.clone(),
      path: path.to_string_lossy().to_string(),
      scene: first_scene_name(&path),
      nested: true,
    });
  }
  children.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  if children.is_empty() && dir_is_project(&root) {
    let name = root
      .file_name()
      .map(|n| n.to_string_lossy().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| "Project".into());
    return Ok(vec![ProjectEntry {
      name,
      path: root.to_string_lossy().to_string(),
      scene: first_scene_name(&root),
      nested: false,
    }]);
  }
  Ok(children)
}

#[tauri::command]
fn create_project_folder(root: String, name: String) -> Result<ProjectEntry, String> {
  let name = sanitize_project_name(&name)?;
  let root = PathBuf::from(&root);
  if !root.is_dir() {
    return Err("Not a directory".into());
  }
  let path = root.join(&name);
  if path.exists() {
    return Err("A folder with that name already exists".into());
  }
  fs::create_dir_all(&path).map_err(|e| e.to_string())?;
  fs::write(path.join("strata.json"), NEW_PROJECT_SETTINGS).map_err(|e| e.to_string())?;
  fs::write(path.join("main.scene"), NEW_PROJECT_SCENE).map_err(|e| e.to_string())?;
  Ok(ProjectEntry {
    name,
    path: path.to_string_lossy().to_string(),
    scene: Some("main.scene".into()),
    nested: true,
  })
}

#[tauri::command]
fn create_project_dir(path: String) -> Result<(), String> {
  let dest = PathBuf::from(&path);
  let name = dest
    .file_name()
    .map(|n| n.to_string_lossy().to_string())
    .unwrap_or_default();
  if name.is_empty() || name == "." || name == ".." || name.starts_with('.') {
    return Err("Invalid folder name".into());
  }
  if name.contains('/') || name.contains('\\') {
    return Err("Name cannot contain path separators".into());
  }
  if dest.exists() {
    return Err("A folder with that name already exists".into());
  }
  fs::create_dir_all(&dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
  if let Some(parent) = Path::new(&path).parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut file = fs::OpenOptions::new()
    .create(true)
    .write(true)
    .truncate(true)
    .open(&path)
    .map_err(|e| e.to_string())?;
  file
    .write_all(contents.as_bytes())
    .map_err(|e| e.to_string())?;
  file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_file_base64(path: String, contents: String) -> Result<(), String> {
  let bytes = data_decoding_base64(&contents)?;
  if let Some(parent) = Path::new(&path).parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
  fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
  use std::io::Read;
  let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
  let mut buf = Vec::new();
  file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
  Ok(data_encoding_base64(&buf))
}

fn data_encoding_base64(bytes: &[u8]) -> String {
  const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::new();
  let mut i = 0;
  while i + 3 <= bytes.len() {
    let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | (bytes[i + 2] as u32);
    out.push(TABLE[((n >> 18) & 63) as usize] as char);
    out.push(TABLE[((n >> 12) & 63) as usize] as char);
    out.push(TABLE[((n >> 6) & 63) as usize] as char);
    out.push(TABLE[(n & 63) as usize] as char);
    i += 3;
  }
  let rem = bytes.len() - i;
  if rem == 1 {
    let n = (bytes[i] as u32) << 16;
    out.push(TABLE[((n >> 18) & 63) as usize] as char);
    out.push(TABLE[((n >> 12) & 63) as usize] as char);
    out.push('=');
    out.push('=');
  } else if rem == 2 {
    let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
    out.push(TABLE[((n >> 18) & 63) as usize] as char);
    out.push(TABLE[((n >> 12) & 63) as usize] as char);
    out.push(TABLE[((n >> 6) & 63) as usize] as char);
    out.push('=');
  }
  out
}

fn data_decoding_base64(s: &str) -> Result<Vec<u8>, String> {
  const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut rev = [0xffu8; 256];
  for (i, b) in TABLE.iter().enumerate() {
    rev[*b as usize] = i as u8;
  }
  let cleaned: Vec<u8> = s
    .bytes()
    .filter(|b| !b.is_ascii_whitespace())
    .collect();
  if cleaned.len() % 4 != 0 {
    return Err("invalid base64".into());
  }
  let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
  for chunk in cleaned.chunks_exact(4) {
    let pad = chunk.iter().filter(|b| **b == b'=').count();
    let mut n = 0u32;
    for b in chunk {
      let v = if *b == b'=' {
        0
      } else {
        let d = rev[*b as usize];
        if d == 0xff {
          return Err("invalid base64".into());
        }
        d as u32
      };
      n = (n << 6) | v;
    }
    out.push((n >> 16) as u8);
    if pad < 2 {
      out.push((n >> 8) as u8);
    }
    if pad < 1 {
      out.push(n as u8);
    }
  }
  Ok(out)
}

#[tauri::command]
fn engine_info() -> EngineInfo {
  EngineInfo {
    version: ENGINE_VERSION.into(),
    script_host: "rosegold".into(),
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityScript {
  entity_id: String,
  source: String,
  /// Optional asset/script name for spawn `script=…` lookup
  #[serde(default)]
  name: Option<String>,
}

#[tauri::command]
fn engine_set_scripts(scripts: Vec<EntityScript>, state: State<EngineState>) -> Result<(), String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  session.set_scripts(scripts.into_iter().map(|s| (s.entity_id, s.source, s.name)));
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioClipBinding {
  name: String,
  url: String,
}

#[tauri::command]
fn engine_set_audio(clips: Vec<AudioClipBinding>, state: State<EngineState>) -> Result<(), String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  session.set_audio(clips.into_iter().map(|c| (c.name, c.url)));
  Ok(())
}

#[tauri::command]
fn engine_clear_play(state: State<EngineState>) -> Result<(), String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  session.clear_play();
  Ok(())
}

#[tauri::command]
fn engine_set_keys(
  keys: String,
  pressed: Option<String>,
  state: State<EngineState>,
) -> Result<(), String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  session.set_keys(keys, pressed);
  Ok(())
}

#[tauri::command]
fn engine_load_scene(scene: SceneFile, state: State<EngineState>) -> Result<PlayFrame, String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  Ok(session.load_scene(scene))
}

#[tauri::command]
fn engine_snapshot(state: State<EngineState>) -> Result<SceneFile, String> {
  let session = state.session.lock().map_err(|e| e.to_string())?;
  Ok(session.snapshot())
}

#[tauri::command]
fn engine_tick(dt: f32, state: State<EngineState>) -> Result<PlayFrame, String> {
  let mut session = state.session.lock().map_err(|e| e.to_string())?;
  Ok(session.tick(dt))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(EngineState::default())
    .invoke_handler(tauri::generate_handler![
      run_rosegold,
      run_rosegold_preview,
      check_rosegold,
      def_rosegold,
      hover_rosegold,
      list_rosegold_exports,
      list_rosegold_signals,
      list_rosegold_fns,
      list_rosegold_nodes,
      stdlib_rosegold,
      run_rosegold_hooks,
      list_project_files,
      list_project_entries,
      create_project_folder,
      create_project_dir,
      write_project_file,
      write_project_file_base64,
      read_text_file,
      read_file_base64,
      engine_info,
      engine_set_scripts,
      engine_set_audio,
      engine_set_keys,
      engine_clear_play,
      engine_load_scene,
      engine_snapshot,
      engine_tick,
      sync_view_menu
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      menu::install(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
