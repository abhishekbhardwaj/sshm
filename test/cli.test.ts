import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { createProgram } from "../src/cli.ts";
import { sshArguments } from "../src/openssh.ts";

async function runProcess(
  command: string[],
  env: Record<string, string | undefined> = process.env,
) {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function runCli(
  configPath: string,
  args: string[],
  env: Record<string, string | undefined> = process.env,
) {
  return runProcess([process.execPath, "src/index.ts", "--config", configPath, ...args], env);
}

test("reports the package version through the CLI", () => {
  // Given
  const expectedVersion = packageJson.version;

  // When
  const programVersion = createProgram().version();

  // Then
  expect(programVersion).toBe(expectedVersion);
});

test("offers self-update through update and upgrade", async () => {
  // When
  const result = await runCli("/tmp/config", ["update", "--help"]);

  // Then
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("upgrade");
  expect(result.stdout).toContain("--check");
});

test("removes a curl-installed binary and purges metadata only when requested", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-uninstall-"));
  const binary = join(directory, ".local", "bin", "sshm");
  const configDirectory = join(directory, ".config", "sshm");
  const metadata = join(configDirectory, "config.json");
  await mkdir(join(directory, ".local", "bin"), { recursive: true });
  await mkdir(configDirectory, { recursive: true });
  await writeFile(binary, "binary");
  await writeFile(metadata, '{"hosts":{}}\n');
  const env = { ...process.env, HOME: directory, XDG_CONFIG_HOME: join(directory, ".config") };

  try {
    // When
    const preview = await runCli("/tmp/config", ["uninstall"], env);
    expect(preview.exitCode).toBe(1);
    expect(preview.stderr).toContain("Rerun with --yes");
    expect(await Bun.file(binary).exists()).toBe(true);

    const result = await runCli("/tmp/config", ["uninstall", "--yes"], env);

    // Then
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(binary).exists()).toBe(false);
    expect(await Bun.file(metadata).exists()).toBe(true);

    await writeFile(binary, "binary");
    const purge = await runCli("/tmp/config", ["uninstall", "--purge", "--yes"], env);
    expect(purge.exitCode).toBe(0);
    expect(await Bun.file(binary).exists()).toBe(false);
    expect(await Bun.file(metadata).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builds a system SSH command without changing connection semantics", () => {
  // Given
  const alias = "prod";
  const configPath = "/tmp/config";

  // When
  const args = sshArguments(alias, configPath);

  // Then
  expect(args).toEqual(["ssh", "-F", configPath, "--", alias]);
});

test("shows a diff without changing the config when confirmation is omitted", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-cli-"));
  const configPath = join(directory, "config");
  await writeFile(configPath, "# unchanged\n");

  try {
    // When
    const result = await runCli(configPath, ["add", "demo"]);

    // Then
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("+Host demo");
    expect(result.stdout).not.toContain("HostName");
    expect(result.stderr).toContain("rerun with --yes");
    expect(await readFile(configPath, "utf8")).toBe("# unchanged\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves included hosts through the root SSH config", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-cli-"));
  const hostsDirectory = join(directory, "hosts");
  const configPath = join(directory, "config");
  await mkdir(hostsDirectory);
  await writeFile(join(hostsDirectory, "demo"), "Host demo\n  HostName demo.example\n");
  await writeFile(configPath, `Include ${hostsDirectory}/*\nHost *\n  Port 2222\n`);

  try {
    // When
    const result = await runCli(configPath, ["resolve", "demo"], {
      ...process.env,
      XDG_CONFIG_HOME: join(directory, "xdg"),
    });

    // Then
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hostname demo.example");
    expect(result.stdout).toContain("port 2222");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects metadata files with unknown root fields when listing without changing them", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-cli-"));
  const configPath = join(directory, "config");
  const xdgConfig = join(directory, "xdg");
  const metadataPath = join(xdgConfig, "sshm", "config.json");
  const metadata = '{"hosts":{},"unexpected":true}\n';
  await writeFile(configPath, "Host demo\n");
  await mkdir(join(xdgConfig, "sshm"), { recursive: true });
  await writeFile(metadataPath, metadata);

  try {
    // When
    const result = await runCli(configPath, ["list"], {
      ...process.env,
      XDG_CONFIG_HOME: xdgConfig,
    });

    // Then
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid sshm metadata");
    expect(await readFile(metadataPath, "utf8")).toBe(metadata);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a reviewed metadata overwrite after another process changes the host", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-cli-"));
  const configPath = join(directory, "config");
  const env = { ...process.env, XDG_CONFIG_HOME: join(directory, "xdg") };
  await writeFile(configPath, "Host demo\n");
  const script = `
    import { setHostMetadata } from "./src/hosts.ts";
    import { updateHostMetadata } from "./src/metadata.ts";
    import { hostId } from "./src/ssh-config.ts";

    const configPath = ${JSON.stringify(configPath)};
    const id = hostId(configPath, "demo");
    await updateHostMetadata(id, { tags: ["newer"] });
    await setHostMetadata(
      {
        id,
        alias: "demo",
        rootConfigPath: configPath,
        sources: [{ configPath, blockIndex: 0, aliases: ["demo"] }],
        metadata: { tags: [], note: "", favourite: false },
      },
      { tags: ["reviewed"], note: "" },
    );
  `;

  try {
    // When
    const result = await runProcess([process.execPath, "-e", script], env);

    // Then
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Metadata changed after review");
    const metadata = JSON.parse(
      await Bun.file(join(env.XDG_CONFIG_HOME!, "sshm", "config.json")).text(),
    );
    expect(metadata.hosts[`${configPath}\u0000demo`].tags).toEqual(["newer"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("applies a reviewed CLI change when confirmation is supplied", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "sshm-cli-"));
  const configPath = join(directory, "config");
  await writeFile(configPath, "# unchanged\n");

  try {
    // When
    const result = await runCli(configPath, [
      "add",
      "demo",
      "demo.example",
      "--port",
      "2222",
      "--yes",
    ]);

    // Then
    expect(result.exitCode).toBe(0);
    expect(await readFile(configPath, "utf8")).toContain(
      "Host demo\n  HostName demo.example\n  Port 2222",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
