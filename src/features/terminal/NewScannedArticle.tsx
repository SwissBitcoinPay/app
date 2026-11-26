import { useIsFocused } from "expo-router";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";

import {
  ArticleSheet,
  EMPTY_DRAFT,
  scannedDraft,
  useEpochRead,
  useProductSearch,
  type Draft
} from "@/features/catalog/ArticleSheet";
import { lockTerminal, useUnlock, useUnlocked } from "@/features/navigation/lock";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import type { Article } from "@/lib/catalog/article";
import { logFailure } from "@/lib/log/log";
import { currencyDigits } from "@/lib/terminal/amount";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";

import { usePos } from "./pos";

export type NewScannedArticleHandle = {
  /** Shows "New item" for `barcode`, Open Food Facts asked for its name and photo. */
  open: (barcode: string) => void;
};

/**
 * "New item" from the point of sale's scan: a barcode of no article,
 * read on the owner's device, its account open or not (till mode). The form of "Items"
 * (ArticleSheet), its barcode taken, Open Food Facts asked for its name and photo, the cursor on
 * the price. Its price is in the point of sale's currency. "Save" saves it in the
 * catalogue, for the next time: in till mode, the passkey opens the account first (the
 * catalogue's keys derive from it, lock.ts). The account then stays open while the scan shows (the
 * next unknown articles are saved without the passkey), and closes as soon as the scan no longer
 * shows (✕, the system's back, the basket, the invoice), the device back in
 * till mode as it was; the auto-lock still runs meanwhile. The point of sale has the article at once
 * (noteCatalogEntry), and `onSaved` gets it. Never on an employee's device: it holds no key to
 * write the catalogue.
 */
export function NewScannedArticle({
  ref,
  profile,
  onSaved,
  onClose
}: {
  ref: Ref<NewScannedArticleHandle>;
  profile: OwnerTerminalProfile;
  /** Saved in the catalogue (a majority of the relays took it). */
  onSaved: (article: Article) => void;
  /** Closed without an article saved. */
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { languageTag, catalog, noteCatalogEntry } = usePos();
  const unlocked = useUnlocked(profile.walletId);
  const { unlock } = useUnlock(profile);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /** Opened again for each form shown: its fields mount afresh and take their focus. */
  const [formKey, setFormKey] = useState(0);
  // As "Items": the roster read again as the form opens, "Save" waiting for it. In
  // till mode no account can read it (null at once): it is read once the passkey opened it.
  const { epoch, read: readEpoch } = useEpochRead();
  /**
   * The account was opened by "Save" (till mode): it closes once the scan no longer shows.
   */
  const openedHere = useRef(false);
  /** The scan shows: false once it left, so that a passkey answered after it opens nothing. */
  const scanShown = useRef(false);
  const focused = useIsFocused();
  // Locked meanwhile (the auto-lock): nothing of this form's is open any more.
  useEffect(() => {
    if (!unlocked) openedHere.current = false;
  }, [unlocked]);
  // The scan left (another screen over it, or gone): the account it opened closes.
  useEffect(() => {
    if (!focused) return;
    scanShown.current = true;
    return () => {
      scanShown.current = false;
      if (!openedHere.current) return;
      openedHere.current = false;
      lockTerminal().catch((error: unknown) => {
        logFailure("Locking the point of sale again failed", error);
      });
    };
  }, [focused]);
  const { search, lookUp, drop } = useProductSearch(setDraft, languageTag);

  useImperativeHandle(ref, () => ({
    open: (barcode: string) => {
      const form = scannedDraft(EMPTY_DRAFT, barcode);
      setDraft(form);
      setFormKey((key) => key + 1);
      setVisible(true);
      void readEpoch();
      lookUp(barcode, form, false);
    }
  }));

  // Till mode: the passkey's prompt, directly; dismissed or failed (useUnlock tells it), nothing is
  // saved and the form stays. The scan left while the prompt showed: the account it opened closes at
  // once, nothing saved (its cleanup above ran before it was open).
  const beforeSave = async (): Promise<boolean> => {
    if (unlocked) return true;
    if (!(await unlock())) return false;
    if (!scanShown.current) {
      await lockTerminal().catch((error: unknown) => {
        logFailure("Locking the point of sale again failed", error);
      });
      return false;
    }
    openedHere.current = true;
    return true;
  };

  const hide = () => {
    drop();
    setVisible(false);
  };

  const close = () => {
    hide();
    onClose();
  };

  const saved = (article: Article) => {
    noteCatalogEntry(article);
    hide();
    notify({
      tone: "success",
      title: t("articles.saved.title"),
      body: t("articles.saved.body", { name: article.name }),
      key: "articles"
    });
    onSaved(article);
  };

  return (
    <ArticleSheet
      key={formKey}
      visible={visible}
      draft={draft}
      onDraft={setDraft}
      editing={null}
      count={catalog.articles.length}
      languageTag={languageTag}
      search={search}
      epoch={epoch}
      onReadEpoch={readEpoch}
      onClose={close}
      onScan={null}
      onSaved={saved}
      beforeSave={beforeSave}
      typedIn={{ currency: profile.currency, digits: currencyDigits(profile.currency) }}
    />
  );
}
