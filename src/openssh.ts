/** Keeps OpenSSH authoritative for effective configuration and connections. */
import { SshmError } from "./errors.ts";

/** Builds an argv array with `--` separating options from the host alias. */
export function sshArguments(alias: string, configPath?: string): string[] {
  return ["ssh", ...(configPath ? ["-F", configPath] : []), "--", alias];
}

export type ResolvedConfig = {
  entries: Array<[key: string, value: string]>;
  values: Record<string, string>;
};

/** Resolves the same effective values the system SSH client will use. */
export async function resolveHost(alias: string, configPath?: string): Promise<ResolvedConfig> {
  const process = Bun.spawn(["ssh", "-G", ...(configPath ? ["-F", configPath] : []), "--", alias], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  await process.exited;

  if (process.exitCode !== 0) {
    throw new SshmError(error.trim() || `OpenSSH could not resolve ${alias}.`);
  }

  const entries: Array<[string, string]> = output.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(" ");
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
  });
  return { entries, values: Object.fromEntries(entries) };
}

export async function connect(alias: string, configPath?: string): Promise<number> {
  const process = Bun.spawn(sshArguments(alias, configPath), {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await process.exited;
  return process.exitCode ?? 1;
}
