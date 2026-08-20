/** Composes a typed, tabbed form from reusable terminal UI primitives. */
import { useTerminalDimensions } from "@opentui/react";
import { SshmError } from "../errors.ts";
import { Action } from "./action.tsx";
import { FormInput } from "./form-input.tsx";
import { FormTab } from "./form-tab.tsx";
import { Hint } from "./hint.tsx";
import { Modal } from "./modal.tsx";
import { below } from "./responsive.ts";

export type FormModalProps<Field extends string> = {
  title: string;
  tabs: readonly [
    {
      label: string;
      compactLabel: string;
      fields: readonly [Field, ...Field[]];
    },
    ...Array<{
      label: string;
      compactLabel: string;
      fields: readonly [Field, ...Field[]];
    }>,
  ];
  fieldDetails: Record<Field, readonly [title: string, placeholder: string]>;
  values: Record<Field, string>;
  activeField: Field;
  saving: boolean;
  saveLabel: string;
  cancelLabel: string;
  hint: string;
  onInput: (field: Field, value: string) => void;
  onFocus: (field: Field) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function FormModal<Field extends string>({
  title,
  tabs,
  fieldDetails,
  values,
  activeField,
  saving,
  saveLabel,
  cancelLabel,
  hint,
  onInput,
  onFocus,
  onSave,
  onCancel,
}: FormModalProps<Field>) {
  const { width } = useTerminalDimensions();
  const compact = below(width, "md");
  const activeTab = tabs.find(({ fields }) => fields.includes(activeField));
  if (!activeTab) throw new SshmError(`No form tab contains ${activeField}.`);

  return (
    <Modal title={title} maxWidth={68}>
      <box style={{ height: 1, flexDirection: "row", gap: 1 }}>
        {tabs.map((tab) => (
          <FormTab
            key={tab.label}
            label={compact ? tab.compactLabel : tab.label}
            active={activeTab.label === tab.label}
            onPress={() => onFocus(tab.fields[0])}
          />
        ))}
      </box>
      {activeTab.fields.map((field) => (
        <FormInput
          key={field}
          id={`form-field-${field}`}
          title={fieldDetails[field][0]}
          value={values[field]}
          placeholder={fieldDetails[field][1]}
          focused={activeField === field}
          onInput={(value) => onInput(field, value)}
          onFocus={() => onFocus(field)}
        />
      ))}
      <box style={{ height: 1, flexDirection: "row", gap: compact ? 1 : 2 }}>
        <Action label={saveLabel} onPress={onSave} disabled={saving} />
        <Action label={cancelLabel} onPress={onCancel} danger />
        <Hint text={hint} tone="accent" />
      </box>
    </Modal>
  );
}
