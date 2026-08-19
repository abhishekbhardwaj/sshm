import { afterEach, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import fc from "fast-check";
import { resolveHost } from "../src/openssh.ts";
import {
  addHost,
  deleteHost,
  discoverConfig,
  discoverHosts,
  previewUpdateHost,
  updateHost,
  watchConfig,
} from "../src/ssh-config.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sshm-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      const path = join(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }),
  );
  return directory;
}

async function sourceFor(configPath: string, alias: string) {
  const host = (await discoverHosts(configPath)).find((candidate) => candidate.alias === alias);
  if (!host?.sources[0]) throw new Error(`Missing test host ${alias}.`);
  return host.sources[0];
}

test("discovers concrete aliases from the root config and globbed includes", async () => {
  // Given
  const directory = await fixture({
    config: "",
    "hosts/prod": "Host production\n  HostName prod.example\n",
  });
  const configPath = join(directory, "config");
  await writeFile(
    configPath,
    `Include ${join(directory, "hosts", "*")}\nHost local *\n  User me\n`,
  );

  // When
  const hosts = await discoverHosts(configPath);

  // Then
  expect(hosts.map(({ alias }) => alias).sort()).toEqual(["local", "production"]);
  expect(hosts.find(({ alias }) => alias === "local")?.sources[0]?.aliases).toEqual(["local", "*"]);
  expect(hosts.find(({ alias }) => alias === "production")).toMatchObject({
    rootConfigPath: configPath,
    sources: [{ configPath: join(directory, "hosts", "prod") }],
  });
});

test("processes multiple Include patterns in their declared order", async () => {
  // Given
  const directory = await fixture({
    config: "",
    "z/host": "Host duplicate\n  HostName first.example\n",
    "a/host": "Host duplicate\n  HostName second.example\n",
  });
  const configPath = join(directory, "config");
  await writeFile(
    configPath,
    `Include ${join(directory, "z", "*")} ${join(directory, "a", "*")}\n`,
  );

  // When
  const hosts = await discoverHosts(configPath);

  // Then
  expect(hosts).toHaveLength(1);
  expect(hosts[0]).toMatchObject({
    alias: "duplicate",
    hostname: "first.example",
    sources: [
      { configPath: join(directory, "z", "host") },
      { configPath: join(directory, "a", "host") },
    ],
  });
});

test("keeps included-file backups outside wildcard Include matches", async () => {
  // Given
  const directory = await fixture({
    config: "",
    "hosts/demo": "Host demo\n  HostName old.example\n",
  });
  const configPath = join(directory, "config");
  await writeFile(configPath, `Include ${join(directory, "hosts", "*")}\n`);

  // When
  await updateHost(configPath, await sourceFor(configPath, "demo"), "demo", {
    alias: "demo",
    hostname: "new.example",
  });
  const hosts = await discoverHosts(configPath);
  const resolved = await resolveHost("demo", configPath);

  // Then
  expect(hosts).toHaveLength(1);
  expect(hosts[0]?.sources).toHaveLength(1);
  expect(resolved.values.hostname).toBe("new.example");
});

test("rejects an appended host whose settings are shadowed by an earlier rule", async () => {
  // Given
  const original = "Host *\n  HostName catchall.example\n  Port 2200\n";
  const directory = await fixture({ config: original });
  const configPath = join(directory, "config");

  // When
  const operation = addHost(configPath, {
    alias: "demo",
    hostname: "demo.example",
    port: "2222",
  });

  // Then
  await expect(operation).rejects.toThrow("earlier SSH rule takes precedence");
  expect(await readFile(configPath, "utf8")).toBe(original);
});

test("rejects contextual Include directives instead of discovering phantom hosts", async () => {
  // Given
  const directory = await fixture({
    config: `Match host never\n  Include placeholder\n`,
  });
  const configPath = join(directory, "config");

  // When
  const operation = discoverHosts(configPath);

  // Then
  await expect(operation).rejects.toThrow("move Include to the top level");
});

test("watches Include directories for new matching files", async () => {
  // Given
  const directory = await fixture({
    config: "",
    "hosts/empty": "# no hosts yet\n",
  });
  const configPath = join(directory, "config");
  await writeFile(configPath, `Include ${join(directory, "hosts", "*")}\n`);
  const discovery = await discoverConfig(configPath);
  let notify = () => {};
  const changed = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const watcher = watchConfig(discovery.watchPaths, notify);

  try {
    await new Promise<void>((resolve) => watcher.once("ready", () => resolve()));

    // When
    await writeFile(join(directory, "hosts", "added"), "Host added\n");
    await Promise.race([
      changed,
      Bun.sleep(2_000).then(() => {
        throw new Error("Config watcher did not report the new Include file.");
      }),
    ]);

    // Then
    expect((await discoverHosts(configPath)).map(({ alias }) => alias)).toContain("added");
  } finally {
    await watcher.close();
  }
});

