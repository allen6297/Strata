## Degrees per second. Shown on the Coin Inspector card.
import strata;
import math;
## Hello:
@export_group("COIN")
## Degrees per second. Shown on the coin inspector card.
@export var spin: Float = 8.0;
var frames: Int = 0;
var popping: Bool = false;
var pop_t: Float = 0.0;

signal collected(amount: Int);

fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready] coin");
    return 0;
}

fn on_enter(other: Str, x: Float, y: Float): Int {
    print(f"[enter] coin/{other}");
    collected.emit(1);
    popping = true;
    pop_t = 0.0;
    strata.after(0.35, "pop");
    return 0;
}

fn pop(): Int {
    strata.destroy();
    return 0;
}

fn on_destroy(): Int {
    print("[gone] coin");
    return 0;
}

## Called every Play frame.
fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    frames = frames + 1;
    if popping {
        pop_t = pop_t + dt;
        var t = math.clamp(pop_t / 0.35, 0.0, 1.0);
        strata.rot(math.lerp(spin, spin * 4.0, t));
    } else {
        strata.rot(spin);
    }
    return 0;
}

fn main(): Int {
    return on_ready("Coin", 0.0, 0.0);
}

fn on_exit(other: Str, x: Float, y: Float): Void {
    print(f"[exit] coin/{other}");
    pass;
}
