/** Renders secondary guidance with the shared muted or accent treatment. */
import { theme } from "./theme.ts";

export type HintProps = {
  text: string;
  tone?: "muted" | "accent";
};

export function Hint({ text, tone = "muted" }: HintProps) {
  return <text style={{ fg: theme[tone] }}>{text}</text>;
}
