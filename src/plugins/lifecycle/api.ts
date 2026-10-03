/**
 * @file lifecycle plugin — API factory, plus the signal every lifecycle source reports to.
 *
 * The sources race. P15 measured iOS sending `tauri://suspended` 1.5 s before
 * `visibilitychange` hidden, so the signal dedupes on transition: subscribers see each trip
 * to background once, and every resume follows a pause.
 */
import type { LifecycleSignal } from "./providers/types";
import type { LifecycleApi, LifecycleContext, Unsubscribe } from "./types";

/**
 * Convert a thrown value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever a subscriber threw.
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
 * Build a subscribe function over one subscriber set.
 *
 * @param {Set<() => void>} subscribers - The set the returned function adds to.
 * @returns {(fn: () => void) => Unsubscribe} Adds `fn`; the remover it returns deletes `fn` only.
 * @example
 * ```ts
 * const subscribers = new Set<() => void>();
 * const off = subscribeTo(subscribers)(() => undefined); // subscribers.size is 1
 * off(); // subscribers.size is 0
 * ```
 */
function subscribeTo(subscribers: Set<() => void>): (fn: () => void) => Unsubscribe {
  return fn => {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  };
}

/**
 * Creates the lifecycle API mounted at app.lifecycle. Both methods are local and synchronous:
 * subscribing never waits for the provider, so it works before app.start().
 *
 * @param {LifecycleContext} ctx - Lifecycle domain context (state).
 * @returns {LifecycleApi} The lifecycle API surface.
 * @example
 * ```ts
 * const offPause = createLifecycleApi(ctx).onPause(() => game.pause()); // ctx.state.pauseSubscribers.size is 1
 * offPause(); // ctx.state.pauseSubscribers.size is 0
 * ```
 */
export function createLifecycleApi(ctx: LifecycleContext): LifecycleApi {
  return {
    onPause: subscribeTo(ctx.state.pauseSubscribers),
    onResume: subscribeTo(ctx.state.resumeSubscribers)
  };
}

/**
 * Creates the signal every provider source reports to. It dedupes on transition: "pause" runs
 * the pause subscribers only when the app was in the foreground, "resume" runs the resume
 * subscribers only after a pause. Several sources may report one transition; subscribers see it
 * once.
 *
 * Subscribers run in subscription order, from a snapshot of the set: one added during the round
 * waits for the next transition, one removed during the round is skipped. A subscriber that
 * throws is logged (`lifecycle:subscriber-failed`) and the others still run.
 *
 * @param {LifecycleContext} ctx - Lifecycle domain context (state + log).
 * @returns {LifecycleSignal} The signal handed to the provider factory.
 * @example
 * ```ts
 * const signal = createSignal(ctx);
 * signal("pause"); // the onPause subscribers run
 * signal("pause"); // same transition from a second source: nothing runs
 * signal("resume"); // the onResume subscribers run
 * ```
 */
export function createSignal(ctx: LifecycleContext): LifecycleSignal {
  return phase => {
    const pausing = phase === "pause";

    // Same as the last transition: a second source reporting it, or a resume with no pause.
    if (ctx.state.paused === pausing) {
      return;
    }
    ctx.state.paused = pausing;

    const subscribers = pausing ? ctx.state.pauseSubscribers : ctx.state.resumeSubscribers;

    // A snapshot: a subscriber added during this round waits for the next transition, so a
    // subscriber that re-subscribes itself cannot loop forever.
    const round = [...subscribers];
    for (const subscriber of round) {
      // Removed by an earlier subscriber in this round.
      if (!subscribers.has(subscriber)) {
        continue;
      }
      try {
        subscriber();
      } catch (error) {
        ctx.log.error("lifecycle:subscriber-failed", { phase }, toError(error));
      }
    }
  };
}
