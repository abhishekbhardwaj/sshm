/** Renders one focus-controlled field for keyboard and mouse-driven forms. */
import { theme } from "./theme.ts";

export type FormInputProps = {
  id: string;
  title: string;
  value: string;
  placeholder: string;
  focused: boolean;
  onInput: (value: string) => void;
  onFocus: () => void;
};

export function FormInput({
  id,
  title,
  value,
  placeholder,
  focused,
  onInput,
  onFocus,
}: FormInputProps) {
  return (
    <box
      id={id}
      title={title}
      style={{ height: 3, border: true, borderColor: focused ? theme.accent : theme.border }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onFocus();
      }}
    >
      <input value={value} placeholder={placeholder} focused={focused} onInput={onInput} />
    </box>
  );
}
