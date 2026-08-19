/** Displays shortcut groups using the registry's labels and shared hint style. */
import { useTerminalDimensions } from "@opentui/react";
import { Hint, type HintProps } from "../ui/hint.tsx";
import { below } from "../ui/responsive.ts";
import { shortcutHint, type ShortcutGroup } from "./shortcuts.ts";

export type ShortcutHintProps = {
  groups: readonly ShortcutGroup[];
  compact?: boolean;
  tone?: HintProps["tone"];
};

export function ShortcutHint({ groups, compact, tone }: ShortcutHintProps) {
  const { width } = useTerminalDimensions();
  return <Hint text={shortcutHint(groups, compact ?? below(width, "lg"))} tone={tone} />;
}
