use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use strata_engine::{NullScriptHost, SceneFile, World, ENGINE_VERSION};
use tauri::State;

mod menu;

#[derive(Serialize)]
struct RunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  message: String,
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
  world: Mutex<World>,
  host: Mutex<NullScriptHost>,
}

impl Default for EngineState {
  fn default() -> Self {
    Self {
      world: Mutex::new(World::new()),
      host: Mutex::new(NullScriptHost),
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
  })
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
  let mut ok = true;

  for (i, job) in jobs.iter().enumerate() {
    let dir = unique_rosegold_dir("strata-rosegold-hook")?;
    let path = dir.join(format!("hook_{i}.rg"));
    fs::write(&path, &job.source).map_err(|e| e.to_string())?;
    let result = run_rosegold_file(&path)?;
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
  })
}

fn classify(name: &str) -> Option<&'static str> {
  let lower = name.to_ascii_lowercase();
  if lower.ends_with(".rg") {
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

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
  if let Some(parent) = Path::new(&path).parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::write(&path, contents).map_err(|e| e.to_string())
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

#[tauri::command]
fn engine_info() -> EngineInfo {
  EngineInfo {
    version: ENGINE_VERSION.into(),
    script_host: "null".into(),
  }
}

#[tauri::command]
fn engine_load_scene(scene: SceneFile, state: State<EngineState>) -> Result<SceneFile, String> {
  let mut world = state.world.lock().map_err(|e| e.to_string())?;
  let mut host = state.host.lock().map_err(|e| e.to_string())?;
  *world = World::from_scene(scene);
  world.load(&mut *host);
  Ok(world.to_scene())
}

#[tauri::command]
fn engine_snapshot(state: State<EngineState>) -> Result<SceneFile, String> {
  let world = state.world.lock().map_err(|e| e.to_string())?;
  Ok(world.to_scene())
}

#[tauri::command]
fn engine_tick(dt: f32, state: State<EngineState>) -> Result<SceneFile, String> {
  let mut world = state.world.lock().map_err(|e| e.to_string())?;
  let mut host = state.host.lock().map_err(|e| e.to_string())?;
  world.tick(dt, &mut *host);
  Ok(world.to_scene())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(EngineState::default())
    .invoke_handler(tauri::generate_handler![
      run_rosegold,
      run_rosegold_hooks,
      list_project_files,
      write_project_file,
      read_text_file,
      read_file_base64,
      engine_info,
      engine_load_scene,
      engine_snapshot,
      engine_tick
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
