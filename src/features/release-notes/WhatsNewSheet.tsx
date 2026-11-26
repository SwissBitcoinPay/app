import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";

import { openExternal } from "@/components/ui/external-link";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { SOURCE_URL } from "@/config/source";
import { FALLBACK_LANGUAGE, LANGUAGES, type Language } from "@/i18n/languages";
import { getAppInfo } from "@/lib/app-info";
import { formatDate } from "@/lib/locale/date";
import { getDeviceLocale } from "@/lib/locale/device";
import { parseMarkdown, type Span } from "@/lib/release-notes/markdown";
import { makeStyles, radius, sans, space, type } from "@/theme";

import { notesOf, shownReleases, type ShownRelease } from "./releases";

/** The notes' column at most this tall, and never more than this share of the window. */
const NOTES_MAX_HEIGHT = 520;
const NOTES_WINDOW_SHARE = 0.6;

/**
 * "What's new": every version's notes this app shows (releases.ts), the latest first, in the UI's
 * language; the source code in the header (GitHub's mark). A bottom sheet on a phone, a dialog on
 * a computer (Sheet). Its notes scroll within it. `fresh`: the notes marked "New".
 */
export function WhatsNewSheet({
  visible,
  onClose,
  fresh
}: {
  visible: boolean;
  onClose: () => void;
  fresh: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("whatsNew.title")}
      closeLabel={t("whatsNew.close")}
      visible={visible}
      onClose={onClose}
      headerAction={
        <IconButton
          icon="github"
          label={t("whatsNew.source")}
          onPress={() => openExternal(SOURCE_URL)}
          testID="whats-new-source"
        />
      }
      testID="whats-new"
    >
      <WhatsNewBody fresh={fresh} />
    </Sheet>
  );
}

function WhatsNewBody({ fresh }: { fresh: string | null }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const releases = shownReleases(getAppInfo());
  const resolved = i18n.resolvedLanguage ?? "";
  const language = (LANGUAGES as readonly string[]).includes(resolved)
    ? (resolved as Language)
    : FALLBACK_LANGUAGE;
  const notes = notesOf(language);
  const maxHeight = Math.min(NOTES_MAX_HEIGHT, Math.round(height * NOTES_WINDOW_SHARE));
  if (releases.length === 0) {
    return (
      <Text style={styles.empty} testID="whats-new-empty">
        {t("whatsNew.empty")}
      </Text>
    );
  }
  return (
    <ScrollView style={{ maxHeight }} contentContainerStyle={styles.list}>
      {releases.map((release, index) => (
        <View
          key={release.key}
          style={[styles.release, index > 0 && styles.releaseNext]}
          testID={`whats-new-${release.key}`}
        >
          <ReleaseHeader release={release} fresh={release.key === fresh} />
          <Notes markdown={notes[release.key] ?? ""} />
        </View>
      ))}
    </ScrollView>
  );
}

function ReleaseHeader({ release, fresh }: { release: ShownRelease; fresh: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const name =
    release.version === null
      ? t("whatsNew.next")
      : t("common.version", { version: release.version });
  const date =
    release.date === null
      ? null
      : formatDate(new Date(`${release.date}T00:00:00Z`), getDeviceLocale().languageTag, {
          dateStyle: "long",
          timeZone: "UTC"
        });
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.name}>
        {name}
      </Text>
      {date ? <Text style={styles.date}>{date}</Text> : null}
      {fresh ? (
        <View style={styles.pill} testID="whats-new-fresh">
          <Text style={styles.pillLabel}>{t("whatsNew.new")}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A version's notes (markdown.ts): its titles, paragraphs and lists, in the theme's text. */
function Notes({ markdown }: { markdown: string }) {
  const styles = useStyles();
  return (
    <View style={styles.notes}>
      {parseMarkdown(markdown).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <Text key={index} accessibilityRole="header" style={styles.heading}>
              <Spans spans={block.spans} />
            </Text>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <Text key={index} style={styles.text}>
              <Spans spans={block.spans} />
            </Text>
          );
        }
        return (
          <View key={index} style={styles.items} role="list">
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.item} role="listitem">
                <Text style={styles.bullet} aria-hidden>
                  •
                </Text>
                <Text style={[styles.text, styles.itemText]}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Spans({ spans }: { spans: Span[] }) {
  const styles = useStyles();
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <Text key={index} style={styles.bold}>
            {span.text}
          </Text>
        ) : (
          <Fragment key={index}>{span.text}</Fragment>
        )
      )}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { paddingBottom: space[2] },
  release: { gap: space[4] },
  // Each earlier version under a hairline.
  releaseNext: {
    marginTop: space[7],
    paddingTop: space[7],
    borderTopWidth: 1,
    borderTopColor: colors.border.faint
  },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: space[4] },
  name: { ...sans(700), fontSize: type.action, color: colors.text.primary },
  date: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  // Apricot and umber: readable in both themes (orange is a fill, never text).
  pill: {
    alignSelf: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[1],
    borderRadius: radius.pill,
    backgroundColor: colors.background.accentSubtle
  },
  pillLabel: { ...sans(700), fontSize: type.overline, color: colors.text.accent },
  notes: { gap: space[3] },
  heading: { ...sans(700), fontSize: type.prose, color: colors.text.primary, marginTop: space[2] },
  text: { ...sans(500), fontSize: type.prose, lineHeight: 21, color: colors.text.primary },
  bold: sans(700),
  items: { gap: space[2] },
  item: { flexDirection: "row", gap: space[3] },
  bullet: { ...sans(500), fontSize: type.prose, lineHeight: 21, color: colors.text.secondary },
  itemText: { flex: 1 },
  empty: { ...sans(500), fontSize: type.prose, lineHeight: 21, color: colors.text.secondary }
}));
