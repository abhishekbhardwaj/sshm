/** Defines sshm's interactive entry point and explicit non-interactive commands. */
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };

declare const SSHM_VERSION: string;
import { SshmError } from "./errors.ts";
import {
  editableHostSource,
  findHost,
  loadHosts,
  recordConnection,
  removeHost,
  searchHosts,
} from "./hosts.ts";
import { updateHostMetadata } from "./metadata.ts";
import { connect, resolveHost } from "./openssh.ts";
import { addHost, previewAddHost, previewDeleteHost, type ConfigPreview } from "./ssh-config.ts";
import { runTui } from "./tui.tsx";
import { setupUninstallCommand } from "./uninstall.ts";
import { setupUpdateCommand } from "./update.ts";

function requireConfirmation(preview: ConfigPreview, confirmed?: boolean): void {
  console.log(preview.patch);
  if (!confirmed) {
    throw new SshmError("Review the diff, then rerun with --yes to apply it.");
  }
}

/** Builds a fresh Commander program so tests and callers do not share parser state. */
export function createProgram(): Command {
  const version = typeof SSHM_VERSION === "string" ? SSHM_VERSION : packageJson.version;
  const program = new Command()
    .name(packageJson.name)
    .description(packageJson.description)
    .version(version)
    .option("-c, --config <path>", "SSH config path")
    .action(async () => {
      process.exitCode = await runTui(configPath(), version);
    });

  const configPath = () =>
    program.opts<{ config?: string }>().config ?? join(homedir(), ".ssh", "config");

  setupUpdateCommand(program, version);
  setupUninstallCommand(program);

  program
    .command("list [query]")
    .description("List connectable SSH aliases")
    .action(async (query = "") => {
      for (const host of searchHosts(await loadHosts(configPath()), query)) {
        console.log(
          `host\t${host.alias}\t${host.sources[0]?.configPath ?? host.rootConfigPath}${host.metadata.favourite ? "\t★" : ""}`,
        );
      }
    });

  program
    .command("resolve <alias>")
    .description("Show OpenSSH-resolved configuration")
    .action(async (alias) => {
      const host = await findHost(configPath(), alias);
      for (const [key, value] of (await resolveHost(host.alias, host.rootConfigPath)).entries) {
        console.log(`${key} ${value}`);
      }
    });

  program
    .command("connect <alias>")
    .description("Connect using the system ssh client")
    .action(async (alias) => {
      const host = await findHost(configPath(), alias);
      await recordConnection(host);
      process.exitCode = await connect(host.alias, host.rootConfigPath);
    });

  program
    .command("add <alias> [hostname]")
    .description("Add a Host block")
    .option("-p, --port <port>", "SSH port")
    .option("-u, --user <user>", "SSH username")
    .option("-i, --identity <path>", "private key path")
    .option("--yes", "apply the displayed diff")
    .action(
      async (
        alias,
        hostname,
        options: { port?: string; user?: string; identity?: string; yes?: boolean },
      ) => {
        const input = {
          alias,
          ...(hostname ? { hostname } : {}),
          ...(options.port ? { port: options.port } : {}),
          ...(options.user ? { user: options.user } : {}),
          ...(options.identity ? { identityFile: options.identity } : {}),
        };
        const preview = await previewAddHost(configPath(), input);
        requireConfirmation(preview, options.yes);
        await addHost(configPath(), input, preview.original);
      },
    );

  program
    .command("delete <alias>")
    .description("Delete a single-alias Host block")
    .option("--yes", "apply the displayed diff")
    .action(async (alias, options: { yes?: boolean }) => {
      const host = await findHost(configPath(), alias);
      const preview = await previewDeleteHost(editableHostSource(host, "delete"), host.alias);
      requireConfirmation(preview, options.yes);
      await removeHost(host, preview.original);
    });

  program
    .command("tag <alias> [tags...]")
    .description("Set manager-owned tags; omit tags to clear them")
    .action(async (alias, tags: string[] = []) => {
      const host = await findHost(configPath(), alias);
      await updateHostMetadata(host.id, { tags });
    });

  program
    .command("note <alias> [note...]")
    .description("Set a manager-owned note; omit it to clear the note")
    .action(async (alias, note: string[] = []) => {
      const host = await findHost(configPath(), alias);
      await updateHostMetadata(host.id, { note: note.join(" ") });
    });

  program
    .command("favourite <alias> <on|off>")
    .description("Mark or unmark a host as a favourite")
    .action(async (alias, state) => {
      if (state !== "on" && state !== "off") {
        throw new SshmError("Favourite state must be on or off.");
      }
      const host = await findHost(configPath(), alias);
      await updateHostMetadata(host.id, { favourite: state === "on" });
    });

  return program;
}
