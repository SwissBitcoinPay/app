import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type TextStyle
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TeamActivateArt, TeamInviteArt, TeamSellsArt } from "@/components/illustrations/team";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Avatar, initialsOf } from "@/components/ui/Avatar";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { ColumnHeader } from "@/components/ui/ColumnHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Callout } from "@/components/ui/Callout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { QrPlate } from "@/components/ui/QrPlate";
import { SHEET_GAP, Sheet } from "@/components/ui/Sheet";
import { LoadingScene, useLoadingScene } from "@/components/ui/LoadingScene";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill, StatusPillBox } from "@/components/ui/StatusPill";
import { TableCard, TableRow } from "@/components/ui/TableCard";
import { TableNoMatch } from "@/components/ui/TableNoMatch";
import { TextField } from "@/components/ui/TextField";
import { useTableView, type ViewColumn } from "@/components/ui/useTableView";
import { getAccountSettings } from "@/features/account/session";
import { guideStep, ListGuide } from "@/features/empty-states/guide";
import { useImageUri } from "@/features/media/images";
import { DockActions, DockScrollView } from "@/features/navigation/dock-area";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import type { OwnerFinalJob } from "@/features/payment-link/owner-finals";
import { SaleSettler, type SettleResult } from "@/features/payment-link/SaleSettler";
import { PosFrame } from "@/features/terminal/PosFrame";
import type { Settlement } from "@/features/terminal/useSale";
import { usePeriodLabel } from "@/features/table/period-label";
import { getInviteOrigin, MEMBER_NAME_MAX_LENGTH } from "@/config/team";
import { formatDate } from "@/lib/locale/date";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import { canShareUrl, shareUrl } from "@/lib/payment-link/device";
import { copySecret } from "@/lib/secret-clipboard";
import type { ImageRef } from "@/lib/media/image";
import type { MemberDevice } from "@/lib/team/member-records";
import type { TeamMember } from "@/lib/team/roster";
import { datePeriodOf, type DatePeriod } from "@/lib/date-periods";
import {
  cardInset,
  control,
  gutter,
  makeStyles,
  mono,
  type PaymentState,
  proseLineHeight,
  radius,
  sans,
  space,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import {
  TeamError,
  inviteEmployee,
  loadTeam,
  removeEmployee,
  showInvite,
  type MemberStatus,
  type MemberView,
  type ShownInvite,
  type TeamErrorCode,
  type TeamView
} from "./owner";
import type { SettleSales } from "./cancel-links";
import { syncEmployeeAddresses } from "./owner-addresses";
import type { Unsettled } from "./unsettled";

/** Desktop table: Status, Date and the actions have fixed widths, the name the rest. */
const COLUMNS = { state: 160, date: 260, actions: 100 } as const;

const PILL_STATE: Record<MemberStatus, PaymentState> = {
  invited: "draft",
  joined: "settled",
  left: "expired",
  expired: "expired"
};

/**
 * The glyph of the platform an employee's device joined on (its device record), beside its row's
 * date (the owner sees where each employee's access is, and can tell a device
 * that is not the employee's). An icon: the row's sentence has no room for a
 * word more on a phone; screen readers read the platform with the sentence (team.platform).
 */
const PLATFORM_ICON: Record<MemberDevice["platform"], IconName> = {
  ios: "apple",
  android: "android",
  web: "globe"
};

/** An invitation not used yet, or ended unused: the dashed avatar, among the invitations. */
const isInvitation = ({ status }: MemberView) => status === "invited" || status === "expired";

/**
 * What a failed action says: a TeamError's code, or the action's own failure (`otherwise`), or a
 * removal the relays did not take (`removeUnreachable`).
 */
type Failure = TeamErrorCode | "removeFailed" | "removeUnreachable";

function codeOf(error: unknown, otherwise: Failure = "unreachable"): Failure {
  if (error instanceof TeamError) return error.code;
  logFailure("Team action failed", error);
  return otherwise;
}

export { initialsOf };

/**
 * What a removal asks to confirm, its dialog's texts (`team.<kind>Dialog`): an employee's access, an
 * employee who left on its own ("Leave the business": it has no access left to remove, only its
 * row of the list), or an invitation not used; then, when its sales are not final yet, canceling
 * them (a second confirmation, `removal` the one asked first).
 */
type Removal = "remove" | "removeLeft" | "deleteInvite";
type Confirming =
  | { member: TeamMember; kind: Removal; leftAt: number | null }
  | {
      member: TeamMember;
      kind: "cancelSales";
      /** Null: the relays could not tell (removeEmployee asks all the same, never held back). */
      unsettled: Unsettled | null;
      removal: Removal;
    };
/** The label of a row's trash (`team.actions.<…>`), for screen readers and the pointer's tip. */
const REMOVAL_ACTION = {
  remove: "removeAccess",
  removeLeft: "removeLeft",
  deleteInvite: "deleteInvite"
} as const satisfies Record<Removal, string>;

/** The sales followed for a removal, and what to do with what was found. */
type Settling = {
  id: number;
  jobs: readonly OwnerFinalJob[];
  done: (settlements: (Settlement | null)[]) => void;
};

/**
 * Follows the sales of `jobs` at once, out of sight (SaleSettler, up to a minute each), and calls
 * `onDone` once with each one's settlement, in their order, or null for a sale not settled in time
 * (also for those still followed when this unmounts: the removal never waits for nothing).
 */
function SalesSettlers({
  jobs,
  onDone
}: {
  jobs: readonly OwnerFinalJob[];
  onDone: (settlements: (Settlement | null)[]) => void;
}) {
  const found = useRef<(Settlement | null | undefined)[]>(jobs.map(() => undefined));
  const finished = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });
  useEffect(
    () => () => {
      if (finished.current) return;
      finished.current = true;
      finish.current(found.current.map((settlement) => settlement ?? null));
    },
    []
  );
  const report = (index: number, result: SettleResult) => {
    if (finished.current) return;
    found.current[index] = result.kind === "settled" ? result.settlement : null;
    if (found.current.every((settlement) => settlement !== undefined)) {
      finished.current = true;
      finish.current(found.current.map((settlement) => settlement ?? null));
    }
  };
  return (
    <>
      {jobs.map((job, index) => (
        <SaleSettler
          key={job.id}
          sale={job.sale}
          saleKey={job.saleKey}
          relays={job.relays}
          tolerance={job.tolerance}
          onDone={(result) => report(index, result)}
        />
      ))}
    </>
  );
}

