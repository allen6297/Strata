use std::fs;
use std::io::Write;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
struct RunResult {
  ok: bool,
  stdout: String,
  stderr: String,
  message: String,
}

#[tauri::command]
fn run_rosegold(source: String) -> Result<RunResult, String> {
  let dir = std::env::temp_dir().join("strata-rosegold");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join("play.rg");
  {
    let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
    file
      .write_all(source.as_bytes())
      .map_err(|e| e.to_string())?;
  }

  let output = Command::new("rosegold")
    .arg(&path)
    .output()
    .map_err(|e| {
      format!(
        "Failed to run `rosegold` ({e}). Install RoseGold-PY and ensure `rosegold` is on PATH."
      )
    })?;

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  let ok = output.status.success();
  let message = if ok {
    "RoseGold finished".to_string()
  } else {
    format!(
      "RoseGold exited with {}",
      output
        .status
        .code()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "signal".into())
    )
  };

  Ok(RunResult {
    ok,
    stdout,
    stderr,
    message,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![run_rosegold])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
