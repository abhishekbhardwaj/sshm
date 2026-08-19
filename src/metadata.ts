/**
 * Owns the persisted manager metadata contract and serialized mutations.
 * SSH directives stay in OpenSSH files; only sshm-specific state belongs here.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import Conf from "conf";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { SshmError } from "./errors.ts";

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .refine((tag) => !tag.includes(","), "Tags cannot contain commas.");

const tagsSchema = z
  .array(z.string())
  .transform((tags) => [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))])
  .pipe(z.array(tagSchema))
  .default([]);

export const editableHostMetadataSchema = z.strictObject({
  tags: tagsSchema,
  note: z.string().trim().default(""),
});

const hostMetadataSchema = editableHostMetadataSchema.extend({
  favourite: z.boolean().default(false),
  recent: z.number().optional(),
});

const metadataDocumentSchema = z.strictObject({
  hosts: z.record(z.string(), hostMetadataSchema).default({}),
});

type MetadataDocument = z.infer<typeof metadataDocumentSchema>;
export type EditableHostMetadata = z.infer<typeof editableHostMetadataSchema>;
export type HostMetadata = z.infer<typeof hostMetadataSchema>;
export const emptyHostMetadata: HostMetadata = hostMetadataSchema.parse({});

const config = new Conf<MetadataDocument>({
  projectName: "sshm",
  projectSuffix: "",
});

export const metadataPath = config.path;

function document(): MetadataDocument {
  const result = metadataDocumentSchema.safeParse(config.store);
  if (!result.success) {
    throw new SshmError(
      `Invalid sshm metadata at ${config.path}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Locks the complete read-modify-write transaction. Conf's atomic replacement
 * protects a single write, but cannot prevent two processes from reading the
 * same old document and overwriting one another's changes.
 */
async function mutateHosts(
  change: (hosts: MetadataDocument["hosts"]) => MetadataDocument["hosts"],
): Promise<void> {
  await mkdir(dirname(config.path), { recursive: true });
  const release = await lockfile.lock(config.path, {
    realpath: false,
    retries: { retries: 20, factor: 1.2, minTimeout: 10, maxTimeout: 100 },
  });
  try {
    const current = document().hosts;
    const next = change(current);
    if (next !== current) config.store = { hosts: next };
  } finally {
    await release();
  }
}

/** Normalizes editable metadata at the shared CLI/TUI boundary. */
export function parseEditableHostMetadata(input: unknown): EditableHostMetadata {
  return editableHostMetadataSchema.parse(input);
}

export function loadHostMetadata(): Readonly<Record<string, HostMetadata>> {
  return document().hosts;
}

export async function updateHostMetadata(
  hostId: string,
  patch: Partial<HostMetadata>,
  expected?: HostMetadata,
): Promise<void> {
  await mutateHosts((hosts) => {
    const current = hostMetadataSchema.parse(hosts[hostId] ?? {});
    if (expected && !isDeepStrictEqual(current, expected)) {
      throw new SshmError("Metadata changed after review; reload and review the change again.");
    }
    return { ...hosts, [hostId]: hostMetadataSchema.parse({ ...current, ...patch }) };
  });
}

export async function moveHostMetadata(currentId: string, nextId: string): Promise<void> {
  if (currentId === nextId) return;
  await mutateHosts((current) => {
    const metadata = current[currentId];
    if (!metadata) return current;
    const hosts = { ...current, [nextId]: metadata };
    delete hosts[currentId];
    return hosts;
  });
}

export async function deleteHostMetadata(hostId: string): Promise<void> {
  await mutateHosts((current) => {
    if (!current[hostId]) return current;
    const hosts = { ...current };
    delete hosts[hostId];
    return hosts;
  });
}
