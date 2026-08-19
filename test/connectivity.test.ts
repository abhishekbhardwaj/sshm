import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pingHost } from "../src/connectivity.ts";
import type { Host } from "../src/hosts.ts";

test("checks the OpenSSH-resolved host and port without authenticating", async () => {
  // Given
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const directory = await mkdtemp(join(tmpdir(), "sshm-ping-"));
  const configPath = join(directory, "config");
  await writeFile(configPath, `Host demo\n  HostName 127.0.0.1\n  Port ${server.port}\n`);

  try {
    const host: Host = {
      id: "demo",
      alias: "demo",
      hostname: "127.0.0.1",
      port: String(server.port),
      rootConfigPath: configPath,
      sources: [{ configPath, blockIndex: 0, aliases: ["demo"] }],
      metadata: { tags: [], note: "", favourite: false },
    };

    // When
    const result = await pingHost(host, 1_000);

    // Then
    expect(result).toMatchObject({
      status: "online",
      hostname: "127.0.0.1",
      port: server.port,
    });
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});
