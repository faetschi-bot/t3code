/**
 * Headline and row labels for the thread details Usage panel.
 *
 * Providers name their windows inconsistently: OpenCode names the plan
 * ("Go · Session") while Codex names only the window ("Weekly"). These helpers
 * add the owner where an expanded row needs it, and strip it back off where the
 * collapsed header is too tight for it.
 *
 * @module components/chat/usageHeadline
 */
import type { LimitPoolWindow } from "@t3tools/shared/usageLimits";

/** Which window the collapsed headline prefers; `auto` follows the tightest. */
export type UsageHeadlineWindow = "auto" | "session" | "weekly" | "monthly";

/** Window kinds, shortest first; ties on share spent break on the shorter one. */
const WINDOW_KIND_ORDER: Record<LimitPoolWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

/**
 * The window closest to running out: highest share spent, shortest kind on
 * ties. Rows without a duration (credits, counters) still compete on share.
 */
export function tightestWindow(windows: readonly LimitPoolWindow[]): LimitPoolWindow | null {
  let best: LimitPoolWindow | null = null;
  for (const window of windows) {
    if (
      best === null ||
      window.usedPercent > best.usedPercent ||
      (window.usedPercent === best.usedPercent &&
        WINDOW_KIND_ORDER[window.kind] < WINDOW_KIND_ORDER[best.kind])
    ) {
      best = window;
    }
  }
  return best;
}

/**
 * The headline window: a preferred kind when one is set and reported, else the
 * window closest to running out.
 */
export function pickHeadlineWindow(
  windows: readonly LimitPoolWindow[],
  preference: UsageHeadlineWindow,
): LimitPoolWindow | null {
  if (preference !== "auto") {
    const preferred = windows.find((window) => window.kind === preference);
    if (preferred) return preferred;
  }
  return tightestWindow(windows);
}

/**
 * The window's own name with any provider/plan prefix stripped, for the tight
 * collapsed header where only "Session" or "Weekly" fits.
 */
export function windowBaseLabel(window: LimitPoolWindow): string {
  const separator = window.label.lastIndexOf("·");
  return (separator === -1 ? window.label : window.label.slice(separator + 1)).trim();
}

/**
 * A row label that always names its owner: a window that already carries a
 * plan prefix keeps it, and the rest take the provider's name.
 */
export function windowDisplayLabel(providerLabel: string, window: LimitPoolWindow): string {
  return window.label.includes("·") ? window.label : `${providerLabel} · ${window.label}`;
}