/**
 * "Employees" (on desktop, its table in a white card like the wallet's movements). The pending
 * invitations, then the employees; inviting asks for a
 * name only, then shows the link and its QR code; the trash of a row asks to confirm. Owner only:
 * the account is open (the passkey), employees' devices have no such screen. An invitation that
 * ended unused stays among the invitations, its share action makes a new one; an employee who
 * left ("Leave the business") stays among
 * the employees, after those still there, with the date it left; a removed
 * employee is no longer listed. In each group, the latest date shown first.
 */
export function EmployeesScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const [view, setView] = useState<TeamView | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [inviting, setInviting] = useState(false);
  const [shown, setShown] = useState<ShownInvite | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  /**
   * The removal confirmed runs: a spinner in its confirm button, the dialog shown until its
   * outcome (closed at once, nothing would show while the relays answer).
   */
  const [removing, setRemoving] = useState(false);
  /**
   * The sales of employees' paid links followed while they are removed (cancel-links.ts): one entry
   * per removal, two removals confirmed one after the other each following their own.
   */
  const [settling, setSettling] = useState<Settling[]>([]);
  const settlings = useRef(0);
  /** The member whose invitation is being published again, or renewed. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const loads = useRef(0);
  const business = getAccountSettings()?.businessName ?? "";
  const noWebApp = getInviteOrigin() === null;

  const reload = useCallback(() => {
    const load = ++loads.current;
    loadTeam().then(
      (next) => {
        if (load !== loads.current) return;
        setView(next);
        setLoadFailure(null);
      },
      (error: unknown) => {
        if (load === loads.current) setLoadFailure(codeOf(error));
      }
    );
  }, []);
  useFocusEffect(reload);

  const fail = (code: Failure, key = "team") =>
    notify({
      tone: "error",
      title: t(
        code === "unreachable" ||
          code === "unpublished" ||
          code === "removeUnreachable" ||
          code === "removalUnsaved"
          ? "team.unreachableTitle"
          : "team.failedTitle"
      ),
      body: t(`team.errors.${code}`),
      key
    });

  /** When an employee who left did, from its device record. */
  const leftAt = ({ member, device }: Pick<MemberView, "member" | "device">) =>
    device?.leftAt ?? member.invitedAt;

  const date = (unix: number) =>
    formatDate(new Date(unix * 1000), languageTag, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

  /** The date a row tells: its invitation's, its arrival, its departure, or its link's end. */
  const shownDate = ({ member, status, device, expiresAt }: MemberView): number => {
    switch (status) {
      case "invited":
        return member.invitedAt;
      case "joined":
        return device?.joinedAt ?? member.invitedAt;
      case "left":
        return leftAt({ member, device });
      case "expired":
        return expiresAt;
    }
  };

  const detail = (row: MemberView) =>
    t(`team.detail.${row.status}`, { date: date(shownDate(row)) });

  /** The platform of the device an employee joined on (and left from), when the relays told it. */
  const platformOf = ({ status, device }: MemberView): MemberDevice["platform"] | null =>
    (status === "joined" || status === "left") && device ? device.platform : null;

  /** What screen readers say of a row's date: its sentence, with its device's platform. */
  const detailLabel = (row: MemberView) => {
    const platform = platformOf(row);
    return platform
      ? t("team.detailWithPlatform", {
          detail: detail(row),
          platform: t(`team.platform.${platform}`)
        })
      : detail(row);
  };

  /** The link and QR code of a pending invitation; an expired one is replaced by a new one. */
  const share = (row: MemberView) => {
    if (pendingId !== null) return;
    setPendingId(row.member.id);
    const run =
      row.status === "expired"
        ? removeEmployee(row.member).then(() => inviteEmployee(row.member.name))
        : showInvite(row.member.id);
    run.then(
      (invite) => {
        setPendingId(null);
        setShown(invite);
        reload();
        // A new invitation, or one whose lot a filling may have missed (offline, the wallet busy).
        void syncEmployeeAddresses({ again: true });
      },
      (error: unknown) => {
        setPendingId(null);
        fail(codeOf(error));
        reload();
      }
    );
  };

  /**
   * Runs the removal `confirming` asks, its dialog shown with a spinner until its outcome: closed
   * then, or showing the second confirmation when its sales are not final.
   */
  const confirmRemoval = () => {
    const target = confirming;
    if (!target || removing) return;
    setRemoving(true);
    const cancelOpen = target.kind === "cancelSales";
    // Its own words: an employee's access, an employee who left (its row only), an invitation.
    const removal: Removal = target.kind === "cancelSales" ? target.removal : target.kind;
    const dialog = `${removal}Dialog` as const;
    const { name, id } = target.member;
    // One notification per member: a removal may run beside another one (an expired invitation
    // renewed, `share`), and the outcome of one must not replace another's in place (a failure
    // would go unseen).
    const key = `team-remove-${id}`;
    // Canceling asks the relays, the LNURL server and the explorer about each link: it takes a
    // while (up to REMOVAL_READ_MS and REMOVAL_CANCEL_MS), said over the dialog until it ends (its
    // outcome replaces it, same key).
    if (cancelOpen) {
      notify({
        tone: "info",
        title: t("team.cancelSalesDialog.progress", { name }),
        key,
        duration: null
      });
    }
    // Its links that received a payment: their sales followed here (SaleSettler), to be finalized.
    const settle: SettleSales = (jobs) =>
      new Promise((resolve) => {
        const entry = ++settlings.current;
        setSettling((current) => [...current, { id: entry, jobs, done: resolve }]);
      });
    removeEmployee(target.member, { cancelOpen, settle }).then(
      (outcome) => {
        setRemoving(false);
        setConfirming(null);
        // Its channel, then its record, on a majority of the relays (removeEmployee); with what
        // could not be canceled of its links, which stay payable until they end.
        notify({
          tone: "success",
          title: t(`team.${dialog}.doneTitle`),
          body:
            outcome === "linksLeft"
              ? t("team.cancelSalesDialog.linksLeft", { name, business })
              : t(`team.${dialog}.doneBody`, { name, business }),
          key
        });
        reload();
      },
      (error: unknown) => {
        setRemoving(false);
        // Sales not final yet, or not told: removing all the same cancels them, once confirmed
        // again, in the same dialog (its texts change in place).
        if (!cancelOpen && error instanceof TeamError && error.code === "salesInProgress") {
          setConfirming({
            member: target.member,
            kind: "cancelSales",
            unsettled: error.unsettled,
            removal
          });
          reload();
          return;
        }
        // Nothing deleted (removeEmployee): the account's relays out of reach, or the removal not
        // recorded.
        setConfirming(null);
        const code = codeOf(error, "removeFailed");
        fail(code === "unreachable" ? "removeUnreachable" : code, key);
        reload();
      }
    );
  };

  /**
   * The second confirmation's body: what is not final (all of it when the relays could not tell),
   * what canceling does.
   */
  const cancelSalesBody = (name: string, unsettled: Unsettled | null) =>
    [
      t(unsettled === null ? "team.cancelSalesDialog.unknownLead" : "team.cancelSalesDialog.lead", {
        name
      }),
      unsettled === null || unsettled.links > 0 ? t("team.cancelSalesDialog.links") : null,
      // Its invoices shown at a point of sale: its device stops showing them once it receives its
      // removal (useMembershipWatch, at once while an invoice shows).
      unsettled === null || unsettled.invoices > 0 ? t("team.cancelSalesDialog.invoices") : null,
      t("team.cancelSalesDialog.end", { name })
    ]
      .filter((sentence) => sentence !== null)
      .join(" ");

  const members = view?.members ?? [];
  /**
   * Each group the latest date its rows tell first (`shownDate`: an arrival, a departure, an
   * invitation's link or its end); a stable sort, rows of the same second keep loadTeam's order.
   */
  const latestFirst = (rows: MemberView[]) => rows.sort((a, b) => shownDate(b) - shownDate(a));
  const invitations = latestFirst(members.filter(isInvitation));
  // Those who left after those still there.
  const employees = [
    ...latestFirst(members.filter((row) => row.status === "joined")),
    ...latestFirst(members.filter((row) => row.status === "left"))
  ];
  // Offline, the relays told no device: a member's state is a guess from its invitation's date
  // (loadTeam), an employee who joined shows as invited, or as expired once its invitation ended.
  const online = view?.online === true;
  /** An invitation not used, as far as the relays tell. */
  const unused = (row: MemberView) => online && isInvitation(row);
  /** What the trash of a row removes. "left" is only known from the relays' answers (loadTeam). */
  const removalOf = (row: MemberView): Removal =>
    unused(row) ? "deleteInvite" : row.status === "left" ? "removeLeft" : "remove";

  const rowActions = (row: MemberView): RowAction[] => {
    const pending = isInvitation(row);
    const actions: RowAction[] = [];
    // Renewing an expired invitation removes its member: never on a guess, which could be an
    // employee who joined.
    if (pending && !noWebApp && (row.status === "invited" || online)) {
      actions.push({
        icon: desktop ? "qrcode" : "share-nodes",
        label: t(
          row.status === "expired"
            ? "team.actions.renew"
            : desktop
              ? "team.actions.showQr"
              : "team.actions.share"
        ),
        kind: "share",
        member: row.member.id,
        busy: pendingId === row.member.id,
        testID: `${row.status === "expired" ? "reinvite" : "show"}-${row.member.id}`
      });
    }
    actions.push({
      icon: "trash-can",
      label: t(`team.actions.${REMOVAL_ACTION[removalOf(row)]}`),
      kind: "remove",
      member: row.member.id,
      testID: `remove-${row.member.id}`
    });
    return actions;
  };

  /** What a row's icon does: its share action, or its trash. */
  const act = (action: RowAction) => {
    const row = members.find(({ member }) => member.id === action.member);
    if (!row) return;
    if (action.kind === "share") share(row);
    else {
      const kind = removalOf(row);
      setConfirming({
        member: row.member,
        kind,
        leftAt: kind === "removeLeft" ? leftAt(row) : null
      });
    }
  };

  const notices = (
    <>
      {noWebApp ? <ErrorMessage>{t("team.errors.noWebApp")}</ErrorMessage> : null}
      {loadFailure ? (
        <ErrorMessage testID="team-failure">{t(`team.errors.${loadFailure}`)}</ErrorMessage>
      ) : null}
      {/* The roster not read: what this device knew, never an empty team (owner.ts, loadTeam). */}
      {view?.roster === "unread" ? (
        <ErrorMessage testID="team-roster-offline">{t("team.rosterOffline")}</ErrorMessage>
      ) : view?.roster === "partial" ? (
        <ErrorMessage testID="team-roster-partial">{t("team.rosterPartial")}</ErrorMessage>
      ) : view && !view.online ? (
        <ErrorMessage>{t("team.offline")}</ErrorMessage>
      ) : null}
      {view?.newer ? <ErrorMessage>{t("team.newer")}</ErrorMessage> : null}
    </>
  );

  // Its loading scene (useLoadingScene): it fades out once read, then the team fades in.
  const waitScene = useLoadingScene(
    view === null && !loadFailure
      ? { scene: "team", label: t("team.loading"), testID: "team-loading" }
      : null
  );
  const waited = waitScene.waited;
  // Not read yet, or its scene fading out: the team waits.
  const pending = view === null || waitScene.scene !== null;
  const body = waitScene.scene ? (
    <View style={styles.loading}>
      <LoadingScene {...waitScene.scene} />
    </View>
  ) : view === null ? null : invitations.length === 0 &&
    employees.length === 0 &&
    view.roster !== "unread" ? (
    <TeamGuide desktop={desktop} />
  ) : null;

  const openInvite = () => setInviting(true);

  return (
    <>
      {desktop ? (
        <DesktopLayout
          title={t("navigation.destinations.employees")}
          inviteLabel={t("team.invite")}
          onInvite={openInvite}
          inviteDisabled={noWebApp}
          notices={notices}
          body={body}
          loading={pending}
          arrival={waited}
          columns={{
            name: t("team.columns.name"),
            state: t("team.columns.state"),
            date: t("team.columns.date")
          }}
          onAction={act}
          languageTag={languageTag}
          rows={[...invitations, ...employees].map((row) => ({
            id: row.member.id,
            name: row.member.name,
            avatar: row.avatar,
            pending: isInvitation(row),
            detail: detail(row),
            detailLabel: detailLabel(row),
            platform: platformOf(row),
            status: row.status,
            state: PILL_STATE[row.status],
            stateLabel: t(`team.status.${row.status}`),
            date: shownDate(row),
            actions: rowActions(row)
          }))}
        />
      ) : (
        // The list runs under "Invite an employee" and the dock, both floating over it.
        <PosFrame title={t("navigation.destinations.employees")} flush="mobile">
          <DockScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              waitScene.scene !== null && styles.scrollLoading
            ]}
            showsVerticalScrollIndicator={false}
            testID="employees"
          >
            {notices}
            {pending ? (
              body
            ) : (
              <Arrival fade={waited} style={styles.arrival}>
                {body}
                {invitations.length > 0 ? (
                  <MobileSection
                    title={t("team.invitations")}
                    first
                    onAction={act}
                    rows={invitations.map((row) => ({
                      id: row.member.id,
                      name: row.member.name,
                      avatar: row.avatar,
                      pending: true,
                      detail: detail(row),
                      detailLabel: detailLabel(row),
                      platform: platformOf(row),
                      actions: rowActions(row)
                    }))}
                  />
                ) : null}
                {employees.length > 0 ? (
                  <MobileSection
                    title={t("team.employees")}
                    first={invitations.length === 0}
                    onAction={act}
                    rows={employees.map((row) => ({
                      id: row.member.id,
                      name: row.member.name,
                      avatar: row.avatar,
                      pending: false,
                      detail: detail(row),
                      detailLabel: detailLabel(row),
                      platform: platformOf(row),
                      actions: rowActions(row)
                    }))}
                  />
                ) : null}
              </Arrival>
            )}
          </DockScrollView>
          <DockActions style={styles.mobileAction}>
            <Button
              icon="user-plus"
              onPress={openInvite}
              disabled={noWebApp}
              testID="invite-employee"
            >
              {t("team.invite")}
            </Button>
          </DockActions>
        </PosFrame>
      )}

      <InviteSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        onInvited={(invite) => {
          setInviting(false);
          setShown(invite);
          reload();
          // Its lot of on-chain addresses, empty until now, fills in the background at once,
          // not at the next login or unlock: its device takes on-chain
          // payments from its first sales (owner-addresses.ts).
          void syncEmployeeAddresses({ again: true });
        }}
        onSavedUnpublished={() => {
          // The employee is in the list: its share action publishes the invitation again.
          setInviting(false);
          fail("unpublished");
          reload();
        }}
      />
      <Sheet
        title={shown ? t("team.qrSheet.title", { name: shown.member.name }) : ""}
        closeLabel={t("navigation.close")}
        visible={shown !== null}
        onClose={() => setShown(null)}
        dialogWidth={600}
        testID="invite-qr"
      >
        {shown ? (
          <InviteShare
            invite={shown}
            business={business}
            languageTag={languageTag}
            onDone={() => setShown(null)}
          />
        ) : null}
      </Sheet>
      {settling.map((entry) => (
        <SalesSettlers
          key={entry.id}
          jobs={entry.jobs}
          onDone={(settlements) => {
            setSettling((current) => current.filter(({ id }) => id !== entry.id));
            entry.done(settlements);
          }}
        />
      ))}
      <ConfirmDialog
        visible={confirming !== null}
        title={
          confirming
            ? t(`team.${confirming.kind}Dialog.title`, { name: confirming.member.name })
            : ""
        }
        body={
          confirming === null
            ? ""
            : confirming.kind === "cancelSales"
              ? cancelSalesBody(confirming.member.name, confirming.unsettled)
              : t(`team.${confirming.kind}Dialog.body`, {
                  name: confirming.member.name,
                  business,
                  date: confirming.leftAt === null ? "" : date(confirming.leftAt)
                })
        }
        confirmLabel={confirming ? t(`team.${confirming.kind}Dialog.confirm`) : ""}
        cancelLabel={t("common.back")}
        onConfirm={confirmRemoval}
        working={removing}
        onCancel={() => setConfirming(null)}
        testID="remove-member"
        confirmTestID="confirm-remove"
      />
    </>
  );
}

