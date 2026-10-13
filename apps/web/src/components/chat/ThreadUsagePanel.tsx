/**
 * Subscription limits in the thread details card, shaped like OpenChamber's
 * usage row: a collapsible "Usage" header that always carries the tightest
 * window as a headline, expanding to per-provider groups that each
 * expand/collapse to their windows.
 *
 * Every readout is quota used: the number climbs as the window is consumed, and
 * both the figure and its bar turn amber past 60% and red past 90%.
 *
 * Limits are environment-level, not thread-level, so the section pools every
 * connected environment, mirroring the Limits page's default. It renders
 * nothing when no connected provider reports windows, so it cannot take space
 * to say nothing.
 *
 * @module components/chat/ThreadUsagePanel
 */
import { useAtomValue } from "@effect/atom-react";
import {
  collectLimitAccounts,
  collectLimitPools,
  displayLimitWindows,
  formatDuration,
  type LimitPool,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import { ChevronDownIcon, GaugeIcon } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import type { ProviderDriverKind } from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import { useClientSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { providerClients } from "../settings/providerDriverMeta";
import { RefreshIcon } from "../ui/refresh-icon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barColor } from "../usage/UsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  pickHeadlineWindow,
  tightestWindow,
  windowBaseLabel,
  windowDisplayLabel,
} from "./usageHeadline";
import { usageTone, type UsageTone } from "./usageTone";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
} from "./threadDetailsPanelStyles";

/** The panel's own refresh cadence; `manual` leaves it to the refresh action. */
const USAGE_REFRESH_INTERVAL_MS: Record<ClientSettings["usageRefreshInterval"], number | null> = {
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
  manual: null,
};

const USAGE_TONE_TEXT_CLASS: Record<UsageTone, string> = {
  default: "text-foreground",
  // A step brighter than the shared `--warning` amber so a window near its
  // limit catches the eye at a glance.
  warn: "text-amber-400",
  danger: "text-destructive",
};

const USAGE_TONE_BAR_CLASS: Record<Exclude<UsageTone, "default">, string> = {
  warn: "bg-amber-400",
  danger: "bg-destructive",
};

function providerLabel(pool: LimitPool): string {
  return providerClients.get(pool.driver)?.label ?? String(pool.driver);
}

/** One pooled window: its name and share used, a thin bar, and the next reset. */
function UsageWindowRow({
  pool,
  limitWindow,
  now,
}: {
  readonly pool: LimitPool;
  readonly limitWindow: LimitPoolWindow;
  readonly now: number;
}) {
  const tone = usageTone(limitWindow.usedPercent);
  const resetsAt = limitWindow.resets[0]?.at;
  const resetsIn = resetsAt === undefined ? null : formatDuration(Math.max(0, resetsAt - now));
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 py-1", THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
          {windowDisplayLabel(providerLabel(pool), limitWindow)}
        </span>
        <span
          className={cn("shrink-0 text-xs font-semibold tabular-nums", USAGE_TONE_TEXT_CLASS[tone])}
        >
          {limitWindow.usedPercent}% used
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              tone === "default" ? undefined : USAGE_TONE_BAR_CLASS[tone],
            )}
            // The provider's own colour until the window starts running low, so
            // the escalation reads as a change rather than the resting state.
            style={{
              width: `${limitWindow.usedPercent}%`,
              ...(tone === "default" ? { backgroundColor: barColor(pool.driver) } : {}),
            }}
          />
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {resetsIn === null ? "" : `↻ ${resetsIn}`}
        </span>
      </div>
    </div>
  );
}

