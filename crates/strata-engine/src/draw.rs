use std::collections::HashMap;

use crate::scene::{Entity, RenderLayer, DEFAULT_LAYER_ID};

fn layer_order(layers: &[RenderLayer], layer_id: &str) -> i32 {
  layers
    .iter()
    .find(|l| l.id == layer_id)
    .map(|l| l.order)
    .unwrap_or(0)
}

/// Depth-first index: roots in array order, children in array order (sibling = list order).
fn dfs_index(entities: &[Entity]) -> HashMap<String, i32> {
  let mut map = HashMap::new();
  let mut next = 0i32;

  fn visit(
    entities: &[Entity],
    id: &str,
    map: &mut HashMap<String, i32>,
    next: &mut i32,
  ) {
    if map.contains_key(id) {
      return;
    }
    map.insert(id.to_string(), *next);
    *next += 1;
    for e in entities {
      if e.parent_id.as_deref() == Some(id) {
        visit(entities, &e.id, map, next);
      }
    }
  }

  for e in entities {
    if e.parent_id.is_none() {
      visit(entities, &e.id, &mut map, &mut next);
    }
  }
  for e in entities {
    if !map.contains_key(&e.id) {
      visit(entities, &e.id, &mut map, &mut next);
    }
  }
  map
}

/// Draw order: layer.order, then sortOrder (blank = 0), then hierarchy DFS, then list index.
pub fn sort_entities_for_draw<'a>(
  entities: &'a [Entity],
  layers: &[RenderLayer],
) -> Vec<&'a Entity> {
  let dfs = dfs_index(entities);
  let mut indexed: Vec<(usize, &Entity)> = entities.iter().enumerate().collect();
  indexed.sort_by_key(|(i, e)| {
    let layer = if e.layer_id.is_empty() {
      DEFAULT_LAYER_ID
    } else {
      e.layer_id.as_str()
    };
    (
      layer_order(layers, layer),
      e.sort_order.unwrap_or(0),
      *dfs.get(&e.id).unwrap_or(&0),
      *i,
    )
  });
  indexed.into_iter().map(|(_, e)| e).collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::scene::EntityKind;

  fn sprite(id: &str, layer: &str, sort: Option<i32>) -> Entity {
    Entity {
      id: id.into(),
      name: id.into(),
      kind: EntityKind::Sprite,
      layer_id: layer.into(),
      sort_order: sort,
      ..Default::default()
    }
  }

  fn layers() -> Vec<RenderLayer> {
    vec![
      RenderLayer {
        id: "world".into(),
        name: "World".into(),
        order: 0,
      },
      RenderLayer {
        id: "ui".into(),
        name: "UI".into(),
        order: 1,
      },
    ]
  }

  #[test]
  fn ui_layer_draws_after_world() {
    let ents = vec![
      sprite("ui", "ui", None),
      sprite("world", "world", None),
    ];
    let order: Vec<&str> = sort_entities_for_draw(&ents, &layers())
      .iter()
      .map(|e| e.id.as_str())
      .collect();
    assert_eq!(order, vec!["world", "ui"]);
  }

  #[test]
  fn sort_order_within_layer() {
    let ents = vec![
      sprite("front", "world", Some(10)),
      sprite("back", "world", Some(-1)),
    ];
    let order: Vec<&str> = sort_entities_for_draw(&ents, &layers())
      .iter()
      .map(|e| e.id.as_str())
      .collect();
    assert_eq!(order, vec!["back", "front"]);
  }

  #[test]
  fn hierarchy_breaks_ties() {
    let parent = sprite("p", "world", None);
    let mut child = sprite("c", "world", None);
    child.parent_id = Some("p".into());
    let ents = vec![child, parent];
    let order: Vec<&str> = sort_entities_for_draw(&ents, &layers())
      .iter()
      .map(|e| e.id.as_str())
      .collect();
    assert_eq!(order, vec!["p", "c"]);
  }
}
