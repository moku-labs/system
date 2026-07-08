/**
 * @file tray web provider skeleton — the all-unsupported branch (kept as a file for
 * anatomy symmetry). Returns unsupportedProvider("web", TRAY_METHODS).
 */
import type { TrayProvider } from "./types";

/**
 * Create the web tray provider: every method resolves to err("web", "unsupported").
 *
 * @example
 * ```ts
 * const provider = createWebTrayProvider();
 * ```
 */
export function createWebTrayProvider(): TrayProvider {
  throw new Error("not implemented");
}
