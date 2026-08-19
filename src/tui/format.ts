/** Builds width-aware display models without coupling formatting to renderables. */
import type { PingState } from "../connectivity.ts";
import type { Host } from "../hosts.ts";
import type { ConfigPreview } from "../ssh-config.ts";
import { atLeast, below } from "../ui/responsive.ts";
import type { PendingChange } from "./types.ts";

export type HostClick = { index: number; at: number };

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Accepts only two clicks on the same row within the terminal's double-click window. */
export function isDoubleClick(
  previous: HostClick | undefined,
  index: number,
  now: number,
): boolean {
  return previous?.index === index && now - previous.at >= 0 && now - previous.at <= 400;
}

/** Pads or truncates a cell by terminal columns without splitting a grapheme. */
export function formatTableCell(value: string, width: number): string {
  if (width <= 0) return "";
  const valueWidth = Bun.stringWidth(value);
  if (valueWidth <= width) return value + " ".repeat(width - valueWidth);

  // JavaScript string length cannot represent terminal width: emoji may span
  // code points and cells, so segment first and measure each visible grapheme.
  const contentWidth = width - 1;
  let truncated = "";
  let truncatedWidth = 0;
  for (const { segment } of graphemes.segment(value)) {
    const segmentWidth = Bun.stringWidth(segment);
    if (truncatedWidth + segmentWidth > contentWidth) break;
    truncated += segment;
    truncatedWidth += segmentWidth;
  }

  return `${truncated}…${" ".repeat(contentWidth - truncatedWidth)}`;
}

function lastLogin(timestamp?: number, now = Date.now()): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

export type PingTone = "muted" | "success" | "warning" | "danger";

/**
 * Maps transport state to a label and semantic color. Online latency is fast
 * through 150ms, degraded through 500ms, and poor above that threshold.
 */
export function pingPresentation(state?: PingState): { label: string; tone: PingTone } {
  if (!state) return { label: "", tone: "muted" };
  if (state.status === "checking") return { label: "checking", tone: "warning" };
  if (state.status === "offline") return { label: "offline", tone: "danger" };
  if (state.latency <= 150) return { label: `${state.latency}ms`, tone: "success" };
  if (state.latency <= 500) return { label: `${state.latency}ms`, tone: "warning" };
  return { label: `${state.latency}ms`, tone: "danger" };
}

export type HostTableRow = {
  content: string;
  status: string;
  tone: PingTone;
};

/** Projects hosts into either fixed columns or a compact rich-text summary. */
export function hostTableModel(hosts: Host[], pings: Record<string, PingState>, width: number) {
  const wide = atLeast(width, "2xl");
  const nameWidth = 17;
  const hostnameWidth = 20;
  const tagsWidth = 14;
  const lastLoginWidth = 9;
  const noteWidth = Math.max(12, width - 79);
  const rows: HostTableRow[] = hosts.map((host) => {
    const ping = pings[host.id];
    const presentation = pingPresentation(ping);
    const name = `${host.metadata.favourite ? "★ " : ""}${host.alias}`;
    const hostname =
      (ping?.status === "online" || ping?.status === "offline" ? ping.hostname : undefined) ??
      host.hostname ??
      host.alias;
    const tags = host.metadata.tags.map((tag) => `#${tag}`).join(" ");
    const recent = lastLogin(host.metadata.recent);
    if (wide) {
      return {
        content: ` ${formatTableCell(name, nameWidth - 2)} ${formatTableCell(hostname, hostnameWidth)} ${formatTableCell(tags || "—", tagsWidth)} ${formatTableCell(recent, lastLoginWidth)} ${formatTableCell(host.metadata.note || "—", noteWidth)} `,
        status: presentation.label || "—",
        tone: presentation.tone,
      };
    }

    const port =
      (ping?.status === "online" || ping?.status === "offline"
        ? ping.port?.toString()
        : undefined) ?? host.port;
    const endpoint =
      hostname === host.alias && (!port || port === "22")
        ? ""
        : `${hostname}${port && port !== "22" ? `:${port}` : ""}`;
    const summary = [name, recent, endpoint, tags, host.metadata.note].filter(Boolean).join(" · ");
    // Reserve columns for the marker and status before truncating the summary;
    // otherwise one long alias can push latency off-screen or wrap the row.
    const rowWidth = Math.max(8, width - (below(width, "sm") ? 4 : 6));
    const separator = presentation.label ? " · " : "";
    const summaryWidth = Math.max(
      1,
      rowWidth - 2 - Bun.stringWidth(separator) - Bun.stringWidth(presentation.label),
    );
    return {
      content: ` ${formatTableCell(summary, summaryWidth)}${separator}`,
      status: presentation.label,
      tone: presentation.tone,
    };
  });
  const header = `${formatTableCell("Name", nameWidth)} ${formatTableCell("Hostname", hostnameWidth)} ${formatTableCell("Tags", tagsWidth)} ${formatTableCell("Last", lastLoginWidth)} ${formatTableCell("Note", noteWidth)} Status`;
  return { rows, header, wide };
}

/** Combines file and manager-metadata changes into one reviewable artifact. */
export function reviewText(change: PendingChange, preview: ConfigPreview): string {
  const before = change.kind === "edit" ? change.host.metadata : { tags: [], note: "" };
  const metadata = [
    "Manager metadata",
    `- Tags: ${before.tags.join(", ") || "—"}`,
    `+ Tags: ${change.metadata.tags.join(", ") || "—"}`,
    `- Note: ${before.note || "—"}`,
    `+ Note: ${change.metadata.note || "—"}`,
  ].join("\n");
  const config =
    preview.original === preview.updated ? "SSH config\n  unchanged" : preview.patch.trimEnd();
  return `${config}\n\n${metadata}`;
}
