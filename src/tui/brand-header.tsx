/** Renders sshm's compact wordmark, purpose line, and current host status. */
import { useTerminalDimensions } from "@opentui/react";
import { atLeast } from "../ui/responsive.ts";
import { theme } from "../ui/theme.ts";

export type BrandHeaderProps = {
  status: string;
  compactStatus: string;
};

export function BrandHeader({ status, compactStatus }: BrandHeaderProps) {
  const { width } = useTerminalDimensions();
  return (
    <box style={{ height: 2, flexDirection: "row", justifyContent: "space-between" }}>
      <ascii-font text="sshm" font="tiny" color={theme.accent} selectable={false} />
      {atLeast(width, "md") && (
        <box style={{ flexDirection: "column", alignItems: "flex-end" }}>
          {atLeast(width, "xl") && <text style={{ fg: theme.muted }}>OpenSSH, organized.</text>}
          <text style={{ fg: theme.muted }}>{atLeast(width, "xl") ? status : compactStatus}</text>
        </box>
      )}
    </box>
  );
}
