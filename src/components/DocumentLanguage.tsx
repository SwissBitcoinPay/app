import { useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View, type ViewInstance } from "react-native";

import type { ButtonSize } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Popover } from "@/components/ui/Popover";
import { SplitButton } from "@/components/ui/SplitButton";
import { useHover } from "@/components/ui/useHover";
import { LANGUAGES, LANGUAGE_NAMES, toLanguage, type Language } from "@/i18n/languages";
import {
  control,
  makeStyles,
  mono,
  radius,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

/** The list's rows start where its texts do. */
const MENU_INSET = space[6];
const MENU_WIDTH = 248;

/**
 * What a language is chosen for: its menu's title and its name say it ("Email language", not
 * "Document language").
 */
export type DocumentKind = "mail" | "pdf" | "export";

/**
 * The language of a document, a mail's included, beside what makes it, its language's code ("FR",
 * "DE-CH"), which opens the app's
 * languages, each by its own name, the app's (the merchant's) marked. The screen keeps the choice
 * while it shows, for all its documents: a mail and its PDF in one language. Chosen once, for that
 * document: nothing is kept. Two forms: in the filled button that makes the document, at its end
 * (DocumentLanguageButton), or a chip beside a row or a
 * tile (this one: "Download the PDF" among an invoice's actions, "Invoice created").
 */
export function DocumentLanguageChip({
  value,
  onChange,
  document,
  height = control.min,
  disabled = false,
  testID
}: {
  value: Language;
  onChange: (language: Language) => void;
  document: DocumentKind;
  /**
   * As the button it sits beside (control.min, .md, .lg); smaller in a tile's corner, its touch
   * area kept at control.min all the same.
   */
  height?: number;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const anchor = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  const { hovered, hoverProps } = useHover();
  return (
    <View ref={anchor} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`documentLanguage.change.${document}`, {
          language: LANGUAGE_NAMES[value]
        })}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        hitSlop={Math.max(0, (control.min - height) / 2)}
        testID={testID}
        {...hoverProps}
        style={({ pressed }) => [
          styles.chip,
          { height, minWidth: height },
          (pressed || hovered) && !disabled && styles.chipPressed
        ]}
      >
        <Text style={[styles.code, disabled && styles.disabled]}>{value.toUpperCase()}</Text>
        <Icon
          name="chevron-down"
          size={10}
          color={disabled ? colors.text.disabled : colors.text.secondary}
        />
      </Pressable>
      <LanguageMenu
        visible={open}
        anchor={anchor}
        value={value}
        onChange={onChange}
        document={document}
        onClose={() => setOpen(false)}
        testID={testID}
      />
    </View>
  );
}

/**
 * The filled button that makes a document, its language at its end (everywhere a filled button
 * makes one: "Send a reminder by email", "Download the PDF", "Export"): the action, a thin line, the language's code and a
 * chevron, which opens the same languages as the chip. Both parts disabled together: while the
 * action waits (`loading`) or cannot run (`disabled`).
 */
export function DocumentLanguageButton({
  children,
  onPress,
  icon,
  size,
  fullWidth,
  disabled,
  loading,
  testID,
  document,
  language,
  onLanguageChange,
  languageTestID
}: {
  children: string;
  onPress: () => void;
  icon?: IconName;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** The action's part. */
  testID?: string;
  document: DocumentKind;
  language: Language;
  onLanguageChange: (language: Language) => void;
  /** The language's part; its menu is `${languageTestID}-menu`, a language `${languageTestID}-fr`. */
  languageTestID?: string;
}) {
  const { t } = useTranslation();
  const anchor = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SplitButton
        icon={icon}
        size={size}
        fullWidth={fullWidth}
        disabled={disabled}
        loading={loading}
        onPress={onPress}
        testID={testID}
        side={{
          label: language.toUpperCase(),
          accessibilityLabel: t(`documentLanguage.change.${document}`, {
            language: LANGUAGE_NAMES[language]
          }),
          onPress: () => setOpen(true),
          expanded: open,
          testID: languageTestID
        }}
        sideAnchor={anchor}
      >
        {children}
      </SplitButton>
      <LanguageMenu
        visible={open}
        anchor={anchor}
        value={language}
        onChange={onLanguageChange}
        document={document}
        onClose={() => setOpen(false)}
        testID={languageTestID}
      />
    </>
  );
}

/**
 * The app's languages, each by its own name, the app's (the merchant's) marked, the one chosen
 * checked; titled by what the language is for. Choosing one closes it.
 */
function LanguageMenu({
  visible,
  anchor,
  value,
  onChange,
  document,
  onClose,
  testID
}: {
  visible: boolean;
  anchor: RefObject<ViewInstance | null>;
  value: Language;
  onChange: (language: Language) => void;
  document: DocumentKind;
  onClose: () => void;
  testID?: string;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const yours = toLanguage(i18n.language);
  const title = t(`documentLanguage.title.${document}`);
  return (
    <Popover
      visible={visible}
      anchor={anchor}
      align="end"
      width={MENU_WIDTH}
      label={title}
      onClose={onClose}
      testID={testID && `${testID}-menu`}
    >
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator>
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          {LANGUAGES.map((language) => {
            const chosen = language === value;
            return (
              <ListRow
                key={language}
                inset={MENU_INSET}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen }}
                onPress={() => {
                  onChange(language);
                  onClose();
                }}
                style={styles.row}
                testID={testID && `${testID}-${language}`}
              >
                <View style={styles.names}>
                  <Text numberOfLines={1} style={[styles.name, chosen && styles.nameChosen]}>
                    {LANGUAGE_NAMES[language]}
                  </Text>
                  {language === yours ? (
                    <Text style={styles.yours}>{t("documentLanguage.yours")}</Text>
                  ) : null}
                </View>
                {chosen ? <Icon name="check" size={12} color={colors.text.accent} /> : null}
              </ListRow>
            );
          })}
        </View>
      </ScrollView>
    </Popover>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface
  },
  chipPressed: { backgroundColor: colors.button.secondary.bgActive },
  code: { ...mono(500), fontSize: type.label, color: colors.text.primary },
  disabled: { color: colors.text.disabled },
  title: {
    ...sans(600),
    paddingHorizontal: MENU_INSET,
    paddingTop: space[3],
    paddingBottom: space[2],
    fontSize: type.caption,
    color: colors.text.secondary
  },
  // Takes what is left of the panel's height (Popover's maxHeight), then scrolls.
  list: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space[5], minHeight: control.min },
  names: { flex: 1, minWidth: 0, paddingVertical: space[2] },
  name: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  nameChosen: { ...sans(600) },
  yours: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
