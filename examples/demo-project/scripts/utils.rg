# Shared helpers. The module name is `utils`, not this file's stem.

import strata;

mod utils {
    pub fn move_line(dx: Float, dy: Float) {
        strata.move(dx, dy);
    }
}
