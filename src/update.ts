import { Command } from "commander";
import { SshmError } from "./errors.ts";

const releaseApi = "https://api.github.com/repos/abhishekbhardwaj/sshm/releases/latest";
const installScript =
  "https://raw.githubusercontent.com/abhishekbhardwaj/sshm/main/scripts/install.sh";

function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let index = 0; index < Math.max(currentParts.length, latestParts.length); index++) {
    const currentPart = currentParts[index] ?? 0;
    const latestPart = latestParts[index] ?? 0;
    if (latestPart !== currentPart) return latestPart > currentPart;
  }
  return false;
}

async function latestReleaseVersion(currentVersion: string): Promise<string> {
  const response = await fetch(releaseApi, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `sshm/${currentVersion}` },
  });
  if (!response.ok)
    throw new SshmError(`Could not check for updates: GitHub returned ${response.status}.`);

  const release: unknown = await response.json();
  if (
    typeof release !== "object" ||
    release === null ||
    !("tag_name" in release) ||
    typeof release.tag_name !== "string"
  ) {
    throw new SshmError("Could not check for updates: GitHub returned an invalid release.");
  }
  return release.tag_name.replace(/^v/, "");
}

async function update(currentVersion: string, checkOnly: boolean): Promise<void> {
  const latestVersion = await latestReleaseVersion(currentVersion);
  if (checkOnly) {
    console.log(`Current version: ${currentVersion}`);
    console.log(`Latest version:  ${latestVersion}`);
    console.log(
      isNewerVersion(currentVersion, latestVersion) ? "Update available." : "Already up to date.",
    );
    return;
  }
  if (!isNewerVersion(currentVersion, latestVersion)) {
    console.log("Already up to date.");
    return;
  }

  console.log(`Updating sshm from ${currentVersion} to ${latestVersion}…`);
  const installer = Bun.spawn(["bash", "-c", `curl -fsSL ${installScript} | bash`], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await installer.exited) !== 0) throw new SshmError("Update failed.");
}

/** Adds the curl-installer self-update commands. */
export function setupUpdateCommand(program: Command, currentVersion: string): void {
  program
    .command("update")
    .alias("upgrade")
    .description("Update sshm using the curl installer")
    .option("--check", "check for an update without installing it")
    .action(async (options: { check?: boolean }) => update(currentVersion, Boolean(options.check)));
}
