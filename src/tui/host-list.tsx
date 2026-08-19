/** Renders the responsive host table and translates mouse gestures into selection. */
import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef, type RefObject } from "react";
import type { PingState } from "../connectivity.ts";
import type { Host } from "../hosts.ts";
import { below } from "../ui/responsive.ts";
import { theme } from "../ui/theme.ts";
import { hostTableModel, isDoubleClick, type HostClick } from "./format.ts";
import { navigationShortcutGroups, shortcutHint, shortcutKey } from "./shortcuts.ts";

export type HostListProps = {
  configuredCount: number;
  sortLabel: string;
  hosts: Host[];
  pings: Record<string, PingState>;
  width: number;
  selected: number;
  focused: boolean;
  listRef: RefObject<ScrollBoxRenderable | null>;
  onSelectedChange: (index: number) => void;
  onConnect: (host: Host) => void;
};

export function HostList({
  configuredCount,
  sortLabel,
  hosts,
  pings,
  width,
  selected,
  focused,
  listRef,
  onSelectedChange,
  onConnect,
}: HostListProps) {
  const lastClick = useRef<HostClick | undefined>(undefined);
  const { rows, header, wide } = hostTableModel(hosts, pings, width);
  const compact = below(width, "lg");
  const compactSortLabel =
    sortLabel === "Recently used" ? "Recent" : sortLabel.replace("Name ", "");
  const displayedSortLabel = compact ? compactSortLabel : sortLabel;
  const bottomTitle = below(width, "md")
    ? `Sort: ${displayedSortLabel}`
    : `${shortcutHint(navigationShortcutGroups, compact)} · Sort: ${displayedSortLabel}`;

  useEffect(() => {
    listRef.current?.scrollChildIntoView(`host-row-${selected}`);
  }, [listRef, selected]);

  if (configuredCount === 0) {
    return (
      <box
        style={{
          flexGrow: 1,
          border: true,
          borderColor: theme.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <text style={{ fg: theme.text }}>No SSH hosts configured</text>
        <text style={{ fg: theme.muted }}>Press {shortcutKey("add")} to add your first host.</text>
      </box>
    );
  }

  return (
    <box
      title="Hosts"
      bottomTitle={bottomTitle}
      style={{ flexGrow: 1, width: "100%", border: true, borderColor: theme.border }}
    >
      {wide && <text style={{ fg: theme.muted }}> {header}</text>}
      <scrollbox
        ref={listRef}
        style={{ width: "100%", flexGrow: 1 }}
        focused={focused}
        onMouseScroll={(event) => {
          const direction = event.scroll?.direction;
          if (direction !== "up" && direction !== "down") return;
          event.preventDefault();
          onSelectedChange(
            Math.max(0, Math.min(hosts.length - 1, selected + (direction === "up" ? -1 : 1))),
          );
        }}
      >
        {rows.map((row, index) => {
          const host = hosts[index];
          if (!host) return null;
          const active = index === selected;
          const statusColor = theme[row.tone];
          return (
            <box
              key={host.id}
              id={`host-row-${index}`}
              style={{
                height: 1,
                width: "100%",
                backgroundColor: active ? theme.modal : theme.background,
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                onSelectedChange(index);
                const now = Date.now();
                if (isDoubleClick(lastClick.current, index, now)) {
                  lastClick.current = undefined;
                  onConnect(host);
                } else {
                  lastClick.current = { index, at: now };
                }
              }}
            >
              <text selectable={false} style={{ fg: active ? theme.accent : theme.text }}>
                <span fg={statusColor}>●</span>
                {row.content}
                {row.status && <span fg={statusColor}>{row.status}</span>}
              </text>
            </box>
          );
        })}
      </scrollbox>
    </box>
  );
}
