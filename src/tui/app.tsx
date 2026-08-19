/**
 * Orchestrates host-manager state and delegates rendering and input policy to
 * focused TUI components. I/O failures are normalized before entering UI state.
 */
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SshmError } from "../errors.ts";
import { emptyHostMetadata } from "../metadata.ts";
import {
  editHost,
  editableHostSource,
  hostSortLabel,
  hostSorts,
  loadHostState,
  loadHosts,
  removeHost,
  searchHosts,
  setHostMetadata,
  sortHosts,
  type Host,
  type HostSort,
  type HostState,
} from "../hosts.ts";
import { resolveHost, type ResolvedConfig } from "../openssh.ts";
import {
  addHost,
  previewAddHost,
  previewDeleteHost,
  previewUpdateHost,
  watchConfig,
} from "../ssh-config.ts";
import { FormModal } from "../ui/form-modal.tsx";
import { atLeast, below } from "../ui/responsive.ts";
import { theme } from "../ui/theme.ts";
import { ActionBar, type ActionBarItem } from "./action-bar.tsx";
import { BrandHeader } from "./brand-header.tsx";
import { DeleteModal } from "./delete-modal.tsx";
import { ErrorModal } from "./error-modal.tsx";
import {
  emptyHostForm,
  fieldDetails,
  formTabs,
  hostInput,
  metadataInput,
  type FormField,
} from "./form.ts";
import { reviewText } from "./format.ts";
import { HelpModal } from "./help-modal.tsx";
import { HostList } from "./host-list.tsx";
import { InspectModal } from "./inspect-modal.tsx";
import { KeyboardController, type KeyboardCommands } from "./keyboard-controller.tsx";
import { ReviewModal } from "./review-modal.tsx";
import { SearchBox } from "./search-box.tsx";
import { shortcutActionLabel, shortcutHint, shortcutKey } from "./shortcuts.ts";
import type { HostFormMode, Mode } from "./types.ts";
import { usePings } from "./use-pings.ts";

type AppProps = {
  configPath: string;
  initialState: HostState;
  finish: (host: Host | null) => void;
};

