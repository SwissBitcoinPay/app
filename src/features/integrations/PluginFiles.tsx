import * as Clipboard from "expo-clipboard";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { CheckBox } from "@/components/ui/CheckBox";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { IconButton } from "@/components/ui/IconButton";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { makeStyles, mono, radius, sans, space, stroke, tracked, type, useTheme } from "@/theme";

import type { GuideFile } from "./guides";
import { checkedFile, type CheckedFile } from "./plugin-file-check";
import { readBundledFile } from "./plugin-files";

/** A file's content: being read, read and checked, or not to be copied. */
type Content = { state: "reading" } | { state: "ready"; file: CheckedFile } | { state: "failed" };

/**
 * The files read and checked, by SHA-256: the app's own files do not change while it runs, and the
 * guide's steps are made again at each render of the sheet. Not a file that did not read or check:
 * the guide opened again tries again.
 */
const checkedFiles = new Map<string, CheckedFile>();

/** Forgets the files read: a test's files are read again. */
export function resetCheckedFiles(): void {
  checkedFiles.clear();
}

/** A file's content, read and checked once (checkedFiles). */
async function contentOf(file: GuideFile): Promise<Content> {
  const known = checkedFiles.get(file.sha256);
  if (known) return { state: "ready", file: known };
  let bytes: Uint8Array;
  try {
    bytes = await readBundledFile(file.source);
  } catch (error) {
    logFailure("Reading a bundled plugin file failed", error, false);
    return { state: "failed" };
  }
  const checked = checkedFile(bytes, file.sha256);
  if (!checked) {
    logFailure("A bundled plugin file does not match its SHA-256", undefined, false);
    return { state: "failed" };
  }
  checkedFiles.set(file.sha256, checked);
  return { state: "ready", file: checked };
}

/**
 * Each file's content, read and checked as the step shows (plugin-files.ts, plugin-file-check.ts):
 * held in memory before its button is pressed, so that a press copies at once, within the click
 * the browser requires for writing to the clipboard. A file that does not read, or whose bytes
 * are not those of the release, is never copied.
 */
function useContents(files: readonly GuideFile[]): readonly Content[] {
  const [contents, setContents] = useState<readonly Content[]>(() =>
    files.map((file) => {
      const known = checkedFiles.get(file.sha256);
      return known ? { state: "ready", file: known } : { state: "reading" };
    })
  );
  useEffect(() => {
    let live = true;
    files.forEach((file, index) => {
      contentOf(file).then((content) => {
        if (!live) return;
        setContents((now) => now.map((old, at) => (at === index ? content : old)));
      });
    });
    return () => {
      live = false;
    };
  }, [files]);
  return contents;
}

/**
 * A guide's files (GuideStep `files`), one row each, in the order they are made: a box checked once
 * its file is pasted, its name with a button that copies it, where it is made, and "Copy the
 * content". The row open (the first not yet pasted) says how to make it, the line its content ends
 * on in the platform's editor once pasted, and offers "Pasted", which checks it and opens the next.
 * What is checked lasts as long as the guide shows. `screenshot`, the platform's screen at this step,
 * shows under the step's text, above the rows.
 */
