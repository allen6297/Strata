import utils;
import strata;
import input;

var frames: Int = 0;

fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready] from project");
    print(name);
    strata.spawn({ "prefab": "Orb", "x": 80.0, "y": -20.0 });
    return 0;
}

fn on_coin(amount: Int): Int {
    print(f"[coin] {amount}");
    strata.play_sound("jump.wav");
    return 0;
}

fn on_enter(other: Str, x: Float, y: Float): Int {
    print(f"[enter] {other}");
    return 0;
}

fn on_exit(other: Str, x: Float, y: Float): Int {
    print(f"[exit] {other}");
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    frames = frames + 1;
    utils.move_line(1.0, 0.0);
    if input.pressed("Space") {
        strata.play_sound("jump.wav");
    }
    return 0;
}

fn main(): Int {
    return on_ready("Hero", 0.0, 0.0);
}
