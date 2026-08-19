/**
 * Defines sshm's mobile-first terminal breakpoints.
 *
 * Tailwind's default scale is 40/48/64/80/96rem. OpenTUI measures width in
 * terminal columns rather than CSS units, so sshm preserves those canonical
 * names and numeric steps as column thresholds.
 */
export const breakpoints = {
  sm: 40,
  md: 48,
  lg: 64,
  xl: 80,
  "2xl": 96,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Returns true at a breakpoint and all larger terminal widths. */
export function atLeast(width: number, breakpoint: Breakpoint): boolean {
  return width >= breakpoints[breakpoint];
}

/** Returns true below a breakpoint, matching Tailwind's max-* ranges. */
export function below(width: number, breakpoint: Breakpoint): boolean {
  return width < breakpoints[breakpoint];
}

/** Vertical space is independent from Tailwind's width-only breakpoint scale. */
export const shortTerminalRows = 24;
