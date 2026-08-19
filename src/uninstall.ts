import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { SshmError } from "./errors.ts";
import { metadataPath } from "./metadata.ts";

async function uninstall(purge: boolean, confirmed: boolean): Promise<void> {
  const paths = [join(homedir(), ".local", "bin", "sshm"), ...(purge ? [metadataPath] : [])];
  const existing = await Promise.all(
    paths.map(async (path) => ((await Bun.file(path).exists()) ? path : undefined)),
  );
  const files = existing.filter((path): path is string => Boolean(path));

  if (files.length === 0) {
    console.log("No curl-installed sshm files found.");
    return;
  }
  console.log(`Will remove:\n${files.map((path) => `- ${path}`).join("\n")}`);
  if (!confirmed) throw new SshmError("Rerun with --yes to uninstall.");

  await Promise.all(files.map((path) => rm(path, { force: true })));
  console.log("sshm uninstalled.");
}

/** Adds removal for the curl-installed binary and optional sshm metadata. */
export function setupUninstallCommand(program: Command): void {
  program
    .command("uninstall")
    .description("Remove the curl-installed sshm binary")
    .option("--purge", "also remove sshm metadata")
    .option("--yes", "confirm removal")
    .action(async (options: { purge?: boolean; yes?: boolean }) =>
      uninstall(Boolean(options.purge), Boolean(options.yes)),
    );
}