type RowAction = {
  kind: "share" | "remove";
  /** The member's id. */
  member: string;
  icon: IconName;
  label: string;
  /** Waiting for the relays: a spinner in its place. */
  busy?: boolean;
  testID: string;
};

type RowData = {
  id: string;
  name: string;
  /** The photo the employee picked on its device, null for the initials. */
  avatar: ImageRef | null;
  /** An invitation not used yet: the dashed avatar. */
  pending: boolean;
  detail: string;
  /** `detail` with its device's platform, for screen readers. */
  detailLabel: string;
  /** The platform of its device, once joined (PLATFORM_ICON); null for an invitation. */
  platform: MemberDevice["platform"] | null;
  actions: RowAction[];
};

/** A row's date, after the glyph of its device's platform (PLATFORM_ICON) when it has one. */
function RowDetail({
  row,
  style,
  width
}: {
  row: Pick<RowData, "id" | "detail" | "detailLabel" | "platform">;
  style: StyleProp<TextStyle>;
  width?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[styles.detailRow, width === undefined ? null : { width }]}
      accessible
      accessibilityLabel={row.detailLabel}
      testID={`detail-${row.id}`}
    >
      {row.platform ? (
        <View testID={`platform-${row.id}-${row.platform}`}>
          <Icon name={PLATFORM_ICON[row.platform]} size={12} color={colors.text.secondary} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.detailText, style]}>
        {row.detail}
      </Text>
    </View>
  );
}

