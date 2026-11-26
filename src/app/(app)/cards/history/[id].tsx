import { Redirect, useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";

import { getAccountWalletId } from "@/features/account/session";
import { CardHistoryScreen } from "@/features/card/CardHistoryScreen";
import { knownCardStates, subscribeCardStates } from "@/features/card/states";
import { isCardShown } from "@/lib/card/card-record";

const CARD_ID = /^[0-9a-f]{32}$/;

/**
 * "History" of a card, from "Cards" (src/features/card/CardHistoryScreen.tsx): one of the
 * open account's cards "Cards" shows, as this session knows them; anything else goes back to
 * "Cards".
 */
export default function CardHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const states = useSyncExternalStore(subscribeCardStates, () =>
    knownCardStates(getAccountWalletId())
  );
  const card =
    typeof id === "string" && CARD_ID.test(id)
      ? states.find((state) => state.cardId === id && isCardShown(state))
      : undefined;
  if (!card) return <Redirect href="/cards" />;
  return <CardHistoryScreen card={card} />;
}
