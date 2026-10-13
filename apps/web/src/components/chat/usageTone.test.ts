import { describe, expect, it } from "vite-plus/test";

import { usageTone } from "./usageTone";

describe("usageTone", () => {
  it.each([
    [0, "default"],
    [59, "default"],
    [60, "warn"],
    [89, "warn"],
    [90, "danger"],
    [100, "danger"],
  ] as const)("tones %i%% spent as %s", (usedPercent, tone) => {
    expect(usageTone(usedPercent)).toBe(tone);
  });
});
