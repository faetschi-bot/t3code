/**
 * How a subscription window's share spent is toned in the thread details card.
 *
 * The readouts lead with quota used, so the escalation is what tells a user the
 * window is close to running out: amber from 60% spent, red from 90%.
 *
 * @module components/chat/usageTone
 */
export type UsageTone = "default" | "warn" | "danger";

export function usageTone(usedPercent: number): UsageTone {
  if (usedPercent >= 90) return "danger";
  if (usedPercent >= 60) return "warn";
  return "default";
}
