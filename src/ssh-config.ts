/**
 * Discovers concrete OpenSSH hosts and applies reviewed, validated document
 * changes without confusing the root config with an included source file.
 */
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { createTwoFilesPatch } from "diff";
import fg from "fast-glob";
import lockfile from "proper-lockfile";
import SSHConfig, { type Directive, type Line, type Section } from "ssh-config";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import { SshmError } from "./errors.ts";
import { resolveHost } from "./openssh.ts";

const safeValue = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\r\n]/.test(value), {
    message: "SSH config values cannot contain line breaks.",
  });

const hostAlias = safeValue
  .regex(/^[A-Za-z0-9._-]+$/, "Use only letters, numbers, dot, underscore, or hyphen.")
  .refine((alias) => !alias.startsWith("-"), "Host aliases cannot start with a hyphen.");

const sshPort = safeValue.refine((value) => {
  const port = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(port) && port >= 1 && port <= 65_535;
}, "SSH port must be an integer between 1 and 65535.");

const hostSchema = z.strictObject({
  alias: hostAlias,
  hostname: safeValue.optional(),
  port: sshPort.optional(),
  user: safeValue.optional(),
  identityFile: safeValue.optional(),
});

export type NewHost = z.infer<typeof hostSchema>;
export type ConfigPreview = {
  original: string;
  updated: string;
  patch: string;
};

export type HostSource = {
  configPath: string;
  blockIndex: number;
  aliases: string[];
};

export type SshHost = {
  alias: string;
  rootConfigPath: string;
  sources: HostSource[];
  id: string;
  hostname?: string;
  port?: string;
  user?: string;
  identityFile?: string;
};

export type ConfigDiscovery = {
  hosts: SshHost[];
  watchPaths: string[];
};

type DocumentChange = {
  text: string;
  validateAlias: string;
  expectedHost?: NewHost;
};

function tokens(directive: Directive): string[] {
  if (Array.isArray(directive.value)) return directive.value.map(({ val }) => val);
  if (directive.quoted) return [directive.value];
  return directive.value.split(/\s+/).filter(Boolean);
}

function directiveValue(lines: Line[], param: string): string | undefined {
  const directive = lines.find(
    (line) => "param" in line && line.param.toLowerCase() === param.toLowerCase(),
  );
  return directive && "param" in directive ? tokens(directive).join(" ") : undefined;
}

function setDirective(document: SSHConfig, param: string, value?: string): void {
  const index = document.findIndex(
    (line) => "param" in line && line.param.toLowerCase() === param.toLowerCase(),
  );
  if (!value) {
    if (index >= 0) document.splice(index, 1);
    return;
  }
  if (index >= 0) {
    const directive = document[index];
    if (directive && "value" in directive) {
      directive.value = value;
      directive.quoted = /\s/.test(value);
    }
    return;
  }
  document.push(...SSHConfig.parse(`  ${param} ${JSON.stringify(value)}\n`));
}

/** Creates the stable metadata key for a concrete source path and alias. */
export function hostId(configPath: string, alias: string): string {
  return `${resolve(configPath)}\u0000${alias}`;
}

function isPattern(alias: string): boolean {
  return /[*!?]/.test(alias);
}

