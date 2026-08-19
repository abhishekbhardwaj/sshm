import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import SSHConfig from "ssh-config";

const fixturesDirectory = join(import.meta.dir, "fixtures");
const knownParserIncompatibilities = new Set(["match.conf"]);

for (const name of await readdir(fixturesDirectory)) {
  test(`records ssh-config compatibility for ${name}`, async () => {
    // Given
    const original = await readFile(join(fixturesDirectory, name), "utf8");

    // When
    const roundTrip = SSHConfig.stringify(SSHConfig.parse(original));

    // Then
    if (knownParserIncompatibilities.has(name)) expect(roundTrip).not.toBe(original);
    else expect(roundTrip).toBe(original);
  });
}
