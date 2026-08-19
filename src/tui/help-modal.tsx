/** Renders the in-app shortcut reference directly from the canonical registry. */
import { HelpBlock } from "../ui/help-block.tsx";
import { Modal } from "../ui/modal.tsx";
import { below } from "../ui/responsive.ts";
import { ShortcutAction } from "./shortcut-action.tsx";
import { shortcutHelpSections, shortcutHint } from "./shortcuts.ts";

export type HelpModalProps = {
  width: number;
  onClose: () => void;
};

export function HelpModal({ width, onClose }: HelpModalProps) {
  const compact = below(width, "lg");
  const sections = shortcutHelpSections.map((section) => ({
    title: compact && "compactTitle" in section ? section.compactTitle : section.title,
    rows: section.rows.map((row): [key: string, action: string] => [
      shortcutHint([row.shortcuts], compact),
      compact && "compactDescription" in row ? row.compactDescription : row.description,
    ]),
  }));

  return (
    <Modal title="sshm · Commands">
      <box style={{ flexDirection: "column", gap: 1 }}>
        {[sections.slice(0, 2), sections.slice(2)].map((row, index) => (
          <box key={index} style={{ flexDirection: "row", gap: compact ? 1 : 4 }}>
            {row.map((section) => (
              <HelpBlock
                key={section.title}
                title={section.title}
                compact={compact}
                rows={section.rows}
              />
            ))}
          </box>
        ))}
      </box>
      <ShortcutAction shortcut="helpClose" title="Close" onPress={onClose} />
    </Modal>
  );
}
