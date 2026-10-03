/**
 * @file back plugin — API factory, the press dispatcher, and the reconciler that keeps
 * the native Back listener in step with the handlers.
 *
 * Native listener rule (D-S04, P14): registering any `onBackButtonPress` listener replaces
 * the Android default. So the listener exists only while at least one handler exists and
 * the app is started. Every subscribe, every remove and onStart chain one `reconcile()`
 * step onto a single queue, so a fast add/remove never registers twice.
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { BackApi, BackContext, Unsubscribe } from "./types";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * toError("boom").message; // "boom"
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Offer the press to one handler. A throw is logged and counts as "not taken", so one
 * broken handler can neither swallow the press nor stop the older handlers.
 *
 * @param {BackContext} ctx - Back domain context (for the log).
 * @param {() => boolean} handler - The handler to run.
 * @returns {boolean} True when the handler took the press.
 * @example
 * ```ts
 * takesPress(ctx, () => true); // true
 * takesPress(ctx, () => { throw new Error("gone"); }); // false, logged as "back:subscriber-failed"
 * ```
 */
function takesPress(ctx: BackContext, handler: () => boolean): boolean {
  try {
    return handler();
  } catch (error) {
    ctx.log.error("back:subscriber-failed", undefined, toError(error));
    return false;
  }
}

/**
 * Offer one Back press to the handlers, newest first. The first handler that returns
 * true takes it and the rest do not run. Walks a copy, so a handler that removes itself
 * during the press does not make the loop skip the next one.
 *
 * @param {BackContext} ctx - Back domain context.
 * @returns {boolean} True when a handler took the press; false sends it to the platform default.
 * @example
 * ```ts
 * // Handlers, oldest first: closeMenu, then closePopup. A popup is open: closePopup returns true.
 * dispatch(ctx); // true: closePopup took the press, closeMenu never ran
 * ```
 */
export function dispatch(ctx: BackContext): boolean {
  // Snapshot: a handler may remove itself during the press. An index loop from the end
  // instead of ES2023 `toReversed()`, which older Android WebViews lack.
  const handlers = [...ctx.state.handlers];
  for (let index = handlers.length - 1; index >= 0; index--) {
    const handler = handlers[index];
    if (handler !== undefined && takesPress(ctx, handler)) {
      return true;
    }
  }
  return false;
}

/**
 * One reconcile step: compare the wanted listener (handlers exist and the provider
 * resolved ok) with the registered one, and register or unregister to match.
 *
 * @param {BackContext} ctx - Back domain context.
 * @returns {Promise<void>} Resolves once the native side matches the handlers.
 * @example
 * ```ts
 * // Started on Android, one handler, nothing registered yet.
 * await applyListener(ctx); // provider.listen ran once; ctx.state.listening is true
 * ```
 */
async function applyListener(ctx: BackContext): Promise<void> {
  const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
  // Not started, or the provider failed to resolve: no listener is wanted, and none
  // was ever registered, since `listening` turns true only after a resolved `listen`.
  if (!resolved.ok) {
    return;
  }

  const wanted = ctx.state.handlers.length > 0;
  if (wanted === ctx.state.listening) {
    return;
  }

  if (wanted) {
    // On a failure the provider already logged; the next subscribe tries again.
    const result = await resolved.provider.listen(() => dispatch(ctx));
    ctx.state.listening = result.ok;
    return;
  }

  // The unlisten result is ignored: the handle is dropped either way.
  await resolved.provider.unlisten();
  ctx.state.listening = false;
}

/**
 * Chain one reconcile step onto the queue. Steps run one after another, so a fast
 * add/remove/add can never register two native listeners. A step that throws is logged
 * and the queue keeps working: its tail never rejects.
 *
 * @param {BackContext} ctx - Back domain context.
 * @example
 * ```ts
 * ctx.state.handlers.push(() => true);
 * reconcile(ctx);
 * await ctx.state.queue; // Android: the native listener is registered once
 * ```
 */
export function reconcile(ctx: BackContext): void {
  ctx.state.queue = ctx.state.queue
    .then(() => applyListener(ctx))
    .catch((error: unknown) => {
      ctx.log.error("back:reconcile-failed", undefined, toError(error));
    });
}

/**
 * Creates the back API surface mounted at app.back.
 *
 * @param {BackContext} ctx - Back domain context (state + runtime + log).
 * @returns {BackApi} The back API surface.
 * @example
 * ```ts
 * // Mounted as app.back. A browser, after app.start(): there is no hardware Back.
 * await app.back.exit(); // { ok: false, provider: "web", reason: "unsupported" }
 * ```
 */
export function createBackApi(ctx: BackContext): BackApi {
  return {
    /**
     * Register a hardware Back handler. Local and synchronous: the handler is kept at
     * once, and the native listener follows through the reconcile queue.
     *
     * @param {() => boolean} fn - Press handler. Returns whether it took the press.
     * @returns {Unsubscribe} Removes this registration only; a second call does nothing.
     * @example
     * ```ts
     * const off = api.onPress(() => closePopup()); // closePopup returns true when it closed one
     * off(); // the last remover gives Back back to the system
     * ```
     */
    onPress: (fn: () => boolean): Unsubscribe => {
      ctx.state.handlers.push(fn);
      reconcile(ctx);

      let removed = false;
      return (): void => {
        if (removed) {
          return;
        }
        removed = true;
        // `fn` may be registered twice. Both copies run the same code, so drop the newest.
        ctx.state.handlers.splice(ctx.state.handlers.lastIndexOf(fn), 1);
        reconcile(ctx);
      };
    },

    /**
     * Close the app through the resolved provider.
     *
     * @returns {Promise<SystemResult<void>>} ok on Tauri Android; err("unsupported") elsewhere.
     * @example
     * ```ts
     * const result = await api.exit(); // web: { ok: false, provider: "web", reason: "unsupported" }
     * ```
     */
    exit: async (): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.exit();
    }
  };
}
