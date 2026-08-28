use crate::world::World;

/// Language / script runtime attached to a [`World`].
///
/// RoseGold will implement this later (CLI or embed). The editor Play loop
/// always calls these hooks; [`NullScriptHost`] is a no-op.
pub trait ScriptHost {
    fn on_load(&mut self, world: &mut World);
    fn on_update(&mut self, world: &mut World, dt: f32);
}

/// Placeholder until RoseGold is wired.
#[derive(Debug, Default)]
pub struct NullScriptHost;

impl ScriptHost for NullScriptHost {
    fn on_load(&mut self, _world: &mut World) {}
    fn on_update(&mut self, _world: &mut World, _dt: f32) {}
}
