/** Presents a normalized sshm failure and the registered close shortcut. */
import type { SshmError } from "../errors.ts";
import { Modal } from "../ui/modal.tsx";
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";

export type ErrorModalProps = {
  error: SshmError;
  onClose: () => void;
};

export function ErrorModal({ error, onClose }: ErrorModalProps) {
  return (
    <Modal title="Could not complete the operation" danger>
      <text style={{ fg: theme.text }}>{error.message}</text>
      <ShortcutAction shortcut="errorClose" title="Close" onPress={onClose} />
    </Modal>
  );
}