/**
 * The person's photo, else its initials in a circle: sand once joined, dashed while the invitation
 * waits (the photo once its device picked one).
 */
function PersonAvatar({
  name,
  avatar,
  pending,
  size
}: {
  name: string;
  avatar: ImageRef | null;
  pending: boolean;
  size: 40 | 36;
}) {
  const image = useImageUri(avatar);
  return <Avatar name={name} image={image} size={size} tone={pending ? "pending" : "subtle"} />;
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

/** Mobile: a section title over a white card of rows. */
function MobileSection({
  title,
  first,
  rows,
  onAction
}: {
  title: string;
  first: boolean;
  rows: RowData[];
  onAction: (action: RowAction) => void;
}) {
  const styles = useStyles();
  return (
    <View>
      <Text accessibilityRole="header" style={[styles.sectionTitle, first && styles.sectionFirst]}>
        {title}
      </Text>
      <View style={styles.card}>
        {rows.map((row, index) => (
          <View
            key={row.id}
            style={[styles.row, index < rows.length - 1 && styles.rowSeparated]}
            testID={`member-${row.id}`}
          >
            <PersonAvatar name={row.name} avatar={row.avatar} pending={row.pending} size={40} />
            <View style={styles.rowTexts}>
              <Text numberOfLines={1} style={styles.name}>
                {row.name}
              </Text>
              <RowDetail row={row} style={styles.detail} />
            </View>
            <Actions actions={row.actions} onAction={onAction} />
          </View>
        ))}
      </View>
    </View>
  );
}

type DesktopRowData = RowData & {
  status: MemberStatus;
  state: PaymentState;
  stateLabel: string;
  /** Unix seconds: the date its "Date" tells (`detail`). */
  date: number;
};

/**
 * The table's columns as its header sorts and filters them (useTableView), each by what it shows:
 * "Name" neither (its header is its name alone); "Status" by its words, its
 * values drawn as its pills; "Date" by the date
 * its sentence tells, its values the periods (today, yesterday, this week…: src/lib/date-periods.ts,
 * the most recent first.
 */
function tableColumns(
  labels: { name: string; state: string; date: string },
  periodLabel: (period: DatePeriod) => string
): ViewColumn<DesktopRowData>[] {
  return [
    {
      // Its name alone: neither sorted nor filtered.
      id: "name",
      label: labels.name
    },
    {
      id: "state",
      label: labels.state,
      sort: { kind: "text", key: (row) => row.stateLabel },
      value: (row) => ({ key: row.status, label: row.stateLabel }),
      renderValue: (row) => (
        <StatusPillBox>
          <StatusPill state={row.state} label={row.stateLabel} size="sm" />
        </StatusPillBox>
      )
    },
    {
      id: "date",
      label: labels.date,
      sort: { kind: "date", key: (row) => row.date },
      value: (row) => {
        // Read when asked (filtering, its menu): "Today" never stays past midnight.
        const period = datePeriodOf(row.date, new Date());
        return { key: period, label: periodLabel(period) };
      },
      valuesOrder: "descending"
    }
  ];
}

/**
 * Without an employee nor an invitation (the roster read): what a team does, in three steps,
 * "Invite an employee" under it on a phone, in the
 * header on a desktop.
 */
function TeamGuide({ desktop }: { desktop: boolean }) {
  const { t } = useTranslation();
  return (
    <ListGuide
      title={t("team.guide.title")}
      lead={t("team.guide.lead")}
      steps={[
        guideStep(t, "team.guide.invite", TeamInviteArt),
        guideStep(t, "team.guide.activate", TeamActivateArt),
        guideStep(t, "team.guide.sales", TeamSellsArt)
      ]}
      desktop={desktop}
      testID="team-empty"
    />
  );
}

/**
 * Desktop: the header of the wallet, then a table in a white card, as the wallet's movements. Each
 * column's header sorts the table by it and filters its values (ColumnHeader); by default, the
 * invitations, then the employees, those who left last, each group the latest date first. A filter
 * that leaves no row says so, with "Clear filters".
 */
function DesktopLayout({
  title,
  inviteLabel,
  onInvite,
  inviteDisabled,
  notices,
  body,
  loading,
  arrival,
  columns,
  rows,
  onAction,
  languageTag
}: {
  title: string;
  inviteLabel: string;
  onInvite: () => void;
  inviteDisabled: boolean;
  notices: ReactNode;
  body: ReactNode;
  /** The team not read yet: `body` is its loading scene. */
  loading: boolean;
  /** Its loading scene shown: the table fades in (Arrival.tsx). */
  arrival: boolean;
  columns: { name: string; state: string; date: string };
  rows: DesktopRowData[];
  onAction: (action: RowAction) => void;
  /** The device's, to compare names. */
  languageTag: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sortable = tableColumns(columns, usePeriodLabel(languageTag));
  const table = useTableView(rows, sortable, languageTag);
  const widths = {
    name: styles.nameCell,
    state: { width: COLUMNS.state },
    date: { width: COLUMNS.date }
  };
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
          icon="user-plus"
          fullWidth={false}
          style={styles.desktopInvite}
          onPress={onInvite}
          disabled={inviteDisabled}
          testID="invite-employee"
        >
          {inviteLabel}
        </Button>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.desktopBody,
          loading && styles.scrollLoading,
          { paddingBottom: Math.max(insets.bottom, 22) }
        ]}
        testID="employees"
      >
        {notices}
        {loading ? (
          body
        ) : (
          <Arrival fade={arrival} style={styles.arrival}>
            {body}
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
                        testID={`team-column-${column.id}`}
                      />
                    ))}
                    <View style={{ width: COLUMNS.actions }} />
                  </>
                }
              >
                {shown.length === 0 && table.filtering ? (
                  <TableNoMatch
                    message={t("team.noMatch")}
                    onClear={table.clearFilters}
                    testID="team-no-match"
                    clearTestID="team-clear-filters"
                  />
                ) : null}
                {shown.map((row) => (
                  <DesktopRow key={row.id} row={row} onAction={onAction} />
                ))}
              </TableCard>
            ) : null}
          </Arrival>
        )}
      </ScrollView>
    </View>
  );
}

