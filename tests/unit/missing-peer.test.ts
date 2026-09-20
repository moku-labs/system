/**
 * Every capability's Tauri branch reaches its `@tauri-apps/*` package through a dynamic
 * import of an OPTIONAL peer dependency. When that package is absent the bundler/runtime
 * rejection says nothing useful ("Failed to fetch dynamically imported module …"), so each
 * load closure is wrapped by the shared `requirePeer` helper. This is the cross-plugin
 * table that proves every capability names ITS package and ITS `@moku-labs/native`
 * `config.system` entry — the two differ (notify → notification, clipboard →
 * clipboard-manager), which is exactly what a hand-written message gets wrong.
 */
import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { describe, expect, it, vi } from "vitest";

const { missingModule } = vi.hoisted(() => ({
  /**
   * The rejection Node raises for an unresolvable specifier, used to stand in for a peer
   * the app never installed.
   *
   * @param {string} specifier - The package that cannot be resolved.
   * @returns {Error} An ERR_MODULE_NOT_FOUND-shaped rejection.
   * @example
   * ```ts
   * throw missingModule("@tauri-apps/plugin-store");
   * ```
   */
  missingModule: (specifier: string): Error =>
    Object.assign(new Error(`Cannot find package '${specifier}'`), {
      code: "ERR_MODULE_NOT_FOUND"
    })
}));

vi.mock("@tauri-apps/plugin-store", () => {
  throw missingModule("@tauri-apps/plugin-store");
});
vi.mock("@tauri-apps/plugin-notification", () => {
  throw missingModule("@tauri-apps/plugin-notification");
});
vi.mock("@tauri-apps/plugin-clipboard-manager", () => {
  throw missingModule("@tauri-apps/plugin-clipboard-manager");
});
vi.mock("@tauri-apps/plugin-deep-link", () => {
  throw missingModule("@tauri-apps/plugin-deep-link");
});
vi.mock("@tauri-apps/api/tray", () => {
  throw missingModule("@tauri-apps/api/tray");
});

import { loadClipboardProvider } from "../../src/plugins/clipboard/providers/index";
import type { ClipboardContext } from "../../src/plugins/clipboard/types";
import { loadDeepLinkProvider } from "../../src/plugins/deep-link/providers/index";
import type { DeepLinkContext } from "../../src/plugins/deep-link/types";
import { loadNotifyProvider } from "../../src/plugins/notify/providers/index";
import type { NotifyContext } from "../../src/plugins/notify/types";
import type { RuntimeApi } from "../../src/plugins/runtime/types";
import { loadStoreProvider } from "../../src/plugins/store/providers/index";
import type { StoreContext } from "../../src/plugins/store/types";
import { loadTrayProvider } from "../../src/plugins/tray/providers/index";
import type { TrayContext } from "../../src/plugins/tray/types";

/**
 * Minimal LogApi test double — the providers under test never get far enough to log,
 * but the context type requires a structurally complete one (no casts).
 *
 * @returns {LogApi} A stubbed logger.
 * @example
 * ```ts
 * const ctx = { log: createMockLog(), ... };
 * ```
 */
function createMockLog(): LogApi {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: (): readonly LogEntry[] => [],
    expect: (): ExpectChain => {
      throw new Error("ExpectChain is not mocked — these tests do not use log.expect()");
    },
    addSink: vi.fn(),
    reset: vi.fn(),
    clearSinks: vi.fn()
  };
}

/** The shell-independent half of every capability context, on a desktop Tauri runtime. */
type TauriContextBase = {
  global: Record<string, never>;
  runtime: RuntimeApi;
  log: LogApi;
};

/**
 * The context slice every capability shares — detected Tauri shell on a desktop platform,
 * which is the only branch that reaches an `@tauri-apps/*` import.
 *
 * @returns {TauriContextBase} The shared context fields.
 * @example
 * ```ts
 * loadStoreProvider({ config, state, emit: vi.fn(), ...tauriBase() });
 * ```
 */
function tauriBase(): TauriContextBase {
  return {
    global: {},
    runtime: { kind: "tauri", platform: "macos" },
    log: createMockLog()
  };
}

/** One row of the missing-peer table: which package, and which native config entry. */
type MissingPeerCase = {
  readonly capability: string;
  readonly peer: string;
  readonly nativeName: string;
  readonly load: () => () => Promise<unknown>;
};

/* eslint-disable unicorn/no-null -- every capability's state.provider is typed
   `Promise<...> | null` per the seam contract; these contexts construct that shape. */
const CASES: readonly MissingPeerCase[] = [
  {
    capability: "store",
    peer: "@tauri-apps/plugin-store",
    nativeName: "store",
    load: (): (() => Promise<unknown>) =>
      loadStoreProvider({
        config: { name: "missing-peer" },
        state: { provider: null },
        emit: vi.fn(),
        ...tauriBase()
      } satisfies StoreContext)
  },
  {
    capability: "notify",
    peer: "@tauri-apps/plugin-notification",
    nativeName: "notification",
    load: (): (() => Promise<unknown>) =>
      loadNotifyProvider({
        config: {},
        state: { provider: null },
        emit: vi.fn(),
        ...tauriBase()
      } satisfies NotifyContext)
  },
  {
    capability: "clipboard",
    peer: "@tauri-apps/plugin-clipboard-manager",
    nativeName: "clipboard-manager",
    load: (): (() => Promise<unknown>) =>
      loadClipboardProvider({
        config: {},
        state: { provider: null },
        emit: vi.fn(),
        ...tauriBase()
      } satisfies ClipboardContext)
  },
  {
    capability: "deepLink",
    peer: "@tauri-apps/plugin-deep-link",
    nativeName: "deep-link",
    load: (): (() => Promise<unknown>) =>
      loadDeepLinkProvider(
        {
          config: { schemes: ["myapp"] },
          state: {
            provider: null,
            handedOver: new Map(),
            launchPhaseOpen: true,
            launchPhaseEndsAt: null,
            subscribers: new Set()
          },
          emit: vi.fn(),
          ...tauriBase()
        } satisfies DeepLinkContext,
        vi.fn()
      )
  },
  {
    capability: "tray",
    peer: "@tauri-apps/api",
    nativeName: "tray",
    load: (): (() => Promise<unknown>) =>
      loadTrayProvider({
        config: { id: "missing-peer" },
        state: { provider: null },
        emit: vi.fn(),
        ...tauriBase()
      } satisfies TrayContext)
  }
];
/* eslint-enable unicorn/no-null */

describe("missing @tauri-apps peer", () => {
  it.each(
    CASES
  )("$capability reports $peer by name instead of a raw module-resolution failure", async ({
    peer,
    nativeName,
    load
  }) => {
    await expect(load()()).rejects.toThrow(
      `${peer} is not installed. Add it to the app, or list "${nativeName}" in @moku-labs/native config.system.`
    );
  });
});
