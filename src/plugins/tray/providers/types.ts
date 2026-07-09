/**
 * @file tray providers — structural provider interface. Both providers satisfy this
 * shape; no `@tauri-apps` types appear here.
 */
import type { SystemResult } from "../../runtime/result";
import type { TrayMenuItem } from "../types";

/** Method names consumed by unsupportedProvider() for the web and Tauri-mobile branches. */
export const TRAY_METHODS = ["setMenu", "setTooltip", "setIcon", "destroy"] as const;

/**
 * Structural tray provider contract (satisfies CapabilityProvider via dispose).
 *
 * Method-shorthand syntax (not arrow-property syntax) is deliberate: TypeScript
 * checks method-shorthand members bivariantly, which is what lets the shared
 * `unsupportedProvider("web" | "tauri", TRAY_METHODS)` stand-in (typed
 * `Record<M, (...args: never[]) => Promise<SystemErr>>`) satisfy this interface —
 * arrow-property members are checked contravariantly and would reject it.
 *
 * @example
 * ```ts
 * const provider: TrayProvider = createWebTrayProvider();
 * ```
 */
export type TrayProvider = {
  /** Replace the tray menu. */
  setMenu(items: TrayMenuItem[]): Promise<SystemResult<void>>;
  /** Set hover tooltip text. */
  setTooltip(text: string): Promise<SystemResult<void>>;
  /** Set the tray icon by path. */
  setIcon(iconPath: string): Promise<SystemResult<void>>;
  /** Remove the tray icon. */
  destroy(): Promise<SystemResult<void>>;
  /** Destroys the OS icon if present (idempotent with destroy()). */
  dispose(): Promise<void>;
};
