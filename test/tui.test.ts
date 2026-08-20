import { expect, test } from "bun:test";
import type { Host } from "../src/hosts.ts";
import { atLeast, below, breakpoints } from "../src/ui/responsive.ts";
import {
  formatTableCell,
  hostTableModel,
  isDoubleClick,
  pingPresentation,
} from "../src/tui/format.ts";
import {
  browseShortcutIds,
  matchingShortcut,
  matchesShortcut,
  navigationShortcutGroups,
  shortcutActionLabel,
  shortcutHint,
  type ShortcutEvent,
} from "../src/tui/shortcuts.ts";

function key(name: string, overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    name,
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    super: false,
    ...overrides,
  };
}

test("uses Tailwind's mobile-first breakpoint scale for terminal columns", () => {
  // Given
  const sm = breakpoints.sm;

  // When
  const belowSm = below(sm - 1, "sm");
  const atSm = atLeast(sm, "sm");

  // Then
  expect(breakpoints).toEqual({ sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 });
  expect(belowSm).toBe(true);
  expect(atSm).toBe(true);
});

test("resolves contextual commands from the canonical shortcut registry", () => {
  // Given
  const selectedPing = key("p");
  const allPings = key("p", { shift: true });
  const update = key("u");

  // When
  const selectedCommand = matchingShortcut(selectedPing, browseShortcutIds);
  const allCommand = matchingShortcut(allPings, browseShortcutIds);
  const updateCommand = matchingShortcut(update, browseShortcutIds);

  // Then
  expect(selectedCommand).toBe("pingSelected");
  expect(allCommand).toBe("pingAll");
  expect(updateCommand).toBe("update");
  expect(matchesShortcut(key("u", { ctrl: true }), "halfPage")).toBe(true);
  expect(matchesShortcut(key("q", { shift: true }), "quit")).toBe(true);
  expect(matchesShortcut(key("s"), "sortNext")).toBe(true);
  expect(matchesShortcut(key("y"), "reviewApply")).toBe(true);
});

test("formats action and navigation labels from the shortcut registry", () => {
  // Given
  const groups = navigationShortcutGroups;

  // When
  const action = shortcutActionLabel("pingAll", "Ping all");
  const compactHint = shortcutHint(groups, true);

  // Then
  expect(action).toBe("P Ping all");
  expect(compactHint).toBe("j/k · Pg · Ctrl-U/D · g/G");
});

test("colors ping status by result and latency", () => {
  // Given
  const states = [
    { status: "checking" } as const,
    { status: "online", latency: 150 } as const,
    { status: "online", latency: 151 } as const,
    { status: "online", latency: 501 } as const,
    { status: "offline", latency: 10 } as const,
  ];

  // When
  const presentations = states.map(pingPresentation);

  // Then
  expect(presentations).toEqual([
    { label: "checking", tone: "warning" },
    { label: "150ms", tone: "success" },
    { label: "151ms", tone: "warning" },
    { label: "501ms", tone: "danger" },
    { label: "offline", tone: "danger" },
  ]);
});

test("keeps compact host rows within their terminal width budget", () => {
  // Given
  const host: Host = {
    id: "demo",
    alias: "source.accessiblehawk.com",
    rootConfigPath: "/tmp/config",
    sources: [{ configPath: "/tmp/config", blockIndex: 0, aliases: ["source.accessiblehawk.com"] }],
    metadata: { tags: [], note: "", favourite: false },
  };

  // When
  const row = hostTableModel(
    [host],
    { demo: { status: "online", latency: 96, hostname: host.alias, port: 22 } },
    40,
  ).rows[0]!;
  const rendered = `●${row.content}${row.status}`;

  // Then
  expect(Bun.stringWidth(rendered)).toBe(34);
  expect(rendered).toContain("…");
  expect(rendered).toEndWith("96ms");
});

test("keeps table columns aligned when a cell contains a wide status symbol", () => {
  // Given
  const header = `${formatTableCell("Name", 18)} ${formatTableCell("Hostname", 24)}`;
  const row = `${formatTableCell("⚪ hawk", 18)} ${formatTableCell("hawk.example", 24)}`;

  // When
  const headerColumn = Bun.stringWidth(header.slice(0, header.indexOf("Hostname")));
  const rowColumn = Bun.stringWidth(row.slice(0, row.indexOf("hawk.example")));

  // Then
  expect(rowColumn).toBe(headerColumn);
  expect(Bun.stringWidth(formatTableCell("⚪ very-long-hostname", 12))).toBe(12);
  expect(formatTableCell("⚪ very-long-hostname", 12)).toEndWith("…");
});

test("treats a quick second click on the same host as a double click", () => {
  // Given
  const firstClick = { index: 2, at: 1_000 };

  // When
  const result = isDoubleClick(firstClick, 2, 1_400);

  // Then
  expect(result).toBe(true);
});

test("does not combine clicks on different hosts", () => {
  // Given
  const firstClick = { index: 2, at: 1_000 };

  // When
  const result = isDoubleClick(firstClick, 1, 1_200);

  // Then
  expect(result).toBe(false);
});

test("does not combine clicks outside the double-click interval", () => {
  // Given
  const firstClick = { index: 2, at: 1_000 };

  // When
  const result = isDoubleClick(firstClick, 2, 1_401);

  // Then
  expect(result).toBe(false);
});
