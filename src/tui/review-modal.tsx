/** Presents the reviewed SSH and metadata diff before a write is allowed. */
import type { ScrollBoxRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { Modal } from "../ui/modal.tsx";
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";
import { ShortcutHint } from "./shortcut-hint.tsx";
import { navigationShortcutGroups } from "./shortcuts.ts";

export type ReviewModalProps = {
  text: string;
  saving: boolean;
  scrollerRef: RefObject<ScrollBoxRenderable | null>;
  onApply: () => void;
  onBack: () => void;
};

export function ReviewModal({ text, saving, scrollerRef, onApply, onBack }: ReviewModalProps) {
  return (
    <Modal title="Review SSH config changes" scrollable>
      <scrollbox ref={scrollerRef} style={{ flexGrow: 1 }} focused>
        <text style={{ fg: theme.text }}>{text}</text>
      </scrollbox>
      <ShortcutHint groups={navigationShortcutGroups} />
      <box style={{ height: 1, flexDirection: "row", gap: 2 }}>
        <ShortcutAction
          shortcut="reviewApply"
          title="Apply"
          statusLabel={saving ? "Saving…" : undefined}
          onPress={onApply}
          disabled={saving}
        />
        <ShortcutAction shortcut="reviewBack" title="Back" onPress={onBack} danger />
      </box>
    </Modal>
  );
}
