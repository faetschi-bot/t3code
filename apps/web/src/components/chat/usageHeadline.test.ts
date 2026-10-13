import type { LimitPoolWindow } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import {
  pickHeadlineWindow,
  tightestWindow,
  windowBaseLabel,
  windowDisplayLabel,
} from "./usageHeadline";

function poolWindow(
  input: Pick<LimitPoolWindow, "kind" | "label" | "usedPercent"> &
    Partial<Pick<LimitPoolWindow, "id">>,
): LimitPoolWindow {
  return {
    id: input.id ?? `${input.kind}:${input.label}`,
    kind: input.kind,
    label: input.label,
    members: [],
    columns: [],
    remainingPercent: 100 - input.usedPercent,
    usedPercent: input.usedPercent,
    pace: null,
    resets: [],
  };
}

describe("usageHeadline", () => {
  const session = poolWindow({ kind: "session", label: "Go · Session", usedPercent: 14 });
  const weekly = poolWindow({ kind: "weekly", label: "Weekly", usedPercent: 40 });
  const monthly = poolWindow({ kind: "monthly", label: "Monthly", usedPercent: 2 });

  describe("windowBaseLabel", () => {
    it("strips a plan prefix the provider already adds", () => {
      expect(windowBaseLabel(session)).toBe("Session");
    });

    it("leaves a bare window name alone", () => {
      expect(windowBaseLabel(weekly)).toBe("Weekly");
    });
  });

  describe("windowDisplayLabel", () => {
    it("keeps a label that already names its plan", () => {
      expect(windowDisplayLabel("OpenCode", session)).toBe("Go · Session");
    });

    it("prefixes the provider when the label is only the window", () => {
      expect(windowDisplayLabel("Codex", weekly)).toBe("Codex · Weekly");
    });
  });

  describe("tightestWindow", () => {
    it("picks the highest share spent", () => {
      expect(tightestWindow([session, weekly, monthly])).toBe(weekly);
    });

    it("breaks a tie on the shortest window", () => {
      const weeklyHigh = poolWindow({ kind: "weekly", label: "Weekly", usedPercent: 50 });
      const sessionHigh = poolWindow({ kind: "session", label: "Session", usedPercent: 50 });
      expect(tightestWindow([weeklyHigh, sessionHigh])).toBe(sessionHigh);
    });

    it("returns null without windows", () => {
      expect(tightestWindow([])).toBeNull();
    });
  });

  describe("pickHeadlineWindow", () => {
    it("follows the tightest window when set to auto", () => {
      expect(pickHeadlineWindow([session, weekly, monthly], "auto")).toBe(weekly);
    });

    it("honours a preferred kind", () => {
      expect(pickHeadlineWindow([session, weekly, monthly], "monthly")).toBe(monthly);
    });

    it("falls back to the tightest window when the preferred kind is absent", () => {
      expect(pickHeadlineWindow([session, weekly], "monthly")).toBe(weekly);
    });
  });
});
