/** Displays the effective OpenSSH settings resolved from the root config. */
import type { ScrollBoxRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { Modal } from "../ui/modal.tsx";
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";
import { ShortcutHint } from "./shortcut-hint.tsx";
import { navigationShortcutGroups } from "./shortcuts.ts";

export type InspectModalProps = {
  alias: string;
  configPath: string;
  settings: string;
  scrollerRef: RefObject<ScrollBoxRenderable | null>;
  onClose: () => void;
};

export function InspectModal({
  alias,
  configPath,
  settings,
  scrollerRef,
  onClose,
}: InspectModalProps) {
  return (
    <Modal title={`OpenSSH inspector · ${alias}`} scrollable>
      <text style={{ fg: theme.muted }}>Resolved by ssh -G using {configPath}</text>
      <scrollbox ref={scrollerRef} style={{ flexGrow: 1 }} focused>
        <text style={{ fg: theme.text }}>{settings || "Resolving…"}</text>
      </scrollbox>
      <ShortcutHint groups={navigationShortcutGroups} />
      <ShortcutAction shortcut="inspectClose" title="Close" onPress={onClose} />
    </Modal>
  );
}
