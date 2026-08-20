/** Defines the finite UI modes that govern overlays and keyboard context. */
import type { SshmError } from "../errors.ts";
import type { Host } from "../hosts.ts";
import type { EditableHostMetadata } from "../metadata.ts";
import type { ConfigPreview, NewHost } from "../ssh-config.ts";
import type { UpdateInfo } from "../update.ts";
import type { FormField } from "./form.ts";

export type HostFormMode =
  | { kind: "add"; field: FormField; saving: boolean }
  | { kind: "edit"; host: Host; field: FormField; saving: boolean };

export type PendingChange =
  | { kind: "add"; input: NewHost; metadata: EditableHostMetadata }
  | { kind: "edit"; host: Host; input: NewHost; metadata: EditableHostMetadata };

export type Mode =
  | { kind: "browse" }
  | { kind: "search" }
  | { kind: "help" }
  | HostFormMode
  | {
      kind: "review";
      change: PendingChange;
      preview: ConfigPreview;
      back: HostFormMode;
      saving: boolean;
    }
  | { kind: "preview"; host: Host }
  | { kind: "delete"; host: Host; preview?: ConfigPreview; deleting: boolean }
  | { kind: "update"; update: UpdateInfo }
  | { kind: "error"; error: SshmError };
