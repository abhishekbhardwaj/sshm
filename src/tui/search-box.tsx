/** Renders the focused host search input and its keyboard-derived completion action. */
import { theme } from "../ui/theme.ts";
import { ShortcutAction } from "./shortcut-action.tsx";

export type SearchBoxProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onDone: () => void;
};

export function SearchBox({ query, onQueryChange, onDone }: SearchBoxProps) {
  return (
    <>
      <box title="Search" style={{ height: 3, border: true, borderColor: theme.accent }}>
        <input
          value={query}
          placeholder="Name, hostname, tag, or note"
          focused
          onInput={onQueryChange}
        />
      </box>
      <box style={{ height: 1 }}>
        <ShortcutAction shortcut="searchDone" title="Done" onPress={onDone} />
      </box>
    </>
  );
}