function DesktopRow({
  row,
  onAction
}: {
  row: DesktopRowData;
  onAction: (action: RowAction) => void;
}) {
  const styles = useStyles();
  return (
    // Not a button: its actions are its own.
    <TableRow height={64} testID={`member-${row.id}`}>
      <View style={[styles.nameCell, styles.desktopName]}>
        <PersonAvatar name={row.name} avatar={row.avatar} pending={row.pending} size={36} />
        <Text numberOfLines={1} style={styles.desktopNameText}>
          {row.name}
        </Text>
      </View>
      <View style={{ width: COLUMNS.state }}>
        <StatusPill state={row.state} label={row.stateLabel} size="sm" />
      </View>
      <RowDetail row={row} style={styles.desktopDate} width={COLUMNS.date} />
      <View style={[styles.desktopActions, { width: COLUMNS.actions }]}>
        <Actions actions={row.actions} onAction={onAction} />
      </View>
    </TableRow>
  );
}

/**
 * Naming the invitation: the name is all it asks, with what the employee will and will not do
 * (InviteRights) and what its link allows. Bottom sheet on mobile, the name right under what the link
 * is for, before the lists; dialog on desktop, the name last, next to "Create the link".
 */
function InviteSheet({
  visible,
  onClose,
  onInvited,
  onSavedUnpublished
}: {
  visible: boolean;
  onClose: () => void;
  onInvited: (invite: ShownInvite) => void;
  /** The employee was saved, but its invitation was not published (TeamError "unpublished"). */
  onSavedUnpublished: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const reduceMotion = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const nameFocused = useRef(false);
  /** Mobile: where the name (its label, field and hint) starts in what scrolls, to scroll to it. */
  const nameTop = useRef(0);
  const scrollToName = (animated: boolean) =>
    scroll.current?.scrollTo({ y: nameTop.current, animated });
  // This component stays mounted between openings, the field does not: a field unmounted while
  // focused may never report its blur, and the next opening would start scrolled to its end.
  useEffect(() => {
    if (!visible) nameFocused.current = false;
  }, [visible]);
  const empty = name.trim() === "";

  const create = () => {
    if (busy || empty) return;
    setBusy(true);
    setFailure(null);
    inviteEmployee(name).then(
      (invite) => {
        setBusy(false);
        setName("");
        onInvited(invite);
      },
      (error: unknown) => {
        setBusy(false);
        const code = codeOf(error);
        if (code === "unpublished") {
          // Saved already: creating it again would invite the employee twice.
          setName("");
          onSavedUnpublished();
        } else {
          // Nothing was created ("unreachable": no majority gave the team or took its record): the
          // name stays, trying again is safe. Mobile: its error shows under the field, at the top,
          // which the owner may have scrolled out of sight to read the lists: brought back into it
          // (on desktop, the field is last, next to the button pressed).
          setFailure(code);
          if (!desktop) scrollToName(!reduceMotion);
        }
      }
    );
  };

  const close = () => {
    setFailure(null);
    onClose();
  };

  const createButton = (
    <Button
      size={desktop ? "sm" : "lg"}
      fullWidth={!desktop}
      onPress={create}
      disabled={empty}
      loading={busy}
      style={desktop ? styles.dialogCreate : undefined}
      testID="invite-create"
    >
      {t("team.inviteSheet.create")}
    </Button>
  );

  const nameArea = (
    <View
      style={styles.inviteName}
      onLayout={(event) => {
        nameTop.current = event.nativeEvent.layout.y;
      }}
      testID="invite-name-area"
    >
      <TextField
        label={t("team.inviteSheet.nameLabel")}
        value={name}
        onChangeText={(value) => {
          setName(value.slice(0, MEMBER_NAME_MAX_LENGTH));
          setFailure(null);
        }}
        onFocus={() => {
          nameFocused.current = true;
        }}
        onBlur={() => {
          nameFocused.current = false;
        }}
        placeholder={t("team.inviteSheet.namePlaceholder")}
        error={failure ? t(`team.errors.${failure}`) : null}
        testID="invite-name"
      />
      {/* Where the name shows, as an integration's: an employee's phone or a shared till, named
          alike. */}
      <Text style={styles.nameHint}>{t("team.inviteSheet.nameHint")}</Text>
    </View>
  );

  return (
    <Sheet
      title={t("team.inviteSheet.title")}
      closeLabel={t("navigation.close")}
      visible={visible}
      onClose={close}
      dismissible={!busy}
      dialogWidth={520}
      // What the employee will and will not do takes more than a dialog's 640 (about 810 in
      // French, more in German); a window too short for it scrolls it.
      dialogMaxHeight={INVITE_DIALOG_MAX_HEIGHT}
      testID="invite-sheet"
    >
      {/* Taller than a panel may be on a small screen, the keyboard open: what it says scrolls,
          its buttons stay. Once the keyboard has shrunk the panel (the panel's KeyboardAvoidingView
          makes room for it by its bottom, nothing scrolls to the field otherwise), the name is
          scrolled into sight: on mobile, to the top of what shows (the field, scrolled near the
          bottom, could end under the keyboard); on desktop (an iPad's keyboard), where it comes
          last, to the end. */}
      <ScrollView
        ref={scroll}
        style={styles.inviteScroll}
        contentContainerStyle={styles.inviteBody}
        keyboardShouldPersistTaps="handled"
        onLayout={() => {
          if (!nameFocused.current) return;
          if (desktop) scroll.current?.scrollToEnd({ animated: false });
          else scrollToName(false);
        }}
        testID="invite-body"
      >
        <Text style={styles.sheetText} testID="invite-lead">
          {t("team.inviteSheet.lead")}
        </Text>
        {desktop ? null : nameArea}
        <InviteRights />
        {/* Its link is a bearer secret until used: said next to "Create the link", which makes
            it. */}
        <Callout tone="warning" testID="invite-notice">
          {t("team.inviteSheet.notice")}
        </Callout>
        {desktop ? nameArea : null}
      </ScrollView>
      {desktop ? (
        <View style={styles.dialogButtons}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={close}
            disabled={busy}
            style={styles.dialogCancel}
          >
            {t("common.cancel")}
          </Button>
          {createButton}
        </View>
      ) : (
        createButton
      )}
    </Sheet>
  );
}

/** "Invite an employee" on a desktop: up to this height, its content shown whole. */
const INVITE_DIALOG_MAX_HEIGHT = 880;

/** What the employee's device does (MemberShell, MEMBER_DESTINATIONS), in this order. */
const EMPLOYEE_CAN = ["sell", "methods", "links", "ownSales"] as const;
/** What stays the owner's: the other destinations, the wallet and the other employees' sales. */
const EMPLOYEE_CANNOT = ["wallet", "settings", "otherSales", "manage"] as const;

/**
 * What an employee will and will not do, before the owner invites one: two lists on a sand
 * box, a green check before each thing allowed, a cross before each that is not, then that its
 * access can be removed.
 */
function InviteRights() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.rights} testID="invite-rights">
      <RightsList
        title={t("team.inviteSheet.can")}
        items={EMPLOYEE_CAN.map((key) => ({
          key,
          label: t(`team.inviteSheet.canItems.${key}`)
        }))}
        allowed
        testID="invite-can"
      />
      <View style={styles.rightsDivider} />
      <RightsList
        title={t("team.inviteSheet.cannot")}
        items={EMPLOYEE_CANNOT.map((key) => ({
          key,
          label: t(`team.inviteSheet.cannotItems.${key}`)
        }))}
        allowed={false}
        testID="invite-cannot"
      />
      <Text style={styles.rightsNote}>{t("team.inviteSheet.revoke")}</Text>
    </View>
  );
}

