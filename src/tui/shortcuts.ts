/**
 * Owns every TUI keyboard chord and its user-facing spelling.
 * Handlers, action labels, modal hints, and help rows all derive from this
 * registry so changing a shortcut cannot leave stale instructions behind.
 */
import type { KeyEvent } from "@opentui/core";

type ShortcutBinding = {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  option?: boolean;
  super?: boolean;
};

type ShortcutDefinition = {
  bindings: readonly ShortcutBinding[];
  key: string;
  compactKey?: string;
};

const enterShortcut = {
  bindings: [{ name: "return" }],
  key: "Enter",
  compactKey: "↵",
} as const satisfies ShortcutDefinition;
const escapeShortcut = {
  bindings: [{ name: "escape" }],
  key: "Esc",
} as const satisfies ShortcutDefinition;
const confirmationShortcut = {
  bindings: [{ name: "return" }, { name: "y" }],
  key: "Enter / y",
  compactKey: "↵/y",
} as const satisfies ShortcutDefinition;
const cancellationShortcut = {
  bindings: [{ name: "q" }, { name: "escape" }, { name: "n" }],
  key: "q / Esc / n",
  compactKey: "q/Esc/n",
} as const satisfies ShortcutDefinition;

const shortcuts = {
  move: {
    bindings: [{ name: "j" }, { name: "k" }, { name: "up" }, { name: "down" }],
    key: "j/k",
  },
  page: {
    bindings: [{ name: "pageup" }, { name: "pagedown" }],
    key: "PgUp/PgDn",
    compactKey: "Pg",
  },
  halfPage: {
    bindings: [
      { name: "u", ctrl: true },
      { name: "d", ctrl: true },
    ],
    key: "Ctrl-U/D",
  },
  ends: {
    bindings: [{ name: "home" }, { name: "end" }, { name: "g" }, { name: "g", shift: true }],
    key: "g/G",
  },
  connect: enterShortcut,
  inspect: { bindings: [{ name: "i" }], key: "i" },
  pingSelected: { bindings: [{ name: "p", shift: false }], key: "p" },
  pingAll: { bindings: [{ name: "p", shift: true }], key: "P" },
  search: { bindings: [{ name: "/" }], key: "/" },
  sortNext: { bindings: [{ name: "s", shift: false }], key: "s" },
  add: { bindings: [{ name: "n" }], key: "n" },
  edit: { bindings: [{ name: "e" }], key: "e" },
  metadata: { bindings: [{ name: "o" }], key: "o" },
  delete: { bindings: [{ name: "d" }], key: "d" },
  help: { bindings: [{ name: "h" }], key: "h" },
  quit: { bindings: [{ name: "q" }, { name: "escape" }], key: "q" },
  escape: escapeShortcut,
  formCancel: escapeShortcut,
  formSwitchTab: {
    bindings: [
      { name: "left", ctrl: true },
      { name: "right", ctrl: true },
    ],
    key: "Ctrl-←/→",
  },
  formSwitchField: {
    bindings: [{ name: "tab" }, { name: "tab", shift: true }],
    key: "Tab/Shift-Tab",
  },
  formReview: enterShortcut,
  reviewApply: confirmationShortcut,
  reviewBack: cancellationShortcut,
  deleteConfirm: confirmationShortcut,
  deleteCancel: cancellationShortcut,
  inspectClose: {
    bindings: [{ name: "q" }, { name: "escape" }, { name: "i" }],
    key: "q / i / Esc",
    compactKey: "q/i/Esc",
  },
  helpClose: {
    bindings: [{ name: "q" }, { name: "escape" }, { name: "h" }, { name: "return" }],
    key: "q / h / Enter / Esc",
    compactKey: "q/h/↵/Esc",
  },
  errorClose: {
    bindings: [{ name: "q" }, { name: "escape" }, { name: "return" }],
    key: "q / Enter / Esc",
    compactKey: "q/↵/Esc",
  },
  searchDone: enterShortcut,
  searchCancel: escapeShortcut,
  mouseConnect: { bindings: [], key: "mouse", compactKey: "2×" },
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof shortcuts;
export type ShortcutEvent = Pick<KeyEvent, "name" | "ctrl" | "shift" | "meta" | "option" | "super">;
export type ShortcutGroup = ShortcutId | readonly ShortcutId[];

export const browseShortcutIds = [
  "connect",
  "inspect",
  "pingAll",
  "pingSelected",
  "search",
  "sortNext",
  "add",
  "edit",
  "metadata",
  "delete",
  "help",
  "quit",
] as const satisfies readonly ShortcutId[];

export type BrowseShortcutId = (typeof browseShortcutIds)[number];

export const navigationShortcutGroups = [
  "move",
  "page",
  "halfPage",
  "ends",
] as const satisfies readonly ShortcutGroup[];

export const shortcutHelpSections = [
  {
    title: "Navigation",
    compactTitle: "Navigate",
    rows: [
      { shortcuts: ["move"], description: "move" },
      { shortcuts: ["page"], description: "page" },
      { shortcuts: ["ends"], description: "first/last", compactDescription: "ends" },
      { shortcuts: ["connect"], description: "connect" },
    ],
  },
  {
    title: "Tools",
    rows: [
      { shortcuts: ["inspect"], description: "inspect" },
      {
        shortcuts: ["pingSelected", "pingAll"],
        description: "ping one/all",
        compactDescription: "ping",
      },
      { shortcuts: ["search"], description: "search" },
      { shortcuts: ["sortNext"], description: "change sort" },
    ],
  },
  {
    title: "Host management",
    compactTitle: "Hosts",
    rows: [
      { shortcuts: ["add", "edit"], description: "add/edit" },
      { shortcuts: ["metadata"], description: "metadata tab", compactDescription: "metadata" },
      { shortcuts: ["delete"], description: "delete" },
    ],
  },
  {
    title: "System & mouse",
    compactTitle: "System",
    rows: [
      { shortcuts: ["help"], description: "help" },
      { shortcuts: ["quit"], description: "close/quit", compactDescription: "close" },
      { shortcuts: ["escape"], description: "back" },
      {
        shortcuts: ["mouseConnect"],
        description: "select / 2× connect",
        compactDescription: "connect",
      },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  compactTitle?: string;
  rows: ReadonlyArray<{
    shortcuts: readonly ShortcutId[];
    description: string;
    compactDescription?: string;
  }>;
}>;

function matchesBinding(event: ShortcutEvent, binding: ShortcutBinding): boolean {
  return (
    event.name === binding.name &&
    event.ctrl === Boolean(binding.ctrl) &&
    // Mnemonic letters remain case-insensitive unless Shift defines a
    // separate command, such as p/P.
    (binding.shift === undefined || event.shift === binding.shift) &&
    event.meta === Boolean(binding.meta) &&
    event.option === Boolean(binding.option) &&
    Boolean(event.super) === Boolean(binding.super)
  );
}

/** Returns whether a key event activates a registered shortcut. */
export function matchesShortcut(event: ShortcutEvent, id: ShortcutId): boolean {
  return shortcuts[id].bindings.some((binding) => matchesBinding(event, binding));
}

/** Finds the first active shortcut in an intentionally ordered context. */
export function matchingShortcut<Id extends ShortcutId>(
  event: ShortcutEvent,
  ids: readonly Id[],
): Id | undefined {
  return ids.find((id) => matchesShortcut(event, id));
}

/** Formats a registered chord for the current terminal density. */
export function shortcutKey(id: ShortcutId, compact = false): string {
  const shortcut: ShortcutDefinition = shortcuts[id];
  return compact ? (shortcut.compactKey ?? shortcut.key) : shortcut.key;
}

/** Builds a clickable action label without duplicating the chord text. */
export function shortcutActionLabel(id: ShortcutId, action: string, compact = false): string {
  return `${shortcutKey(id, compact)} ${action}`;
}

/** Formats related chords with slashes and separate behaviors with dots. */
export function shortcutHint(groups: readonly ShortcutGroup[], compact = false): string {
  return groups
    .map((group) =>
      typeof group === "string"
        ? shortcutKey(group, compact)
        : group.map((id) => shortcutKey(id, compact)).join("/"),
    )
    .join(" · ");
}
