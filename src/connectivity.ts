/** Performs bounded TCP reachability checks against OpenSSH-resolved endpoints. */
import { createConnection } from "node:net";
import { SshmError } from "./errors.ts";
import type { Host } from "./hosts.ts";
import { resolveHost } from "./openssh.ts";

export type PingResult = {
  status: "online" | "offline";
  latency: number;
  hostname?: string;
  port?: number;
  error?: string;
};

export type PingState = PingResult | { status: "checking" };

/** Checks transport reachability only; it deliberately does not authenticate. */
export async function pingHost(host: Host, timeout = 3_000): Promise<PingResult> {
  const started = performance.now();
  try {
    const resolved = await resolveHost(host.alias, host.rootConfigPath);
    const hostname = resolved.values.hostname ?? host.hostname ?? host.alias;
    const port = Number.parseInt(resolved.values.port ?? "22", 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SshmError(`Invalid resolved SSH port: ${resolved.values.port}`);
    }

    return await new Promise<PingResult>((resolve) => {
      const socket = createConnection({ host: hostname, port });
      socket.unref();
      // Timeout, error, and connect events can race during teardown. Only the
      // first result is observable and it owns socket cleanup.
      let settled = false;
      const finish = (result: PingResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeout);
      socket.once("connect", () =>
        finish({
          status: "online",
          latency: Math.round(performance.now() - started),
          hostname,
          port,
        }),
      );
      socket.once("timeout", () =>
        finish({
          status: "offline",
          latency: Math.round(performance.now() - started),
          hostname,
          port,
          error: `Timed out after ${timeout}ms`,
        }),
      );
      socket.once("error", (error) =>
        finish({
          status: "offline",
          latency: Math.round(performance.now() - started),
          hostname,
          port,
          error: error.message,
        }),
      );
    });
  } catch (error) {
    return {
      status: "offline",
      latency: Math.round(performance.now() - started),
      error: SshmError.from(error).message,
    };
  }
}

/** Runs checks through a small shared worker pool instead of opening every socket at once. */
export async function pingHosts(
  hosts: Host[],
  onResult: (host: Host, result: PingResult) => void,
  concurrency = 6,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++];
      if (!host) return;
      onResult(host, await pingHost(host));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), hosts.length) }, worker),
  );
}
