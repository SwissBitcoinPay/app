import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { openCardImage, type CardImageSource } from "@/features/media/card-image";
import { rememberImage } from "@/features/media/images";
import { PickImageError, type ImageSource } from "@/features/media/pick-image";
import {
  CARD_COLORS,
  MAX_CARD_NAME_LENGTH,
  defaultCardColor,
  type CardColor,
  type CardLook,
  type CardState
} from "@/lib/card/card-record";
import { logFailure } from "@/lib/log/log";
import {
  createImage,
  publishImageToMajority,
  sameImageRef,
  type ImageRef
} from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { currentRelays } from "@/lib/relays/current";
import { makeStyles, palette, radius, sans, space, type, useTheme } from "@/theme";

import { CARD_PALETTE } from "./card-look";
import { CardFaceView } from "./CardFaceView";
import type { FramedImage } from "./CardImageFramer";
import { cardNameOf, customizeCard } from "./manage";
import { PairingError } from "./pairing";

/*
 * "Customize": the card's name and its look, one save. The name: one line, cleared with a tap; a
 * name another card of the account shows already is said (they are told apart as they pay), never
 * refused. The look: a colour of the palette, or an image of the holder's, framed at the card's
 * shape (CardImageFramer.tsx); the colours' names are for screen readers only. A v2 card keeps its
 * issuer's visual: its name only changes, and no "Look" shows. The image is published (a majority
 * of the relays) only as the change is saved, with it.
 */

/** The preview's width (240 px). */
const PREVIEW_WIDTH = 240;

/** "Customize" as it is being changed: kept by the panel while the image is framed. */
export type CustomizeDraft = {
  /**
   * The card's name and look as the change began: what it is told against, and the only parts
   * saved are those that differ from it (a rename made elsewhere meanwhile is never undone).
   */
  opened: Pick<CardState, "name" | "look">;
  /** The name as typed. */
  name: string;
  tab: "color" | "image";
  /** The look the preview shows: the card's at first (null: the colour drawn for it). */
  look: CardLook | null;
  /** The image framed here, published with the change (its record and reference). */
  framed: { ref: ImageRef; event: NostrEvent } | null;
};

/** The draft of a panel opened on `card`: what the card has. */
export function customizeDraftOf(card: CardState): CustomizeDraft {
  return {
    opened: { name: card.name, look: card.look },
    name: card.name,
    tab: card.look?.kind === "image" ? "image" : "color",
    look: card.look,
    framed: null
  };
}

/** The draft with `framed` as its look: its record made here, kept until "Save". */
export function draftWithImage(draft: CustomizeDraft, framed: FramedImage): CustomizeDraft {
  const { ref, event } = createImage(framed.bytes, Math.floor(Date.now() / 1000));
  // Shown at once, by the preview and later by "Cards", without reading it back.
  rememberImage(ref, framed.bytes);
  return {
    ...draft,
    tab: "image",
    look: { kind: "image", image: ref, ink: framed.ink },
    framed: { ref, event }
  };
}

/** Whether `a` and `b` show the same on the card `cardId` (none: the colour drawn for it). */
function sameLook(cardId: string, a: CardLook | null, b: CardLook | null): boolean {
  const drawn: CardLook = { kind: "color", color: defaultCardColor(cardId) };
  const x = a ?? drawn;
  const y = b ?? drawn;
  if (x.kind === "color") return y.kind === "color" && x.color === y.color;
  return y.kind === "image" && sameImageRef(x.image, y.image) && x.ink === y.ink;
}

/** What `name` is compared by: as the user reads it, case aside. */
function comparable(name: string): string {
  return name.toLocaleLowerCase();
}

type Failure = "photoDenied" | "cameraDenied" | "unreadable" | "imageUnpublished" | "failed";

