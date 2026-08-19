/** Owns concurrent ping state and ignores results from superseded runs. */
import { useCallback, useRef, useState } from "react";
import { pingHosts, type PingState } from "../connectivity.ts";
import type { Host } from "../hosts.ts";

/** Returns ping commands plus state scoped to the currently discovered hosts. */
export function usePings() {
  const [pings, setPings] = useState<Record<string, PingState>>({});
  const runs = useRef<Record<string, number>>({});

  const ping = useCallback((targets: Host[]) => {
    // A per-host generation prevents a slower old request from replacing a
    // newer manual refresh when both complete out of order.
    const currentRuns = Object.fromEntries(
      targets.map((host) => {
        const run = (runs.current[host.id] ?? 0) + 1;
        runs.current[host.id] = run;
        return [host.id, run];
      }),
    );
    setPings((current) => ({
      ...current,
      ...Object.fromEntries(targets.map((host) => [host.id, { status: "checking" }])),
    }));
    void pingHosts(targets, (host, result) => {
      if (runs.current[host.id] !== currentRuns[host.id]) return;
      setPings((current) => ({ ...current, [host.id]: result }));
    });
  }, []);

  const retain = useCallback((hosts: Host[]) => {
    const ids = new Set(hosts.map(({ id }) => id));
    setPings((current) =>
      Object.fromEntries(Object.entries(current).filter(([hostId]) => ids.has(hostId))),
    );
    runs.current = Object.fromEntries(
      Object.entries(runs.current).filter(([hostId]) => ids.has(hostId)),
    );
  }, []);

  return { pings, ping, retain };
}