function ProviderUsageGroup({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const label = providerLabel(pool);
  // Collapse state is persisted per provider, so folding the whole Usage
  // section away and back does not re-expand everything.
  const collapsed = useUiStateStore((state) => state.collapsedUsageProviders.includes(pool.driver));
  const setUsageProviderCollapsed = useUiStateStore((state) => state.setUsageProviderCollapsed);
  const expanded = !collapsed;
  const windows = displayLimitWindows(pool);
  const summary = tightestWindow(windows);
  return (
    <div className="flex flex-col">
      {/* A panel row, not a section header: its text matches the card's other
          controls (branch, git actions) instead of the sidebar's muted tone. */}
      <ThreadDetailsControl
        part="row"
        aria-expanded={expanded}
        aria-label={`${label} usage`}
        onClick={() => setUsageProviderCollapsed(pool.driver, expanded)}
      >
        <ProviderInstanceIcon
          driverKind={pool.driver}
          displayName={label}
          className="size-4"
          iconClassName={cn("size-4", THREAD_DETAILS_PANEL_ICON_CLASS)}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {summary ? (
          <span
            className={cn(
              "shrink-0 text-2xs font-semibold tabular-nums",
              USAGE_TONE_TEXT_CLASS[usageTone(summary.usedPercent)],
            )}
          >
            {summary.usedPercent}%
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !expanded && "-rotate-90",
          )}
        />
      </ThreadDetailsControl>
      {expanded
        ? windows.map((limitWindow) => (
            <UsageWindowRow
              key={`${limitWindow.kind}:${limitWindow.id}`}
              pool={pool}
              limitWindow={limitWindow}
              now={now}
            />
          ))
        : null}
    </div>
  );
}

/**
 * Renders nothing until at least one connected provider reports usage limits,
 * so an environment without subscriptions never gains an empty section.
 */
export function ThreadUsagePanel({
  providerDriver,
}: {
  /** The provider the session is pointed at; its tightest window is the headline. */
  readonly providerDriver?: ProviderDriverKind | null | undefined;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshInterval = useClientSettings((settings) => settings.usageRefreshInterval);
  const headlineWindow = useClientSettings((settings) => settings.usageHeadlineWindow);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  const connectedKey = [...presentations]
    .filter(
      ([, presentation]) =>
        presentation.connection.phase === "connected" && presentation.serverConfig !== null,
    )
    .map(([environmentId]) => environmentId)
    .sort()
    .join(",");

  const refresh = async (automatic: boolean) => {
    try {
      await Promise.all(
        Array.from(presentations, ([environmentId, presentation]) => {
          if (presentation.connection.phase === "connected" && presentation.serverConfig !== null) {
            return refreshUsageLimits(
              environmentId,
              () => refreshProviders({ environmentId, input: {} }),
              automatic,
            );
          }
        }),
      );
    } finally {
      setNow(Date.now());
    }
  };
  // Mount respects the shared cooldown so opening the card is not a probe; the
  // timer owns its own cadence, so it goes through the non-automatic path the
  // cooldown does not throttle (the helper still dedupes an in-flight probe).
  const loadRefresh = useEffectEvent(() => {
    void refresh(true);
  });
  const tickRefresh = useEffectEvent(() => {
    void refresh(false);
  });
  const refreshIntervalMs = USAGE_REFRESH_INTERVAL_MS[refreshInterval];

  useEffect(() => {
    if (connectedKey) loadRefresh();
  }, [connectedKey]);
  useEffect(() => {
    if (!connectedKey || refreshIntervalMs === null) return;
    const timer = setInterval(() => tickRefresh(), refreshIntervalMs);
    return () => clearInterval(timer);
  }, [connectedKey, refreshIntervalMs]);

  const pools = connectedKey ? collectLimitPools(collectLimitAccounts(presentations), now) : [];
  // The headline follows the provider the session runs on, so a tighter window
  // on some other subscription never reads as this session's. It shows that
  // provider's window closest to running out, unless a preferred kind is set;
  // no match means no number rather than another account's, and the expanded
  // rows still list them all.
  const activePool = useMemo(
    () => (providerDriver ? pools.find((pool) => pool.driver === providerDriver) : undefined),
    [pools, providerDriver],
  );
  const headline = useMemo(
    () => (activePool ? pickHeadlineWindow(displayLimitWindows(activePool), headlineWindow) : null),
    [activePool, headlineWindow],
  );
  if (pools.length === 0) return null;

  const onRefresh = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    void refresh(false).finally(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
    });
  };

  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title="Usage"
      showHeading={false}
      data-thread-usage-panel
    >
      <div className="flex h-8 min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={
            headline && activePool
              ? `Usage: ${providerLabel(activePool)} ${windowBaseLabel(headline)}, ${headline.usedPercent}% used`
              : "Usage"
          }
          onClick={() => setExpanded((current) => !current)}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-2xs font-medium text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          <ChevronDownIcon
            aria-hidden
            className={cn("size-3 shrink-0 transition-transform", !expanded && "-rotate-90")}
          />
          <GaugeIcon
            aria-hidden
            className={cn("size-4 shrink-0", THREAD_DETAILS_PANEL_ICON_CLASS)}
          />
          <span className="shrink-0">Usage</span>
          <span aria-hidden className="h-px min-w-2 flex-1 bg-border/60" />
          {headline && activePool ? (
            <span aria-hidden className="flex min-w-0 shrink items-center gap-1">
              <span className="min-w-0 truncate">{windowBaseLabel(headline)}</span>
              <span
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  USAGE_TONE_TEXT_CLASS[usageTone(headline.usedPercent)],
                )}
              >
                {headline.usedPercent}% used
              </span>
            </span>
          ) : null}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <ThreadDetailsControl
                size="icon-xs"
                variant="ghost"
                part="icon"
                aria-label="Refresh usage"
                disabled={isRefreshing}
                onClick={onRefresh}
              >
                <RefreshIcon size="sm" refreshing={isRefreshing} />
              </ThreadDetailsControl>
            }
          />
          <TooltipPopup>Refresh usage</TooltipPopup>
        </Tooltip>
      </div>
      {expanded ? (
        <div className="flex flex-col gap-1 pt-1">
          {pools.map((pool) => (
            <ProviderUsageGroup key={pool.driver} pool={pool} now={now} />
          ))}
        </div>
      ) : null}
    </ThreadDetailsSection>
  );
}
