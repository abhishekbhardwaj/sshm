/** Shows the exact deletion patch before applying the destructive change. */
import type { ScrollBoxRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { Modal } from "../ui/modal.tsx";
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";
import { ShortcutHint } from "./shortcut-hint.tsx";
import { navigationShortcutGroups } from "./shortcuts.ts";

export type DeleteModalProps = {
  alias: string;
  patch?: string;
  deleting: boolean;
  scrollerRef: RefObject<ScrollBoxRenderable | null>;
  onDelete: () => void;
  onCancel: () => void;
};

export function DeleteModal({
  alias,
  patch,
  deleting,
  scrollerRef,
  onDelete,
  onCancel,
}: DeleteModalProps) {
  return (
    <Modal title={`Delete ${alias}?`} danger scrollable>
      <text style={{ fg: theme.muted }}>A timestamped backup is created first.</text>
      <scrollbox ref={scrollerRef} style={{ flexGrow: 1 }} focused>
        <text style={{ fg: theme.text }}>{patch ?? "Preparing diff…"}</text>
      </scrollbox>
      <ShortcutHint groups={navigationShortcutGroups} />
      <box style={{ height: 1, flexDirection: "row", gap: 2 }}>
        <ShortcutAction
          shortcut="deleteConfirm"
          title="Delete"
          statusLabel={deleting ? "Deleting…" : undefined}
          onPress={onDelete}
          danger
          disabled={deleting || patch === undefined}
        />
        <ShortcutAction shortcut="deleteCancel" title="Cancel" onPress={onCancel} />
      </box>
    </Modal>
  );
}
