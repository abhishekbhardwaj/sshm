/** Renders a mouse-aware terminal action with shared disabled and danger states. */
import { theme } from "./theme.ts";

export type ActionProps = {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function Action({ label, onPress, danger = false, disabled = false }: ActionProps) {
  return (
    <text
      selectable={false}
      style={{ fg: disabled ? theme.border : danger ? theme.danger : theme.accent }}
      onMouseDown={(event) => {
        if (event.button !== 0 || disabled) return;
        event.preventDefault();
        onPress();
      }}
    >
      [{label}]
    </text>
  );
}
