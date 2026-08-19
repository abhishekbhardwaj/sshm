/** Aligns shortcut and action pairs within one help section. */
import { theme } from "./theme.ts";

export type HelpBlockProps = {
  title: string;
  rows: Array<[key: string, action: string]>;
  compact: boolean;
};

export function HelpBlock({ title, rows, compact }: HelpBlockProps) {
  const keyWidth = compact ? 4 : 12;
  return (
    <box style={{ flexGrow: 1, flexDirection: "column" }}>
      <text style={{ fg: theme.accent }}>{title}</text>
      <text style={{ fg: theme.muted }}>
        {rows.map(([key, action]) => `${key.padEnd(keyWidth)} ${action}`).join("\n")}
      </text>
    </box>
  );
}
