/**
 * Routes registered shortcuts according to the active UI mode.
 * This component owns keyboard policy only; application commands remain in
 * `App`, while chord definitions and labels live in `shortcuts.ts`.
 */
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { fields, formTabs } from "./form.ts";
import {
  browseShortcutIds,
  matchesShortcut,
  matchingShortcut,
  type BrowseShortcutId,
} from "./shortcuts.ts";
import type { Mode } from "./types.ts";

export type KeyboardCommands = Record<BrowseShortcutId, () => void> & {
  cancelSearch: () => void;
  saveForm: () => void;
  confirmReview: () => void;
  confirmDelete: () => void;
};

export type KeyboardControllerProps = {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  selected: number;
  setSelected: (index: number) => void;
  visibleHostCount: number;
  hostListRef: RefObject<ScrollBoxRenderable | null>;
  scrollerRef: RefObject<ScrollBoxRenderable | null>;
  commands: KeyboardCommands;
};

export function KeyboardController({
  mode,
  setMode,
  selected,
  setSelected,
  visibleHostCount,
  hostListRef,
  scrollerRef,
  commands,
}: KeyboardControllerProps) {
  const scrollModal = (key: KeyEvent) => {
    const scroller = scrollerRef.current;
    if (!scroller) return false;
    // ScrollBox handles line and page movement itself. Accelerated movement and
    // absolute jumps are handled here because they depend on viewport units.
    if (matchesShortcut(key, "halfPage")) {
      scroller.scrollBy(key.name === "d" ? 0.5 : -0.5, "viewport");
      return true;
    }
    if (matchesShortcut(key, "ends")) {
      const toEnd = key.name === "end" || key.shift;
      scroller.scrollTo(toEnd ? scroller.scrollHeight : 0);
      return true;
    }
    return false;
  };

  const navigateHostList = (key: KeyEvent) => {
    // Distances use the rendered height so page movement stays consistent
    // when the terminal is resized.
    const pageSize = Math.max(1, Math.floor(hostListRef.current?.height ?? 10));
    let next: number | undefined;
    if (matchesShortcut(key, "move")) {
      next = selected + (key.name === "j" || key.name === "down" ? 1 : -1);
    } else if (matchesShortcut(key, "halfPage")) {
      const distance = Math.max(1, Math.floor(pageSize / 2));
      next = selected + (key.name === "d" ? distance : -distance);
    } else if (matchesShortcut(key, "page")) {
      next = selected + (key.name === "pagedown" ? pageSize : -pageSize);
    } else if (matchesShortcut(key, "ends")) {
      next = key.name === "end" || key.shift ? visibleHostCount - 1 : 0;
    }
    if (next === undefined) return false;
    setSelected(Math.max(0, Math.min(visibleHostCount - 1, next)));
    return true;
  };

  useKeyboard((key) => {
    if (mode.kind === "add" || mode.kind === "edit") {
      if (matchesShortcut(key, "formCancel")) setMode({ kind: "browse" });
      else if (matchesShortcut(key, "formSwitchTab")) {
        key.preventDefault();
        const currentTab = formTabs.findIndex(({ fields }) =>
          fields.some((field) => field === mode.field),
        );
        const direction = key.name === "right" ? 1 : -1;
        const nextTab = (currentTab + direction + formTabs.length) % formTabs.length;
        setMode({ ...mode, field: formTabs[nextTab]!.fields[0] });
      } else if (matchesShortcut(key, "formSwitchField")) {
        key.preventDefault();
        const index = fields.indexOf(mode.field);
        const direction = key.shift ? -1 : 1;
        setMode({ ...mode, field: fields[(index + direction + fields.length) % fields.length]! });
      } else if (matchesShortcut(key, "formReview")) {
        key.preventDefault();
        commands.saveForm();
      }
      return;
    }

    if (mode.kind === "review") {
      if (matchesShortcut(key, "reviewBack")) {
        key.preventDefault();
        setMode(mode.back);
      } else if (matchesShortcut(key, "reviewApply")) {
        key.preventDefault();
        commands.confirmReview();
      } else if (scrollModal(key)) key.preventDefault();
      return;
    }

    if (mode.kind === "delete") {
      if (matchesShortcut(key, "deleteCancel")) {
        key.preventDefault();
        setMode({ kind: "browse" });
      } else if (matchesShortcut(key, "deleteConfirm")) {
        key.preventDefault();
        commands.confirmDelete();
      } else if (scrollModal(key)) key.preventDefault();
      return;
    }

    if (mode.kind === "preview") {
      if (matchesShortcut(key, "inspectClose")) {
        key.preventDefault();
        setMode({ kind: "browse" });
      } else if (scrollModal(key)) key.preventDefault();
      return;
    }

    if (mode.kind === "help") {
      if (matchesShortcut(key, "helpClose")) {
        key.preventDefault();
        setMode({ kind: "browse" });
      }
      return;
    }

    if (mode.kind === "error") {
      if (matchesShortcut(key, "errorClose")) {
        key.preventDefault();
        setMode({ kind: "browse" });
      }
      return;
    }

    if (mode.kind === "search") {
      if (matchesShortcut(key, "searchCancel")) commands.cancelSearch();
      else if (matchesShortcut(key, "searchDone")) setMode({ kind: "browse" });
      return;
    }

    if (navigateHostList(key)) {
      key.preventDefault();
      return;
    }

    const shortcut = matchingShortcut(key, browseShortcutIds);
    if (!shortcut) return;
    key.preventDefault();
    commands[shortcut]();
  });

  return null;
}
