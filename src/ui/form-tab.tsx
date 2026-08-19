/** Renders a selectable form tab using the shared active-state treatment. */
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
        height: 3,
        flexGrow: 1,
        border: true,
        borderColor: active ? theme.accent : theme.border,
        backgroundColor: active ? theme.accent : theme.modal,
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
