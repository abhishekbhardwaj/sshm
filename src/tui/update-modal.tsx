/** Confirms an available release before leaving the TUI to run the installer. */
import type { UpdateInfo } from "../update.ts";
import { Modal } from "../ui/modal.tsx";
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";

export type UpdateModalProps = {
  update: UpdateInfo;
  onUpdate: () => void;
  onLater: () => void;
};

export function UpdateModal({ update, onUpdate, onLater }: UpdateModalProps) {
  return (
    <Modal title="Update available" maxWidth={68}>
      <text style={{ fg: theme.text }}>
        sshm {update.currentVersion} → {update.latestVersion}
      </text>
      <text style={{ fg: theme.muted }}>Run the installer after closing sshm?</text>
      <box style={{ height: 1, flexDirection: "row", gap: 2 }}>
        <ShortcutAction shortcut="updateConfirm" title="Update" onPress={onUpdate} />
        <ShortcutAction shortcut="updateCancel" title="Later" onPress={onLater} />
      </box>
    </Modal>
  );
}
