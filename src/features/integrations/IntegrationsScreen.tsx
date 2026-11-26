import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  IntegrationCreateArt,
  IntegrationKeyArt,
  IntegrationPayArt
} from "@/components/illustrations/integrations";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { ColumnHeader } from "@/components/ui/ColumnHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { IconName } from "@/components/ui/Icon";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { LoadingScene, useLoadingScene } from "@/components/ui/LoadingScene";
import { Spinner } from "@/components/ui/Spinner";
import { TableCard, TableRow } from "@/components/ui/TableCard";
import { TableNoMatch } from "@/components/ui/TableNoMatch";
import { useTableView, type ViewColumn } from "@/components/ui/useTableView";
import { exportGrantsSuspended } from "@/config/assistants";
import { MAX_INTEGRATIONS } from "@/config/team";
import { guideStep, ListGuide } from "@/features/empty-states/guide";
import { DockActions, DockScrollView } from "@/features/navigation/dock-area";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { usePeriodLabel } from "@/features/table/period-label";
import {
  TeamError,
  loadAssistants,
  loadIntegrations,
  removeAssistant,
  removeIntegration,
  setAssistantExport,
  type AssistantsView,
  type IntegrationsView
} from "@/features/team/owner";
import type { IntegrationPending } from "@/features/team/integration-pending";
import { PosFrame } from "@/features/terminal/PosFrame";
import { datePeriodOf, type DatePeriod } from "@/lib/date-periods";
import { formatDate } from "@/lib/locale/date";
import { getDeviceLocale } from "@/lib/locale/device";
import type { Assistant, Integration } from "@/lib/team/roster";
import {
  cardInset,
  control,
  gutter,
  makeStyles,
  proseLineHeight,
  radius,
  sans,
  space,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { codeOf, type Failure } from "./failures";
import { IntegrationAvatar } from "./IntegrationAvatar";
import { NewIntegrationSheet } from "./NewIntegrationSheet";

/** Desktop table: the date and the actions have fixed widths, the name the rest. */
const COLUMNS = { date: 260, actions: 100 } as const;

/**
 * A row of the list: an integration, or an assistant, both seats holding a key the owner gave.
 */
type Seat = { kind: "integration"; seat: Integration } | { kind: "assistant"; seat: Assistant };

type RowAction = {
  /** Removes the seat, or allows or withdraws an assistant's export of the transactions. */
  kind: "remove" | "export";
  target: Seat;
  icon: IconName;
  label: string;
  /** Waiting for the relays: a spinner in its place. */
  busy: boolean;
  testID: string;
};

/**
 * "Integrations" (docs/integrations.md; built as "Employees"). The account's integrations, each
 * with the date it was created; creating one picks its shop or its language first
 * (NewIntegrationSheet), then gives its secret key, which its integrator keeps on the shop's server
 * (never the business's Lightning address: the server reads it from the integration's channel). The
 * key shows that once (never again, not even with the passkey; createIntegration): a row only
 * removes its integration, after a confirmation. Owner only, the account open (the passkey).
 *
 * The account's AI assistants are listed with them: a seat holding a key the owner gave, created
 * from "New integration" ("AI assistant"), removed the same way (removeAssistant: its invoices stay
 * payable, nothing waits). Integrations and assistants in one list, the latest created first.
 */
export function IntegrationsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const settings = useAccountSettings();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<Seat | null>(null);
  /** An assistant whose export of the transactions the owner allows or withdraws (export-grants.ts). */
  const [granting, setGranting] = useState<{ seat: Assistant; allow: boolean } | null>(null);
  /**
   * An integration whose removal waits for its payments (integration-pending.ts): what is pending,
   * null when that could not be told.
   */
  const [pending, setPending] = useState<{
    integration: Integration;
    pending: IntegrationPending | null;
  } | null>(null);
  /** The integrations whose removal runs. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  /** The roster's integrations (loadIntegrations), null until read. */
  const [view, setView] = useState<IntegrationsView | null>(null);
  /** The roster's assistants (loadAssistants), null until read. */
  const [assistantsView, setAssistantsView] = useState<AssistantsView | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const loads = useRef(0);
  const integrations = view?.integrations ?? [];
  const assistants = assistantsView?.assistants ?? [];
  const business = settings?.businessName ?? "";

  const reload = useCallback(() => {
    const load = ++loads.current;
    // One roster holds both (two reads of it): shown together once both came.
    Promise.all([loadIntegrations(), loadAssistants()]).then(
      ([next, nextAssistants]) => {
        if (load !== loads.current) return;
        setView(next);
        setAssistantsView(nextAssistants);
        setLoadFailure(null);
      },
      (error: unknown) => {
        if (load === loads.current) setLoadFailure(codeOf(error, "unreachable"));
      }
    );
  }, []);
  useFocusEffect(reload);

  const mark = (id: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const fail = (code: Failure, key = "integrations") =>
    notify({
      tone: "error",
      title: t(
        code === "unreachable" || code === "removeUnreachable" || code === "removalUnsaved"
          ? "integrations.unreachableTitle"
          : "integrations.failedTitle"
      ),
      body: t(`integrations.errors.${code}`, { max: MAX_INTEGRATIONS }),
      key
    });

  const created = (target: Seat) => {
    const date = formatDate(new Date(target.seat.createdAt * 1000), languageTag, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    if (target.kind === "integration") return t("integrations.created", { date });
    const exporting = assistantsView?.exports[target.seat.id] === "allowed";
    // One created without invoices says so, whatever is read.
    if (target.seat.invoicing === false) {
      return exporting
        ? t("integrations.assistant.createdExportOnly", { date })
        : t("integrations.assistant.createdNoInvoices", { date });
    }
    return exporting
      ? t("integrations.assistant.createdExporting", { date })
      : t("integrations.assistant.created", { date });
  };

  /**
   * Removes `target`; an integration all the same with `force`, its payments not final (or not
   * told) once confirmed again in PendingSheet (removeIntegration). Its confirmation dialog, when
   * that is where it was confirmed, shows until the outcome (closed at once, nothing would show
   * while the relays answer), then closes.
   */
  const remove = (target: Seat, force = false) => {
    const { seat } = target;
    const assistant = target.kind === "assistant";
    const key = `integrations-remove-${seat.id}`;
    const settled = () => {
      mark(seat.id, false);
      setConfirming((current) => (current?.seat.id === seat.id ? null : current));
    };
    mark(seat.id, true);
    // An assistant's invoices stay payable until their due date, its links settled by the owner
    // (removeAssistant): nothing waits.
    const removal =
      target.kind === "assistant"
        ? removeAssistant(target.seat)
        : removeIntegration(target.seat, { force });
    removal.then(
      () => {
        // Its channel, then its record, on a majority of the relays: the row leaves.
        settled();
        setPending(null);
        notify({
          tone: "success",
          title: t(
            assistant
              ? "integrations.assistant.removeDialog.doneTitle"
              : "integrations.removeDialog.doneTitle"
          ),
          body: t(
            assistant
              ? "integrations.assistant.removeDialog.doneBody"
              : "integrations.removeDialog.doneBody",
            { name: seat.name }
          ),
          key
        });
        reload();
      },
      (error: unknown) => {
        settled();
        // A payment of it not final yet, or not told: not removed; what is pending, to try again
        // once it is final, or to remove it all the same.
        if (
          target.kind === "integration" &&
          error instanceof TeamError &&
          error.code === "integrationPending"
        ) {
          setPending({ integration: target.seat, pending: error.pending });
          return;
        }
        setPending(null);
        const code = codeOf(error, "removeFailed");
        fail(code === "unreachable" ? "removeUnreachable" : code, key);
        reload();
      }
    );
  };

  /** Whether the removal the dialog confirms runs: a spinner in its confirm button. */
  const removing = confirming !== null && busy.has(confirming.seat.id);
  const confirmRemoval = () => {
    if (confirming && !removing) remove(confirming);
  };

  /**
   * Allows or withdraws an assistant's export (setAssistantExport): its decision, then its keys, on
   * a majority of the relays; the row shows it once read again. Its confirmation dialog shows until
   * the outcome (as a removal's), then closes.
   */
  const grant = (seat: Assistant, allow: boolean) => {
    const key = `integrations-export-${seat.id}`;
    const settled = () => {
      mark(`export-${seat.id}`, false);
      setGranting((current) => (current?.seat.id === seat.id ? null : current));
    };
    mark(`export-${seat.id}`, true);
    setAssistantExport(seat, allow).then(
      () => {
        settled();
        notify({
          tone: "success",
          title: t(
            allow
              ? "integrations.assistant.export.allowedTitle"
              : "integrations.assistant.export.withdrawnTitle"
          ),
          body: t(
            allow
              ? "integrations.assistant.export.allowedBody"
              : "integrations.assistant.export.withdrawnBody",
            { name: seat.name }
          ),
          key
        });
        reload();
      },
      (error: unknown) => {
        settled();
        const code = codeOf(error, "unreachable");
        notify({
          tone: "error",
          title: t(
            code === "unreachable" ? "integrations.unreachableTitle" : "integrations.failedTitle"
          ),
          body: t(
            code === "unreachable"
              ? "integrations.assistant.export.unreachable"
              : `integrations.errors.${code}`,
            { max: MAX_INTEGRATIONS }
          ),
          key
        });
        reload();
      }
    );
  };

  /** Whether the export the dialog confirms is being written: a spinner in its confirm button. */
  const grantWorking = granting !== null && busy.has(`export-${granting.seat.id}`);
  const confirmGrant = () => {
    if (granting && !grantWorking) grant(granting.seat, granting.allow);
  };

  /**
   * An assistant's export, once its grant was read (allowed or not): offered to allow or to
   * withdraw. Not read, or written by a newer app: not offered (the row's notices say why). Never
   * offered to allow while exportGrantsSuspended.
   */
  const exportAction = (target: Seat): RowAction[] => {
    if (target.kind !== "assistant") return [];
    const status = assistantsView?.exports[target.seat.id];
    if (status !== "allowed" && status !== "notAllowed") return [];
    if (status === "notAllowed" && exportGrantsSuspended()) return [];
    return [
      {
        kind: "export",
        target,
        icon: "file-export",
        label: t(
          status === "allowed"
            ? "integrations.assistant.export.withdraw"
            : "integrations.assistant.export.allow"
        ),
        busy: busy.has(`export-${target.seat.id}`),
        testID: `export-${target.seat.id}`
      }
    ];
  };

  const rowActions = (target: Seat): RowAction[] => [
    ...exportAction(target),
    {
      kind: "remove",
      target,
      icon: "trash-can",
      label: t(
        target.kind === "assistant"
          ? "integrations.assistant.remove"
          : "integrations.actions.remove"
      ),
      busy: busy.has(target.seat.id),
      testID: `remove-${target.seat.id}`
    }
  ];

  const act = (action: RowAction) => {
    if (action.kind === "export" && action.target.kind === "assistant") {
      setGranting({
        seat: action.target.seat,
        allow: assistantsView?.exports[action.target.seat.id] !== "allowed"
      });
      return;
    }
    setConfirming(action.target);
  };

  const notices = (
    <>
      {loadFailure ? (
        <ErrorMessage testID="integrations-failure">
          {t(`integrations.errors.${loadFailure}`, { max: MAX_INTEGRATIONS })}
        </ErrorMessage>
      ) : null}
      {/* The roster not read: what this device knew, never an empty list (owner.ts). */}
      {view?.roster === "unread" || assistantsView?.roster === "unread" ? (
        <ErrorMessage testID="integrations-offline">{t("integrations.offline")}</ErrorMessage>
      ) : view?.roster === "partial" || assistantsView?.roster === "partial" ? (
        <ErrorMessage testID="integrations-partial">{t("integrations.partial")}</ErrorMessage>
      ) : null}
      {view?.newer || assistantsView?.newer ? (
        <ErrorMessage>{t("integrations.newer")}</ErrorMessage>
      ) : null}
    </>
  );
  // Its loading scene (useLoadingScene): it fades out once read, then the list fades in.
  const waitScene = useLoadingScene(
    view === null && !loadFailure
      ? { scene: "integrations", label: t("integrations.loading"), testID: "integrations-loading" }
      : null
  );
  const waited = waitScene.waited;
  // Not read yet, or its scene fading out: the list waits.
  const unread = view === null || waitScene.scene !== null;
  const empty = waitScene.scene ? (
    <View style={styles.loading}>
      <LoadingScene {...waitScene.scene} />
    </View>
  ) : view === null ? null : integrations.length === 0 &&
    assistants.length === 0 &&
    view.roster !== "unread" ? (
    <IntegrationsGuide desktop={desktop} />
  ) : null;
  // One list, the latest created first (the roster gives each kind oldest first): a stable sort,
  // seats created in the same second keep the roster's order.
  const seats: Seat[] = [
    ...integrations.map((seat): Seat => ({ kind: "integration", seat })),
    ...assistants.map((seat): Seat => ({ kind: "assistant", seat }))
  ].sort((a, b) => b.seat.createdAt - a.seat.createdAt);
  const rows = seats.map((target) => ({
    id: target.seat.id,
    target,
    createdAt: target.seat.createdAt,
    detail: created(target),
    actions: rowActions(target)
  }));
  const openCreate = () => setCreating(true);

  return (
    <>
      {desktop ? (
        <DesktopLayout
          title={t("navigation.destinations.integrations")}
          createLabel={t("integrations.create")}
          onCreate={openCreate}
          notices={notices}
          empty={empty}
          loading={unread}
          arrival={waited}
          rows={rows}
          onAction={act}
          languageTag={languageTag}
        />
      ) : (
        // The list runs under "Create an integration" and the dock, both floating over it.
        <PosFrame title={t("navigation.destinations.integrations")} flush="mobile">
          <DockScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              waitScene.scene !== null && styles.scrollLoading
            ]}
            showsVerticalScrollIndicator={false}
            testID="integrations"
          >
            {notices}
            {unread ? (
              empty
            ) : (
              <Arrival fade={waited} style={styles.arrival}>
                {empty}
                {rows.length > 0 ? (
                  <View style={styles.card}>
                    {rows.map((row, index) => (
                      <View
                        key={row.id}
                        style={[styles.row, index < rows.length - 1 && styles.rowSeparated]}
                        testID={`integration-${row.id}`}
                      >
                        <SeatAvatar size={40} target={row.target} />
                        <View style={styles.rowTexts}>
                          <Text numberOfLines={1} style={styles.name}>
                            {row.target.seat.name}
                          </Text>
                          <Text numberOfLines={1} style={styles.detail}>
                            {row.detail}
                          </Text>
                        </View>
                        <Actions actions={row.actions} onAction={act} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </Arrival>
            )}
          </DockScrollView>
          <DockActions style={styles.mobileAction}>
            <Button icon="plus" onPress={openCreate} testID="create-integration">
              {t("integrations.create")}
            </Button>
          </DockActions>
        </PosFrame>
      )}
      <NewIntegrationSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
      />
      <ConfirmDialog
        visible={confirming !== null}
        title={
          confirming
            ? t(
                confirming.kind === "assistant"
                  ? "integrations.assistant.removeDialog.title"
                  : "integrations.removeDialog.title",
                { name: confirming.seat.name }
              )
            : ""
        }
        body={
          confirming
            ? t(
                confirming.kind === "assistant"
                  ? "integrations.assistant.removeDialog.body"
                  : "integrations.removeDialog.body",
                { name: confirming.seat.name, business }
              )
            : ""
        }
        confirmLabel={t(
          confirming?.kind === "assistant"
            ? "integrations.assistant.removeDialog.confirm"
            : "integrations.removeDialog.confirm"
        )}
        cancelLabel={t("common.back")}
        onConfirm={confirmRemoval}
        working={removing}
        onCancel={() => setConfirming(null)}
        testID="remove-integration"
        confirmTestID="confirm-remove-integration"
      />
      {/*
       * The export of the transactions an assistant may do, confirmed as a removal is, since it
       * gives the assistant what the business sold.
       */}
      <ConfirmDialog
        visible={granting !== null}
        title={
          granting
            ? t(
                granting.allow
                  ? "integrations.assistant.export.allowDialog.title"
                  : "integrations.assistant.export.withdrawDialog.title",
                { name: granting.seat.name }
              )
            : ""
        }
        body={
          granting
            ? t(
                granting.allow
                  ? "integrations.assistant.export.allowDialog.body"
                  : "integrations.assistant.export.withdrawDialog.body",
                { name: granting.seat.name, business }
              )
            : ""
        }
        confirmLabel={t(
          granting?.allow
            ? "integrations.assistant.export.allowDialog.confirm"
            : "integrations.assistant.export.withdrawDialog.confirm"
        )}
        tone={granting?.allow ? "primary" : "destructive"}
        cancelLabel={t("common.back")}
        onConfirm={confirmGrant}
        working={grantWorking}
        onCancel={() => setGranting(null)}
        testID="assistant-export"
        confirmTestID="confirm-assistant-export"
      />
      <PendingSheet
        shown={pending}
        checking={pending !== null && busy.has(pending.integration.id)}
        onRetry={() => {
          if (pending) remove({ kind: "integration", seat: pending.integration });
        }}
        onForce={() => {
          if (pending) remove({ kind: "integration", seat: pending.integration }, true);
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}

/**
 * A seat's avatar: an integration's platform, or the assistant's icon on the developers' tile of
 * "New integration".
 */
function SeatAvatar({ size, target }: { size: number; target: Seat }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (target.kind === "integration") {
    return <IntegrationAvatar size={size} platform={target.seat.platform} />;
  }
  return (
    <View
      style={[styles.assistantAvatar, { width: size, height: size, borderRadius: size / 2 }]}
      testID={`assistant-avatar-${target.seat.id}`}
    >
      <Icon name="wand-magic-sparkles" size={size * 0.4} color={colors.text.primary} />
    </View>
  );
}

function Actions({
  actions,
  onAction
}: {
  actions: RowAction[];
  onAction: (action: RowAction) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.actions}>
      {actions.map((action) =>
        action.busy ? (
          <View key={action.testID} style={styles.actionBusy} testID={`${action.testID}-busy`}>
            <Spinner size={18} />
          </View>
        ) : (
          <IconButton
            key={action.testID}
            icon={action.icon}
            label={action.label}
            size={16}
            onPress={() => onAction(action)}
            testID={action.testID}
          />
        )
      )}
    </View>
  );
}

type DesktopRowData = {
  id: string;
  target: Seat;
  /** Unix seconds. */
  createdAt: number;
  detail: string;
  actions: RowAction[];
};

/**
 * The table's columns as its header sorts and filters them (useTableView), as "Employees": "Name"
 * its name alone; "Created" by the date, its values the periods (today, yesterday, this week…:
 * src/lib/date-periods.ts), the most recent first.
 */
function tableColumns(
  labels: { name: string; date: string },
  periodLabel: (period: DatePeriod) => string
): ViewColumn<DesktopRowData>[] {
  return [
    { id: "name", label: labels.name },
    {
      id: "date",
      label: labels.date,
      sort: { kind: "date", key: (row) => row.createdAt },
      value: (row) => {
        // Read when asked (filtering, its menu): "Today" never stays past midnight.
        const period = datePeriodOf(row.createdAt, new Date());
        return { key: period, label: periodLabel(period) };
      },
      valuesOrder: "descending"
    }
  ];
}

/**
 * Without an integration (the roster read): what one does, in three steps, "Create an integration"
 * under it on a phone, in the header on a desktop.
 */
function IntegrationsGuide({ desktop }: { desktop: boolean }) {
  const { t } = useTranslation();
  return (
    <ListGuide
      title={t("integrations.guide.title")}
      lead={t("integrations.guide.lead")}
      steps={[
        guideStep(t, "integrations.guide.create", IntegrationCreateArt),
        guideStep(t, "integrations.guide.key", IntegrationKeyArt),
        guideStep(t, "integrations.guide.pay", IntegrationPayArt)
      ]}
      desktop={desktop}
      testID="integrations-empty"
    />
  );
}

/** Desktop: the header of the wallet's screen, then a table in a white card, as "Employees". */
function DesktopLayout({
  title,
  createLabel,
  onCreate,
  notices,
  empty,
  loading,
  arrival,
  rows,
  onAction,
  languageTag
}: {
  title: string;
  createLabel: string;
  onCreate: () => void;
  notices: ReactNode;
  /** The loading scene while `loading`, then the guide without an integration. */
  empty: ReactNode;
  loading: boolean;
  /** Its loading scene shown: the table fades in (Arrival.tsx). */
  arrival: boolean;
  rows: DesktopRowData[];
  onAction: (action: RowAction) => void;
  languageTag: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sortable = tableColumns(
    { name: t("integrations.columns.name"), date: t("integrations.columns.date") },
    usePeriodLabel(languageTag)
  );
  const table = useTableView(rows, sortable, languageTag);
  const widths = { name: styles.nameCell, date: { width: COLUMNS.date } };
  const shown = table.rows.filter(table.shown);
  return (
    <View style={[styles.desktop, { paddingTop: insets.top }]}>
      <View style={styles.desktopHeader}>
        <Text accessibilityRole="header" style={styles.desktopTitle}>
          {title}
        </Text>
        <Button
          variant="primary"
          size="md"
          icon="plus"
          fullWidth={false}
          style={styles.desktopCreate}
          onPress={onCreate}
          testID="create-integration"
        >
          {createLabel}
        </Button>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.desktopBody,
          loading && styles.scrollLoading,
          { paddingBottom: Math.max(insets.bottom, 22) }
        ]}
        testID="integrations"
      >
        {notices}
        {loading ? (
          empty
        ) : (
          <Arrival fade={arrival} style={styles.arrival}>
            {empty}
            {rows.length > 0 ? (
              <TableCard
                endInset={space[6]}
                head={
                  <>
                    {sortable.map((column) => (
                      <ColumnHeader
                        key={column.id}
                        control={table.header(column)}
                        style={widths[column.id as keyof typeof widths]}
                        testID={`integrations-column-${column.id}`}
                      />
                    ))}
                    <View style={{ width: COLUMNS.actions }} />
                  </>
                }
              >
                {shown.length === 0 && table.filtering ? (
                  <TableNoMatch
                    message={t("integrations.noMatch")}
                    onClear={table.clearFilters}
                    testID="integrations-no-match"
                    clearTestID="integrations-clear-filters"
                  />
                ) : null}
                {shown.map((row) => (
                  // Not a button: its actions are its own.
                  <TableRow key={row.id} height={64} testID={`integration-${row.id}`}>
                    <View style={[styles.nameCell, styles.desktopName]}>
                      <SeatAvatar size={36} target={row.target} />
                      <Text numberOfLines={1} style={styles.desktopNameText}>
                        {row.target.seat.name}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.desktopDate, { width: COLUMNS.date }]}>
                      {row.detail}
                    </Text>
                    <View style={[styles.desktopActions, { width: COLUMNS.actions }]}>
                      <Actions actions={row.actions} onAction={onAction} />
                    </View>
                  </TableRow>
                ))}
              </TableCard>
            ) : null}
          </Arrival>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * The removal of an integration waits (blocked, tried again later): an order whose address is still
 * leased (open, or underpaid within its time), a payment being confirmed (integration-pending.ts),
 * or what could not be told. What is pending, and "Try again" once it is final; or "Remove anyway",
 * confirmed by this sheet as the second confirmation of the removal: what holds it back are the
 * integration's own records, which a key that leaked writes too (removeIntegration's `force`).
 * Built on "New integration"'s sheet.
 */
function PendingSheet({
  shown,
  checking,
  onRetry,
  onForce,
  onClose
}: {
  shown: { integration: Integration; pending: IntegrationPending | null } | null;
  /** The check runs again, or the removal: "Try again" waits, "Remove anyway" too. */
  checking: boolean;
  onRetry: () => void;
  /** Removes the integration all the same (removeIntegration's `force`). */
  onForce: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const name = shown?.integration.name ?? "";
  const pending = shown?.pending;
  // Not told (the relays, the explorer, a record of a newer format): never said to be pending.
  const unknown = shown !== null && shown.pending === null;
  const lines = [
    pending && pending.open > 0
      ? t("integrations.pendingDialog.open", {
          count: pending.open,
          time:
            pending.openUntil === null
              ? ""
              : formatDate(new Date(pending.openUntil * 1000), languageTag, {
                  hour: "2-digit",
                  minute: "2-digit"
                })
        })
      : null,
    pending && pending.confirming > 0
      ? t("integrations.pendingDialog.confirming", { count: pending.confirming })
      : null
  ].filter((line): line is string => line !== null);
  const retryButton = (
    <Button
      size={desktop ? "sm" : "lg"}
      fullWidth={!desktop}
      onPress={onRetry}
      loading={checking}
      style={desktop ? styles.dialogCreate : undefined}
      testID="integration-pending-retry"
    >
      {t("integrations.pendingDialog.retry")}
    </Button>
  );
  const forceButton = (
    <Button
      variant="destructive"
      size={desktop ? "sm" : "md"}
      fullWidth={!desktop}
      onPress={onForce}
      disabled={checking}
      testID="integration-pending-force"
    >
      {t("integrations.pendingDialog.force")}
    </Button>
  );
  return (
    <Sheet
      title={t(
        unknown ? "integrations.pendingDialog.unknownTitle" : "integrations.pendingDialog.title",
        { name }
      )}
      closeLabel={t("navigation.close")}
      visible={shown !== null}
      onClose={onClose}
      dialogWidth={520}
      testID="integration-pending-sheet"
    >
      <Text style={styles.sheetText}>
        {t(unknown ? "integrations.pendingDialog.unknownLead" : "integrations.pendingDialog.lead", {
          name
        })}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={styles.sheetText} testID="integration-pending-line">
          {line}
        </Text>
      ))}
      <Text style={styles.sheetText}>{t("integrations.pendingDialog.end")}</Text>
      <Text style={styles.sheetText}>{t("integrations.pendingDialog.forceNote", { name })}</Text>
      {desktop ? (
        <View style={styles.dialogButtons}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={onClose}
            style={styles.dialogCancel}
          >
            {t("integrations.pendingDialog.close")}
          </Button>
          {forceButton}
          {retryButton}
        </View>
      ) : (
        <>
          {retryButton}
          {forceButton}
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1, alignSelf: "stretch" },
  scrollContent: {
    gap: space[5],
    paddingTop: space[3],
    paddingHorizontal: gutter,
    paddingBottom: space[5]
  },
  // The loading scene, in the middle of the page under its header: the scroll fills the page
  // while it shows (scrollLoading), the scene its rest.
  scrollLoading: { flexGrow: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  // The list, once read: its parts as far apart as in the scroll that holds them.
  arrival: { gap: space[5] },
  mobileAction: { paddingTop: 14, paddingHorizontal: gutter },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingLeft: cardInset,
    paddingRight: space[2]
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[5], height: 62 },
  rowSeparated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rowTexts: { flex: 1, minWidth: 0, gap: space[1] },
  name: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  detail: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  actions: { flexDirection: "row", flexShrink: 0 },
  assistantAvatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  },
  actionBusy: {
    width: control.min,
    height: control.min,
    alignItems: "center",
    justifyContent: "center"
  },

  // Desktop, as "Employees" (the header of the wallet's screen).
  desktop: { flex: 1, backgroundColor: colors.background.app },
  desktopHeader: {
    height: 108,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 22,
    paddingTop: 30,
    paddingHorizontal: 38,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  desktopTitle: {
    ...sans(700),
    fontSize: 26,
    letterSpacing: tracking(TITLE_EM, 26),
    color: colors.text.primary
  },
  desktopCreate: { minWidth: 236 },
  desktopBody: { paddingTop: space[9], paddingHorizontal: 38, gap: space[5] },
  nameCell: { flex: 1, minWidth: 0 },
  desktopName: { flexDirection: "row", alignItems: "center", gap: space[5] },
  desktopNameText: {
    ...sans(600),
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    color: colors.text.primary
  },
  desktopDate: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  desktopActions: { flexDirection: "row", justifyContent: "flex-end" },

  // Sheets.
  sheetText: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  // The buttons' widths at least: a longer label widens its button, a row too long wraps.
  dialogButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4
  },
  dialogCancel: { minWidth: 120 },
  dialogCreate: { minWidth: 180 }
}));