test("adds the first host with its connection fields", async () => {
  // Given
  const directory = await fixture({ config: "" });
  const configPath = join(directory, "config");
  const host = {
    alias: "demo",
    hostname: "demo.example",
    port: "2222",
    user: "deploy",
    identityFile: "~/.ssh/id_ed25519",
  };

  // When
  await addHost(configPath, host);

  // Then
  expect(await readFile(configPath, "utf8")).toContain(
    "Host demo\n  HostName demo.example\n  Port 2222\n  User deploy\n  IdentityFile ~/.ssh/id_ed25519",
  );
  expect((await discoverHosts(configPath))[0]).toMatchObject({ alias: "demo", port: "2222" });
});

test("uses the alias as the destination when HostName is omitted", async () => {
  // Given
  const directory = await fixture({ config: "" });
  const configPath = join(directory, "config");

  // When
  await addHost(configPath, { alias: "localhost" });

  // Then
  expect(await readFile(configPath, "utf8")).toBe("Host localhost\n");
  const host = (await discoverHosts(configPath))[0];
  expect(host?.alias).toBe("localhost");
  expect(host?.hostname).toBeUndefined();
});

test("rejects aliases containing line breaks without changing the config", async () => {
  // Given
  const directory = await fixture({ config: "# unchanged\n" });
  const configPath = join(directory, "config");

  // When
  const operation = addHost(configPath, {
    alias: "bad\nHost injected",
    hostname: "example.com",
  });

  // Then
  await expect(operation).rejects.toThrow("Use only letters");
  expect(await readFile(configPath, "utf8")).toBe("# unchanged\n");
});

test("rejects option-like aliases without changing the config", async () => {
  // Given
  const directory = await fixture({ config: "# unchanged\n" });
  const configPath = join(directory, "config");

  // When
  const operation = addHost(configPath, { alias: "-V", hostname: "example.com" });

  // Then
  await expect(operation).rejects.toThrow("cannot start with a hyphen");
  expect(await readFile(configPath, "utf8")).toBe("# unchanged\n");
});

test("rejects invalid SSH ports without changing the config", async () => {
  // Given
  const directory = await fixture({ config: "# unchanged\n" });
  const configPath = join(directory, "config");

  // When
  const operation = addHost(configPath, {
    alias: "demo",
    hostname: "example.com",
    port: "65536",
  });

  // Then
  await expect(operation).rejects.toThrow("between 1 and 65535");
  expect(await readFile(configPath, "utf8")).toBe("# unchanged\n");
});

test("scoped hostname edits retain comments and unknown directives", async () => {
  // Given
  const directory = await fixture({
    config:
      "IgnoreUnknown FutureDirective\n# retain me\nHost demo\n  HostName old.example\n  FutureDirective untouched\n",
  });
  const configPath = join(directory, "config");

  // When
  await updateHost(configPath, await sourceFor(configPath, "demo"), "demo", {
    alias: "demo",
    hostname: "new.example",
  });

  // Then
  const result = await readFile(configPath, "utf8");
  expect(result).toContain("# retain me");
  expect(result).toContain("HostName new.example");
  expect(result).toContain("FutureDirective untouched");
});

test("editing preserves an inherited HostName when no explicit value exists", async () => {
  // Given
  const original = "Host demo\n  User deploy\n\nHost *\n  HostName %h.example.com\n";
  const directory = await fixture({ config: original });
  const configPath = join(directory, "config");

  // When
  await updateHost(configPath, await sourceFor(configPath, "demo"), "demo", {
    alias: "demo",
    user: "deploy",
  });

  // Then
  expect(await readFile(configPath, "utf8")).toBe(original);
});

test("previews an exact edit without changing the config", async () => {
  // Given
  const original = "Host demo\n  HostName old.example\n";
  const directory = await fixture({ config: original });
  const configPath = join(directory, "config");

  // When
  const preview = await previewUpdateHost(configPath, await sourceFor(configPath, "demo"), "demo", {
    alias: "demo",
    hostname: "new.example",
  });

  // Then
  expect(preview.patch).toContain("-  HostName old.example");
  expect(preview.patch).toContain("+  HostName new.example");
  expect(await readFile(configPath, "utf8")).toBe(original);
});

