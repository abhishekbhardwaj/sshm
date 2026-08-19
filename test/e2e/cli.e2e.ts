import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binaryPath = join(import.meta.dir, "..", "..", "sshm");

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type Workspace = {
  root: string;
  configPath: string;
  env: Record<string, string | undefined>;
};

async function run(command: string[], env = process.env): Promise<CommandResult> {
  const child = Bun.spawn(command, {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function runRequired(command: string[], env = process.env): Promise<void> {
  const result = await run(command, env);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
}

async function createWorkspace(config = ""): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), "sshm-e2e-"));
  const home = join(root, "home");
  const xdgConfig = join(root, "xdg");
  const configPath = join(root, "config");
  await mkdir(home);
  await mkdir(xdgConfig);
  await Bun.write(configPath, config);
  return {
    root,
    configPath,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: xdgConfig },
  };
}

function runSshm(workspace: Workspace, ...args: string[]): Promise<CommandResult> {
  return run([binaryPath, "--config", workspace.configPath, ...args], workspace.env);
}

async function availablePort(): Promise<number> {
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = reservation.port;
  await reservation.stop(true);
  if (port === undefined) throw new Error("Bun did not assign an ephemeral port.");
  return port;
}

async function startSshServer(workspace: Workspace) {
  const sshd = Bun.which("sshd");
  const sshKeygen = Bun.which("ssh-keygen");
  const id = Bun.which("id");
  if (!sshd || !sshKeygen || !id) {
    throw new Error("The E2E suite requires sshd, ssh-keygen, and id on PATH.");
  }

  const usernameResult = await run([id, "-un"]);
  if (usernameResult.exitCode !== 0) throw new Error(usernameResult.stderr);
  const username = usernameResult.stdout.trim();
  const port = await availablePort();
  const hostKey = join(workspace.root, "host_key");
  const clientKey = join(workspace.root, "client_key");
  const authorizedKeys = join(workspace.root, "authorized_keys");
  const serverConfig = join(workspace.root, "sshd_config");

  await runRequired([sshKeygen, "-q", "-t", "ed25519", "-N", "", "-f", hostKey]);
  await runRequired([sshKeygen, "-q", "-t", "ed25519", "-N", "", "-f", clientKey]);
  await Bun.write(authorizedKeys, Bun.file(`${clientKey}.pub`));
  await chmod(authorizedKeys, 0o600);
  await Bun.write(
    serverConfig,
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${hostKey}`,
      `PidFile ${join(workspace.root, "sshd.pid")}`,
      `AuthorizedKeysFile ${authorizedKeys}`,
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "UsePAM no",
      "StrictModes no",
      "LogLevel VERBOSE",
      `AllowUsers ${username}`,
      "",
    ].join("\n"),
  );

  const process = Bun.spawn([sshd, "-D", "-e", "-f", serverConfig], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  let logs = "";
  const reader = process.stderr.getReader();
  const readLogs = (async () => {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logs += decoder.decode(value, { stream: true });
    }
    logs += decoder.decode();
  })();

  try {
    const deadline = Date.now() + 5_000;
    while (!logs.includes("Server listening")) {
      if (process.exitCode !== null) throw new Error(`sshd exited early:\n${logs}`);
      if (Date.now() >= deadline) throw new Error(`sshd did not start:\n${logs}`);
      await Bun.sleep(20);
    }
  } catch (error) {
    if (process.exitCode === null) process.kill("SIGTERM");
    await process.exited;
    await readLogs;
    throw error;
  }

  return {
    clientKey,
    port,
    username,
    stop: async () => {
      if (process.exitCode === null) process.kill("SIGTERM");
      await process.exited;
      await readLogs;
    },
  };
}

test("connects through OpenSSH on a non-default port", async () => {
  // Given
  const workspace = await createWorkspace(
    [
      "Host *",
      "  BatchMode yes",
      "  StrictHostKeyChecking no",
      "  UserKnownHostsFile /dev/null",
      "  LogLevel ERROR",
      "  ConnectTimeout 2",
      "  RemoteCommand printf sshm-e2e-connected",
      "  RequestTTY no",
      "",
    ].join("\n"),
  );
  let server: Awaited<ReturnType<typeof startSshServer>> | undefined;

  try {
    server = await startSshServer(workspace);

    // When
    const addition = await runSshm(
      workspace,
      "add",
      "e2e",
      "127.0.0.1",
      "--port",
      String(server.port),
      "--user",
      server.username,
      "--identity",
      server.clientKey,
      "--yes",
    );
    const resolution = await runSshm(workspace, "resolve", "e2e");
    const connection = await runSshm(workspace, "connect", "e2e");
    const deletion = await runSshm(workspace, "delete", "e2e", "--yes");

    // Then
    expect(addition.exitCode).toBe(0);
    expect(resolution.exitCode).toBe(0);
    expect(resolution.stdout).toContain("hostname 127.0.0.1");
    expect(resolution.stdout).toContain(`port ${server.port}`);
    expect(connection).toEqual({ exitCode: 0, stdout: "sshm-e2e-connected", stderr: "" });
    expect(deletion.exitCode).toBe(0);
    expect(await Bun.file(workspace.configPath).text()).not.toContain("Host e2e");
  } finally {
    await server?.stop();
    await rm(workspace.root, { recursive: true, force: true });
  }
});

test("lists matching aliases through the compiled CLI", async () => {
  // Given
  const workspace = await createWorkspace();

  try {
    // When
    const commands = [
      await runSshm(workspace, "add", "alpha", "localhost", "--yes"),
      await runSshm(workspace, "add", "bravo", "localhost", "--yes"),
    ];
    const matches = await runSshm(workspace, "list", "alpha");

    // Then
    expect(commands.map(({ exitCode }) => exitCode)).toEqual([0, 0]);
    expect(matches).toMatchObject({ exitCode: 0, stderr: "" });
    expect(matches.stdout).toContain("host\talpha\t");
    expect(matches.stdout).not.toContain("host\tbravo\t");
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});
