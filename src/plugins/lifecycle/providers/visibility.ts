/**
 * @file lifecycle providers — the shared visibility source. Both providers use it (the web
 * provider alone, the Tauri provider next to the native events), never a copy. No browser
 * globals at module scope (SSR-safe): `document` is read inside watchVisibility, not at import
 * time.
 */
import type { LifecycleSignal } from "./types";

const VISIBILITY_CHANGE = "visibilitychange";

/**
 * Structural shape of the `document` subset this source reads. Declared locally (rather than
 * relying on the DOM lib) because the project's tsconfig targets Bun/Node with
 * `lib: ["ESNext"]` only — no ambient `Document`/`document` global.
 */
type VisibilityDocument = {
  readonly visibilityState: string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/**
 * Report a document's current visibility: hidden → "pause", anything else → "resume".
 *
 * @param {Pick<VisibilityDocument, "visibilityState">} doc - The page document.
 * @param {LifecycleSignal} signal - Where the phase goes.
 * @example
 * ```ts
 * reportVisibility({ visibilityState: "hidden" }, phase => phases.push(phase)); // phases is ["pause"]
 * ```
 */
function reportVisibility(
  doc: Pick<VisibilityDocument, "visibilityState">,
  signal: LifecycleSignal
): void {
  signal(doc.visibilityState === "hidden" ? "pause" : "resume");
}

/**
 * Watch the page's visibility: `visibilitychange` to hidden reports "pause", back to visible
 * reports "resume". A page already hidden at call time reports "pause" once. Without a
 * `document` (SSR) nothing is watched and the remover does nothing.
 *
 * @param {LifecycleSignal} signal - Where each phase goes.
 * @returns {() => void} Removes the `visibilitychange` listener.
 * @example
 * ```ts
 * const stopWatching = watchVisibility(phase => phases.push(phase)); // tab hidden → phases is ["pause"]
 * stopWatching(); // later tab switches report nothing
 * ```
 */
export function watchVisibility(signal: LifecycleSignal): () => void {
  // `document` has no ambient declaration under this DOM-lib-free tsconfig — narrowed
  // immediately via the local structural type, never `any`.
  const doc = (globalThis as { document?: VisibilityDocument }).document;
  if (doc === undefined) {
    return () => {
      // SSR: no listener was added, so there is nothing to remove.
    };
  }

  const report = reportVisibility.bind(undefined, doc, signal);
  doc.addEventListener(VISIBILITY_CHANGE, report);

  if (doc.visibilityState === "hidden") {
    signal("pause");
  }

  return () => {
    doc.removeEventListener(VISIBILITY_CHANGE, report);
  };
}