export function CustomizePanel({
  card,
  others,
  draft,
  onDraft,
  onFrame,
  onBusy,
  onDone
}: {
  card: CardState;
  /** The labels of the account's other cards (their names, or "Card 9D81"). */
  others: readonly string[];
  draft: CustomizeDraft;
  onDraft: (draft: CustomizeDraft) => void;
  /** An image picked: framed over the panel (CardImageFramer.tsx), then back to it. */
  onFrame: (source: CardImageSource) => void;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [picking, setPicking] = useState<ImageSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ reason: Failure; detail: string | null } | null>(null);
  const busy = saving || picking !== null;
  useEffect(() => {
    if (!busy) return;
    onBusy(true);
    return () => onBusy(false);
  }, [busy, onBusy]);

  const name = cardNameOf(draft.name);
  const fallback = t("cards.unnamed", { id: card.cardId.slice(-4).toUpperCase() });
  const taken =
    name !== null && name !== "" && others.some((other) => comparable(other) === comparable(name));
  const issuer = card.issuer !== null;
  const nameChanged = name !== null && name !== draft.opened.name;
  const lookChanged = !issuer && !sameLook(card.cardId, draft.look, draft.opened.look);
  const changed = name !== null && (nameChanged || lookChanged);
  const shownColor: CardColor | null =
    draft.look === null
      ? defaultCardColor(card.cardId)
      : draft.look.kind === "color"
        ? draft.look.color
        : null;

  const pick = (source: ImageSource) => {
    if (busy) return;
    setPicking(source);
    setFailure(null);
    openCardImage(source).then(
      (opened) => {
        setPicking(null);
        if (opened) onFrame(opened);
      },
      (error: unknown) => {
        setPicking(null);
        const code = error instanceof PickImageError ? error.code : null;
        if (code !== "denied" && code !== "cameraDenied") {
          logFailure("A card's image could not be opened", error);
        }
        setFailure({
          reason:
            code === "denied"
              ? "photoDenied"
              : code === "cameraDenied"
                ? "cameraDenied"
                : "unreadable",
          detail: null
        });
      }
    );
  };

  const save = async () => {
    if (!changed || busy || name === null) return;
    setSaving(true);
    setFailure(null);
    // What changed only: the card's other settings as this device knows them now.
    const look = lookChanged ? (draft.look ?? undefined) : undefined;
    try {
      // The image first, on a majority of the relays: the card's record never names one they lack.
      if (look?.kind === "image" && draft.framed && draft.framed.ref.key === look.image.key) {
        try {
          await publishImageToMajority(draft.framed.event, draft.framed.ref, currentRelays());
        } catch (error) {
          logFailure("A card's image was not published", error);
          setFailure({ reason: "imageUnpublished", detail: null });
          setSaving(false);
          return;
        }
      }
      await customizeCard(card.cardId, { name: nameChanged ? name : undefined, look });
      onDone();
    } catch (error) {
      logFailure("A card's name and look were not saved", error);
      // A reason of its own (the relays, the account) said as it is; anything else, the panel's.
      const reason = error instanceof PairingError ? error.reason : "failed";
      setFailure({
        reason: "failed",
        detail: reason === "failed" ? null : t(`card.failure.${reason}`)
      });
      setSaving(false);
    }
  };

  return (
    <View style={[styles.content, desktop && styles.contentDesktop]} testID="card-customize-panel">
      <View
        style={[styles.preview, desktop && styles.previewDesktop]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CardFaceView
          // The face as it will be saved: over a v2 card's visual, the name typed only.
          card={{ cardId: card.cardId, name: name || "", look: draft.look, issuer: card.issuer }}
          label={name || fallback}
          placeholder={!name}
          width={PREVIEW_WIDTH}
          testID="card-customize-preview"
        />
      </View>
      <View style={styles.block}>
        <TextField
          label={t("cards.customize.name")}
          value={draft.name}
          onChangeText={(text) => onDraft({ ...draft, name: text })}
          placeholder={fallback}
          maxLength={MAX_CARD_NAME_LENGTH}
          disabled={saving}
          error={name === null ? t("cards.sheet.nameInvalid", { max: MAX_CARD_NAME_LENGTH }) : null}
          trailing={
            draft.name.length > 0 && !saving ? (
              <IconButton
                icon="circle-xmark"
                label={t("cards.customize.clear")}
                onPress={() => onDraft({ ...draft, name: "" })}
                testID="card-customize-clear"
              />
            ) : undefined
          }
          testID="card-name-field"
        />
        {taken ? (
          <Callout tone="warning" testID="card-customize-taken">
            {t("cards.customize.taken", { name })}
          </Callout>
        ) : null}
      </View>
      {issuer ? null : (
        <View style={styles.block}>
          <Text style={[styles.label, desktop && styles.labelDesktop]}>
            {t("cards.customize.look")}
          </Text>
          <SegmentedControl
            label={t("cards.customize.lookKind")}
            options={[
              { value: "color", label: t("cards.customize.color"), icon: "palette" },
              { value: "image", label: t("cards.customize.image"), icon: "image" }
            ]}
            value={draft.tab}
            onChange={(tab) => onDraft({ ...draft, tab })}
            // As wide as the panel, on a phone too.
            stretch
            testID="card-customize-kind"
          />
          {draft.tab === "color" ? (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t("cards.customize.color")}
              style={[styles.swatches, desktop && styles.swatchesDesktop]}
            >
              {CARD_COLORS.map((color) => (
                <Swatch
                  key={color}
                  color={color}
                  desktop={desktop}
                  chosen={color === shownColor}
                  label={t(`cards.customize.colors.${color}`)}
                  disabled={saving}
                  onPress={() => onDraft({ ...draft, look: { kind: "color", color } })}
                />
              ))}
            </View>
          ) : (
            <View style={styles.imageActions}>
              <Button
                variant="secondary"
                size="md"
                icon="image"
                loading={picking === "library"}
                disabled={busy}
                onPress={() => pick("library")}
                testID="card-customize-library"
              >
                {t(
                  Platform.OS === "web"
                    ? "cards.customize.chooseImage"
                    : "cards.customize.choosePhoto"
                )}
              </Button>
              {Platform.OS === "web" ? null : (
                <Button
                  variant="secondary"
                  size="md"
                  icon="camera"
                  loading={picking === "camera"}
                  disabled={busy}
                  onPress={() => pick("camera")}
                  testID="card-customize-camera"
                >
                  {t("cards.customize.takePhoto")}
                </Button>
              )}
              <Text style={styles.imageNote}>{t("cards.customize.imageNote")}</Text>
            </View>
          )}
        </View>
      )}
      {failure ? (
        <Callout tone="error" testID="card-customize-failed">
          {failure.detail ?? t(`cards.customize.errors.${failure.reason}`)}
        </Callout>
      ) : null}
      {desktop ? (
        // "Cancel" beside it on a desktop: the dialog closes, nothing saved.
        <View style={styles.dialogActions}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onPress={onDone}
            style={styles.dialogCancel}
            testID="card-customize-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            fullWidth={false}
            disabled={!changed}
            loading={saving}
            onPress={() => void save()}
            style={styles.dialogSave}
            testID="card-customize-save"
          >
            {t("cards.sheet.save")}
          </Button>
        </View>
      ) : (
        <Button
          disabled={!changed}
          loading={saving}
          onPress={() => void save()}
          testID="card-customize-save"
        >
          {t("cards.sheet.save")}
        </Button>
      )}
    </View>
  );
}