/**
 * A list of InviteRights under its title. Each line is read with its title ("This device will not
 * be able to, See your balance…"): read alone, a line that is not allowed would say the opposite.
 * A list of
 * list items: on the web, a name is only read on an element with a role (ARIA names no generic
 * `div`), and react-native-web drops `accessible`.
 */
function RightsList({
  title,
  items,
  allowed,
  testID
}: {
  title: string;
  items: readonly { key: string; label: string }[];
  allowed: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.rightsGroup} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.rightsTitle, allowed ? styles.rightsTitleCan : styles.rightsTitleCannot]}
      >
        {title}
      </Text>
      <View role="list" style={styles.rightsItems}>
        {items.map((item) => (
          <View
            key={item.key}
            role="listitem"
            style={styles.right}
            accessible
            accessibilityLabel={`${title}, ${item.label}`}
          >
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.rightMark, allowed ? styles.rightMarkCan : styles.rightMarkCannot]}
            >
              <Icon
                name={allowed ? "check" : "xmark"}
                size={RIGHT_ICON}
                color={allowed ? colors.success.fg : colors.text.note}
              />
            </View>
            <Text style={[styles.rightText, !allowed && styles.rightTextCannot]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The invitation's link as the mobile row shows it, without its scheme: its host and path whole,
 * then the fragment's first characters and "…". Built here, not left to the platform: cut on one
 * line by the system, an iPhone shows only the host's first part, up to a hyphen and without "…",
 * which does not read as a link. The fragment is the link's long part
 * (`invite.ts`): its start says the link goes on, its rest would say nothing to a reader.
 */
function shortInviteLink(url: string): string {
  const shown = url.replace(/^https:\/\//, "");
  const hash = shown.indexOf("#");
  if (hash < 0 || shown.length - (hash + 1) <= SHORT_LINK_FRAGMENT) return shown;
  return `${shown.slice(0, hash + 1 + SHORT_LINK_FRAGMENT)}…`;
}

/** Characters of the fragment shortInviteLink keeps. */
const SHORT_LINK_FRAGMENT = 6;

/**
 * Sharing the invitation: the link and its QR code, together. The employee present scans the
 * code; otherwise the link goes by message. Mobile: "Share the link" first, the link copied
 * from its row; desktop: "Copy the link" first. A browser without a share sheet would only copy
 * the link from "Share the link": there, "Copy the link" first on
 * mobile too, and its row without the icon that would do the same. A warning above the
 * buttons: the link is used once, until its end (its
 * record's, to the minute: 48 hours after its creation), and whoever opens it first can take the
 * employee's place.
 */
function InviteShare({
  invite,
  business,
  languageTag,
  onDone
}: {
  invite: ShownInvite;
  business: string;
  /** The device's, for the date. */
  languageTag: string;
  onDone: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  // Once a copy failed, the mobile row shows the whole link, which "Select it" then means:
  // the short one, selected, would give a link that opens nothing.
  const [whole, setWhole] = useState(false);
  const notice = (
    <Callout tone="warning" testID="invite-share-notice">
      {t("team.qrSheet.notice", {
        name: invite.member.name,
        date: formatDate(new Date(invite.expiresAt * 1000), languageTag, {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit"
        })
      })}
    </Callout>
  );

  const copied = () => notify({ tone: "success", title: t("team.qrSheet.copied"), key: "team" });
  const copyFailed = () => {
    setWhole(true);
    notify({ tone: "error", title: t("team.qrSheet.copyFailed"), key: "team" });
  };
  const copy = () => {
    copySecret(invite.url).then((done) => (done ? copied() : copyFailed()), copyFailed);
  };
  const shareable = canShareUrl(invite.url);
  // Within the tap: browsers only open their share sheet right after a gesture.
  const share = () =>
    void shareUrl(invite.url).then(
      (outcome) => {
        if (outcome === "copied") copied();
      },
      () => undefined
    );

  if (desktop) {
    return (
      <>
        <Text style={styles.sheetText}>{t("team.qrSheet.leadDesktop", { business })}</Text>
        <View style={styles.shareDesktop}>
          <QrPlate value={invite.url} size={168} elevation="flat" />
          <View style={styles.shareLinkColumn}>
            <Text style={styles.fieldLabel}>{t("team.qrSheet.linkLabel")}</Text>
            <View style={styles.linkBox}>
              <Text selectable style={styles.linkFull} testID="invite-link">
                {invite.url}
              </Text>
            </View>
          </View>
        </View>
        {notice}
        <View style={styles.dialogButtons}>
          <Button
            variant="text"
            size="sm"
            fullWidth={false}
            onPress={onDone}
            style={styles.dialogCancel}
            testID="invite-done"
          >
            {t("team.qrSheet.done")}
          </Button>
          <Button
            size="sm"
            icon="copy"
            fullWidth={false}
            onPress={copy}
            style={styles.dialogCopy}
            testID="invite-copy"
          >
            {t("team.qrSheet.copy")}
          </Button>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.sheetText}>{t("team.qrSheet.lead")}</Text>
      <View style={styles.qr}>
        <QrPlate value={invite.url} size={176} elevation="flat" />
      </View>
      <View style={styles.linkRow}>
        <Text
          selectable={whole}
          style={styles.linkShort}
          accessibilityLabel={invite.url}
          testID="invite-link"
        >
          {whole ? invite.url : shortInviteLink(invite.url)}
        </Text>
        {shareable ? (
          <IconButton
            icon="copy"
            label={t("team.qrSheet.copy")}
            onPress={copy}
            testID="invite-copy"
          />
        ) : null}
      </View>
      {notice}
      <View style={styles.shareButtons}>
        {shareable ? (
          <Button icon="share-nodes" onPress={share} testID="invite-share">
            {t("team.qrSheet.share")}
          </Button>
        ) : (
          <Button icon="copy" onPress={copy} testID="invite-copy">
            {t("team.qrSheet.copy")}
          </Button>
        )}
        <Button variant="text" size="md" onPress={onDone} testID="invite-done">
          {t("team.qrSheet.done")}
        </Button>
      </View>
    </>
  );
}

/** InviteRights: a line of its lists, its mark centred on the line's first row, and its glyph. */
const RIGHT_LINE = type.body * 1.45;
const RIGHT_MARK = 22;
const RIGHT_ICON = 11;

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1, alignSelf: "stretch" },
  scrollContent: { gap: space[5], paddingHorizontal: gutter, paddingBottom: space[5] },
  // The team, once read: its parts as far apart as in the scroll that holds them.
  arrival: { gap: space[5] },
  // The loading scene, in the middle of the page under its header: the scroll fills the page
  // while it shows (scrollLoading), the scene its rest.
  scrollLoading: { flexGrow: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  mobileAction: { paddingTop: 14, paddingHorizontal: gutter },

  // Mobile: 6 px above the first title, 26 above the second, 12 below each.
  sectionTitle: {
    ...sans(700),
    paddingTop: space[9] - space[5],
    paddingBottom: space[5],
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  sectionFirst: { paddingTop: space[3] },
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
  detailRow: { flexDirection: "row", alignItems: "center", gap: space[3], minWidth: 0 },
  detailText: { flexShrink: 1, minWidth: 0 },
  actions: { flexDirection: "row", flexShrink: 0 },
  actionBusy: {
    width: control.min,
    height: control.min,
    alignItems: "center",
    justifyContent: "center"
  },

  // Desktop (the header of the wallet's screen).
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
  desktopInvite: { minWidth: 236 },
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
  // "Invite an employee": what scrolls (ArticleSheet's dialog), with the panel's gap.
  inviteScroll: { flexGrow: 0, flexShrink: 1 },
  inviteBody: { gap: SHEET_GAP },
  // The name field and its hint, SHEET_GAP apart as the body's items.
  inviteName: { gap: SHEET_GAP },
  rights: {
    gap: space[6],
    padding: space[6],
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  rightsGroup: { gap: space[4] },
  rightsItems: { gap: space[4] },
  rightsDivider: { height: stroke.hairline, backgroundColor: colors.border.subtle },
  rightsTitle: { ...sans(600), fontSize: type.label, letterSpacing: tracked.label },
  rightsTitleCan: { color: colors.success.fg },
  rightsTitleCannot: { color: colors.text.note },
  right: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rightMark: {
    width: RIGHT_MARK,
    height: RIGHT_MARK,
    borderRadius: RIGHT_MARK / 2,
    flexShrink: 0,
    marginTop: (RIGHT_LINE - RIGHT_MARK) / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  rightMarkCan: { backgroundColor: colors.success.bg },
  rightMarkCannot: { backgroundColor: colors.background.surface },
  rightText: {
    ...sans(500),
    flex: 1,
    minWidth: 0,
    fontSize: type.body,
    lineHeight: RIGHT_LINE,
    color: colors.text.primary
  },
  rightTextCannot: { color: colors.text.note },
  rightsNote: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  // Under the invitation's name: NewIntegrationSheet's `fine`.
  nameHint: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary
  },
  // These widths at least: a longer label widens its button, a row too long wraps.
  dialogButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4
  },
  dialogCancel: { minWidth: 120 },
  dialogCreate: { minWidth: 180 },
  dialogCopy: { minWidth: 190 },
  qr: { flexDirection: "row", justifyContent: "center" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    // On a narrow phone the short link takes two lines; the whole one, after a failed copy, more.
    minHeight: control.md,
    paddingVertical: space[3],
    paddingLeft: 18,
    paddingRight: space[2],
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  linkShort: {
    ...mono(500),
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.text.primary
  },
  shareButtons: { gap: space[3] },
  shareDesktop: { flexDirection: "row", alignItems: "center", gap: 24 },
  shareLinkColumn: { flex: 1, minWidth: 0, gap: 8 },
  fieldLabel: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  linkBox: {
    minHeight: control.md,
    justifyContent: "center",
    paddingVertical: space[5],
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  linkFull: { ...mono(500), fontSize: 13, lineHeight: 13 * 1.5, color: colors.text.primary }
}));
