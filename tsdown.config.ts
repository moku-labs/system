import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    // Capability subpath entries (D-011b) — one per plugin so pure-web consumers
    // bundle only the capabilities they compose.
    store: "src/store.ts",
    tray: "src/tray.ts",
    notify: "src/notify.ts",
    clipboard: "src/clipboard.ts",
    "deep-link": "src/deep-link.ts"
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  tsconfig: "tsconfig.build.json"
});
