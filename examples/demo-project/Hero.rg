fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready] from project");
    print(name);
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    print("[update] from project");
    return 0;
}

fn main(): Int {
    return on_ready("Hero", 0.0, 0.0);
}
