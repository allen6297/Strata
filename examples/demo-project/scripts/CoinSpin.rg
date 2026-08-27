fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready] coin");
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    print("strata:rot 8");
    return 0;
}

fn main(): Int {
    return on_ready("Coin", 0.0, 0.0);
}
