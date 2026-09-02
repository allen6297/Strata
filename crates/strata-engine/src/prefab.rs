use crate::scene::Entity;

/// Prefab roots are catalog entries with no parent.
pub fn find_prefab_root<'a>(prefabs: &'a [Entity], name: &str) -> Option<&'a Entity> {
  prefabs
    .iter()
    .find(|p| p.parent_id.is_none() && p.name.eq_ignore_ascii_case(name))
    .or_else(|| prefabs.iter().find(|p| p.name.eq_ignore_ascii_case(name)))
}

fn children_of<'a>(prefabs: &'a [Entity], parent_id: &str) -> Vec<&'a Entity> {
  prefabs
    .iter()
    .filter(|e| e.parent_id.as_deref() == Some(parent_id))
    .collect()
}

/// Depth-first subtree, root first (array order among siblings).
pub fn collect_subtree<'a>(prefabs: &'a [Entity], root_id: &str) -> Vec<&'a Entity> {
  let mut out = Vec::new();
  fn visit<'a>(prefabs: &'a [Entity], id: &str, out: &mut Vec<&'a Entity>) {
    let Some(e) = prefabs.iter().find(|p| p.id == id) else {
      return;
    };
    out.push(e);
    for child in children_of(prefabs, id) {
      visit(prefabs, &child.id, out);
    }
  }
  visit(prefabs, root_id, &mut out);
  out
}

/// Copy a prefab subtree into the play world. Root gets `world_x`/`world_y`; children keep local offsets.
pub fn instantiate_prefab(
  prefabs: &[Entity],
  root: &Entity,
  new_root_id: String,
  world_x: f32,
  world_y: f32,
  mut next_id: impl FnMut() -> String,
) -> Vec<Entity> {
  let tree = collect_subtree(prefabs, &root.id);
  let mut id_map = std::collections::HashMap::new();
  id_map.insert(root.id.clone(), new_root_id.clone());
  for e in tree.iter().skip(1) {
    id_map.insert(e.id.clone(), next_id());
  }
  tree
    .into_iter()
    .map(|src| {
      let is_root = src.id == root.id;
      let mut e = src.clone();
      e.id = id_map.get(&src.id).cloned().unwrap_or_else(|| src.id.clone());
      e.parent_id = if is_root {
        None
      } else {
        src
          .parent_id
          .as_ref()
          .and_then(|p| id_map.get(p).cloned())
      };
      if is_root {
        e.x = world_x;
        e.y = world_y;
      }
      e.prefab_id = Some(root.id.clone());
      e.prefab_source_id = Some(src.id.clone());
      e.prefab_overrides.clear();
      e.connections = src
        .connections
        .iter()
        .map(|c| {
          let mut c = c.clone();
          if let Some(mapped) = id_map.get(&c.to) {
            c.to = mapped.clone();
          }
          c
        })
        .collect();
      e.sync_rotation_alias();
      e
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::scene::EntityKind;

  fn node(id: &str, name: &str, parent: Option<&str>, x: f32, y: f32) -> Entity {
    Entity {
      id: id.into(),
      name: name.into(),
      kind: EntityKind::Sprite,
      parent_id: parent.map(String::from),
      x,
      y,
      ..Default::default()
    }
  }

  #[test]
  fn instantiate_keeps_child_local() {
    let catalog = vec![
      node("r", "Orb", None, 80.0, -20.0),
      node("c", "Gem", Some("r"), 4.0, 8.0),
    ];
    let root = find_prefab_root(&catalog, "Orb").unwrap();
    let mut n = 0;
    let spawned = instantiate_prefab(&catalog, root, "spawn_1".into(), 10.0, 20.0, || {
      n += 1;
      format!("spawn_c{n}")
    });
    assert_eq!(spawned.len(), 2);
    assert_eq!(spawned[0].id, "spawn_1");
    assert!((spawned[0].x - 10.0).abs() < 0.001);
    assert!((spawned[0].y - 20.0).abs() < 0.001);
    assert_eq!(spawned[1].parent_id.as_deref(), Some("spawn_1"));
    assert!((spawned[1].x - 4.0).abs() < 0.001);
    assert!((spawned[1].y - 8.0).abs() < 0.001);
    assert_eq!(spawned[0].prefab_id.as_deref(), Some("r"));
    assert_eq!(spawned[0].prefab_source_id.as_deref(), Some("r"));
    assert_eq!(spawned[1].prefab_id.as_deref(), Some("r"));
    assert_eq!(spawned[1].prefab_source_id.as_deref(), Some("c"));
  }
}
