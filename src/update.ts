import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { Command } from "commander";
import { z } from "zod";
import { SshmError } from "./errors.ts";

const releaseApi = "https://api.github.com/repos/abhishekbhardwaj/sshm/releases/latest";
const installScript =
  "https://raw.githubusercontent.com/abhishekbhardwaj/sshm/main/scripts/install.sh";
const updateCheckInterval = 60 * 60 * 1_000;

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

type FetchRelease = (url: string, init: RequestInit) => Promise<Response>;

async function latestReleaseVersion(
  currentVersion: string,
  request: FetchRelease = fetch,
  signal?: AbortSignal,
): Promise<string> {
  const response = await request(releaseApi, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `sshm/${currentVersion}` },
    signal,
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

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
};

const cachedUpdateSchema = z.strictObject({
  currentVersion: z.string(),
  latestVersion: z.string(),
  checkedAt: z.number().finite(),
});

type CachedUpdate = z.infer<typeof cachedUpdateSchema>;

export type UpdateCheckOptions = {
  signal?: AbortSignal;
  request?: FetchRelease;
  now?: number;
  cachePath?: string;
};

function defaultUpdateCachePath(): string {
  const configuredCacheHome = process.env.XDG_CACHE_HOME;
  const cacheDirectory =
    configuredCacheHome && isAbsolute(configuredCacheHome)
      ? configuredCacheHome
      : join(homedir(), ".cache");
  return join(cacheDirectory, "sshm", "update.json");
}

function parseCachedUpdate(value: unknown): CachedUpdate | undefined {
  const result = cachedUpdateSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

async function readCachedUpdate(path: string): Promise<CachedUpdate | undefined> {
  try {
    const file = Bun.file(path);
    return (await file.exists()) ? parseCachedUpdate(await file.json()) : undefined;
  } catch {
    return undefined;
  }
}

async function writeCachedUpdate(path: string, update: CachedUpdate): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, `${JSON.stringify(update)}\n`);
  } catch {
    // A cache write must not turn an advisory update check into an application error.
  }
}

/** Checks GitHub Releases without installing anything. */
export async function checkForUpdates(
  currentVersion: string,
  request: FetchRelease = fetch,
  signal?: AbortSignal,
): Promise<UpdateInfo> {
  const latestVersion = await latestReleaseVersion(currentVersion, request, signal);
  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewerVersion(currentVersion, latestVersion),
  };
}

/** Reuses an hourly on-disk result before making another GitHub request. */
export async function checkForUpdatesHourly(
  currentVersion: string,
  options: UpdateCheckOptions = {},
): Promise<UpdateInfo> {
  const now = options.now ?? Date.now();
  const cachePath = options.cachePath ?? defaultUpdateCachePath();
  const cached = await readCachedUpdate(cachePath);
  const cacheAge = cached ? now - cached.checkedAt : updateCheckInterval;
  if (
    cached?.currentVersion === currentVersion &&
    cacheAge >= 0 &&
    cacheAge < updateCheckInterval
  ) {
    return {
      currentVersion: cached.currentVersion,
      latestVersion: cached.latestVersion,
      hasUpdate: isNewerVersion(cached.currentVersion, cached.latestVersion),
    };
  }

  const update = await checkForUpdates(currentVersion, options.request, options.signal);
  await writeCachedUpdate(cachePath, {
    currentVersion: update.currentVersion,
    latestVersion: update.latestVersion,
    checkedAt: now,
  });
  return update;
}

/** Replaces the installed binary using sshm's existing installer. */
export async function performSelfUpdate(): Promise<void> {
  const installer = Bun.spawn(["bash", "-c", `curl -fsSL ${installScript} | bash`], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await installer.exited) !== 0) throw new SshmError("Update failed.");
}

async function update(currentVersion: string, checkOnly: boolean): Promise<void> {
  const info = await checkForUpdates(currentVersion);
  if (checkOnly) {
    console.log(`Current version: ${info.currentVersion}`);
    console.log(`Latest version:  ${info.latestVersion}`);
    console.log(info.hasUpdate ? "Update available." : "Already up to date.");
    return;
  }
  if (!info.hasUpdate) {
    console.log("Already up to date.");
    return;
  }

  console.log(`Updating sshm from ${info.currentVersion} to ${info.latestVersion}…`);
  await performSelfUpdate();
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