export function PluginFiles({
  body,
  files,
  screenshot
}: {
  body: string;
  files: readonly GuideFile[];
  screenshot?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const contents = useContents(files);
  const [pasted, setPasted] = useState<readonly boolean[]>(() => files.map(() => false));
  const [open, setOpen] = useState(0);
  const [copied, setCopied] = useState<readonly boolean[]>(() => files.map(() => false));
  const { languageTag } = getDeviceLocale();

  const copy = (text: string, success: string, failure: string, onCopied?: () => void) => {
    const failed = (error?: unknown) => {
      logFailure("Copying a plugin file failed", error, false);
      notify({ tone: "error", title: failure, key: "integrations" });
    };
    Clipboard.setStringAsync(text).then((ok) => {
      if (!ok) return failed();
      onCopied?.();
      notify({ tone: "success", title: success, key: "integrations" });
    }, failed);
  };

  const done = pasted.filter(Boolean).length;
  return (
    <View style={styles.files} testID="integration-files">
      <Text style={styles.body}>{body}</Text>
      {screenshot}
      <View style={styles.list}>
        {files.map((file, index) => {
          const content = contents[index]!;
          const isOpen = open === index;
          const last = index === files.length - 1;
          return (
            <View
              key={file.name}
              style={[styles.row, isOpen && styles.rowOpen, !last && styles.rowRule]}
              testID={`integration-file-${index}`}
            >
              <View style={styles.rowHead}>
                <View
                  accessible
                  accessibilityRole="checkbox"
                  accessibilityLabel={file.name}
                  accessibilityState={{ checked: pasted[index] }}
                  style={styles.box}
                >
                  <CheckBox checked={pasted[index]!} />
                </View>
                <View style={styles.texts}>
                  <View style={styles.nameLine}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      accessibilityLabel={t("integrations.files.show", { name: file.name })}
                      onPress={() => setOpen(isOpen ? -1 : index)}
                      style={styles.name}
                      testID={`integration-file-${index}-toggle`}
                    >
                      <Text
                        style={[
                          styles.nameText,
                          isOpen && styles.nameOpen,
                          pasted[index] && !isOpen && styles.namePasted
                        ]}
                      >
                        {file.name}
                      </Text>
                    </Pressable>
                    <IconButton
                      icon="copy"
                      size={13}
                      color={colors.text.secondary}
                      label={t("integrations.files.copyName", { name: file.name })}
                      onPress={() =>
                        copy(
                          file.name,
                          t("integrations.files.nameCopied", { name: file.name }),
                          t("integrations.files.copyFailed")
                        )
                      }
                      testID={`integration-file-${index}-name`}
                    />
                  </View>
                  <Text style={styles.where}>{file.where}</Text>
                </View>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied[index] ? "check" : "copy"}
                  disabled={content.state !== "ready"}
                  loading={content.state === "reading"}
                  onPress={() => {
                    if (content.state !== "ready") return;
                    copy(
                      content.file.text,
                      t("integrations.files.contentCopied", { name: file.name }),
                      t("integrations.files.copyFailed"),
                      () => {
                        setCopied((now) => now.map((was, at) => was || at === index));
                        setOpen(index);
                      }
                    );
                  }}
                  testID={`integration-file-${index}-copy`}
                >
                  {copied[index] ? t("integrations.files.copied") : t("integrations.files.copy")}
                </Button>
              </View>
              {content.state === "failed" ? (
                <ErrorMessage style={styles.detail} testID={`integration-file-${index}-failed`}>
                  {t("integrations.files.readFailed")}
                </ErrorMessage>
              ) : null}
              {isOpen ? (
                <View style={styles.detail} testID={`integration-file-${index}-how`}>
                  <Text style={styles.how}>{file.how}</Text>
                  {content.state === "ready" ? (
                    <Text style={styles.lines}>
                      {t("integrations.files.lastLine", {
                        line: formatInteger(content.file.lastLine, languageTag)
                      })}
                    </Text>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="check"
                    fullWidth={false}
                    onPress={() => {
                      const next = pasted.map((was, at) => was || at === index);
                      setPasted(next);
                      setOpen(next.findIndex((was) => !was));
                    }}
                    testID={`integration-file-${index}-pasted`}
                  >
                    {t("integrations.files.pasted")}
                  </Button>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text style={styles.progress} testID="integration-files-progress">
        {t("integrations.files.progress", { count: done, total: files.length })}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  files: { gap: space[4] },
  body: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.5,
    color: colors.text.secondary
  },
  list: {
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    overflow: "hidden"
  },
  row: { backgroundColor: colors.background.surface },
  rowOpen: { backgroundColor: colors.background.accentSubtle },
  rowRule: { borderBottomWidth: stroke.hairline, borderBottomColor: colors.border.faint },
  rowHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space[4],
    rowGap: space[2],
    paddingVertical: space[2],
    paddingLeft: space[5],
    paddingRight: space[3]
  },
  box: { width: 18, alignItems: "center" },
  texts: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", marginVertical: -space[3] },
  name: { flexShrink: 1, minHeight: 44, justifyContent: "center" },
  nameText: { ...mono(500), fontSize: 13.5, color: colors.text.primary },
  nameOpen: { ...mono(700) },
  namePasted: { color: colors.text.secondary, textDecorationLine: "line-through" },
  where: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  detail: { gap: space[3], paddingBottom: space[5], paddingLeft: 44, paddingRight: space[5] },
  how: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.45,
    color: colors.text.note
  },
  lines: { ...sans(600), fontSize: type.caption, color: colors.text.note },
  progress: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
