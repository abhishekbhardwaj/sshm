import { expect, test } from "bun:test";
import { SshmError } from "../src/errors.ts";
import { editableHostSource, searchHosts, sortHosts, type Host } from "../src/hosts.ts";

test("rejects alias-only edits when multiple concrete Host blocks define the alias", () => {
  // Given
  const host: Host = {
    id: "config-alpha",
    alias: "alpha",
    rootConfigPath: "/tmp/config",
    sources: [
      { configPath: "/tmp/first", blockIndex: 0, aliases: ["alpha"] },
      { configPath: "/tmp/second", blockIndex: 0, aliases: ["alpha"] },
    ],
    metadata: { tags: [], note: "", favourite: false },
  };

  // When
  const operation = () => editableHostSource(host, "edit");

  // Then
  expect(operation).toThrow(SshmError);
  expect(operation).toThrow("defined by 2 Host blocks");
});

test("sorts hosts by the selected browse order", () => {
  // Given
  const hosts = [
    { alias: "alpha", favourite: false, recent: 10 },
    { alias: "bravo", favourite: true, recent: undefined },
    { alias: "charlie", favourite: false, recent: 20 },
  ].map(({ alias, favourite, recent }): Host => ({
    id: alias,
    alias,
    rootConfigPath: "/tmp/config",
    sources: [{ configPath: "/tmp/config", blockIndex: 0, aliases: [alias] }],
    metadata: { tags: [], note: "", favourite, recent },
  }));

  // When
  const defaultOrder = sortHosts(hosts).map(({ alias }) => alias);
  const alphabetical = sortHosts(hosts, "alias-asc").map(({ alias }) => alias);
  const recent = sortHosts(hosts, "recent").map(({ alias }) => alias);

  // Then
  expect(defaultOrder).toEqual(["bravo", "charlie", "alpha"]);
  expect(alphabetical).toEqual(["alpha", "bravo", "charlie"]);
  expect(recent).toEqual(["charlie", "alpha", "bravo"]);
});

test("searches host tags and notes", () => {
  // Given
  const hosts: Host[] = [
    {
      id: "config-alpha",
      alias: "alpha",
      rootConfigPath: "/tmp/config",
      sources: [{ configPath: "/tmp/config", blockIndex: 0, aliases: ["alpha"] }],
      metadata: {
        tags: ["payments"],
        note: "",
        favourite: false,
      },
    },
    {
      id: "config-bravo",
      alias: "bravo",
      rootConfigPath: "/tmp/config",
      sources: [{ configPath: "/tmp/config", blockIndex: 1, aliases: ["bravo"] }],
      metadata: {
        tags: [],
        note: "nightly backup target",
        favourite: false,
      },
    },
  ];

  // When
  const tagMatches = searchHosts(hosts, "payments");
  const noteMatches = searchHosts(hosts, "nightly backup");

  // Then
  expect(tagMatches.map(({ alias }) => alias)).toEqual(["alpha"]);
  expect(noteMatches.map(({ alias }) => alias)).toEqual(["bravo"]);
});
