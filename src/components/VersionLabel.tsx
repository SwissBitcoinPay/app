import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useHover } from "@/components/ui/useHover";
import { useWhatsNew } from "@/features/release-notes/useWhatsNew";
import { WhatsNewSheet } from "@/features/release-notes/WhatsNewSheet";
import { type AppInfo, chipParts, getAppInfo, getBuildTags } from "@/lib/app-info";
import { control, makeStyles, sans, tracking, type } from "@/theme";

/** The chip's height on one line; its corners are half of it, round however it wraps. */
const CHIP_HEIGHT = 26;

/**
 * Up to the 44 px touch floor without moving anything: the chip is 26 px high. Less above, where
 * a screen's last control may end close to it (a later sibling's slop would take its taps); below,
 * nothing that takes a touch (the screen's end).
 */
const HIT_SLOP = { top: 8, bottom: 10, left: 8, right: 8 };

/** The tag's line, in px: its touch area grows to the floor around it (VersionTag). */
const TAG_LINE = 13;
/** Above and below the tag's line up to the 44 px floor, taken back by as much margin. */
const TAG_REACH = (control.min - TAG_LINE) / 2;
/** Beside its text, taken back the same way. */
const TAG_SIDE = 8;

/**
 * The build in words, for screen readers: the whole build in staging, for testers
 * ("Version 3.0.0 · f82ecab · staging"), "Version 3.0.0" in production.
 */
function spokenBuild(info: AppInfo, version: string): string {
  const spoken = [version];
  if (info.variant === "staging") spoken.push(...getBuildTags(info));
  return spoken.join(" · ");
}

/**
 * Which build runs, in a chip (`chipParts`): in the staging app, the commit in bold, then
 * "staging" behind an orange dot, parted by a thin rule; in production, the release tag's name
 * ("v3.0.0") alone. It opens "What's new" (WhatsNewSheet); while its latest notes were never
 * opened on this device, "What's new" and an orange dot end the chip. Screen readers get the
 * words: what it opens, then the build (`spokenBuild`).
 * The same wherever it shows; `style` places it, and the button is as wide as the chip
 * (`alignSelf`). The primary text on the theme's hover tint, its ring darker when hovered or pressed.
 */
export function VersionLabel({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const whatsNew = useWhatsNew();
  const info = getAppInfo();
  const [first, ...rest] = chipParts(info);
  const build = spokenBuild(info, t("common.version", { version: info.version }));
  return (
    <>
      <Pressable
        {...hoverProps}
        onPress={whatsNew.open}
        accessibilityRole="button"
        accessibilityLabel={t(whatsNew.unread ? "whatsNew.openUnread" : "whatsNew.open", { build })}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => [styles.chip, (hovered || pressed) && styles.active, style]}
        testID={testID}
      >
        <Text style={[styles.part, styles.first]}>{first}</Text>
        {rest.map((part) => (
          <Fragment key={part}>
            <View style={styles.rule} />
            {part === "staging" ? (
              <View style={styles.staging}>
                <View style={styles.dot} testID={testID && `${testID}-staging-dot`} />
                <Text style={styles.part}>{part}</Text>
              </View>
            ) : (
              <Text style={styles.part}>{part}</Text>
            )}
          </Fragment>
        ))}
        {whatsNew.unread ? (
          <>
            <View style={styles.rule} />
            <View style={styles.staging}>
              <Text style={styles.part}>{t("whatsNew.title")}</Text>
              <View style={styles.dot} testID={testID && `${testID}-unread`} />
            </View>
          </>
        ) : null}
      </Pressable>
      <WhatsNewSheet visible={whatsNew.visible} onClose={whatsNew.close} fresh={whatsNew.fresh} />
    </>
  );
}

/**
 * The build in a few small, dimmed characters, over ink (the desktop side bar, right of the
 * logo): the commit in the staging app (the release tag's name when the commit is unknown), the
 * release tag's name ("v3.0.0") in production, the chip's first part. White while hovered or
 * pressed. It opens "What's new" as the chip does; while its latest notes were never opened on
 * this device, an orange dot at its top right, over its padding (the text keeps its room). Its
 * touch area reaches the 44 px floor by padding taken back by margins (react-native-web ignores
 * `hitSlop`): it moves nothing around it. One line: shortened rather than pushed out of the side
 * bar by a long version.
 */
export function VersionTag({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const whatsNew = useWhatsNew();
  const info = getAppInfo();
  const [first] = chipParts(info);
  const build = spokenBuild(info, t("common.version", { version: info.version }));
  return (
    <>
      <Pressable
        {...hoverProps}
        onPress={whatsNew.open}
        accessibilityRole="button"
        accessibilityLabel={t(whatsNew.unread ? "whatsNew.openUnread" : "whatsNew.open", { build })}
        style={[styles.tag, style]}
        testID={testID}
      >
        {({ pressed }) => (
          <>
            <Text
              numberOfLines={1}
              style={[styles.tagText, (hovered || pressed) && styles.tagActive]}
            >
              {first}
            </Text>
            {whatsNew.unread ? (
              <View style={styles.tagDot} testID={testID && `${testID}-unread`} />
            ) : null}
          </>
        )}
      </Pressable>
      <WhatsNewSheet visible={whatsNew.visible} onClose={whatsNew.close} fresh={whatsNew.fresh} />
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  chip: {
    minHeight: CHIP_HEIGHT,
    paddingVertical: 2,
    paddingHorizontal: 11,
    borderRadius: CHIP_HEIGHT / 2,
    flexDirection: "row",
    // Large text on a narrow screen: its parts go to the next line, centred.
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 8,
    rowGap: 2,
    borderWidth: 1,
    borderColor: colors.border.faint,
    backgroundColor: colors.hoverOverlay
  },
  // Never underlined.
  active: { borderColor: colors.border.strong },
  // SemiBold and Bold: web startup fonts (fonts.ts), the welcome screen draws them.
  part: {
    ...sans(500),
    fontSize: type.caption,
    letterSpacing: tracking(0.01, type.caption),
    color: colors.text.primary
  },
  first: sans(600),
  rule: { width: 1, height: 11, backgroundColor: colors.border.strong },
  staging: { flexDirection: "row", alignItems: "center", gap: 5 },
  // Orange is a fill (the design system's rule), never the text.
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.background.accent },
  tag: {
    minHeight: control.min,
    justifyContent: "center",
    flexShrink: 1,
    minWidth: 0,
    paddingVertical: TAG_REACH,
    marginVertical: -TAG_REACH,
    paddingHorizontal: TAG_SIDE,
    marginHorizontal: -TAG_SIDE
  },
  // The side bar's group titles' dimmed white (5.2:1 over ink).
  tagText: {
    ...sans(500),
    fontSize: type.overline,
    lineHeight: TAG_LINE,
    color: colors.onDark.muted
  },
  tagActive: { color: colors.onDark.text },
  // Over the padding at the text's top right: the text keeps its width.
  tagDot: {
    position: "absolute",
    top: TAG_REACH - 2,
    right: TAG_SIDE - 7,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.background.accent
  }
}));
