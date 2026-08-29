use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsRunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  message: String,
}

fn to_js(result: rosegold::RunResult) -> JsValue {
  let payload = JsRunResult {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.message,
  };
  serde_wasm_bindgen::to_value(&payload).unwrap_or(JsValue::NULL)
}

/// Run a RoseGold source string. Returns `{ ok, stdout, stderr, message }`.
#[wasm_bindgen]
pub fn run(source: &str) -> JsValue {
  console_error_panic_hook::set_once();
  to_js(rosegold::run_source(source))
}

/// Run labeled hook jobs sequentially (same shape as Tauri `run_rosegold_hooks`).
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
      return to_js(rosegold::RunResult {
        ok: false,
        stdout: String::new(),
        stderr: e.to_string(),
        message: format!("invalid jobs json: {e}"),
      });
    }
  };

  let mut all_out = String::new();
  let mut all_err = String::new();
  let mut ok = true;
  for job in jobs {
    all_out.push_str(&format!("--- {} ---\n", job.label));
    let result = rosegold::run_source(&job.source);
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
  to_js(rosegold::RunResult {
    ok,
    stdout: all_out,
    stderr: all_err,
    message: if ok {
      "RoseGold wasm finished".into()
    } else {
      "RoseGold wasm finished with errors".into()
    },
  })
}
