/* tslint:disable */
/* eslint-disable */

/**
 * Typecheck/parse without evaluating. Returns `{ file, line, col, severity, message }[]`.
 */
export function check(source: string, file: string): any;

/**
 * Same as `check`, with in-memory `{ "utils": "…", "utils.rg": "…" }` modules.
 */
export function check_with_modules(source: string, file: string, modules_json: string): any;

/**
 * Go-to-def at `line`/`col` (1-based). Null if stdlib or unknown.
 */
export function def_at(source: string, file: string, line: number, col: number, modules_json: string): any;

export function engine_clear_play(): void;

/**
 * `{ version, scriptHost }` — same shape as Tauri `engine_info`.
 */
export function engine_info(): any;

/**
 * Load a scene JSON and run `on_ready`. Returns a `PlayFrame`.
 */
export function engine_load_scene(scene_json: string): any;

/**
 * Bind named audio clips (`name` → playable URL) for `strata.play_sound`.
 */
export function engine_set_audio(clips_json: string): void;

export function engine_set_keys(keys: string, pressed: string): void;

/**
 * Bind entity scripts + library sources (`name` used for `import` / spawn).
 */
export function engine_set_scripts(scripts_json: string): void;

export function engine_snapshot(): any;

/**
 * Tick `on_update`. Returns a `PlayFrame`.
 */
export function engine_tick(dt: number): any;

/**
 * Pretty-print source. Throws if the file does not parse.
 */
export function format_source(source: string): string;

/**
 * Hover at `line`/`col`. Same payload as `def_at`.
 */
export function hover_at(source: string, file: string, line: number, col: number, modules_json: string): any;

/**
 * Inspector metadata for `@export var`. Parse-only; no eval.
 */
export function list_exports(source: string): any;

/**
 * Top-level `fn` names for Inspector method pickers.
 */
export function list_fns(source: string): any;

/**
 * `@node` classes for Add Node. Parse-only.
 */
export function list_nodes(source: string): any;

/**
 * Inspector metadata for `signal` declarations. Parse-only.
 */
export function list_signals(source: string): any;

/**
 * Same as `list_signals`, with in-memory `{ "utils": "…" }` modules.
 */
export function list_signals_with_modules(source: string, modules_json: string): any;

/**
 * Run a RoseGold source string. Returns `{ ok, stdout, stderr, message, effects, hookEffects }`.
 */
export function run(source: string): any;

/**
 * Run labeled hook jobs sequentially (same shape as Tauri `run_rosegold_hooks`).
 * Preview helper only — Play uses `engine_load_scene` / `engine_tick`.
 */
export function run_hooks(jobs_json: string): any;

/**
 * Script-tab Run: class `on_ready`/`on_create` or a free `on_ready`.
 */
export function run_preview(source: string, name: string, x: number, y: number): any;

/**
 * Same as `run_preview`, with in-memory `{ "utils": "…", "utils.rg": "…" }` modules.
 */
export function run_preview_with_modules(source: string, name: string, x: number, y: number, modules_json: string): any;

/**
 * Crate-embedded stdlib source (`math` / `node.rg`). Empty if unknown.
 */
export function stdlib_source(name: string): string | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly check: (a: number, b: number, c: number, d: number) => any;
    readonly check_with_modules: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly def_at: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly format_source: (a: number, b: number) => [number, number, number, number];
    readonly list_exports: (a: number, b: number) => any;
    readonly list_fns: (a: number, b: number) => any;
    readonly list_nodes: (a: number, b: number) => any;
    readonly list_signals: (a: number, b: number) => any;
    readonly list_signals_with_modules: (a: number, b: number, c: number, d: number) => any;
    readonly run: (a: number, b: number) => any;
    readonly run_hooks: (a: number, b: number) => any;
    readonly run_preview: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly run_preview_with_modules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly stdlib_source: (a: number, b: number) => [number, number];
    readonly hover_at: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly engine_clear_play: () => void;
    readonly engine_info: () => any;
    readonly engine_load_scene: (a: number, b: number) => [number, number, number];
    readonly engine_set_audio: (a: number, b: number) => [number, number];
    readonly engine_set_keys: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_scripts: (a: number, b: number) => [number, number];
    readonly engine_snapshot: () => [number, number, number];
    readonly engine_tick: (a: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