test("rejects an edit when the config changed after its preview", async () => {
  // Given
  const original = "Host demo\n  HostName old.example\n";
  const externallyChanged = `${original}# external change\n`;
  const directory = await fixture({ config: original });
  const configPath = join(directory, "config");
  const input = { alias: "demo", hostname: "new.example" };
  const source = await sourceFor(configPath, "demo");
  const preview = await previewUpdateHost(configPath, source, "demo", input);
  await writeFile(configPath, externallyChanged);

  // When
  const operation = updateHost(configPath, source, "demo", input, preview.original);

  // Then
  await expect(operation).rejects.toThrow("changed after preview");
  expect(await readFile(configPath, "utf8")).toBe(externallyChanged);
});

test("edits all managed connection fields and renames the alias", async () => {
  // Given
  const directory = await fixture({
    config: "Host old\n  HostName old.example\n  Port 22\n  User root\n  IdentityFile ~/.ssh/old\n",
  });
  const configPath = join(directory, "config");

  // When
  await updateHost(configPath, await sourceFor(configPath, "old"), "old", {
    alias: "new",
    hostname: "new.example",
    port: "2222",
    user: "deploy",
    identityFile: "~/.ssh/new key",
  });

  // Then
  const result = await readFile(configPath, "utf8");
  expect(result).toContain("Host new");
  expect(result).toContain("HostName new.example");
  expect(result).toContain("Port 2222");
  expect(result).toContain("User deploy");
  expect(result).toContain('IdentityFile "~/.ssh/new key"');
  expect((await discoverHosts(configPath))[0]).toMatchObject({
    alias: "new",
    hostname: "new.example",
    port: "2222",
    user: "deploy",
    identityFile: "~/.ssh/new key",
  });
});

test("deletes one Host block without rewriting its neighbors", async () => {
  // Given
  const directory = await fixture({
    config:
      "# before\nHost first\n  HostName first.example\n\n# keep\nHost second\n  HostName second.example\n",
  });
  const configPath = join(directory, "config");

  // When
  await deleteHost(await sourceFor(configPath, "first"), "first");

  // Then
  const result = await readFile(configPath, "utf8");
  expect(result).not.toContain("Host first");
  expect(result).toContain("# keep\nHost second\n  HostName second.example");
  expect(
    (await readdir(directory)).some(
      (name) => name.startsWith(".config.sshm-") && name.endsWith(".bak"),
    ),
  ).toBe(true);
});

test.skipIf(process.platform === "win32")(
  "preserves a symlinked config while updating its target",
  async () => {
    // Given
    const directory = await fixture({
      target: "Host demo\n  HostName old.example\n",
    });
    const target = join(directory, "target");
    const configPath = join(directory, "config");
    await symlink(target, configPath);

    // When
    await updateHost(configPath, await sourceFor(configPath, "demo"), "demo", {
      alias: "demo",
      hostname: "new.example",
    });

    // Then
    expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, "utf8")).toContain("HostName new.example");
  },
);

test("deletes every valid generated host without leaving its block", async () => {
  // Given
  const directory = await fixture({ config: "# managed fixture\n" });
  const configPath = join(directory, "config");
  const validHost = fc.record({
    alias: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    hostname: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\.example$/),
  });

  const property = fc.asyncProperty(validHost, async (host) => {
    // Given
    await writeFile(configPath, "# managed fixture\n");
    await addHost(configPath, host);

    // When
    await deleteHost(await sourceFor(configPath, host.alias), host.alias);

    // Then
    expect(await readFile(configPath, "utf8")).not.toContain(`Host ${host.alias}`);
  });

  // When
  const verification = fc.assert(property, { numRuns: 20 });

  // Then
  await expect(verification).resolves.toBeUndefined();
});

test("refuses edits when ssh-config cannot preserve the document", async () => {
  // Given
  const original =
    'Host bastion\n  HostName bastion.example.com\n\nMatch host *.example.com exec "test -n \\"$SSH_AUTH_SOCK\\""\n  ForwardAgent yes\n';
  const directory = await fixture({ config: original });
  const configPath = join(directory, "config");

  // When
  const operation = deleteHost(await sourceFor(configPath, "bastion"), "bastion");

  // Then
  await expect(operation).rejects.toThrow("cannot preserve byte-for-byte");
  expect(await readFile(configPath, "utf8")).toBe(original);
});

test("refuses to delete an alias that shares a Host block", async () => {
  // Given
  const directory = await fixture({
    config: "Host first second\n  HostName shared.example\n",
  });
  const configPath = join(directory, "config");

  // When
  const operation = deleteHost(await sourceFor(configPath, "first"), "first");

  // Then
  await expect(operation).rejects.toThrow("also defines second");
  expect(await readFile(configPath, "utf8")).toContain("Host first second");
});