export function App({ configPath, initialState, finish }: AppProps) {
  const { width } = useTerminalDimensions();
  const compact = below(width, "md");
  const [hostState, setHostState] = useState(initialState);
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HostSort>("default");
  const [details, setDetails] = useState<ResolvedConfig>({ entries: [], values: {} });
  const [form, setForm] = useState(emptyHostForm);
  const hostList = useRef<ScrollBoxRenderable | null>(null);
  const previewScroller = useRef<ScrollBoxRenderable | null>(null);
  const { pings, ping, retain: retainPings } = usePings();
  const hosts = hostState.hosts;
  const visibleHosts = useMemo(
    () => sortHosts(searchHosts(hosts, query), sort),
    [hosts, query, sort],
  );
  const selectedHost = visibleHosts[selected];
  // POSIX and Windows paths cannot contain NUL, making this a stable effect
  // dependency without retaining a fresh array on every render.
  const watchKey = useMemo(
    () => [...hostState.watchPaths].sort().join("\u0000"),
    [hostState.watchPaths],
  );

  const refresh = useCallback(async () => {
    const next = await loadHostState(configPath);
    setHostState(next);
    retainPings(next.hosts);
    setSelected(0);
  }, [configPath, retainPings]);

  useEffect(() => {
    const watcher = watchConfig(watchKey.split("\u0000"), () => {
      void refresh().catch((error) => setMode({ kind: "error", error: SshmError.from(error) }));
    });
    return () => void watcher.close();
  }, [refresh, watchKey]);

  const previewHost = mode.kind === "preview" ? mode.host : undefined;
  useEffect(() => {
    if (!previewHost) return;
    // Resolution can outlive the inspector. Do not replace a newer mode with
    // a result or failure from an overlay the user already closed.
    let active = true;
    void resolveHost(previewHost.alias, previewHost.rootConfigPath)
      .then((result) => active && setDetails(result))
      .catch((error) => {
        if (!active) return;
        setMode((current) =>
          current.kind === "preview" && current.host.id === previewHost.id
            ? { kind: "error", error: SshmError.from(error) }
            : current,
        );
      });
    return () => {
      active = false;
    };
  }, [previewHost]);

  const deleteHostToPreview = mode.kind === "delete" && !mode.preview ? mode.host : undefined;
  useEffect(() => {
    if (!deleteHostToPreview) return;
    let active = true;
    const source = editableHostSource(deleteHostToPreview, "delete");
    void previewDeleteHost(source, deleteHostToPreview.alias)
      .then((change) => {
        if (!active) return;
        setMode((current) =>
          current.kind === "delete" && current.host.id === deleteHostToPreview.id
            ? { ...current, preview: change }
            : current,
        );
      })
      .catch((error) => {
        if (!active) return;
        setMode((current) =>
          current.kind === "delete" && current.host.id === deleteHostToPreview.id
            ? { kind: "error", error: SshmError.from(error) }
            : current,
        );
      });
    return () => {
      active = false;
    };
  }, [deleteHostToPreview]);

  const saveForm = async () => {
    if ((mode.kind !== "add" && mode.kind !== "edit") || mode.saving) return;
    const back: HostFormMode = { ...mode, saving: false };
    setMode({ ...mode, saving: true });
    try {
      const metadata = metadataInput(form);
      const input = hostInput(form);
      if (mode.kind === "add") {
        const preview = await previewAddHost(configPath, input);
        setMode({
          kind: "review",
          change: { kind: "add", input, metadata },
          preview,
          back,
          saving: false,
        });
        return;
      }

      const preview = await previewUpdateHost(
        mode.host.rootConfigPath,
        editableHostSource(mode.host, "edit"),
        mode.host.alias,
        input,
      );
      const metadataUnchanged =
        metadata.note === mode.host.metadata.note &&
        metadata.tags.length === mode.host.metadata.tags.length &&
        metadata.tags.every((tag, index) => tag === mode.host.metadata.tags[index]);
      if (preview.original === preview.updated && metadataUnchanged) {
        setMode({ kind: "browse" });
        return;
      }
      setMode({
        kind: "review",
        change: { kind: "edit", host: mode.host, input, metadata },
        preview,
        back,
        saving: false,
      });
    } catch (error) {
      setMode({ kind: "error", error: SshmError.from(error) });
    }
  };

  const confirmReview = async () => {
    if (mode.kind !== "review" || mode.saving) return;
    setMode({ ...mode, saving: true });
    try {
      let updated: Host;
      if (mode.change.kind === "add") {
        await addHost(configPath, mode.change.input, mode.preview.original);
        const added = (await loadHosts(configPath)).find(
          (host) => host.alias === mode.change.input.alias,
        );
        if (!added) {
          throw new SshmError(`Added host ${mode.change.input.alias} could not be reloaded.`);
        }
        updated = added;
      } else {
        updated = await editHost(mode.change.host, mode.change.input, mode.preview.original);
      }
      await setHostMetadata(
        updated,
        mode.change.metadata,
        mode.change.kind === "edit" ? mode.change.host.metadata : emptyHostMetadata,
      );
      await refresh();
      setMode({ kind: "browse" });
    } catch (error) {
      setMode({ kind: "error", error: SshmError.from(error) });
    }
  };

  const confirmDelete = async () => {
    if (mode.kind !== "delete" || !mode.preview || mode.deleting) return;
    setMode({ ...mode, deleting: true });
    try {
      await removeHost(mode.host, mode.preview.original);
      await refresh();
      setMode({ kind: "browse" });
    } catch (error) {
      setMode({ kind: "error", error: SshmError.from(error) });
    }
  };

  const closeOverlay = () => setMode({ kind: "browse" });
  const startAdd = () => {
    setForm(emptyHostForm());
    setMode({ kind: "add", field: "alias", saving: false });
  };
  const startEdit = (field: FormField = "alias") => {
    if (!selectedHost) return;
    try {
      editableHostSource(selectedHost, "edit");
    } catch (error) {
      setMode({ kind: "error", error: SshmError.from(error) });
      return;
    }
    setForm({
      alias: selectedHost.alias,
      hostname: selectedHost.hostname ?? "",
      port: selectedHost.port ?? "",
      user: selectedHost.user ?? "",
      identityFile: selectedHost.identityFile ?? "",
      tags: selectedHost.metadata.tags.join(", "),
      note: selectedHost.metadata.note,
    });
    setMode({ kind: "edit", host: selectedHost, field, saving: false });
  };
  const startPreview = () => {
    if (!selectedHost) return;
    setDetails({ entries: [], values: {} });
    setMode({ kind: "preview", host: selectedHost });
  };
  const startDelete = () => {
    if (!selectedHost) return;
    try {
      editableHostSource(selectedHost, "delete");
      setMode({ kind: "delete", host: selectedHost, deleting: false });
    } catch (error) {
      setMode({ kind: "error", error: SshmError.from(error) });
    }
  };
  const startSearch = () => {
    setQuery("");
    setSelected(0);
    setMode({ kind: "search" });
  };
  const connectSelected = () => {
    if (selectedHost) finish(selectedHost);
  };
  const pingSelected = () => {
    if (selectedHost) ping([selectedHost]);
  };
  const pingAll = () => ping(hosts);
  const cancelSearch = () => {
    setQuery("");
    setSelected(0);
    setMode({ kind: "browse" });
  };
  const changeSort = () => {
    const next = hostSorts[(hostSorts.indexOf(sort) + 1) % hostSorts.length]!;
    const selectedId = selectedHost?.id;
    const nextHosts = sortHosts(searchHosts(hosts, query), next);
    setSort(next);
    setSelected(
      Math.max(
        0,
        nextHosts.findIndex((host) => host.id === selectedId),
      ),
    );
  };
  const keyboardCommands: KeyboardCommands = {
    connect: connectSelected,
    inspect: startPreview,
    pingSelected,
    pingAll,
    search: startSearch,
    sortNext: changeSort,
    add: startAdd,
    edit: () => startEdit("alias"),
    metadata: () => startEdit("tags"),
    delete: startDelete,
    help: () => setMode({ kind: "help" }),
    quit: () => finish(null),
    cancelSearch,
    saveForm: () => void saveForm(),
    confirmReview: () => void confirmReview(),
    confirmDelete: () => void confirmDelete(),
  };

  const checked = Object.values(pings);
  const online = checked.filter(({ status }) => status === "online").length;
  const checking = checked.filter(({ status }) => status === "checking").length;
  const hostCount = `${hosts.length} ${hosts.length === 1 ? "host" : "hosts"}${checked.length ? ` · ${checking ? `${checking} checking` : `${online} reachable`}` : ""}`;
  const compactHostCount = `${hosts.length} ${hosts.length === 1 ? "host" : "hosts"}${checked.length ? ` · ${checking ? `${checking} ping` : `${online} up`}` : ""}`;
  const settings = [...details.entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key.padEnd(24)} ${value}`)
    .join("\n");
  // Clicks and keys invoke the same command object; only availability and
  // presentation differ in the action bar.
  const actions: ActionBarItem[] = [
    {
      shortcut: "connect",
      title: "Connect",
      onPress: keyboardCommands.connect,
      disabled: !selectedHost,
    },
    {
      shortcut: "inspect",
      title: "Inspect",
      onPress: keyboardCommands.inspect,
      disabled: !selectedHost,
    },
    {
      shortcut: "pingSelected",
      title: "Ping",
      onPress: keyboardCommands.pingSelected,
      disabled: !selectedHost,
    },
    {
      shortcut: "search",
      title: "Search",
      onPress: keyboardCommands.search,
      disabled: hosts.length === 0,
    },
    {
      shortcut: "sortNext",
      title: `Sort: ${hostSortLabel(sort)}`,
      onPress: keyboardCommands.sortNext,
      disabled: hosts.length === 0,
    },
    { shortcut: "add", title: "New", onPress: keyboardCommands.add },
    { shortcut: "edit", title: "Edit", onPress: keyboardCommands.edit, disabled: !selectedHost },
    {
      shortcut: "delete",
      title: "Delete",
      onPress: keyboardCommands.delete,
      disabled: !selectedHost,
      danger: true,
    },
    { shortcut: "help", title: "Help", onPress: keyboardCommands.help },
    { shortcut: "quit", title: "Quit", onPress: keyboardCommands.quit },
  ];

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: theme.background,
        padding: atLeast(width, "sm") ? 1 : 0,
        flexDirection: "column",
        gap: 1,
      }}
    >
      <KeyboardController
        mode={mode}
        setMode={setMode}
        selected={selected}
        setSelected={setSelected}
        visibleHostCount={visibleHosts.length}
        hostListRef={hostList}
        scrollerRef={previewScroller}
        commands={keyboardCommands}
      />
      <BrandHeader status={hostCount} compactStatus={compactHostCount} />

      {mode.kind === "search" && (
        <SearchBox
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setSelected(0);
          }}
          onDone={closeOverlay}
        />
      )}

      <HostList
        configuredCount={hosts.length}
        sortLabel={hostSortLabel(sort)}
        hosts={visibleHosts}
        pings={pings}
        width={width}
        selected={selected}
        focused={mode.kind === "browse"}
        listRef={hostList}
        onSelectedChange={setSelected}
        onConnect={finish}
      />

      {mode.kind === "browse" && <ActionBar actions={actions} width={width} />}

      {(mode.kind === "add" || mode.kind === "edit") && (
        <FormModal
          title={mode.kind === "add" ? "Add SSH host" : `Edit ${mode.host.alias}`}
          tabs={formTabs}
          fieldDetails={fieldDetails}
          values={form}
          activeField={mode.field}
          saving={mode.saving}
          saveLabel={
            mode.saving ? "Preparing…" : shortcutActionLabel("formReview", "Review", compact)
          }
          cancelLabel={
            compact ? shortcutKey("formCancel", true) : shortcutActionLabel("formCancel", "Cancel")
          }
          hint={
            compact
              ? shortcutHint(["formSwitchTab"], true)
              : shortcutActionLabel("formSwitchTab", "Switch tabs")
          }
          onInput={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
          onFocus={(field) => setMode({ ...mode, field })}
          onSave={() => void saveForm()}
          onCancel={closeOverlay}
        />
      )}
      {mode.kind === "review" && (
        <ReviewModal
          text={reviewText(mode.change, mode.preview)}
          saving={mode.saving}
          scrollerRef={previewScroller}
          onApply={() => void confirmReview()}
          onBack={() => setMode(mode.back)}
        />
      )}
      {mode.kind === "preview" && (
        <InspectModal
          alias={mode.host.alias}
          configPath={mode.host.rootConfigPath}
          settings={settings}
          scrollerRef={previewScroller}
          onClose={closeOverlay}
        />
      )}
      {mode.kind === "help" && <HelpModal width={width} onClose={closeOverlay} />}
      {mode.kind === "delete" && (
        <DeleteModal
          alias={mode.host.alias}
          patch={mode.preview?.patch}
          deleting={mode.deleting}
          scrollerRef={previewScroller}
          onDelete={() => void confirmDelete()}
          onCancel={closeOverlay}
        />
      )}
      {mode.kind === "error" && <ErrorModal error={mode.error} onClose={closeOverlay} />}
    </box>
  );
}
