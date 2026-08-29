//! Strata engine — 2D/3D world, components, and a script-host seam.
//!
//! The React editor talks to this crate through Tauri IPC. Three.js in the
//! frontend is an **editor view adapter only**, not the game runtime.
//!
//! Scripting: [`RoseGoldScriptHost`] runs native RoseGold hooks and applies
//! `strata:` directives to the world. [`NullScriptHost`] remains available as a no-op.

mod scene;
mod script;
mod world;

pub use scene::{
  Entity, EntityKind, LightKind, MeshPrimitive, Mode, SceneFile, ENGINE_VERSION,
};
pub use script::{
  NullScriptHost, RoseGoldScriptHost, ScriptHost, StrataDirective, parse_strata_directives,
};
pub use world::World;
