//! Strata engine — 2D/3D world, components, and a script-host seam.
//!
//! The React editor talks to this crate through Tauri IPC. Three.js in the
//! frontend is an **editor view adapter only**, not the game runtime.
//!
//! Scripting: [`NullScriptHost`] is the current host. A future
//! `RoseGoldScriptHost` can implement [`ScriptHost`] without changing World.

mod scene;
mod script;
mod world;

pub use scene::{
    Entity, EntityKind, LightKind, MeshPrimitive, Mode, SceneFile, ENGINE_VERSION,
};
pub use script::{NullScriptHost, ScriptHost};
pub use world::World;
