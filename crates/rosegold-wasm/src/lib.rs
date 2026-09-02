use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

mod engine;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsRunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  message: String,
  effects: Vec<rosegold::HostEffect>,
  hook_effects: Vec<rosegold::LabeledHostEffects>,
}

fn to_js(
  result: rosegold::RunResult,
  hook_effects: Vec<rosegold::LabeledHostEffects>,
) -> JsValue {
  let payload = JsRunResult {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.message,
    effects: result.effects,
    hook_effects,
  };
  payload
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// Typecheck/parse without evaluating. Returns `{ file, line, col, severity, message }[]`.
#[wasm_bindgen]
pub fn check(source: &str, file: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let diags = rosegold::check_source(source, file);
  serde_wasm_bindgen::to_value(&diags).unwrap_or(JsValue::NULL)
}

/// Same as `check`, with in-memory `{ "utils": "…", "utils.rg": "…" }` modules.
#[wasm_bindgen]
pub fn check_with_modules(source: &str, file: &str, modules_json: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let modules: HashMap<String, String> = serde_json::from_str(modules_json).unwrap_or_default();
  let diags = if modules.is_empty() {
    rosegold::check_source(source, file)
  } else {
    rosegold::check_source_with_modules(source, file, modules)
  };
  serde_wasm_bindgen::to_value(&diags).unwrap_or(JsValue::NULL)
}

fn symbol_js(
  source: &str,
  file: &str,
  line: u32,
  col: u32,
  modules_json: &str,
) -> JsValue {
  let modules: HashMap<String, String> = serde_json::from_str(modules_json).unwrap_or_default();
  match rosegold::symbol_at(source, file, line, col, modules) {
    Some(info) => info
      .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
      .unwrap_or(JsValue::NULL),
    None => JsValue::NULL,
  }
}

/// Go-to-def at `line`/`col` (1-based). Null if stdlib or unknown.
#[wasm_bindgen]
pub fn def_at(source: &str, file: &str, line: u32, col: u32, modules_json: &str) -> JsValue {
  console_error_panic_hook::set_once();
  symbol_js(source, file, line, col, modules_json)
}

/// Hover at `line`/`col`. Same payload as `def_at`.
#[wasm_bindgen]
pub fn hover_at(source: &str, file: &str, line: u32, col: u32, modules_json: &str) -> JsValue {
  console_error_panic_hook::set_once();
  symbol_js(source, file, line, col, modules_json)
}

/// Inspector metadata for `@export var`. Parse-only; no eval.
#[wasm_bindgen]
pub fn list_exports(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let fields = rosegold::list_exports(source);
  fields
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// Inspector metadata for `signal` declarations. Parse-only.
#[wasm_bindgen]
pub fn list_signals(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let fields = rosegold::list_signals(source);
  fields
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// Same as `list_signals`, with in-memory `{ "utils": "…" }` modules.
#[wasm_bindgen]
pub fn list_signals_with_modules(source: &str, modules_json: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let modules: HashMap<String, String> = serde_json::from_str(modules_json).unwrap_or_default();
  let fields = if modules.is_empty() {
    rosegold::list_signals(source)
  } else {
    rosegold::list_signals_with_modules(source, modules)
  };
  fields
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// Top-level `fn` names for Inspector method pickers.
#[wasm_bindgen]
pub fn list_fns(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let fields = rosegold::list_fns(source);
  fields
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// `@node` classes for Add Node. Parse-only.
#[wasm_bindgen]
pub fn list_nodes(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  let fields = rosegold::list_nodes(source);
  fields
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .unwrap_or(JsValue::NULL)
}

/// Crate-embedded stdlib source (`math` / `node.rg`). Empty if unknown.
#[wasm_bindgen]
pub fn stdlib_source(name: &str) -> Option<String> {
  console_error_panic_hook::set_once();
  rosegold::stdlib::file_source(name).map(|(_, src)| src.to_string())
}

/// Pretty-print source. Throws if the file does not parse.
#[wasm_bindgen]
pub fn format_source(source: &str) -> Result<String, JsValue> {
  console_error_panic_hook::set_once();
  rosegold::format_source(source).map_err(|e| JsValue::from_str(&e))
}

/// Run a RoseGold source string. Returns `{ ok, stdout, stderr, message, effects, hookEffects }`.
#[wasm_bindgen]
pub fn run(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  to_js(rosegold::run_source(source), Vec::new())
}

/// Script-tab Run: class `on_ready`/`on_create` or a free `on_ready`.
#[wasm_bindgen]
pub fn run_preview(source: &str, name: &str, x: f64, y: f64) -> JsValue {
  console_error_panic_hook::set_once();
  to_js(rosegold::run_preview(source, name, x, y), Vec::new())
}

/// Same as `run_preview`, with in-memory `{ "utils": "…", "utils.rg": "…" }` modules.
#[wasm_bindgen]
pub fn run_preview_with_modules(
  source: &str,
  name: &str,
  x: f64,
  y: f64,
  modules_json: &str,
) -> JsValue {
  console_error_panic_hook::set_once();
  let modules: HashMap<String, String> = serde_json::from_str(modules_json).unwrap_or_default();
  to_js(
    if modules.is_empty() {
      rosegold::run_preview(source, name, x, y)
    } else {
      rosegold::run_preview_with_modules(source, name, x, y, modules)
    },
    Vec::new(),
  )
}

/// Run labeled hook jobs sequentially (same shape as Tauri `run_rosegold_hooks`).
/// Preview helper only — Play uses `engine_load_scene` / `engine_tick`.
#[wasm_bindgen]
pub fn run_hooks(jobs_json: &str) -> JsValue {
  console_error_panic_hook::set_once();
  #[derive(serde::Deserialize)]
  struct Job {
    label: String,
    source: String,
  }
  let jobs: Vec<Job> = match serde_json::from_str(jobs_json) {
    Ok(j) => j,
    Err(e) => {
      return to_js(
        rosegold::RunResult {
          ok: false,
          stdout: String::new(),
          stderr: e.to_string(),
          message: format!("invalid jobs json: {e}"),
          effects: Vec::new(),
        },
        Vec::new(),
      );
    }
  };

  let mut all_out = String::new();
  let mut all_err = String::new();
  let mut hook_effects = Vec::new();
  let mut ok = true;
  for job in jobs {
    all_out.push_str(&format!("--- {} ---\n", job.label));
    let mut result = rosegold::run_source(&job.source);
    hook_effects.push(rosegold::LabeledHostEffects {
      label: job.label.clone(),
      effects: std::mem::take(&mut result.effects),
    });
    if !result.stdout.is_empty() {
      all_out.push_str(&result.stdout);
      if !result.stdout.ends_with('\n') {
        all_out.push('\n');
      }
    }
    if !result.ok {
      ok = false;
      if !result.stderr.is_empty() {
        all_err.push_str(&format!("--- {} ---\n{}\n", job.label, result.stderr));
      }
    }
  }
  to_js(
    rosegold::RunResult {
      ok,
      stdout: all_out,
      stderr: all_err,
      message: if ok {
        "RoseGold wasm finished".into()
      } else {
        "RoseGold wasm finished with errors".into()
      },
      effects: Vec::new(),
    },
    hook_effects,
  )
}
