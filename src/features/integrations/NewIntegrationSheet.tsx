import * as Clipboard from "expo-clipboard";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent
} from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { externalLinkProps, openExternal } from "@/components/ui/external-link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { outOfReach } from "@/components/ui/reach";
import { SHEET_TITLE_FONT, Sheet, useSheetInset } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useHover } from "@/components/ui/useHover";
import {
  SDK_LANGUAGES,
  SHOP_PLATFORMS,
  type IntegrationOptionId,
  type SdkLanguage,
  type SdkPackage,
  type ShopPlatformId,
  sourceCodeUrl
} from "@/config/integration-catalog";
import {
  assistantConnections,
  CHATGPT_CONNECTORS_PAGE,
  claudeConnectorLink,
  exportGrantsSuspended
} from "@/config/assistants";
import { MAX_ASSISTANTS, MAX_INTEGRATIONS, MEMBER_NAME_MAX_LENGTH } from "@/config/team";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { syncIntegrationAddresses } from "@/features/team/integration-addresses";
import { createAssistant, createIntegration, setAssistantExport } from "@/features/team/owner";
import { syncEmployeeAddresses } from "@/features/team/owner-addresses";
import { DESKTOP_BUNDLE } from "@/lib/assistant/desktop-bundle";
import {
  fetchReleaseDownload,
  type ReleaseDownload,
  type ReleaseFile
} from "@/lib/github/latest-release";
import { logFailure } from "@/lib/log/log";
import { copySecret } from "@/lib/secret-clipboard";
import {
  control,
  makeStyles,
  mono,
  proseLineHeight,
  radius,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

import { codeOf, type Failure } from "./failures";
import { GUIDES, type Guide, type GuideImage } from "./guides";
import { IntegrationLogo } from "./IntegrationLogo";
import { PluginFiles } from "./PluginFiles";

/**
 * How an AI app reaches the assistant: the hosted server, the Claude Desktop bundle, or the same
 * server run by the merchant (or their developer) on a machine of their own.
 */
type AssistantVia = "hosted" | "desktop" | "selfHosted";

/** What the sheet shows: the list, or what one of its options asks. */
type Screen =
  | { kind: "catalog" }
  | { kind: "shop"; id: ShopPlatformId; name: string; guide: Guide }
  | { kind: "sdk"; language: SdkLanguage; package: SdkPackage }
  /** "AI assistant": which way it connects (null: to choose), then its steps. */
  | { kind: "assistant"; via: AssistantVia | null };

/**
 * A key just created, shown this once: an integration's or an assistant's (createIntegration,
 * createAssistant). Its name is the one the owner typed, as the roster keeps it.
 */
type ShownKey = {
  kind: "integration" | "assistant";
  name: string;
  secretKey: string;
  published: boolean;
  /** An assistant's: whether it makes invoices (what its first request is, for example). */
  invoicing?: boolean;
};

/**
 * The ways an AI app reaches the assistant (src/config/assistants.ts), in the order they are
 * offered: the hosted server always, ready to use; Claude Desktop and a server of one's own once
 * released.
 */
function assistantWays(): { via: AssistantVia; url: string }[] {
  const { hosted, desktop, selfHosted } = assistantConnections();
  return [
    { via: "hosted", url: hosted },
    ...(desktop ? [{ via: "desktop" as const, url: desktop }] : []),
    ...(selfHosted ? [{ via: "selfHosted" as const, url: selfHosted }] : [])
  ];
}

/** Where each way's key is created, pasted and asked for, in the sheet's texts. */
const KEY_LEAD = {
  hosted: "integrations.assistant.keyStep.leadHosted",
  desktop: "integrations.assistant.keyStep.leadDesktop",
  selfHosted: "integrations.assistant.keyStep.leadSelfHosted"
} as const;
const KEY_PASTE = {
  hosted: "integrations.assistant.keySheet.pasteHosted",
  desktop: "integrations.assistant.keySheet.pasteDesktop",
  selfHosted: "integrations.assistant.keySheet.pasteSelfHosted"
} as const;
/** The same, for an assistant without invoices: its first request is an export. */
const KEY_PASTE_EXPORT = {
  hosted: "integrations.assistant.keySheet.pasteHostedExport",
  desktop: "integrations.assistant.keySheet.pasteDesktopExport",
  selfHosted: "integrations.assistant.keySheet.pasteSelfHostedExport"
} as const;

/**
 * A way's discreet label beside its title, in the choice: the hosted server is the simplest, a
 * server of one's own is for experts; Claude Desktop has none.
 */
const WAY_BADGES = {
  hosted: "integrations.assistant.hosted.badge",
  desktop: null,
  selfHosted: "integrations.assistant.selfHosted.badge"
} as const satisfies Record<AssistantVia, string | null>;

/** A way's icon, in the choice: the web, a download, a server. */
const WAY_ICONS: Record<AssistantVia, IconName> = {
  hosted: "globe",
  desktop: "download",
  selfHosted: "server"
};

const CATALOG: Screen = { kind: "catalog" };

/** A row of the list (the AI assistant's, the developers'), above the 44 px touch floor. */
const ROW = 48;

/**
 * A row on two lines (its title, then a detail): the height of the settings' rows with a caption,
 * room above and below its text (a 48 px row is tight). Its least:
 * a detail longer than a line (the ways of "AI assistant" in German or Finnish) grows it.
 */
const ROW_TWO_LINES = 64;

/** The tile of the AI assistant's and the developers' rows. */
const LOGO = 32;

/**
 * The grid of what can be chosen: three tiles a row, each its logo above its name; two a row when
 * three would leave a cell (its spacing included) narrower than `TILE_CELL_MIN`, where the longest
 * names ("WooCommerce", "nopCommerce") no longer show whole: a phone narrower than 390 px (its
 * 118.7 px cells, the screen's gutter of 22 px on each side, show them whole on the web app; a 375
 * px one gets two a row).
 */
const TILE_COLUMNS = 3;
const TILE_COLUMNS_NARROW = 2;
const TILE_CELL_MIN = 116;
const TILE_HEIGHT = 92;
const TILE_LOGO = 30;
/** Half the space between two tiles: each cell's padding. */
const TILE_HALF_GAP = 5;

/** A logo in the "Coming soon" strip, beside its name. */
const SOON_LOGO = 16;

/** The SDK row's detail names the first languages, then counts the others. */
const NAMED_LANGUAGES = 3;

/** The GitHub mark of "Source code", in the header. */
const SOURCE_MARK = 13;

/**
 * What a phone's header takes beside the title and the label of "Source code": the back arrow and
 * the close button (32 px each: 44 px targets pulled 12 px outward), the title's and the link's
 * margins (4 px each), and the link's padding (6 px a side), mark and gap (6 px).
 */
const SOURCE_FIXED = 32 + 32 + 4 + 4 + 6 + 6 + SOURCE_MARK + 6;

/**
 * "New integration": "AI assistant" first, then the online shops, each opening its plugin's
 * installation guide, then, folded under "For developers", the SDK of each language, opening its
 * package's page and the key. What can be chosen is a white tile of a grid, its logo above its name
 * (the logos recognised at a glance, the nine shops three by three); what is not released yet is a
 * sand chip under "Coming soon", its logo and name, that nothing happens on: a shop until its guide
 * is written (guides.ts), a language until its package is published (integration-catalog.ts). Not
 * tiles: eight "Coming soon" tiles for one released shop would draw the eye to what cannot be
 * chosen (their sand fill looks like buttons, the released one's white like the exception); one
 * layout on a phone and a desktop, tiles then chips. The key is created where it is used: at the
 * guide's step where the plugin's field for it is open, or next to the package. Once created it
 * shows this once (createIntegration), and the sheet then closes by "Done" only: neither its close
 * button, nor a tap beside it, nor the system's back, nor a step back to the list. Bottom sheet on
 * mobile, dialog on desktop.
 */
export function NewIntegrationSheet({
  visible,
  onClose,
  onCreated,
  start = "catalog"
}: {
  visible: boolean;
  onClose: () => void;
  /** An integration was created (its key shows until "Done"): the list is read again. */
  onCreated: () => void;
  /**
   * Where it opens: the list, or "AI assistant" straight away (from "New invoice"), whose way back
   * then closes it.
   */
  start?: "catalog" | "assistant";
}) {
  const { t } = useTranslation();
  const ways = assistantWays();
  // One way released: straight to its steps, nothing to choose.
  const assistantStart: Screen = {
    kind: "assistant",
    via: ways.length === 1 ? ways[0]!.via : null
  };
  const home = start === "assistant" ? assistantStart : CATALOG;
  const [screen, setScreen] = useState<Screen>(home);
  const [developersOpen, setDevelopersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<ShownKey | null>(null);
  /** "Done" pressed: the key is forgotten at once, the panel slides away empty. */
  const [finished, setFinished] = useState(false);
  // Each opening starts from the list. Set while rendering, as React advises for state that
  // follows a prop: the sheet keeps what it showed while it slides away.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setScreen(home);
      setDevelopersOpen(false);
      setBusy(false);
      setShown(null);
      setFinished(false);
    }
  }

  // Not after "Done" either: the close button and the step back stay disabled while the panel
  // slides away.
  const settled = !busy && shown === null && !finished;
  const title =
    screen.kind === "catalog"
      ? t("integrations.createSheet.title")
      : screen.kind === "shop"
        ? screen.name
        : screen.kind === "assistant"
          ? t("integrations.assistant.title")
          : screen.language.name;
  // An assistant's steps go back to the choice of its way when there is one to make.
  const backTo: Screen =
    screen.kind === "assistant" && screen.via !== null && ways.length > 1
      ? { kind: "assistant", via: null }
      : home;
  // A shop's or a language's source code, in the header.
  const option =
    screen.kind === "shop" ? screen.id : screen.kind === "sdk" ? screen.language.id : null;
  const source = option === null ? null : sourceCodeUrl(option);
  // Where it opened: no way back from there.
  const atHome =
    screen.kind === "assistant" && home.kind === "assistant"
      ? screen.via === home.via
      : screen.kind === home.kind;

  return (
    <Sheet
      title={title}
      closeLabel={t("navigation.close")}
      visible={visible}
      onClose={onClose}
      dismissible={settled}
      back={
        // Unsettled, shown disabled (Sheet).
        !atHome ? { label: t("common.back"), onPress: () => setScreen(backTo) } : undefined
      }
      headerAction={
        // Its own measures for each page.
        source ? <SourceCodeLink key={option} name={title} url={source} /> : undefined
      }
      // Wide enough for the list's lead on one line.
      dialogWidth={600}
      page={
        screen.kind === "catalog"
          ? "catalog"
          : screen.kind === "shop"
            ? `shop:${screen.id}`
            : screen.kind === "assistant"
              ? `assistant:${screen.via ?? "choose"}`
              : `sdk:${screen.language.id}`
      }
      testID="integration-create-sheet"
    >
      {finished ? null : screen.kind === "catalog" ? (
        <Catalog
          developersOpen={developersOpen}
          onToggleDevelopers={() => setDevelopersOpen((open) => !open)}
          onPick={setScreen}
          onAssistant={() => setScreen(assistantStart)}
        />
      ) : screen.kind === "assistant" && screen.via === null ? (
        <AssistantChoice ways={ways} onPick={(via) => setScreen({ kind: "assistant", via })} />
      ) : (
        <OptionContent
          screen={screen}
          ways={ways}
          shown={shown}
          busy={busy}
          onBusy={setBusy}
          onCreated={(next) => {
            setShown(next);
            onCreated();
          }}
          onDone={() => {
            // Never kept longer than it shows: not while the panel slides away, nor until the
            // next opening.
            setShown(null);
            setFinished(true);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function Catalog({
  developersOpen,
  onToggleDevelopers,
  onPick,
  onAssistant
}: {
  developersOpen: boolean;
  onToggleDevelopers: () => void;
  onPick: (screen: Screen) => void;
  /** "AI assistant". */
  onAssistant: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const inset = useSheetInset();
  const padded = { paddingHorizontal: inset };
  // A shop opens its guide once written; until then, "Coming soon".
  const shops = SHOP_PLATFORMS.map((platform) => ({ ...platform, guide: GUIDES[platform.id] }));
  const releasedShops = shops.flatMap(({ id, name, guide }) =>
    guide ? [{ id, name, guide }] : []
  );
  const upcomingShops = shops.filter(({ guide }) => !guide);
  const releasedLanguages = SDK_LANGUAGES.flatMap((language) =>
    language.package ? [{ language, published: language.package }] : []
  );
  const upcomingLanguages = SDK_LANGUAGES.filter((language) => !language.package);
  return (
    <ScrollView
      // As wide as the panel: its rows are pressed up to its edges (ListRow).
      style={[styles.scroll, { marginHorizontal: -inset }]}
      contentContainerStyle={styles.catalog}
      testID="integration-catalog"
    >
      <Text style={[styles.lead, padded]}>{t("integrations.createSheet.lead")}</Text>
      <View>
        <Text accessibilityRole="header" style={[styles.groupLabel, padded]}>
          {t("integrations.createSheet.invoices")}
        </Text>
        <AssistantRow inset={inset} onPress={onAssistant} />
      </View>
      <View>
        <Text accessibilityRole="header" style={[styles.groupLabel, padded]}>
          {t("integrations.createSheet.shops")}
        </Text>
        <OptionTiles
          inset={inset}
          options={releasedShops.map((platform) => ({
            id: platform.id,
            name: platform.name,
            onPress: () =>
              onPick({ kind: "shop", id: platform.id, name: platform.name, guide: platform.guide })
          }))}
          testID="integration-shops"
        />
        <Upcoming
          options={upcomingShops}
          inset={inset}
          separated={releasedShops.length > 0}
          testID="integration-shops-soon"
        />
      </View>
      <View>
        <ListRow
          inset={inset}
          accessibilityRole="button"
          accessibilityState={{ expanded: developersOpen }}
          onPress={onToggleDevelopers}
          style={[styles.row, styles.rowTwoLines, styles.rowSeparated]}
          testID="integration-developers"
        >
          <View style={styles.codeTile}>
            <Icon name="code" size={14} color={colors.text.primary} />
          </View>
          <View style={styles.rowTexts}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {t("integrations.createSheet.developers")}
            </Text>
            <Text numberOfLines={1} style={styles.rowDetail}>
              {t("integrations.createSheet.developersDetail", {
                names: SDK_LANGUAGES.slice(0, NAMED_LANGUAGES)
                  .map((language) => language.name)
                  .join(", "),
                count: SDK_LANGUAGES.length - NAMED_LANGUAGES
              })}
            </Text>
          </View>
          <Icon
            name={developersOpen ? "chevron-up" : "chevron-down"}
            size={13}
            color={colors.text.secondary}
          />
        </ListRow>
        {developersOpen ? (
          <>
            <OptionTiles
              inset={inset}
              options={releasedLanguages.map(({ language, published }) => ({
                id: language.id,
                name: language.name,
                onPress: () => onPick({ kind: "sdk", language, package: published })
              }))}
              spaced
              testID="integration-languages"
            />
            <Upcoming
              options={upcomingLanguages}
              inset={inset}
              separated
              testID="integration-languages-soon"
            />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * What can be chosen, in a grid: three tiles a row, two where three would be too narrow for the
 * names (TILE_CELL_MIN), from the grid's own width once measured. Until then, the width it will
 * have: a phone's sheet is as wide as the window, its inset on each side; the desktop's dialog
 * always has room for three. So a narrow phone draws two a row from its first frame, never three
 * then two. Each cell takes its share of the width (a percentage, the last row's cells too), its
 * padding the space between tiles. Nothing when nothing is released.
 */
function OptionTiles({
  inset,
  options,
  spaced = false,
  testID
}: {
  inset: number;
  options: readonly { id: IntegrationOptionId; name: string; onPress: () => void }[];
  /** Room above it: under the developers' row, not under a group's label. */
  spaced?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  const desktop = useIsDesktop();
  const screenSize = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  if (options.length === 0) return null;
  const width = measured ?? (desktop ? Infinity : screenSize.width - 2 * inset + 2 * TILE_HALF_GAP);
  const columns = width / TILE_COLUMNS < TILE_CELL_MIN ? TILE_COLUMNS_NARROW : TILE_COLUMNS;
  const cell = { width: `${100 / columns}%` as const, padding: TILE_HALF_GAP };
  return (
    <View style={[{ paddingHorizontal: inset }, spaced && styles.tilesSpaced]} testID={testID}>
      <View
        onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
        style={styles.tiles}
        testID={`${testID}-grid`}
      >
        {options.map((option) => (
          <View key={option.id} style={cell} testID={`integration-cell-${option.id}`}>
            <OptionTile {...option} compact={!desktop} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A shop or a language that can be chosen: its logo above its name, the tile its frame. Pressed or
 * under the pointer, it takes the hover tint, as the Articles grid's cards.
 */
function OptionTile({
  id,
  name,
  onPress,
  compact
}: {
  id: IntegrationOptionId;
  name: string;
  onPress: () => void;
  /** A phone's narrower tiles: the name a size smaller (tileNamePhone). */
  compact: boolean;
}) {
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      {...hoverProps}
      style={styles.tile}
      testID={`integration-option-${id}`}
    >
      {({ pressed }) => (
        <>
          <IntegrationLogo id={id} size={TILE_LOGO} framed={false} />
          <Text numberOfLines={1} style={[styles.tileName, compact && styles.tileNamePhone]}>
            {name}
          </Text>
          {hovered || pressed ? <View style={styles.tileTint} /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * What is not released yet, under "Coming soon": each a sand chip (the design system's disabled),
 * its logo beside its name, wrapped on as many lines as they take. Nothing happens on a press; a
 * screen reader reads each as unavailable. Nothing when everything is released.
 */
function Upcoming({
  options,
  inset,
  separated,
  testID
}: {
  options: readonly { id: IntegrationOptionId; name: string }[];
  inset: number;
  separated: boolean;
  testID: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (options.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: inset }} testID={testID}>
      <View style={[styles.upcoming, separated && styles.rowSeparated]}>
        <Text style={styles.upcomingLabel}>{t("integrations.createSheet.soon")}</Text>
        <View style={styles.chips}>
          {options.map(({ id, name }) => (
            <View
              key={id}
              accessible
              accessibilityLabel={t("integrations.createSheet.soonLabel", { name })}
              accessibilityState={{ disabled: true }}
              style={styles.chip}
              testID={`integration-option-${id}`}
            >
              <IntegrationLogo id={id} size={SOON_LOGO} framed={false} />
              <Text numberOfLines={1} style={styles.chipName}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * A shop's guide, a language's package or an assistant's steps, each with its key; "Done" once the
 * key shows.
 */
function OptionContent({
  screen,
  ways,
  shown,
  busy,
  onBusy,
  onCreated,
  onDone
}: {
  screen: Exclude<Screen, { kind: "catalog" }>;
  /** An assistant's ways released (assistantWays). */
  ways: readonly { via: AssistantVia; url: string }[];
  shown: ShownKey | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onCreated: (shown: ShownKey) => void;
  onDone: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const key = (context: KeyContext) => (
    <KeyCard context={context} shown={shown} busy={busy} onBusy={onBusy} onCreated={onCreated} />
  );
  const way =
    screen.kind === "assistant" ? ways.find((entry) => entry.via === screen.via) : undefined;
  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.option}
        keyboardShouldPersistTaps="handled"
        testID="integration-option"
      >
        {screen.kind === "shop" ? (
          <GuideSteps
            guide={screen.guide}
            keyStep={key({ kind: "shop", platform: screen.name, option: screen.id })}
          />
        ) : screen.kind === "sdk" ? (
          <SdkSteps
            language={screen.language}
            published={screen.package}
            keyStep={key({ kind: "sdk", option: screen.language.id })}
          />
        ) : way ? (
          <AssistantSteps
            via={way.via}
            url={way.url}
            keyStep={key({ kind: "assistant", via: way.via })}
          />
        ) : null}
      </ScrollView>
      {shown ? (
        <View style={desktop ? styles.dialogButtons : null}>
          <Button
            variant="secondary"
            size={desktop ? "sm" : "md"}
            fullWidth={!desktop}
            onPress={onDone}
            style={desktop ? styles.dialogDone : undefined}
            testID="integration-done"
          >
            {t("integrations.keySheet.done")}
          </Button>
        </View>
      ) : null}
    </>
  );
}

/**
 * "AI assistant" in the list: an AI app (Claude, ChatGPT…) making the business's invoices: a row of
 * the list, its icon on the developers' tile. Always open, in every build.
 */
function AssistantRow({ inset, onPress }: { inset: number; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const name = t("integrations.assistant.row");
  const texts = (
    <View style={styles.rowTexts}>
      <Text numberOfLines={1} style={styles.rowTitle}>
        {name}
      </Text>
      <Text numberOfLines={1} style={styles.rowDetail}>
        {t("integrations.assistant.rowDetail")}
      </Text>
    </View>
  );
  const tile = (
    <View style={styles.codeTile}>
      <Icon name="wand-magic-sparkles" size={14} color={colors.text.primary} />
    </View>
  );
  return (
    <ListRow
      inset={inset}
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={[styles.row, styles.rowTwoLines]}
      testID="integration-assistant"
    >
      {tile}
      {texts}
      <Icon name="chevron-right" size={13} color={colors.text.secondary} />
    </ListRow>
  );
}

/**
 * Where the merchant uses its assistant, when more than one way is released: in an AI app through
 * the hosted server, ready to use; in Claude Desktop, the key staying on the computer; or on a
 * server of their own, whose code is on GitHub.
 */
function AssistantChoice({
  ways,
  onPick
}: {
  ways: readonly { via: AssistantVia }[];
  onPick: (via: AssistantVia) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const inset = useSheetInset();
  return (
    <ScrollView
      style={[styles.scroll, { marginHorizontal: -inset }]}
      contentContainerStyle={styles.catalog}
      testID="assistant-choice"
    >
      <Text style={[styles.lead, { paddingHorizontal: inset }]}>
        {t("integrations.assistant.lead")}
      </Text>
      <View>
        {ways.map(({ via }, index) => (
          <ListRow
            key={via}
            inset={inset}
            accessibilityRole="button"
            onPress={() => onPick(via)}
            style={[styles.row, styles.rowTwoLines, index > 0 && styles.rowSeparated]}
            testID={`assistant-${via}`}
          >
            <View style={styles.codeTile}>
              <Icon name={WAY_ICONS[via]} size={14} color={colors.text.primary} />
            </View>
            <View style={styles.rowTexts}>
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={[styles.rowTitle, styles.titleShrink]}>
                  {t(`integrations.assistant.${via}.title`)}
                </Text>
                {WAY_BADGES[via] ? (
                  <Text numberOfLines={1} style={styles.badge} testID={`assistant-${via}-badge`}>
                    {t(WAY_BADGES[via])}
                  </Text>
                ) : null}
              </View>
              <Text numberOfLines={2} style={styles.rowDetail}>
                {t(`integrations.assistant.${via}.detail`)}
              </Text>
            </View>
            <Icon name="chevron-right" size={13} color={colors.text.secondary} />
          </ListRow>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * An assistant's steps: connect the AI app, then the key, created last: where it is asked (the
 * server's own consent page, Claude Desktop's secret field), since it shows once and the app locks
 * after 5 minutes. Connecting is, by way:
 * - the hosted server: "Add to Claude" (Claude's install link, its dialog filled in: the merchant
 *   confirms there), and for ChatGPT or any other AI app its address to paste, with ChatGPT's page
 *   where it goes (ChatGPT documents no link that fills it in);
 * - Claude Desktop: its bundle to download and open;
 * - a server of one's own: its code and guide on GitHub, what whoever runs it sees, then its
 *   address added as the hosted one's.
 */
function AssistantSteps({
  via,
  url,
  keyStep
}: {
  via: AssistantVia;
  url: string;
  keyStep: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const copyAddress = () => {
    const failed = (error?: unknown) => {
      logFailure("Copying the assistant's address failed", error, false);
      notify({
        tone: "error",
        title: t("integrations.assistant.hostedSteps.copyFailed"),
        key: "integrations"
      });
    };
    Clipboard.setStringAsync(url).then(
      (ok) =>
        ok
          ? notify({
              tone: "success",
              title: t("integrations.assistant.hostedSteps.copied"),
              key: "integrations"
            })
          : failed(),
      failed
    );
  };
  return (
    <View style={styles.sdk} testID={`assistant-steps-${via}`}>
      <Text style={styles.lead}>{t("integrations.assistant.lead")}</Text>
      <View>
        {via === "hosted" ? (
          <>
            <Step
              marker={<NumberMarker number={1} />}
              title={t("integrations.assistant.hostedSteps.add.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.hostedSteps.add.claude")}
              </Text>
              <Button
                variant="secondary"
                icon="arrow-up-right-from-square"
                size="sm"
                fullWidth={false}
                onPress={() => openExternal(claudeConnectorLink(url))}
                testID="assistant-add-claude"
              >
                {t("integrations.assistant.hostedSteps.addClaude")}
              </Button>
              <Text style={[styles.stepBody, styles.stepBodySpaced]}>
                {t("integrations.assistant.hostedSteps.add.other")}
              </Text>
              <Text selectable style={styles.code} testID="assistant-address">
                {url}
              </Text>
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  icon="copy"
                  size="sm"
                  fullWidth={false}
                  onPress={copyAddress}
                  testID="assistant-copy-address"
                >
                  {t("integrations.assistant.hostedSteps.copy")}
                </Button>
                <Button
                  variant="secondary"
                  icon="arrow-up-right-from-square"
                  size="sm"
                  fullWidth={false}
                  onPress={() => openExternal(CHATGPT_CONNECTORS_PAGE)}
                  testID="assistant-open-chatgpt"
                >
                  {t("integrations.assistant.hostedSteps.openChatGpt")}
                </Button>
              </View>
            </Step>
            <Step
              marker={<NumberMarker number={2} />}
              title={t("integrations.assistant.hostedSteps.connect.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.hostedSteps.connect.body")}
              </Text>
            </Step>
          </>
        ) : via === "desktop" ? (
          <>
            <Step
              marker={<NumberMarker number={1} />}
              title={t("integrations.assistant.desktopSteps.download.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.desktopSteps.download.body")}
              </Text>
              <ReleaseLink
                page={{ label: t("integrations.assistant.desktopSteps.download.link"), url }}
                release={{
                  file: DESKTOP_BUNDLE,
                  label: (version) =>
                    t("integrations.assistant.desktopSteps.download.file", { version })
                }}
                failure="Reading the assistant's latest release failed"
                testID="assistant-bundle"
              />
            </Step>
            <Step
              marker={<NumberMarker number={2} />}
              title={t("integrations.assistant.desktopSteps.open.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.desktopSteps.open.body")}
              </Text>
            </Step>
          </>
        ) : (
          <>
            <Step
              marker={<NumberMarker number={1} />}
              title={t("integrations.assistant.selfHostedSteps.install.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.selfHostedSteps.install.body")}
              </Text>
              <ExternalLink
                label={t("integrations.assistant.selfHostedSteps.install.link")}
                url={url}
                testID="assistant-self-hosted-code"
              />
              {/*
               * Whoever runs the server sees each request's key and the invoices it makes, in
               * memory (the server's SELF-HOSTING.md, "What you take on"): said before the merchant
               * trusts a server with a key, and how it ends.
               */}
              <Callout
                tone="warning"
                title={t("integrations.assistant.selfHostedSteps.trust.title")}
                testID="assistant-self-hosted-trust"
              >
                {t("integrations.assistant.selfHostedSteps.trust.body")}
              </Callout>
            </Step>
            <Step
              marker={<NumberMarker number={2} />}
              title={t("integrations.assistant.selfHostedSteps.add.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.selfHostedSteps.add.body")}
              </Text>
            </Step>
            <Step
              marker={<NumberMarker number={3} />}
              title={t("integrations.assistant.selfHostedSteps.connect.title")}
              last={false}
            >
              <Text style={styles.stepBody}>
                {t("integrations.assistant.selfHostedSteps.connect.body")}
              </Text>
            </Step>
          </>
        )}
        <Step marker={<KeyMarker />} title={t("integrations.assistant.keyStep.title")} last>
          {keyStep}
        </Step>
      </View>
    </View>
  );
}

/** A plugin's guide, step after step, the key at its own step. */
function GuideSteps({ guide, keyStep }: { guide: Guide; keyStep: ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const steps = guide(t);
  return (
    <View testID="integration-guide">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        if (step.kind === "key") {
          return (
            <Step
              key="key"
              marker={<KeyMarker />}
              title={t("integrations.keyStep.title")}
              last={last}
            >
              {keyStep}
            </Step>
          );
        }
        if (step.kind === "files") {
          return (
            <Step
              key={index}
              marker={<NumberMarker number={index + 1} />}
              title={step.title}
              last={last}
            >
              <PluginFiles
                body={step.body}
                files={step.files}
                screenshot={
                  step.image ? (
                    <Screenshot image={step.image} testID={`integration-guide-image-${index}`} />
                  ) : null
                }
              />
            </Step>
          );
        }
        return (
          <Step
            key={index}
            marker={<NumberMarker number={index + 1} />}
            title={step.title}
            last={last}
          >
            <Text style={styles.stepBody}>{step.body}</Text>
            {step.code ? (
              <Text selectable style={styles.code} testID={`integration-guide-code-${index}`}>
                {step.code}
              </Text>
            ) : null}
            {step.image ? (
              <Screenshot image={step.image} testID={`integration-guide-image-${index}`} />
            ) : null}
            {step.link?.release ? (
              <ReleaseLink
                page={step.link}
                release={step.link.release}
                failure="Reading a plugin's latest release failed"
                testID={`integration-guide-release-${index}`}
              />
            ) : step.link ? (
              <ExternalLink label={step.link.label} url={step.link.url} />
            ) : null}
          </Step>
        );
      })}
    </View>
  );
}

/** A language's SDK: its package (its registry's page), then the key. */
function SdkSteps({
  language,
  published,
  keyStep
}: {
  language: SdkLanguage;
  published: SdkPackage;
  keyStep: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.sdk} testID="integration-sdk">
      <Text style={styles.lead}>{t("integrations.sdk.lead", { name: language.name })}</Text>
      <View>
        <Step
          marker={<NumberMarker number={1} />}
          title={t("integrations.sdk.package")}
          last={false}
        >
          <Pressable
            {...externalLinkProps(published.url)}
            accessibilityRole="link"
            accessibilityLabel={t("integrations.sdk.openLabel", {
              name: published.name,
              site: published.site
            })}
            style={({ pressed }) => [styles.package, pressed && styles.pressed]}
            testID="integration-package"
          >
            <View style={styles.packageTexts}>
              <Text numberOfLines={2} style={styles.packageName}>
                {published.name}
              </Text>
              <Text numberOfLines={1} style={styles.packageSite}>
                {t("integrations.sdk.open", { site: published.site })}
              </Text>
            </View>
            <Icon name="arrow-up-right-from-square" size={14} color={colors.text.accent} />
          </Pressable>
          <Text style={styles.fine}>{t("integrations.sdk.readme")}</Text>
        </Step>
        <Step marker={<KeyMarker />} title={t("integrations.sdk.key")} last>
          {keyStep}
        </Step>
      </View>
    </View>
  );
}

/** A step: its marker on a line down to the next one, its title, what it holds. */
function Step({
  marker,
  title,
  last,
  children
}: {
  marker: ReactNode;
  title: string;
  last: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        {marker}
        {last ? null : <View style={styles.railLine} />}
      </View>
      <View style={[styles.stepTexts, !last && styles.stepSpaced]}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function NumberMarker({ number }: { number: number }) {
  const styles = useStyles();
  return (
    <View style={styles.marker}>
      <Text style={styles.markerText}>{number}</Text>
    </View>
  );
}

function KeyMarker() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.marker, styles.markerKey]}>
      <Icon name="key" size={12} color={colors.text.onAccent} />
    </View>
  );
}

/**
 * The platform's screen at a step: as wide as the step, at its own aspect ratio, never wider than
 * it was taken (half its pixels: taken at 2×), framed from the panel it lies on. Its box bounds
 * the width, its frame inside holds the ratio, the image fills it. The ratio is never on the
 * bounded view itself: Yoga takes a height from the ratio and the width before `maxWidth` bounds
 * that width, a frame taller than its image wherever the step is wider (a tablet's sheet, the
 * dialog). And an Image takes its file's size in pixels for a size it is not given (react-native
 * and react-native-web alike), which a ratio on the image does not override.
 */
function Screenshot({ image, testID }: { image: GuideImage; testID: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.screenshotBox, { maxWidth: image.width / 2 }]} testID={testID}>
      <View
        style={[styles.screenshot, { aspectRatio: image.width / image.height }]}
        testID={`${testID}-frame`}
      >
        <Image
          source={image.source}
          accessible
          accessibilityRole="image"
          accessibilityLabel={image.label}
          // A screenshot keeps its colours under the system's Smart Invert, as the app's photos.
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          style={styles.screenshotImage}
        />
      </View>
    </View>
  );
}

/**
 * "Source code" in the header of a shop's guide or a language's package: its repository on GitHub
 * (sattleme/checkout-<id>, sourceCodeUrl), GitHub's mark then the label, as discreet as
 * QuietAction (the caption's grey, darker when hovered or pressed). On a phone, the label shows
 * only when the page's title and it both fit on the header's line, as measured off screen in the
 * device's language and text size (as SegmentedControl's labels): else the mark alone, a 44 px
 * target, until then too. The title is never cut. Its name for a screen reader says whose code
 * and where.
 */
function SourceCodeLink({ name, url }: { name: string; url: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const inset = useSheetInset();
  const { width } = useWindowDimensions();
  const { hovered, hoverProps } = useHover();
  const [widths, setWidths] = useState<{ title?: number; label?: number }>({});
  const keepWidth = (text: "title" | "label") => (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    // A hidden view on the web reports 0 (PillMeasures.tsx).
    if (measured <= 0) return;
    setWidths((known) => (known[text] === measured ? known : { ...known, [text]: measured }));
  };
  const label = t("integrations.createSheet.source");
  // A phone's sheet is as wide as the window. A pixel more for each text: the web rounds a
  // layout's width to a whole pixel (Sheet's TitleView). The desktop's dialog (600 px) always has
  // room.
  const labelled =
    desktop ||
    (widths.title !== undefined &&
      widths.label !== undefined &&
      widths.title + 1 + widths.label + 1 <= width - 2 * inset - SOURCE_FIXED);
  return (
    <>
      <Pressable
        {...externalLinkProps(url)}
        accessibilityRole="link"
        accessibilityLabel={t("integrations.createSheet.sourceLabel", { name })}
        {...hoverProps}
        style={[styles.source, !labelled && styles.sourceMarkOnly]}
        testID="integration-source"
      >
        {({ pressed }) => {
          const color = hovered || pressed ? colors.text.primary : colors.text.secondary;
          return (
            <>
              <Icon name="github" size={SOURCE_MARK} color={color} />
              {labelled ? (
                <Text numberOfLines={1} style={[styles.sourceLabel, { color }]}>
                  {label}
                </Text>
              ) : null}
            </>
          );
        }}
      </Pressable>
      {/* The title and the label, off screen: measured again when the text size changes. */}
      <View style={styles.measures} {...outOfReach(true)}>
        <View style={styles.measuresInner}>
          <Text
            style={SHEET_TITLE_FONT}
            onLayout={keepWidth("title")}
            testID="integration-source-measure-title"
          >
            {name}
          </Text>
          <Text
            style={styles.sourceLabel}
            onLayout={keepWidth("label")}
            testID="integration-source-measure-label"
          >
            {label}
          </Text>
        </View>
      </View>
    </>
  );
}

/**
 * A file of a GitHub repository's latest release (Claude Desktop's bundle, a plugin's archive): the
 * file itself once GitHub said which (src/lib/github/latest-release.ts, read once its step shows),
 * the release's page until then or when it cannot say. The link's address changes, never a press's
 * handler: the web app opens it as a plain link, within the click (no tab opened after a wait).
 * `failure` is what the journal says when GitHub cannot say (logFailure).
 */
function ReleaseLink({
  page,
  release,
  failure,
  testID
}: {
  page: { label: string; url: string };
  release: { file: ReleaseFile; label: (version: string) => string };
  failure: string;
  testID: string;
}) {
  const [download, setDownload] = useState<ReleaseDownload | null>(null);
  const { file } = release;
  useEffect(() => {
    let shown = true;
    fetchReleaseDownload(file).then(
      (found) => {
        if (shown) setDownload(found);
      },
      (error: unknown) => logFailure(failure, error)
    );
    return () => {
      shown = false;
    };
  }, [file, failure]);
  return download ? (
    <ExternalLink
      label={release.label(download.version)}
      url={download.url}
      icon="download"
      testID={`${testID}-download`}
    />
  ) : (
    <ExternalLink label={page.label} url={page.url} testID={`${testID}-page`} />
  );
}

type KeyContext =
  | { kind: "shop"; platform: string; option: IntegrationOptionId }
  | { kind: "sdk"; option: IntegrationOptionId }
  | { kind: "assistant"; via: AssistantVia };

/** What a failure says, for an integration's key or an assistant's (`tooMany`: its own limit). */
function failureText(t: TFunction, failure: Failure, assistant: boolean): string {
  return assistant && failure === "tooMany"
    ? t("integrations.errors.tooManyAssistants", { max: MAX_ASSISTANTS })
    : t(`integrations.errors.${failure}`, { max: MAX_INTEGRATIONS });
}

/**
 * The key: a name (the shop's, shown next to its sales; the assistant's, next to its invoices),
 * then "Create the key"; once created, the key itself, this once, with how to keep it. Copied with
 * its button (expo-clipboard), never shared through the system's share sheet: a secret goes where
 * its holder pastes it.
 */
function KeyCard({
  context,
  shown,
  busy,
  onBusy,
  onCreated
}: {
  context: KeyContext;
  shown: ShownKey | null;
  /** The key being created: the sheet's own state, which also keeps the panel from closing. */
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onCreated: (shown: ShownKey) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [name, setName] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  /**
   * An assistant's permissions, each chosen here: whether it makes invoices (on unless the owner
   * turns it off, for good: Assistant.invoicing), and whether it may read the sales and payments
   * sent to export them (off unless the owner turns it on, withdrawn or allowed later from the
   * list). At least one.
   */
  const [invoicingAllowed, setInvoicingAllowed] = useState(true);
  const [exportAllowed, setExportAllowed] = useState(false);
  // Two taps in the same frame both see `busy` false: never a second integration, whose key would
  // replace the first one's before it showed.
  const creating = useRef(false);
  const empty = name.trim() === "";
  const assistant = context.kind === "assistant";
  const nonePicked = assistant && !invoicingAllowed && !exportAllowed;

  if (shown) {
    return (
      <View style={styles.keyCard}>
        <SecretKey shown={shown} via={assistant ? context.via : null} />
      </View>
    );
  }

  const create = () => {
    if (creating.current || empty || nonePicked) return;
    creating.current = true;
    onBusy(true);
    setFailure(null);
    const made: Promise<ShownKey> =
      context.kind === "assistant"
        ? createAssistant(name, { invoicing: invoicingAllowed }).then(
            async ({ assistant: made, secretKey, published }) => {
              // Its lot of on-chain addresses, empty until now, fills in the background at once,
              // not at the next login or unlock: its MCP server takes its invoices' on-chain
              // addresses there (owner-addresses.ts), from its first invoice. None for an assistant
              // without invoices.
              if (invoicingAllowed) void syncEmployeeAddresses({ again: true });
              // Its export allowed next (setAssistantExport): a failure never hides the key, which
              // shows this once; the owner allows it again from the list.
              if (exportAllowed) {
                await setAssistantExport(made, true).catch((error: unknown) => {
                  logFailure("Allowing a new assistant's export failed", error);
                  notify({
                    tone: "error",
                    title: t("integrations.assistant.export.createFailedTitle"),
                    body: t("integrations.assistant.export.createFailed", { name: made.name }),
                    key: "integrations-export"
                  });
                });
              }
              return {
                kind: "assistant" as const,
                name: made.name,
                secretKey,
                published,
                invoicing: invoicingAllowed
              };
            }
          )
        : createIntegration(name, context.option).then(({ integration, secretKey, published }) => {
            // Its lot of on-chain addresses, empty until now, fills in the background at once, not
            // at the next login or unlock: its server takes on-chain payments as soon as the first
            // copy is published (integration-addresses.ts).
            void syncIntegrationAddresses({ again: true });
            return { kind: "integration", name: integration.name, secretKey, published };
          });
    made.then(
      (next) => {
        creating.current = false;
        onBusy(false);
        onCreated(next);
      },
      (error: unknown) => {
        // Nothing was created (its record on no majority of the relays): trying again is safe.
        creating.current = false;
        onBusy(false);
        setFailure(codeOf(error, "unreachable"));
      }
    );
  };

  return (
    <View style={styles.keyCard} testID="integration-key-step">
      <Text style={styles.stepBody}>
        {context.kind === "shop"
          ? t("integrations.keyStep.leadShop", { platform: context.platform })
          : context.kind === "sdk"
            ? t("integrations.keyStep.leadSdk")
            : t(KEY_LEAD[context.via])}
      </Text>
      <TextField
        label={
          context.kind === "shop"
            ? t("integrations.keyStep.shopName")
            : context.kind === "sdk"
              ? t("integrations.keyStep.siteName")
              : t("integrations.assistant.keyStep.name")
        }
        value={name}
        onChangeText={(value) => {
          setName(value.slice(0, MEMBER_NAME_MAX_LENGTH));
          setFailure(null);
        }}
        placeholder={
          assistant
            ? t("integrations.assistant.keyStep.namePlaceholder")
            : t("integrations.createSheet.namePlaceholder")
        }
        error={failure ? failureText(t, failure, assistant) : null}
        testID="integration-name"
      />
      <Text style={styles.fine}>
        {assistant
          ? t("integrations.assistant.keyStep.nameHint")
          : t("integrations.keyStep.nameHint")}
      </Text>
      {assistant ? (
        // What the assistant may do, each permission chosen here. Its invoices, for good (its
        // record's format 4 without them); the export of the transactions, off unless turned on
        // here or later from the list (export-grants.ts).
        <View style={styles.permissions} testID="assistant-permissions">
          <Text accessibilityRole="header" style={styles.groupLabel}>
            {t("integrations.assistant.keyStep.permissionsTitle")}
          </Text>
          <View style={styles.exportRow}>
            <View style={styles.exportTexts}>
              <Text style={styles.exportTitle}>{t("integrations.assistant.invoicing.switch")}</Text>
              <Text style={styles.fine}>{t("integrations.assistant.invoicing.switchHint")}</Text>
            </View>
            <Switch
              value={invoicingAllowed}
              onValueChange={setInvoicingAllowed}
              label={t("integrations.assistant.invoicing.switch")}
              disabled={busy}
              testID="assistant-invoicing-switch"
            />
          </View>
          <View style={styles.exportRow}>
            <View style={styles.exportTexts}>
              <Text style={styles.exportTitle}>{t("integrations.assistant.export.switch")}</Text>
              {/* Unless suspended (exportGrantsSuspended), as while white-hat finding A1 was open. */}
              <Text style={styles.fine}>
                {t(
                  exportGrantsSuspended()
                    ? "integrations.assistant.export.suspended"
                    : "integrations.assistant.export.switchHint"
                )}
              </Text>
            </View>
            <Switch
              value={exportAllowed}
              onValueChange={setExportAllowed}
              label={t("integrations.assistant.export.switch")}
              disabled={busy || exportGrantsSuspended()}
              testID="assistant-export-switch"
            />
          </View>
          {nonePicked ? (
            <ErrorMessage testID="assistant-none-picked">
              {t("integrations.assistant.keyStep.nonePicked")}
            </ErrorMessage>
          ) : null}
        </View>
      ) : null}
      {assistant ? (
        // What its holder can never do, before the key exists (SPEC.md §3 of
        // sattleme/mcp-server): spend. And where it goes.
        <Callout
          tone="warning"
          title={t("integrations.assistant.keyStep.powerTitle")}
          testID="assistant-key-power"
        >
          {t(`integrations.assistant.keyStep.power.${context.via}`)}
        </Callout>
      ) : (
        /*
         * One key, one shop (checkout-spec SPEC.md §8): an order's sale derives from the key and
         * the order's reference, so two shops sharing a key would mix their orders. Nothing can
         * stop a key being copied: the owner is told before the key exists.
         */
        <Callout
          tone="warning"
          title={t("integrations.createSheet.oneShopTitle")}
          testID="integration-one-shop"
        >
          {t("integrations.createSheet.oneShop")}
        </Callout>
      )}
      <View style={desktop ? styles.dialogButtons : null}>
        <Button
          size={desktop ? "sm" : "md"}
          fullWidth={!desktop}
          onPress={create}
          disabled={empty || nonePicked}
          loading={busy}
          style={desktop ? styles.dialogCreate : undefined}
          testID="integration-create"
        >
          {t("integrations.keyStep.create")}
        </Button>
      </View>
    </View>
  );
}

/**
 * The secret key, whole, and how to keep it: shown this once, which it says; and when no majority
 * of the relays took its channel yet, that its server does not find it until the next unlock
 * publishes it. An assistant's says where it is pasted (`via`).
 */
function SecretKey({ shown, via }: { shown: ShownKey; via: AssistantVia | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const name = shown.name;
  const assistant = shown.kind === "assistant";

  const copy = () => {
    // Refused (`error`), or not copied (`false`, the web's failure): both journaled, the error's
    // kind and code only, never what it was given, the key.
    const copyFailed = (error?: unknown) => {
      logFailure("Copying the integration's key failed", error, false);
      notify({ tone: "error", title: t("integrations.keySheet.copyFailed"), key: "integrations" });
    };
    copySecret(shown.secretKey).then(
      (ok) =>
        ok
          ? notify({
              tone: "success",
              title: t("integrations.keySheet.copied"),
              key: "integrations"
            })
          : copyFailed(),
      copyFailed
    );
  };

  return (
    <>
      <Text style={styles.keyTitle}>{t("integrations.keySheet.title", { name })}</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t("integrations.keySheet.keyLabel")}</Text>
        <Text selectable style={styles.secret} testID="integration-key">
          {shown.secretKey}
        </Text>
        {/* Right under the key, at its label's width (not a full width button under the
            warning). */}
        <Button icon="copy" size="sm" fullWidth={false} onPress={copy} testID="integration-copy">
          {t("integrations.keySheet.copy")}
        </Button>
      </View>
      <Text style={styles.once} testID="integration-key-once">
        {t(assistant ? "integrations.assistant.keySheet.once" : "integrations.keySheet.once")}
      </Text>
      {shown.published ? null : (
        <ErrorMessage testID="integration-unpublished">
          {t(
            assistant
              ? "integrations.assistant.keySheet.unpublished"
              : "integrations.keySheet.unpublished",
            { name }
          )}
        </ErrorMessage>
      )}
      <Text style={styles.fine}>
        {t(assistant ? "integrations.assistant.keySheet.secret" : "integrations.keySheet.secret")}
      </Text>
      {via ? (
        // Its first request, for example: an invoice, or the export for one that makes none.
        <Text style={styles.stepBody} testID="assistant-paste">
          {t(shown.invoicing === false ? KEY_PASTE_EXPORT[via] : KEY_PASTE[via])}
        </Text>
      ) : null}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // Shrinks to what the panel leaves it (85 % of the screen, the dialog's 640 px), then scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
  catalog: { gap: space[5] },
  option: { gap: space[5] },
  // The 44 px touch floor is its own height (react-native-web ignores `hitSlop`).
  source: {
    minHeight: control.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3]
  },
  sourceMarkOnly: { minWidth: control.min, justifyContent: "center", paddingHorizontal: 0 },
  sourceLabel: { ...sans(500), fontSize: type.caption },
  measures: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none"
  },
  measuresInner: { position: "absolute", top: 0, left: 0, width: 1000, alignItems: "flex-start" },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  groupLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary,
    paddingBottom: space[2]
  },
  row: { height: ROW, flexDirection: "row", alignItems: "center", gap: space[5] },
  rowTwoLines: { height: "auto", minHeight: ROW_TWO_LINES, paddingVertical: space[3] },
  rowSeparated: { borderTopWidth: stroke.hairline, borderTopColor: colors.border.subtle },
  rowTexts: { flex: 1, minWidth: 0, gap: space[1] },
  rowTitle: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  rowDetail: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  // A title and its label: the label goes under the title when both do not fit on a line.
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space[3],
    rowGap: space[1]
  },
  titleShrink: { flexShrink: 1 },
  // Discreet: the sand of the logos' tiles, the details' grey, smaller than the title.
  badge: {
    ...sans(600),
    fontSize: type.caption,
    color: colors.text.secondary,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  // The grid: its cells' padding reaches the inset's edge, as the rows' content did.
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -TILE_HALF_GAP,
    marginVertical: -TILE_HALF_GAP,
    paddingBottom: space[4]
  },
  tilesSpaced: { paddingTop: space[4] },
  tile: {
    height: TILE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[2],
    borderRadius: radius.md,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface,
    // The hover tint stays inside the rounded corners.
    overflow: "hidden"
  },
  tileName: {
    ...sans(600),
    maxWidth: "100%",
    fontSize: type.label,
    letterSpacing: tracked.label,
    textAlign: "center",
    color: colors.text.primary
  },
  // A phone's tiles are narrower: the longest names whole from 390 px (TILE_CELL_MIN).
  tileNamePhone: { fontSize: type.caption },
  tileTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.hoverOverlay,
    pointerEvents: "none"
  },
  // "Coming soon": its label, then its chips, wrapped.
  upcoming: { gap: space[3], paddingVertical: space[4] },
  upcomingLabel: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  chip: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  chipName: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  // The developers' row, as a logo's tile: the code icon of "Integrations".
  codeTile: {
    width: LOGO,
    height: LOGO,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  },
  fine: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary
  },
  permissions: { gap: space[4] },
  exportRow: { flexDirection: "row", alignItems: "center", gap: space[5] },
  exportTexts: { flex: 1, minWidth: 0, gap: space[1] },
  exportTitle: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.4,
    color: colors.text.primary
  },
  sdk: { gap: space[6] },
  step: { flexDirection: "row", gap: space[5] },
  rail: { alignItems: "center" },
  railLine: {
    flex: 1,
    width: stroke.hairline,
    marginTop: space[2],
    backgroundColor: colors.border.subtle
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  },
  markerKey: { backgroundColor: colors.background.accent },
  markerText: { ...sans(700), fontSize: 13, color: colors.text.primary },
  stepTexts: { flex: 1, minWidth: 0, gap: space[3], paddingTop: 3 },
  stepSpaced: { paddingBottom: space[8] },
  stepTitle: {
    ...sans(700),
    fontSize: type.body,
    lineHeight: 21,
    color: colors.text.primary
  },
  stepBody: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.5,
    color: colors.text.secondary
  },
  // Claude's way, then the other AI apps': apart, as two paragraphs.
  stepBodySpaced: { marginTop: space[3] },
  // Buttons side by side, the next line when they do not fit.
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  // Commands as they are typed, on the key's sand: a line too long for the panel wraps.
  code: {
    ...mono(500),
    fontSize: 12.5,
    lineHeight: 12.5 * 1.6,
    color: colors.text.primary,
    paddingVertical: space[4],
    paddingHorizontal: space[5],
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  screenshotBox: { width: "100%" },
  // The screenshot's own white, kept apart from the panel by a hairline.
  screenshot: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    overflow: "hidden"
  },
  screenshotImage: { width: "100%", height: "100%" },
  pressed: { backgroundColor: colors.hoverOverlay },
  package: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    paddingVertical: space[5],
    paddingHorizontal: space[6],
    borderRadius: radius.md,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle
  },
  packageTexts: { flex: 1, minWidth: 0, gap: space[1] },
  packageName: { ...mono(500), fontSize: 13.5, color: colors.text.primary },
  packageSite: { ...sans(600), fontSize: type.caption, color: colors.text.accent },
  keyCard: {
    gap: space[5],
    marginTop: space[2],
    padding: space[6],
    borderRadius: radius.lg,
    borderWidth: stroke.control,
    borderColor: colors.border.accent,
    backgroundColor: colors.background.surface
  },
  keyTitle: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  },
  field: { gap: 8 },
  fieldLabel: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  // The whole key, its lines broken anywhere: it has no spaces.
  secret: {
    ...mono(500),
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.text.primary,
    paddingVertical: space[4],
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  once: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.45,
    color: colors.text.primary
  },
  // The buttons' widths at least: a longer label widens its button, a row too long wraps.
  dialogButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  dialogCreate: { minWidth: 180 },
  dialogDone: { minWidth: 120 }
}));
