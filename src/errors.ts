/**
 * Defines failures that are safe to present at the CLI and TUI boundaries.
 * External libraries may throw their own error types; `SshmError.from` wraps
 * those once without discarding the original cause.
 */
export class SshmError extends Error {
  override readonly name = "SshmError";

  /** Converts an unknown thrown value into sshm's display-safe error type. */
  static from(cause: unknown): SshmError {
    if (cause instanceof SshmError) return cause;
    if (cause instanceof Error) return new SshmError(cause.message, { cause });
    if (typeof cause === "string") return new SshmError(cause, { cause });
    return new SshmError("An unexpected error occurred.", { cause });
  }
}
