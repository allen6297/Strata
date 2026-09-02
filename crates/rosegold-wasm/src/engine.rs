use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use strata_engine::{PlaySession, SceneFile, ENGINE_VERSION};
use wasm_bindgen::prelude::*;

thread_local! {
  static SESSION: RefCell<PlaySession> = RefCell::new(PlaySession::new());
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
  value
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .map_err(|e| JsValue::from_str(&e.to_string()))
}

fn js_err(e: impl ToString) -> JsValue {
  JsValue::from_str(&e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityScript {
  entity_id: String,
  source: String,
  #[serde(default)]
  name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineInfoPayload {
  version: String,
  script_host: String,
}

/// `{ version, scriptHost }` — same shape as Tauri `engine_info`.
#[wasm_bindgen]
pub fn engine_info() -> JsValue {
  console_error_panic_hook::set_once();
  let payload = EngineInfoPayload {
    version: ENGINE_VERSION.into(),
    script_host: "rosegold".into(),
  };
  to_js(&payload).unwrap_or(JsValue::NULL)
}

/// Bind entity scripts + library sources (`name` used for `import` / spawn).
#[wasm_bindgen]
pub fn engine_set_scripts(scripts_json: &str) -> Result<(), JsValue> {
  console_error_panic_hook::set_once();
  let scripts: Vec<EntityScript> =
    serde_json::from_str(scripts_json).map_err(js_err)?;
  SESSION.with(|s| {
    s.borrow_mut()
      .set_scripts(scripts.into_iter().map(|x| (x.entity_id, x.source, x.name)));
  });
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioClipBinding {
  name: String,
  url: String,
}

/// Bind named audio clips (`name` → playable URL) for `strata.play_sound`.
#[wasm_bindgen]
pub fn engine_set_audio(clips_json: &str) -> Result<(), JsValue> {
  console_error_panic_hook::set_once();
  let clips: Vec<AudioClipBinding> = serde_json::from_str(clips_json).map_err(js_err)?;
  SESSION.with(|s| {
    s.borrow_mut()
      .set_audio(clips.into_iter().map(|c| (c.name, c.url)));
  });
  Ok(())
}

#[wasm_bindgen]
pub fn engine_set_keys(keys: &str, pressed: &str) {
  console_error_panic_hook::set_once();
  SESSION.with(|s| {
    s.borrow_mut()
      .set_keys(keys.to_string(), Some(pressed.to_string()));
  });
}

#[wasm_bindgen]
pub fn engine_clear_play() {
  console_error_panic_hook::set_once();
  SESSION.with(|s| s.borrow_mut().clear_play());
}

/// Load a scene JSON and run `on_ready`. Returns a `PlayFrame`.
#[wasm_bindgen]
pub fn engine_load_scene(scene_json: &str) -> Result<JsValue, JsValue> {
  console_error_panic_hook::set_once();
  let scene: SceneFile = serde_json::from_str(scene_json).map_err(js_err)?;
  let frame = SESSION.with(|s| s.borrow_mut().load_scene(scene));
  to_js(&frame)
}

#[wasm_bindgen]
pub fn engine_snapshot() -> Result<JsValue, JsValue> {
  console_error_panic_hook::set_once();
  let scene = SESSION.with(|s| s.borrow().snapshot());
  to_js(&scene)
}

/// Tick `on_update`. Returns a `PlayFrame`.
#[wasm_bindgen]
pub fn engine_tick(dt: f32) -> Result<JsValue, JsValue> {
  console_error_panic_hook::set_once();
  let frame = SESSION.with(|s| s.borrow_mut().tick(dt));
  to_js(&frame)
}