function hasInclude(lines: Line[]): boolean {
  return lines.some(
    (line) =>
      "param" in line &&
      (line.param.toLowerCase() === "include" || ("config" in line && hasInclude(line.config))),
  );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

type DiscoveryState = {
  rootConfigPath: string;
  hosts: Map<string, SshHost>;
  watchPaths: Set<string>;
  visited: Set<string>;
};

function includePatterns(directive: Directive, watchPaths: Set<string>): string[] {
  const sshDirectory = join(homedir(), ".ssh");
  return tokens(directive).map((pattern) => {
    const expanded = pattern.replace(/^~(?=$|[\\/])/, homedir());
    const absolute = (isAbsolute(expanded) ? expanded : join(sshDirectory, expanded)).replaceAll(
      "\\",
      "/",
    );
    // Dynamic patterns must watch their base directory so a newly created
    // matching file is observed even when no file matched during discovery.
    for (const task of fg.generateTasks(absolute, { absolute: true })) {
      watchPaths.add(task.dynamic ? task.base : absolute);
    }
    return absolute;
  });
}

function addHostDeclaration(
  state: DiscoveryState,
  source: HostSource,
  config: Line[],
  alias: string,
): void {
  const values = {
    hostname: directiveValue(config, "HostName"),
    port: directiveValue(config, "Port"),
    user: directiveValue(config, "User"),
    identityFile: directiveValue(config, "IdentityFile"),
  };
  const existing = state.hosts.get(alias);
  if (existing) {
    // OpenSSH uses the first obtained value. Keep that effective declaration
    // while retaining every source so alias-only edits can be rejected.
    existing.sources.push(source);
    existing.hostname ??= values.hostname;
    existing.port ??= values.port;
    existing.user ??= values.user;
    existing.identityFile ??= values.identityFile;
    return;
  }

  state.hosts.set(alias, {
    alias,
    rootConfigPath: state.rootConfigPath,
    sources: [source],
    id: hostId(source.configPath, alias),
    ...(values.hostname ? { hostname: values.hostname } : {}),
    ...(values.port ? { port: values.port } : {}),
    ...(values.user ? { user: values.user } : {}),
    ...(values.identityFile ? { identityFile: values.identityFile } : {}),
  });
}

/**
 * Walks top-level Includes in OpenSSH order. Canonical paths prevent cycles,
 * while source block indexes preserve an exact target for later edits.
 */
async function discoverFile(configPath: string, state: DiscoveryState): Promise<void> {
  const absolutePath = resolve(configPath);
  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return;
    throw error;
  }

  const canonicalPath = await realpath(absolutePath);
  if (state.visited.has(canonicalPath)) return;
  state.visited.add(canonicalPath);

  const document = SSHConfig.parse(text);
  for (const [blockIndex, line] of document.entries()) {
    if (!("param" in line)) continue;
    if ("config" in line && hasInclude(line.config)) {
      throw new SshmError(
        `Cannot discover contextual Include directives in ${absolutePath}; move Include to the top level.`,
      );
    }

    const param = line.param.toLowerCase();
    if (param === "include") {
      for (const pattern of includePatterns(line, state.watchPaths)) {
        const matches = await fg(pattern, { absolute: true, onlyFiles: true, unique: true });
        for (const includedPath of matches.sort()) await discoverFile(includedPath, state);
      }
      continue;
    }
    if (param !== "host") continue;

    const aliases = tokens(line);
    const source = { configPath: absolutePath, blockIndex, aliases };
    const config = "config" in line ? line.config : [];
    for (const alias of new Set(aliases.filter((candidate) => !isPattern(candidate)))) {
      addHostDeclaration(state, source, config, alias);
    }
  }
}

/** Discovers logical hosts and all files or directories that can change them. */
export async function discoverConfig(configPath: string): Promise<ConfigDiscovery> {
  const rootConfigPath = resolve(configPath);
  const state: DiscoveryState = {
    rootConfigPath,
    hosts: new Map(),
    watchPaths: new Set([rootConfigPath]),
    visited: new Set(),
  };
  await discoverFile(rootConfigPath, state);
  return {
    hosts: [...state.hosts.values()],
    watchPaths: [...state.watchPaths],
  };
}

export async function discoverHosts(configPath: string): Promise<SshHost[]> {
  return (await discoverConfig(configPath)).hosts;
}

function preview(configPath: string, original: string, updated: string): ConfigPreview {
  return {
    original,
    updated,
    patch: createTwoFilesPatch(
      basename(configPath),
      basename(configPath),
      original,
      updated,
      "before",
      "after",
      {
        context: 3,
      },
    ),
  };
}