/** A colour of the palette: its disc, a tick on the one chosen; its name for screen readers. */
function Swatch({
  color,
  desktop,
  chosen,
  label,
  disabled,
  onPress
}: {
  color: CardColor;
  /** The eight on one line, 40 px each. */
  desktop: boolean;
  chosen: boolean;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { fill, ink } = CARD_PALETTE[color];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.swatchTarget, desktop && styles.swatchTargetDesktop]}
      testID={`card-customize-color-${color}`}
    >
      <View
        style={[
          styles.swatch,
          desktop && styles.swatchDesktop,
          {
            backgroundColor: fill,
            boxShadow: chosen
              ? `0 0 0 3px ${colors.background.surface}, 0 0 0 5px ${palette.orange}`
              : `inset 0 0 0 1px ${colors.border.faint}`
          }
        ]}
      >
        {chosen ? <Icon name="check" size={desktop ? 14 : 15} color={ink} /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space[6] },
  preview: { alignItems: "center" },
  // A desktop's dialog.
  contentDesktop: { gap: space[5] },
  previewDesktop: { paddingTop: space[2], paddingBottom: space[3] },
  labelDesktop: { paddingHorizontal: 0 },
  swatchesDesktop: { rowGap: 8, paddingVertical: space[2] },
  swatchTargetDesktop: { width: "12.5%", minHeight: 44, justifyContent: "center" },
  swatchDesktop: { width: 40, height: 40 },
  dialogActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  dialogCancel: { minWidth: 120 },
  dialogSave: { minWidth: 180 },
  block: { gap: space[4] },
  label: {
    ...sans(600),
    paddingHorizontal: space[2],
    fontSize: type.caption,
    color: colors.text.secondary
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", rowGap: space[5], paddingVertical: space[2] },
  swatchTarget: { width: "25%", alignItems: "center" },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  imageActions: { gap: space[4], paddingVertical: space[2] },
  imageNote: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    textAlign: "center",
    color: colors.text.secondary
  }
}));
