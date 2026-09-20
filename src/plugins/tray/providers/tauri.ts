/**
 * @file tray Tauri provider — `@tauri-apps/api` tray/menu glue. The packages are
 * reached ONLY via `await import("@tauri-apps/api/tray")` + `await import("@tauri-apps/api/menu")`
 * (+ `@tauri-apps/api/app` for the default icon) inside the factory body (stay live
 * lazy imports in dist). Resolution itself is side-effect-free: the factory never
 * creates the OS tray icon. A private `ensureIcon()` creates it lazily on the first
 * mutating call and caches the handle in this closure; `destroy()`/`dispose()` destroy
 * it idempotently, and the next mutating call after a destroy recreates it lazily
 * again. The attached `Menu` is a Rust-side resource too: exactly one is kept alive at
 * a time, the replaced one is closed after the swap, and teardown closes the last one.
 * Every swap (and teardown) runs through one promise queue, so overlapping `setMenu()`
 * calls can never resolve out of order and close the menu the OS is showing. The
 * default window icon is a Rust-side `Image` resource as well — `TrayIcon.new` only
 * reads its rid, so this provider closes the one it asked for. `dispose()` is the one
 * removal that is final: after it every method answers
 * `err("tauri", "unavailable", "app stopped")` rather than lazily creating a status item
 * the stopped app would never release.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok } from "../../runtime/result";
import type { TrayConfig, TrayMenuItem } from "../types";
import type { TrayProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Failure of the status item's image itself — a packaging/environment problem rather
 * than a bad call, so it maps to "unavailable" and names the config field to fix.
 */
class TrayIconUnavailableError extends Error {
  /**
   * Build the error with a message that already names `tray.icon`.
   *
   * @param {string} reason - Why the icon could not be loaded.
   * @example
   * ```ts
   * throw new TrayIconUnavailableError("the app has no default window icon");
   * ```
   */
  constructor(reason: string) {
    super(`tray icon could not be loaded: ${reason}. Set tray.icon to a readable image path`);
    this.name = "TrayIconUnavailableError";
  }
}

/** Errors a missing icon file surfaces as across the three desktop platforms. */
const MISSING_ICON_FILE_PATTERN = /no such file|not found|cannot find|os error 2/i;

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("tray:tauri-set-menu-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Map a tray failure to its SystemResult. An unloadable icon is "unavailable" (fix the
 * packaging or `tray.icon`); everything else is "error" — never "denied", since Tauri
 * ACL throws are ambiguous (D-004).
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {SystemResult<never>} The mapped failure.
 * @example
 * ```ts
 * catch (error) { return mapTrayThrow(error); }
 * ```
 */
function mapTrayThrow(thrown: unknown): SystemResult<never> {
  if (thrown instanceof TrayIconUnavailableError) {
    return err(PROVIDER, "unavailable", thrown.message);
  }
  return mapThrownToResult(PROVIDER, thrown);
}

/**
 * Local, structural shape for a single native menu item build — matches
 * `@tauri-apps/api/menu`'s `MenuItemOptions` without importing its type (structural,
 * local — no `@tauri-apps` re-export, per the .d.mts leakage guard).
 */
type NativeMenuItemOptions = {
  id: string;
  text: string;
  enabled?: boolean;
  action?: (id: string) => void;
};

/**
 * Swallow a menu swap's outcome when building the queue tail — the outcome belongs to
 * the caller that awaited the swap, never to the next one waiting behind it.
 *
 * @example
 * ```ts
 * menuQueue = running.then(ignoreSwapOutcome, ignoreSwapOutcome);
 * ```
 */
function ignoreSwapOutcome(): void {
  // Intentionally empty — the queue tail carries no value and never rejects.
}

/**
 * Wrap a zero-arg TrayMenuItem action as a native `(id: string) => void` click handler.
 *
 * @param {() => void} action - The original isomorphic action callback.
 * @returns {(id: string) => void} A native-shaped click handler that ignores the id.
 * @example
 * ```ts
 * const handler = buildActionHandler(() => app.quit());
 * ```
 */
function buildActionHandler(action: () => void): (id: string) => void {
  return (): void => action();
}