async function configText(configPath: string): Promise<string> {
  try {
    return await readFile(resolve(configPath), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
}

async function previewDocument(
  configPath: string,
  change: (document: SSHConfig, original: string) => DocumentChange,
): Promise<ConfigPreview> {
  const original = await configText(configPath);
  return preview(configPath, original, change(SSHConfig.parse(original), original).text);
}

function hostDocument(host: NewHost): SSHConfig {
  return new SSHConfig().append({
    Host: host.alias,
    ...(host.hostname ? { HostName: host.hostname } : {}),
    ...(host.port ? { Port: host.port } : {}),
    ...(host.user ? { User: host.user } : {}),
    ...(host.identityFile ? { IdentityFile: host.identityFile } : {}),
  });
}

/**
 * Validates syntax with `ssh -G` and, for additions, compares effective
 * managed values against an isolated Host block to detect earlier rules.
 */
async function validateChange(candidate: DocumentChange, directory: string): Promise<void> {
  const validationPath = join(directory, `.sshm-validate-${randomUUID()}`);
  const expectedPath = join(directory, `.sshm-expected-${randomUUID()}`);
  try {
    await writeFile(validationPath, candidate.text, { mode: 0o600 });
    const actual = await resolveHost(candidate.validateAlias, validationPath);
    if (!candidate.expectedHost) return;

    await writeFile(expectedPath, hostDocument(candidate.expectedHost).toString(), { mode: 0o600 });
    const expected = await resolveHost(candidate.validateAlias, expectedPath);
    const keys = [
      "hostname",
      ...(candidate.expectedHost.port ? ["port"] : []),
      ...(candidate.expectedHost.user ? ["user"] : []),
    ];
    const mismatch = keys.some((key) => actual.values[key] !== expected.values[key]);
    const expectedIdentity = candidate.expectedHost.identityFile
      ? expected.entries.find(([key]) => key === "identityfile")?.[1]
      : undefined;
    const identities = actual.entries
      .filter(([key]) => key === "identityfile")
      .map(([, value]) => value);
    if (mismatch || (expectedIdentity !== undefined && !identities.includes(expectedIdentity))) {
      throw new SshmError(
        `Host ${candidate.validateAlias} would not resolve to the reviewed settings because an earlier SSH rule takes precedence.`,
      );
    }
  } finally {
    await Promise.all([rm(validationPath, { force: true }), rm(expectedPath, { force: true })]);
  }
}

/**
 * Serializes the full stale-check, validation, backup, and atomic replacement
 * sequence so concurrent writers cannot invalidate a reviewed document.
 */
async function changeDocument(
  configPath: string,
  change: (document: SSHConfig, original: string) => DocumentChange,
  expectedOriginal?: string,
): Promise<void> {
  const requestedPath = resolve(configPath);
  await mkdir(dirname(requestedPath), { recursive: true });
  await writeFile(requestedPath, "", { flag: "a", mode: 0o600 });
  const absolutePath = await realpath(requestedPath);

  const release = await lockfile.lock(absolutePath, { retries: 0 });
  try {
    const original = await readFile(absolutePath, "utf8");
    if (expectedOriginal !== undefined && original !== expectedOriginal) {
      throw new SshmError(
        "The SSH config changed after preview; review the new diff before saving.",
      );
    }
    const candidate = change(SSHConfig.parse(original), original);
    if (candidate.text === original) return;

    await validateChange(candidate, dirname(absolutePath));

    // A leading dot keeps sibling backups outside common `Include dir/*`
    // globs, preventing a backup from becoming a second live Host block.
    const backupPath = join(
      dirname(absolutePath),
      `.${basename(absolutePath)}.sshm-${Date.now()}.bak`,
    );
    await copyFile(absolutePath, backupPath);
    await writeFileAtomic(absolutePath, candidate.text, { fsync: true });
  } finally {
    await release();
  }
}

function addHostChange(host: NewHost) {
  return (document: SSHConfig, original: string): DocumentChange => {
    const duplicate = document.some(
      (line) =>
        "param" in line && line.param.toLowerCase() === "host" && tokens(line).includes(host.alias),
    );
    if (duplicate) throw new SshmError(`Host ${host.alias} already exists.`);

    const separator = original && !original.endsWith("\n") ? "\n" : "";
    return {
      text: original + separator + hostDocument(host).toString(),
      validateAlias: host.alias,
      expectedHost: host,
    };
  };
}

async function assertAliasAvailable(configPath: string, alias: string): Promise<void> {
  if ((await discoverHosts(configPath)).some((host) => host.alias === alias)) {
    throw new SshmError(`Host ${alias} already exists in ${configPath}.`);
  }
}

export async function previewAddHost(configPath: string, input: unknown): Promise<ConfigPreview> {
  const host = hostSchema.parse(input);
  await assertAliasAvailable(configPath, host.alias);
  return previewDocument(configPath, addHostChange(host));
}

export async function addHost(
  configPath: string,
  input: unknown,
  expectedOriginal?: string,
): Promise<void> {
  const host = hostSchema.parse(input);
  await assertAliasAvailable(configPath, host.alias);
  await changeDocument(configPath, addHostChange(host), expectedOriginal);
}

/** Refuses a stale block reference instead of mutating a nearby Host section. */
function hostSection(document: SSHConfig, source: HostSource, alias: string): Section {
  const section = document[source.blockIndex] as Line | undefined;
  if (
    !section ||
    !("param" in section) ||
    !("config" in section) ||
    section.param.toLowerCase() !== "host" ||
    !tokens(section).includes(alias)
  ) {
    throw new SshmError(`The Host block for ${alias} is no longer at its reviewed location.`);
  }
  return section;
}

function updateHostChange(source: HostSource, currentAlias: string, host: NewHost) {
  return (document: SSHConfig, original: string): DocumentChange => {
    if (document.toString() !== original) {
      throw new SshmError(
        "This config uses syntax that ssh-config cannot preserve byte-for-byte; edit it manually.",
      );
    }
    const section = hostSection(document, source, currentAlias);
    const aliases = tokens(section);
    if (aliases.length !== 1) {
      throw new SshmError(
        `Cannot safely edit ${currentAlias}: its Host block also defines ${aliases.filter((item) => item !== currentAlias).join(", ")}.`,
      );
    }
    const duplicate = document.some(
      (line) =>
        line !== section &&
        "param" in line &&
        line.param.toLowerCase() === "host" &&
        tokens(line).includes(host.alias),
    );
    if (duplicate) throw new SshmError(`Host ${host.alias} already exists.`);

    section.value = host.alias;
    section.quoted = false;
    setDirective(section.config, "HostName", host.hostname);
    setDirective(section.config, "Port", host.port);
    setDirective(section.config, "User", host.user);
    setDirective(section.config, "IdentityFile", host.identityFile);
    return { text: document.toString(), validateAlias: host.alias };
  };
}

async function assertRenameAvailable(
  rootConfigPath: string,
  currentAlias: string,
  alias: string,
): Promise<void> {
  if (alias !== currentAlias) await assertAliasAvailable(rootConfigPath, alias);
}

export async function previewUpdateHost(
  rootConfigPath: string,
  source: HostSource,
  currentAlias: string,
  input: unknown,
): Promise<ConfigPreview> {
  const host = hostSchema.parse(input);
  await assertRenameAvailable(rootConfigPath, currentAlias, host.alias);
  return previewDocument(source.configPath, updateHostChange(source, currentAlias, host));
}

export async function updateHost(
  rootConfigPath: string,
  source: HostSource,
  currentAlias: string,
  input: unknown,
  expectedOriginal?: string,
): Promise<void> {
  const host = hostSchema.parse(input);
  await assertRenameAvailable(rootConfigPath, currentAlias, host.alias);
  await changeDocument(
    source.configPath,
    updateHostChange(source, currentAlias, host),
    expectedOriginal,
  );
}

function deleteHostChange(source: HostSource, alias: string) {
  return (document: SSHConfig, original: string): DocumentChange => {
    if (document.toString() !== original) {
      throw new SshmError(
        "This config uses syntax that ssh-config cannot preserve byte-for-byte; delete it manually.",
      );
    }
    const section = hostSection(document, source, alias);
    const aliases = tokens(section);
    if (aliases.length !== 1) {
      throw new SshmError(
        `Cannot safely delete ${alias}: its Host block also defines ${aliases.filter((item) => item !== alias).join(", ")}.`,
      );
    }

    // Preserve comments nested under the removed section by promoting them to
    // its document position instead of silently deleting user annotations.
    const comments = "config" in section ? section.config.filter((line) => !("param" in line)) : [];
    document.splice(source.blockIndex, 1, ...comments);
    return { text: document.toString(), validateAlias: "sshm-validation" };
  };
}

export async function previewDeleteHost(source: HostSource, alias: string): Promise<ConfigPreview> {
  return previewDocument(source.configPath, deleteHostChange(source, alias));
}

export async function deleteHost(
  source: HostSource,
  alias: string,
  expectedOriginal?: string,
): Promise<void> {
  await changeDocument(source.configPath, deleteHostChange(source, alias), expectedOriginal);
}

/** Watches root files, included files, include bases, and manager metadata. */
export function watchConfig(paths: string[], onChange: () => void): FSWatcher {
  return chokidar.watch(paths, { atomic: true, ignoreInitial: true }).on("all", onChange);
}
