/** Provides the shared responsive overlay frame for transient TUI modes. */
import { useTerminalDimensions } from "@opentui/react";
import type { ReactNode } from "react";
import { below, shortTerminalRows } from "./responsive.ts";
import { theme } from "./theme.ts";

export type ModalProps = {
  title: string;
  children: ReactNode;
  danger?: boolean;
  scrollable?: boolean;
};

export function Modal({ title, children, danger = false, scrollable = false }: ModalProps) {
  const { width, height } = useTerminalDimensions();
  const compact = below(width, "md");
  const short = height < shortTerminalRows;
  return (
    <box
      style={{
        position: "absolute",
        left: compact ? "5%" : "10%",
        top: short ? "5%" : "15%",
        width: compact ? "90%" : "80%",
        height: scrollable ? (short ? "85%" : "70%") : "auto",
        zIndex: 100,
        border: true,
        borderColor: danger ? theme.danger : theme.accent,
        backgroundColor: theme.modal,
        padding: 1,
        flexDirection: "column",
        gap: 1,
      }}
    >
      <text style={{ fg: danger ? theme.danger : theme.accent }}>{title}</text>
      {children}
    </box>
  );
}
