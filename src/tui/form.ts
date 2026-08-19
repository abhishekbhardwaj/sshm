/** Owns host-form fields and converts their string values at domain boundaries. */
import { parseEditableHostMetadata } from "../metadata.ts";
import type { NewHost } from "../ssh-config.ts";

export const formTabs = [
  { label: "Target", compactLabel: "Target", fields: ["alias", "hostname", "port"] },
  { label: "Auth", compactLabel: "Auth", fields: ["user", "identityFile"] },
  { label: "Metadata", compactLabel: "Meta", fields: ["tags", "note"] },
] as const;

export type FormField = (typeof formTabs)[number]["fields"][number];
export type HostForm = Record<FormField, string>;

export const fields: FormField[] = formTabs.flatMap(({ fields }) => [...fields]);

export const fieldDetails: Record<FormField, [title: string, placeholder: string]> = {
  alias: ["Alias", "production"],
  hostname: ["HostName (optional)", "defaults to alias"],
  port: ["Port (optional)", "22"],
  user: ["Username (optional)", "deploy"],
  identityFile: ["Private key (optional)", "~/.ssh/id_ed25519"],
  tags: ["Tags (comma-separated)", "prod, critical"],
  note: ["Custom note", "Owner / purpose"],
};

export function emptyHostForm(): HostForm {
  return {
    alias: "",
    hostname: "",
    port: "",
    user: "",
    identityFile: "",
    tags: "",
    note: "",
  };
}

export function hostInput(form: HostForm): NewHost {
  return {
    alias: form.alias,
    ...(form.hostname ? { hostname: form.hostname } : {}),
    ...(form.port ? { port: form.port } : {}),
    ...(form.user ? { user: form.user } : {}),
    ...(form.identityFile ? { identityFile: form.identityFile } : {}),
  };
}

export function metadataInput(form: HostForm) {
  return parseEditableHostMetadata({
    tags: form.tags.split(","),
    note: form.note,
  });
}
