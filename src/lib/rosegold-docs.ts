/** Static docs for completions, hover, and signature help. Not an LSP. */

import catalog from "../../editors/vscode/catalog.json";

export type DocsKind = "function" | "hook" | "builtin" | "module" | "type";

export type DocsEntry = {
  /** Lookup key: `strata.move`, `on_update`, `print`. */
  key: string;
  label: string;
  /** Completion detail, e.g. `(dx, dy)`. */
  detail: string;
  /** Full signature line shown in hover. */
  signature: string;
  /** One or two sentences. Same copy as completion `info`. */
  doc: string;
  kind: DocsKind;
  /** Snippet inserted on complete. Members omit the module prefix. */
  template?: string;
  /** Parameter names in order, for signature help. */
  params?: string[];
  boost?: number;
};

export const ROSEGOLD_DOCS: DocsEntry[] = catalog as DocsEntry[];

const BY_KEY = new Map(ROSEGOLD_DOCS.map((e) => [e.key, e]));

export function lookupDocs(key: string): DocsEntry | undefined {
  return BY_KEY.get(key);
}

export function docsMembers(mod: string): DocsEntry[] {
  const prefix = `${mod}.`;
  return ROSEGOLD_DOCS.filter(
    (e) => e.key.startsWith(prefix) && e.kind === "function",
  );
}

export function docsHooks(): DocsEntry[] {
  return ROSEGOLD_DOCS.filter((e) => e.kind === "hook");
}

export function docsBuiltins(): DocsEntry[] {
  return ROSEGOLD_DOCS.filter((e) => e.kind === "builtin");
}

export function completionType(
  kind: DocsKind,
): "function" | "keyword" | "type" | "namespace" {
  if (kind === "module") return "namespace";
  if (kind === "type") return "type";
  if (kind === "hook") return "function";
  return "function";
}
