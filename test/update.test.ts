import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdates, checkForUpdatesHourly } from "../src/update.ts";

test("reports a newer GitHub release without installing it", async () => {
  // Given
  let requestedUrl = "";
  let requestedOptions: RequestInit | undefined;
  const controller = new AbortController();
  const request = async (url: string, options: RequestInit) => {
    requestedUrl = url;
    requestedOptions = options;
    return Response.json({ tag_name: "v1.3.0" });
  };

  // When
  const update = await checkForUpdates("1.2.3", request, controller.signal);

  // Then
  expect(requestedUrl).toBe("https://api.github.com/repos/abhishekbhardwaj/sshm/releases/latest");
  expect(new Headers(requestedOptions?.headers).get("User-Agent")).toBe("sshm/1.2.3");
  expect(requestedOptions?.signal).toBe(controller.signal);
  expect(update).toEqual({
    currentVersion: "1.2.3",
    latestVersion: "1.3.0",
    hasUpdate: true,
  });
});

test("derives update availability from cached release versions", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-update-"));
  const cachePath = join(directory, "update.json");
  await Bun.write(
    cachePath,
    JSON.stringify({ currentVersion: "1.0.0", latestVersion: "2.0.0", checkedAt: 1_000 }),
  );

  try {
    // When
    const update = await checkForUpdatesHourly("1.0.0", {
      cachePath,
      now: 1_001,
      request: async () => {
        throw new Error("A fresh cache must not make a request.");
      },
    });

    // Then
    expect(update).toEqual({
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
      hasUpdate: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reuses an update result for one hour", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-update-"));
  const cachePath = join(directory, "update.json");
  let requests = 0;
  const request = async () => {
    requests++;
    return Response.json({ tag_name: `v1.${requests}.0` });
  };

  try {
    // When
    const first = await checkForUpdatesHourly("1.0.0", {
      cachePath,
      now: 1_000,
      request,
    });
    const cached = await checkForUpdatesHourly("1.0.0", {
      cachePath,
      now: 1_000 + 60 * 60 * 1_000 - 1,
      request,
    });
    const refreshed = await checkForUpdatesHourly("1.0.0", {
      cachePath,
      now: 1_000 + 60 * 60 * 1_000,
      request,
    });

    // Then
    expect(requests).toBe(2);
    expect(cached).toEqual(first);
    expect(refreshed.latestVersion).toBe("1.2.0");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores an empty XDG cache home", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-update-home-"));
  const updateModule = new URL("../src/update.ts", import.meta.url).href;
  const script = `
    const { checkForUpdatesHourly } = await import(${JSON.stringify(updateModule)});
    await checkForUpdatesHourly("1.0.0", {
      now: 1_000,
      request: async () => Response.json({ tag_name: "v1.0.0" }),
    });
  `;

  try {
    // When
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: directory,
      env: { ...process.env, HOME: directory, XDG_CACHE_HOME: "" },
      stdout: "ignore",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

    // Then
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
    expect(await Bun.file(join(directory, ".cache", "sshm", "update.json")).exists()).toBe(true);
    expect(await Bun.file(join(directory, "sshm", "update.json")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
