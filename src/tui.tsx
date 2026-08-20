/** Owns renderer lifetime and hands the selected host back to system OpenSSH. */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadHostState, recordConnection, type Host } from "./hosts.ts";
import { connect } from "./openssh.ts";
import { App } from "./tui/app.tsx";
import { performSelfUpdate } from "./update.ts";

/** Runs one TUI session and returns the eventual SSH or update process exit code. */
export async function runTui(configPath: string, currentVersion: string): Promise<number> {
  const initialState = await loadHostState(configPath);
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const root = createRoot(renderer);
  let result: Host | "update" | null;
  try {
    result = await new Promise<Host | "update" | null>((resolve) => {
      // Renderer destruction and a user action may happen in the same tick;
      // settling once keeps shutdown deterministic.
      let finished = false;
      const finish = (result: Host | "update" | null) => {
        if (finished) return;
        finished = true;
        resolve(result);
      };
      renderer.once("destroy", () => finish(null));
      root.render(
        <App
          configPath={configPath}
          currentVersion={currentVersion}
          initialState={initialState}
          finish={finish}
        />,
      );
    });
  } finally {
    try {
      root.unmount();
    } finally {
      if (!renderer.isDestroyed) renderer.destroy();
    }
  }
  if (!result) return 0;
  if (result === "update") {
    await performSelfUpdate();
    return 0;
  }

  await recordConnection(result);
  return connect(result.alias, result.rootConfigPath);
}
