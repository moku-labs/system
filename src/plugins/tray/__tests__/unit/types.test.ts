import { describe, expectTypeOf, it } from "vitest";

import type { TrayConfig } from "../../types";

/** Every image form the config accepts — what TrayIcon.new takes, minus its Image resource. */
type ExpectedIcon = string | Uint8Array | number[] | undefined;

describe("TrayConfig.icon", () => {
  it("accepts every image form TrayIcon.new takes, minus the Image resource", () => {
    expectTypeOf<TrayConfig["icon"]>().toEqualTypeOf<ExpectedIcon>();
  });

  it("accepts a path, raw bytes, or a byte array as written config", () => {
    const path: TrayConfig = { id: "my-app", icon: "/Applications/My.app/tray.png" };
    const bytes: TrayConfig = { id: "my-app", icon: new Uint8Array([137, 80, 78, 71]) };
    const numbers: TrayConfig = { id: "my-app", icon: [137, 80, 78, 71] };

    expectTypeOf(path.icon).toEqualTypeOf<ExpectedIcon>();
    expectTypeOf(bytes.icon).toEqualTypeOf<ExpectedIcon>();
    expectTypeOf(numbers.icon).toEqualTypeOf<ExpectedIcon>();
  });

  it("rejects a value that is not an image form", () => {
    // @ts-expect-error — icon takes a path or bytes, never a number
    const invalid: TrayConfig = { id: "my-app", icon: 42 };

    expectTypeOf(invalid).toExtend<TrayConfig>();
  });
});
