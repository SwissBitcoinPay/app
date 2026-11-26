import type { TFunction } from "i18next";

import type { CardState } from "@/lib/card/card-record";

/** The card's name, or "Card 9D81" (the end of its opaque id) when it has none. */
export function cardLabel(card: Pick<CardState, "name" | "cardId">, t: TFunction): string {
  return card.name || t("cards.unnamed", { id: card.cardId.slice(-4).toUpperCase() });
}

/**
 * "Card Daily", what a panel or a screen is of; a card without a name is "Card 9D81" already.
 */
export function cardOfLabel(card: Pick<CardState, "name" | "cardId">, t: TFunction): string {
  return card.name ? t("cards.cardOf", { name: card.name }) : cardLabel(card, t);
}
