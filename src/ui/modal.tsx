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
  maxWidth?: number;
};

export function Modal({
  title,
  children,
  danger = false,
  scrollable = false,
  maxWidth = 96,
}: ModalProps) {
  const { width, height } = useTerminalDimensions();
  const compact = below(width, "md");
  const short = height < shortTerminalRows;
  const modalWidth = compact ? Math.max(1, width - 4) : Math.min(maxWidth, Math.floor(width * 0.8));
  return (
    <box
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((width - modalWidth) / 2)),
        top: short ? "5%" : "15%",
        width: modalWidth,
        height: scrollable ? (short ? "85%" : "70%") : "auto",
        zIndex: 100,
        border: true,
        borderStyle: "rounded",
        borderColor: danger ? theme.danger : theme.accent,
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width: "100%",
          flexGrow: scrollable ? 1 : 0,
          backgroundColor: theme.modal,
          padding: 1,
          flexDirection: "column",
          gap: 1,
        }}
      >
        <text style={{ fg: danger ? theme.danger : theme.accent }}>{title}</text>
        {children}
      </box>
    </box>
  );
}
