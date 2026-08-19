/** Renders a responsive action whose chord label comes from the shortcut registry. */
import { useTerminalDimensions } from "@opentui/react";
import { Action, type ActionProps } from "../ui/action.tsx";
import { below } from "../ui/responsive.ts";
import { shortcutActionLabel, type ShortcutId } from "./shortcuts.ts";

export type ShortcutActionProps = Omit<ActionProps, "label"> & {
  shortcut: ShortcutId;
  title: string;
  statusLabel?: string;
};

export function ShortcutAction({ shortcut, title, statusLabel, ...action }: ShortcutActionProps) {
  const { width } = useTerminalDimensions();
  return (
    <Action
      label={statusLabel ?? shortcutActionLabel(shortcut, title, below(width, "md"))}
      {...action}
    />
  );
}
