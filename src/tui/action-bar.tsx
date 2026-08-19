/** Lays out browse-mode actions and derives every key label from the shortcut registry. */
import { atLeast } from "../ui/responsive.ts";
import { ShortcutAction, type ShortcutActionProps } from "./shortcut-action.tsx";

export type ActionBarItem = ShortcutActionProps;

export type ActionBarProps = {
  actions: ActionBarItem[];
  width: number;
};

export function ActionBar({ actions, width }: ActionBarProps) {
  const perRow = atLeast(width, "xl") ? 6 : atLeast(width, "md") ? 4 : 3;
  const rows = Array.from({ length: Math.ceil(actions.length / perRow) }, (_, index) =>
    actions.slice(index * perRow, (index + 1) * perRow),
  );
  return (
    <box style={{ height: rows.length, flexDirection: "column" }}>
      {rows.map((row, rowIndex) => (
        <box key={rowIndex} style={{ height: 1, flexDirection: "row", gap: 2 }}>
          {row.map((action) => (
            <ShortcutAction key={action.shortcut} {...action} />
          ))}
        </box>
      ))}
    </box>
  );
}
