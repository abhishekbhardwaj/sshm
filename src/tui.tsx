/** Owns renderer lifetime and hands the selected host back to system OpenSSH. */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadHostState, recordConnection, type Host } from "./hosts.ts";
import { connect } from "./openssh.ts";
import { App } from "./tui/app.tsx";

/** Runs one TUI session and returns the eventual SSH process exit code. */
export async function runTui(configPath: string): Promise<number> {
  const initialState = await loadHostState(configPath);
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const root = createRoot(renderer);
  let selected: Host | null;
  try {
    selected = await new Promise<Host | null>((resolve) => {
      // Renderer destruction and a user action may happen in the same tick;
      // settling once keeps shutdown deterministic.
      let finished = false;
      const finish = (host: Host | null) => {
        if (finished) return;
        finished = true;
        resolve(host);
      };
      renderer.once("destroy", () => finish(null));
      root.render(<App configPath={configPath} initialState={initialState} finish={finish} />);
    });
  } finally {
    try {
      root.unmount();
    } finally {
      if (!renderer.isDestroyed) renderer.destroy();
    }
  }
  if (!selected) return 0;

  await recordConnection(selected);
  return connect(selected.alias, selected.rootConfigPath);
}
