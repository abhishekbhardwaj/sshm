/** Joins discovered SSH hosts with manager metadata and safe host operations. */
import Fuse from "fuse.js";
import { SshmError } from "./errors.ts";
import {
  deleteHostMetadata,
  emptyHostMetadata,
  loadHostMetadata,
  metadataPath,
  moveHostMetadata,
  updateHostMetadata,
  type EditableHostMetadata,
  type HostMetadata,
} from "./metadata.ts";
import {
  deleteHost,
  discoverConfig,
  hostId,
  updateHost,
  type HostSource,
  type NewHost,
  type SshHost,
} from "./ssh-config.ts";

export type Host = SshHost & { metadata: HostMetadata };
export type HostState = { hosts: Host[]; watchPaths: string[] };

export const hostSorts = ["default", "alias-asc", "alias-desc", "recent"] as const;
export type HostSort = (typeof hostSorts)[number];

export function hostSortLabel(sort: HostSort): string {
  switch (sort) {
    case "alias-asc":
      return "Name A-Z";
    case "alias-desc":
      return "Name Z-A";
    case "recent":
      return "Recently used";
    default:
      return "Default";
  }
}

/** Returns a new host list in the requested temporary browse order. */
export function sortHosts(hosts: Host[], sort: HostSort = "default"): Host[] {
  return [...hosts].sort((left, right) => {
    if (sort === "alias-asc") return left.alias.localeCompare(right.alias);
    if (sort === "alias-desc") return right.alias.localeCompare(left.alias);
    if (sort === "recent") {
      return (
        (right.metadata.recent ?? 0) - (left.metadata.recent ?? 0) ||
        left.alias.localeCompare(right.alias)
      );
    }
    if (left.metadata.favourite !== right.metadata.favourite) {
      return left.metadata.favourite ? -1 : 1;
    }
    return (
      (right.metadata.recent ?? 0) - (left.metadata.recent ?? 0) ||
      left.alias.localeCompare(right.alias)
    );
  });
}

/**
 * Returns the only source block when an alias identifies exactly one safe edit
 * target. Ambiguous blocks must be edited manually rather than guessed.
 */
export function editableHostSource(host: Host, operation: "edit" | "delete"): HostSource {
  if (host.sources.length !== 1) {
    throw new SshmError(
      `Cannot safely ${operation} ${host.alias}: it is defined by ${host.sources.length} Host blocks.`,
    );
  }
  const source = host.sources[0]!;
  if (source.aliases.length !== 1) {
    throw new SshmError(
      `Cannot safely ${operation} ${host.alias}: its Host block also defines ${source.aliases.filter((alias) => alias !== host.alias).join(", ")}.`,
    );
  }
  return source;
}

/** Loads discovery and metadata once and returns every path the TUI must watch. */
export async function loadHostState(configPath: string): Promise<HostState> {
  const discoveryPromise = discoverConfig(configPath);
  const metadataById = loadHostMetadata();
  const discovery = await discoveryPromise;
  const hosts = sortHosts(
    discovery.hosts.map((host) => ({
      ...host,
      metadata: metadataById[host.id] ?? emptyHostMetadata,
    })),
  );
  return { hosts, watchPaths: [...new Set([...discovery.watchPaths, metadataPath])] };
}

export async function loadHosts(configPath: string): Promise<Host[]> {
  return (await loadHostState(configPath)).hosts;
}

export async function findHost(configPath: string, alias: string): Promise<Host> {
  const host = (await loadHosts(configPath)).find((candidate) => candidate.alias === alias);
  if (!host) throw new SshmError(`Unknown concrete host: ${alias}`);
  return host;
}

export async function editHost(
  host: Host,
  input: NewHost,
  expectedOriginal?: string,
): Promise<Host> {
  const source = editableHostSource(host, "edit");
  await updateHost(host.rootConfigPath, source, host.alias, input, expectedOriginal);
  const nextId = hostId(source.configPath, input.alias);
  await moveHostMetadata(host.id, nextId);
  const updated = (await loadHosts(host.rootConfigPath)).find(({ alias }) => alias === input.alias);
  if (!updated) throw new SshmError(`Edited host ${input.alias} could not be reloaded.`);
  return updated;
}

export async function removeHost(host: Host, expectedOriginal?: string): Promise<void> {
  await deleteHost(editableHostSource(host, "delete"), host.alias, expectedOriginal);
  await deleteHostMetadata(host.id);
}

export function searchHosts(hosts: Host[], query: string): Host[] {
  if (!query.trim()) return hosts;
  return new Fuse(hosts, {
    keys: ["alias", "hostname", "metadata.tags", "metadata.note"],
    threshold: 0.4,
  })
    .search(query)
    .map(({ item }) => item);
}

export async function setHostMetadata(
  host: Host,
  input: EditableHostMetadata,
  expected = host.metadata,
): Promise<void> {
  await updateHostMetadata(host.id, input, expected);
}

export async function recordConnection(host: Host): Promise<void> {
  await updateHostMetadata(host.id, { recent: Date.now() });
}
