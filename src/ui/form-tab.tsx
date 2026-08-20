/**
 * Renders the form's labeled tab presentation.
 * Selected-state treatment follows the MIT Tuiparts Tabs recipe:
 * https://github.com/tuiparts/tuiparts/blob/main/registry/tabs/react.tsx
 */
import { theme } from "./theme.ts";

export type FormTabProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function FormTab({ label, active, onPress }: FormTabProps) {
  return (
    <box
      style={{
        height: 1,
        flexGrow: 1,
        backgroundColor: active ? theme.accent : theme.background,
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onPress();
      }}
    >
      <text selectable={false} style={{ fg: active ? theme.background : theme.muted }}>
        {label}
      </text>
    </box>
  );
}