/**
 * Map an isomorphic TrayMenuItem to the native menu item shape, wiring `action`
 * into a click handler that invokes the original zero-arg callback. Optional keys
 * are included only when present (exactOptionalPropertyTypes-safe).
 *
 * @param {TrayMenuItem} item - The isomorphic tray menu item.
 * @returns {NativeMenuItemOptions} The native-shaped menu item options.
 * @example
 * ```ts
 * const native = toNativeMenuItem({ id: "quit", text: "Quit", action: () => app.quit() });
 * ```
 */
function toNativeMenuItem(item: TrayMenuItem): NativeMenuItemOptions {
  return {
    id: item.id,
    text: item.text,
    ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
    ...(item.action === undefined ? {} : { action: buildActionHandler(item.action) })
  };
}

/**
 * Create the Tauri desktop tray provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied"
 * (ACL "not allowed" throws are ambiguous, D-004).
 *
 * @param {TrayConfig} config - Resolved config (id → OS tray identity).
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<TrayProvider>} The Tauri-backed tray provider.
 * @example
 * ```ts
 * const provider = await createTauriTrayProvider(config, log);
 * ```
 */
export async function createTauriTrayProvider(
  config: TrayConfig,
  log: LogApi
): Promise<TrayProvider> {
  const { TrayIcon } = await import("@tauri-apps/api/tray");
  const { Menu } = await import("@tauri-apps/api/menu");

  /** Handle to the live OS status item. */
  type TrayIconHandle = Awaited<ReturnType<typeof TrayIcon.new>>;
  /** Handle to a Rust-side menu resource attached to the status item. */
  type MenuHandle = Awaited<ReturnType<typeof Menu.new>>;
  /** What TrayIcon.new accepts as its image: a path, raw bytes, or an Image resource. */
  type IconSource = NonNullable<NonNullable<Parameters<typeof TrayIcon.new>[0]>["icon"]>;

  /**
   * A Rust-side image resource this provider created and therefore has to release.
   * `TrayIcon.new` only reads the image's `rid` (see `transformImage` in
   * `@tauri-apps/api/image`) — it never takes ownership.
   */
  type OwnedIconImage = { close: () => Promise<void> };

  /** The image to create the status item with, plus the resource to release afterwards. */
  type ResolvedTrayIcon = { icon: IconSource; owned?: OwnedIconImage };

  let iconPromise: Promise<TrayIconHandle> | undefined;
  let currentMenu: MenuHandle | undefined;

  // dispose() releases the status item and its menu at app.stop(). A call arriving after
  // that must not lazily create a NEW OS tray icon nobody will ever destroy — an island
  // that outlives app.stop() gets the honest typed failure instead. destroy() is a
  // different thing: it removes the icon and the next call deliberately recreates it.
  let disposed = false;

  /**
   * The image the status item is created with: the configured `tray.icon` when set,
   * otherwise the app's own default window icon. A relative path is resolved against
   * the process working directory, which a bundled app does not control, so the
   * bundle's window icon — not a path guess — is the default that actually works.
   * A configured icon is plain data the caller owns; the default one is a resource
   * this provider just allocated, so it comes back marked for release.
   *
   * @returns {Promise<ResolvedTrayIcon>} The icon for TrayIcon.new, plus what to release.
   * @example
   * ```ts
   * const { icon, owned } = await resolveIcon();
   * ```
   */
  async function resolveIcon(): Promise<ResolvedTrayIcon> {
    if (config.icon !== undefined) {
      return { icon: config.icon };
    }
    const { defaultWindowIcon } = await import("@tauri-apps/api/app");
    const icon = await defaultWindowIcon();
    if (!icon) {
      throw new TrayIconUnavailableError("the app bundle exposes no default window icon");
    }
    return { icon, owned: icon };
  }

  /**
   * Release an image resource this provider allocated. A failed close is hygiene, not
   * the caller's problem, so it is reported through ctx.log and never rethrown.
   *
   * @param {OwnedIconImage | undefined} image - The image to release; undefined is a no-op.
   * @returns {Promise<void>} Resolves once the image is closed (or the failure is logged).
   * @example
   * ```ts
   * await releaseIconImage(owned);
   * ```
   */
  async function releaseIconImage(image: OwnedIconImage | undefined): Promise<void> {
    if (image === undefined) {
      return;
    }
    try {
      await image.close();
    } catch (error) {
      log.debug("tray:tauri-default-icon-close-failed", { reason: toError(error).message });
    }
  }

  /**
   * Create the OS status item with its icon, translating a missing icon file into the
   * typed "unavailable" failure instead of an opaque OS message. The default window
   * icon is released in a `finally` once `TrayIcon.new` has read its rid — success or
   * failure, the resource never outlives this call.
   *
   * @returns {Promise<TrayIconHandle>} The freshly created tray icon handle.
   * @example
   * ```ts
   * const trayIcon = await createIcon();
   * ```
   */
  async function createIcon(): Promise<TrayIconHandle> {
    const { icon, owned } = await resolveIcon();
    try {
      return await TrayIcon.new({ id: config.id, icon });
    } catch (error) {
      if (
        error instanceof TrayIconUnavailableError ||
        !MISSING_ICON_FILE_PATTERN.test(String(error))
      ) {
        throw error;
      }
      throw new TrayIconUnavailableError(toError(error).message);
    } finally {
      await releaseIconImage(owned);
    }
  }

  /**
   * Close a Rust-side menu resource, reporting a failure through ctx.log instead of
   * letting teardown hygiene break the caller's result.
   *
   * @param {MenuHandle | undefined} menu - The menu to release; undefined is a no-op.
   * @returns {Promise<void>} Resolves once the menu is closed (or the failure is logged).
   * @example
   * ```ts
   * await closeMenu(previousMenu);
   * ```
   */
  async function closeMenu(menu: MenuHandle | undefined): Promise<void> {
    if (menu === undefined) {
      return;
    }
    try {
      await menu.close();
    } catch (error) {
      log.error("tray:tauri-menu-close-failed", undefined, toError(error));
    }
  }

  /**
   * Tail of the menu-swap queue. Every build-attach-release sequence runs through it,
   * so two overlapping `setMenu()` calls can never interleave — without it their native
   * swaps can resolve out of order and the call that finishes last closes the menu the
   * OS is actually showing. The tail never rejects, so one failed swap cannot poison
   * the queue for the next one.
   */
  let menuQueue: Promise<void> = Promise.resolve();

  /**
   * Run one menu swap after every swap queued before it.
   *
   * @param {() => Promise<void>} swap - The build-attach-release sequence to serialize.
   * @returns {Promise<void>} The swap's own outcome — rejections reach its caller only.
   * @example
   * ```ts
   * await enqueueMenuSwap(async () => attachMenu(await ensureIcon(), await Menu.new(options)));
   * ```
   */
  function enqueueMenuSwap(swap: () => Promise<void>): Promise<void> {
    const running = menuQueue.then(swap, swap);
    menuQueue = running.then(ignoreSwapOutcome, ignoreSwapOutcome);
    return running;
  }

  /**
   * Attach a freshly built menu to the status item, then release the one it replaced.
   * Every `Menu.new()` allocates a Rust-side resource plus a Channel per item, so
   * exactly one menu is kept alive at a time — the replaced one is closed only after
   * the swap succeeded, and a menu that failed to attach is closed immediately.
   *
   * @param {TrayIconHandle} trayIcon - The status item to attach to.
   * @param {MenuHandle} menu - The newly built menu.
   * @returns {Promise<void>} Resolves once the swap completed.
   * @example
   * ```ts
   * await attachMenu(await ensureIcon(), await Menu.new({ items }));
   * ```
   */
  async function attachMenu(trayIcon: TrayIconHandle, menu: MenuHandle): Promise<void> {
    try {
      await trayIcon.setMenu(menu);
    } catch (error) {
      await closeMenu(menu);
      throw error;
    }
    const previous = currentMenu;
    currentMenu = menu;
    await closeMenu(previous);
  }

  /**
   * Lazily create (or return the in-flight/cached) OS tray icon handle. Caching the
   * PROMISE — not just the resolved handle — closes a check-then-act race: two
   * mutating calls issued without an intervening await (e.g. via `Promise.all`) both
   * see the same in-flight promise instead of each independently calling
   * `TrayIcon.new()`, which would leak an OS tray-icon handle the second call
   * overwrites and `destroy()`/`dispose()` could never reach. On rejection (a
   * transient OS failure), the cache is cleared so the NEXT mutating call retries
   * instead of replaying the same failure forever.
   *
   * @returns {Promise<TrayIconHandle>} The tray icon handle.
   * @example
   * ```ts
   * const trayIcon = await ensureIcon();
   * ```
   */
  function ensureIcon(): Promise<TrayIconHandle> {
    if (iconPromise === undefined) {
      iconPromise = createIcon().catch((error: unknown) => {
        iconPromise = undefined;
        throw error;
      });
    }
    return iconPromise;
  }

  /**
   * Destroy the cached icon if present; idempotent when never created, already
   * destroyed, or the in-flight creation failed (nothing to destroy in that case —
   * the rejection already propagated to the caller that awaited it). Clears the
   * cached promise so the next mutating call recreates it lazily. Awaits (and
   * clears) any in-flight creation first so a destroy racing a concurrent first-call
   * creation still ends up with no leaked handle, and NEVER throws — so
   * `destroy()`/`dispose()` (and the teardown registry that awaits `dispose()` at
   * `app.stop()`) always resolve cleanly even after a prior creation failure.
   *
   * @returns {Promise<void>} Resolves once teardown completes.
   * @example
   * ```ts
   * await destroyIcon();
   * ```
   */
  async function destroyIcon(): Promise<void> {
    const pending = iconPromise;
    const menu = currentMenu;
    iconPromise = undefined;
    currentMenu = undefined;
    if (pending !== undefined) {
      try {
        const current = await pending;
        await current.close();
      } catch {
        // The in-flight creation itself failed — nothing was ever created to close.
      }
    }
    await closeMenu(menu);
  }

  return {
    /**
     * Replace the tray menu. Creates the OS icon lazily on first call, and releases the
     * menu this call replaces. Overlapping calls run one after another, so the menu the
     * OS shows and the menu this provider holds open never disagree.
     *
     * @param {TrayMenuItem[]} items - Menu items.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setMenu([{ id: "quit", text: "Quit" }]);
     * ```
     */
    setMenu: async (items: TrayMenuItem[]): Promise<SystemResult<void>> => {
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
      try {
        await enqueueMenuSwap(async () => {
          const trayIcon = await ensureIcon();
          const menu = await Menu.new({ items: items.map(item => toNativeMenuItem(item)) });
          await attachMenu(trayIcon, menu);
        });
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-menu-failed", undefined, toError(error));
        return mapTrayThrow(error);
      }
    },

    /**
     * Set hover tooltip text. Creates the OS icon lazily on first call.
     *
     * @param {string} text - Tooltip text.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setTooltip("hover text");
     * ```
     */
    setTooltip: async (text: string): Promise<SystemResult<void>> => {
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
      try {
        const trayIcon = await ensureIcon();
        await trayIcon.setTooltip(text);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-tooltip-failed", { text }, toError(error));
        return mapTrayThrow(error);
      }
    },

    /**
     * Set the tray icon by path. Creates the OS icon lazily on first call.
     *
     * @param {string} iconPath - Icon path.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setIcon("/path/icon.png");
     * ```
     */
    setIcon: async (iconPath: string): Promise<SystemResult<void>> => {
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
      try {
        const trayIcon = await ensureIcon();
        await trayIcon.setIcon(iconPath);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-icon-failed", { iconPath }, toError(error));
        return mapTrayThrow(error);
      }
    },

    /**
     * Remove the tray icon; next mutating call recreates it. ok even if never created —
     * unless the provider was disposed, which is the one removal that is final.
     *
     * @returns {Promise<SystemResult<void>>} ok when removed or absent.
     * @example
     * ```ts
     * const r = await provider.destroy();
     * ```
     */
    destroy: async (): Promise<SystemResult<void>> => {
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
      try {
        await enqueueMenuSwap(destroyIcon);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-destroy-failed", undefined, toError(error));
        return mapTrayThrow(error);
      }
    },

    /**
     * Teardown — destroys the cached OS icon and its menu if present (idempotent with
     * destroy()). Queued behind any in-flight menu swap, so teardown never races a
     * swap into leaving a menu open. Final: every method that arrives afterwards
     * reports `err("tauri", "unavailable", "app stopped")` instead of lazily creating a
     * status item the stopped app can no longer release.
     *
     * @returns {Promise<void>} Resolves once teardown completes.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => {
      if (disposed) {
        return Promise.resolve();
      }
      disposed = true;
      return enqueueMenuSwap(destroyIcon);
    }
  };
}
