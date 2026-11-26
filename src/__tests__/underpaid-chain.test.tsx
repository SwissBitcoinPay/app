import "@/i18n";

import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Linking } from "react-native";

import { ReceivedTransactions } from "@/features/onchain/ReceivedTransactions";
import { UnderpaidChain } from "@/features/onchain/UnderpaidChain";
import type { SaleReceipt } from "@/features/terminal/useSale";
import { formatDate } from "@/lib/locale/date";
import type { PayerNode } from "@/lib/onchain/node";
import { normalTxid, explorerName, txPageUrl } from "@/lib/onchain/tx-page";
import { splitFiat, splitFiatShares } from "@/lib/terminal/amount";

const TX1 = "24a0a1349cde64b40cc55d1bdcffd702224ceaef3be904cf781a4a4ebe44c327";
const TX2 = "3d96b48f083db0cc07dc208a71060d091aae766db3d5c7e098866d3598471eb2";
const HASH = "9f2c".padEnd(64, "0");
const LANGUAGE = "en-CH";
/** 5.00 CHF: the sale's 10 000 sats. */
const FIAT = { minor: 500, digits: 2, currency: "CHF" };
/** Local times, whatever the time zone the tests run in. */
const NOON = new Date(2026, 9, 12, 12, 0, 0).getTime();
const AT_1432 = new Date(2026, 9, 12, 14, 32, 0).getTime();
const AT_1436 = new Date(2026, 9, 12, 14, 36, 0).getTime();
const NOW = Math.floor(new Date(2026, 9, 12, 14, 40, 0).getTime() / 1000);
/** The merchant's own node, as its address is written (normalizeNodeUrl). */
const NODE: PayerNode = { url: "https://node.example.ch", fallback: "none" };

const onchain = (txid: string, sats: bigint, receivedAt: number | null): SaleReceipt => ({
  kind: "onchain",
  txid,
  sats,
  receivedAt
});
const time = (ms: number) => formatDate(new Date(ms), LANGUAGE, { timeStyle: "short" });

async function renderChain(
  receipts: readonly SaleReceipt[] | undefined,
  {
    received = 4_000n,
    fiat = FIAT,
    node = null
  }: { received?: bigint; fiat?: typeof FIAT | null; node?: PayerNode | null } = {}
) {
  await render(
    <UnderpaidChain
      received={received}
      rest={10_000n - received}
      sats={10_000n}
      fiat={fiat}
      languageTag={LANGUAGE}
      receipts={receipts}
      now={NOW}
      node={node}
    />
  );
  return screen.getAllByTestId("underpaid-received").map((step) => within(step));
}

describe("splitFiatShares", () => {
  it("gives each payment what it adds to the received share", () => {
    // 2.00 CHF for 2 881 sats: 1 500 then 500 received, 1.38 CHF in all.
    expect(splitFiatShares(200, 2_881n, [1_500n, 500n])).toEqual([104, 34]);
    expect(splitFiat(200, 2_881n, 2_000n).receivedMinor).toBe(138);
  });

  it("always adds up to splitFiat's received share, never a unit more or less", () => {
    for (const minor of [1, 7, 99, 200, 12_345]) {
      for (const sats of [3n, 997n, 2_881n, 100_003n]) {
        const parts = [sats / 3n, 1n, sats / 7n, 2n];
        const shares = splitFiatShares(minor, sats, parts);
        const received = parts.reduce((sum, part) => sum + part, 0n);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(
          splitFiat(minor, sats, received).receivedMinor
        );
        expect(shares.every((share) => Number.isInteger(share) && share >= 0)).toBe(true);
      }
    }
  });

  it("caps at the sale's amount, as splitFiat does", () => {
    expect(splitFiatShares(500, 10_000n, [8_000n, 4_000n])).toEqual([400, 100]);
  });
});

describe("txPageUrl", () => {
  it("links a transaction to its page on mempool.space", () => {
    expect(txPageUrl(TX1, null)).toBe(`https://mempool.space/tx/${TX1}`);
    expect(explorerName(null)).toBe("mempool.space");
  });

  it("links a transaction to its page on the merchant's node when the screen reads it", () => {
    expect(txPageUrl(TX1, NODE)).toBe(`https://node.example.ch/tx/${TX1}`);
    expect(explorerName(NODE)).toBe("node.example.ch");
    // Whatever its fallback: the node the owner chose.
    expect(txPageUrl(TX1, { ...NODE, fallback: "mempool" })).toBe(
      `https://node.example.ch/tx/${TX1}`
    );
    // Its port and its path kept, as its web page's address (its API under `/api`).
    const proxied = { url: "https://example.ch:8443/mempool", fallback: "none" } as const;
    expect(txPageUrl(TX1, proxied)).toBe(`https://example.ch:8443/mempool/tx/${TX1}`);
    expect(explorerName(proxied)).toBe("example.ch:8443");
    // A node of the local network, on a merchant's device.
    const local = { url: "https://umbrel.local:3006", fallback: "mempool", payers: false } as const;
    expect(txPageUrl(TX1, local)).toBe(`https://umbrel.local:3006/tx/${TX1}`);
    expect(explorerName(local)).toBe("umbrel.local:3006");
    // One saved in http:// before HTTPS was required: its pages
    // over HTTPS too, never in clear.
    expect(txPageUrl(TX1, { ...local, url: "http://umbrel.local:3006" })).toBe(
      `https://umbrel.local:3006/tx/${TX1}`
    );
  });

  it("writes a transaction id in lower case, whatever its case", () => {
    expect(normalTxid(TX1.toUpperCase())).toBe(TX1);
    expect(txPageUrl(TX1.toUpperCase(), null)).toBe(`https://mempool.space/tx/${TX1}`);
    expect(txPageUrl(TX1.toUpperCase(), NODE)).toBe(`https://node.example.ch/tx/${TX1}`);
  });

  it("links nothing but a transaction id", () => {
    for (const bad of [
      "",
      TX1.slice(1),
      `${TX1}0`,
      `${TX1.slice(0, 63)}g`,
      ` ${TX1.slice(1)}`,
      `../${TX1.slice(3)}`,
      `${TX1.slice(0, 32)}?x=${TX1.slice(35)}`
    ]) {
      expect(normalTxid(bad)).toBeNull();
      expect(txPageUrl(bad, null)).toBeNull();
      expect(txPageUrl(bad, NODE)).toBeNull();
    }
  });
});

describe("UnderpaidChain", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  it('shows one "Received" step per payment, in the order received, each with its time', async () => {
    const steps = await renderChain([onchain(TX2, 1_000n, AT_1436), onchain(TX1, 3_000n, AT_1432)]);
    expect(steps).toHaveLength(2);
    expect(steps[0].getByText("Received")).toBeTruthy();
    expect(steps[0].getByLabelText("3'000 sats")).toBeTruthy();
    expect(steps[0].getByText(`${time(AT_1432)} ·`)).toBeTruthy();
    expect(steps[0].getByText("24a0…c327")).toBeTruthy();
    expect(steps[1].getByLabelText("1'000 sats")).toBeTruthy();
    expect(steps[1].getByText(`${time(AT_1436)} ·`)).toBeTruthy();
    expect(steps[1].getByText("3d96…1eb2")).toBeTruthy();
  });

  it("splits the received fiat between the payments, adding up to it", async () => {
    const steps = await renderChain([onchain(TX1, 3_000n, AT_1432), onchain(TX2, 1_000n, AT_1436)]);
    expect(steps[0].getByText("1.50 CHF")).toBeTruthy();
    expect(steps[1].getByText("0.50 CHF")).toBeTruthy();
    expect(screen.getByText("Left to pay")).toBeTruthy();
    expect(screen.getByText("3.00 CHF")).toBeTruthy();
  });

  it("opens a transaction on mempool.space", async () => {
    await renderChain([onchain(TX1, 3_000n, AT_1432), onchain(TX2, 1_000n, AT_1436)]);
    const links = screen.getAllByTestId("tx-link");
    expect(links).toHaveLength(2);
    expect(links[0].props.accessibilityRole).toBe("link");
    expect(screen.getByLabelText("View transaction 24a0…c327 on mempool.space")).toBeTruthy();
    await fireEvent.press(links[1]);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${TX2}`);
  });

  it("opens a transaction on the merchant's node when the screen reads it", async () => {
    await renderChain([onchain(TX1, 3_000n, AT_1432), onchain(TX2, 1_000n, AT_1436)], {
      node: NODE
    });
    expect(screen.getByLabelText("View transaction 24a0…c327 on node.example.ch")).toBeTruthy();
    expect(screen.queryByLabelText(/mempool\.space/)).toBeNull();
    await fireEvent.press(screen.getAllByTestId("tx-link")[1]);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://node.example.ch/tx/${TX2}`);
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
  });

  it("writes the date of a payment received another day", async () => {
    const yesterday = new Date(2026, 9, 11, 9, 5, 0).getTime();
    const steps = await renderChain([onchain(TX1, 4_000n, yesterday)]);
    const written = formatDate(new Date(yesterday), LANGUAGE, {
      dateStyle: "short",
      timeStyle: "short"
    });
    expect(written).not.toBe(time(yesterday));
    expect(steps[0].getByText(`${written} ·`)).toBeTruthy();
  });

  it("shows a transaction whose time is not known yet without one, after the others", async () => {
    const steps = await renderChain([onchain(TX2, 1_000n, null), onchain(TX1, 3_000n, NOON)]);
    expect(steps[0].getByText("24a0…c327")).toBeTruthy();
    expect(steps[1].getByText("3d96…1eb2")).toBeTruthy();
    expect(steps[1].queryByText(/ ·$/)).toBeNull();
    expect(steps[1].getByTestId("tx-link")).toBeTruthy();
  });

  it("names a payment over Lightning, last, without a time nor a link", async () => {
    const steps = await renderChain([
      { kind: "lightning", paymentHash: HASH, sats: 1_000n },
      onchain(TX1, 3_000n, AT_1432)
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0].getByText("24a0…c327")).toBeTruthy();
    expect(steps[1].getByText("Lightning")).toBeTruthy();
    expect(steps[1].getByLabelText("1'000 sats")).toBeTruthy();
    expect(steps[1].queryByTestId("tx-link")).toBeNull();
    expect(screen.getAllByTestId("tx-link")).toHaveLength(1);
  });

  it("shows and links a transaction id given in upper case in lower case", async () => {
    const steps = await renderChain([onchain(TX1.toUpperCase(), 4_000n, AT_1432)]);
    expect(steps[0].getByText("24a0…c327")).toBeTruthy();
    await fireEvent.press(steps[0].getByTestId("tx-link"));
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${TX1}`);
  });

  it("links nothing that is not a transaction id", async () => {
    const odd = `${TX1.slice(0, 63)}z`;
    const steps = await renderChain([onchain(odd, 4_000n, AT_1432)]);
    expect(steps[0].getByText(`${odd.slice(0, 4)}…${odd.slice(-4)}`)).toBeTruthy();
    expect(screen.queryByTestId("tx-link")).toBeNull();
  });

  it("shows the total alone when the payments do not add up to it", async () => {
    const steps = await renderChain([onchain(TX1, 3_000n, AT_1432)], { received: 4_000n });
    expect(steps).toHaveLength(1);
    expect(steps[0].getByLabelText("4'000 sats")).toBeTruthy();
    expect(steps[0].getByText("2.00 CHF")).toBeTruthy();
    expect(screen.queryByTestId("tx-link")).toBeNull();
  });

  it("shows the total alone without payments, as past the sale's end", async () => {
    const steps = await renderChain(undefined);
    expect(steps).toHaveLength(1);
    expect(steps[0].getByLabelText("4'000 sats")).toBeTruthy();
    expect(steps[0].getByText("2.00 CHF")).toBeTruthy();
  });

  it("leaves out a transaction that pays nothing", async () => {
    const steps = await renderChain([onchain(TX2, 0n, AT_1436), onchain(TX1, 4_000n, AT_1432)]);
    expect(steps).toHaveLength(1);
    expect(screen.queryByText("3d96…1eb2")).toBeNull();
  });

  it("shows each transaction of an order priced in sats, without fiat", async () => {
    const steps = await renderChain(
      [onchain(TX1, 3_000n, AT_1432), onchain(TX2, 1_000n, AT_1436)],
      { fiat: null }
    );
    expect(steps).toHaveLength(2);
    expect(screen.queryByText(/CHF/)).toBeNull();
    expect(screen.getAllByTestId("tx-link")).toHaveLength(2);
  });
});

describe("ReceivedTransactions", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  it("links each transaction received by the sale's end to mempool.space", async () => {
    await render(
      <ReceivedTransactions
        transactions={[
          { txid: TX1, sats: 3_000n, receivedAt: AT_1432, confirmations: 3 },
          { txid: TX2, sats: 1_000n, receivedAt: AT_1436, confirmations: 0 }
        ]}
        lightning={500n}
        languageTag={LANGUAGE}
        node={null}
      />
    );
    const rows = screen.getAllByTestId("received-transaction").map((row) => within(row));
    expect(rows).toHaveLength(2);
    // Its id as before, 8…8, now a link; its time and its confirmations as before.
    expect(rows[0].getByText("24a0a134…be44c327")).toBeTruthy();
    expect(rows[0].getByText("Confirmed")).toBeTruthy();
    expect(rows[1].getByText("Confirming · 0/3")).toBeTruthy();
    // A spinner beside "Confirming" only (decorative: its words say what it waits for).
    const spinner = { includeHiddenElements: true };
    expect(rows[0].queryByTestId("received-transaction-confirming", spinner)).toBeNull();
    expect(rows[1].getByTestId("received-transaction-confirming", spinner)).toBeTruthy();
    const link = rows[1].getByTestId("tx-link");
    expect(link.props.accessibilityRole).toBe("link");
    expect(
      screen.getByLabelText("View transaction 3d96b48f…98471eb2 on mempool.space")
    ).toBeTruthy();
    await fireEvent.press(link);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${TX2}`);
    // What came over Lightning has no transaction to link.
    expect(within(screen.getByTestId("received-lightning")).queryByTestId("tx-link")).toBeNull();
    expect(screen.getAllByTestId("tx-link")).toHaveLength(2);
  });

  it("links nothing that is not a transaction id", async () => {
    const odd = `${TX1.slice(0, 63)}z`;
    await render(
      <ReceivedTransactions
        transactions={[{ txid: odd, sats: 4_000n, receivedAt: AT_1432, confirmations: 1 }]}
        lightning={0n}
        languageTag={LANGUAGE}
        node={null}
      />
    );
    expect(screen.getByText(`${odd.slice(0, 8)}…${odd.slice(-8)}`)).toBeTruthy();
    expect(screen.queryByTestId("tx-link")).toBeNull();
  });

  it("shows and links a transaction id given in upper case in lower case", async () => {
    await render(
      <ReceivedTransactions
        transactions={[
          { txid: TX2.toUpperCase(), sats: 4_000n, receivedAt: AT_1436, confirmations: 1 }
        ]}
        lightning={0n}
        languageTag={LANGUAGE}
        node={null}
      />
    );
    expect(screen.getByText("3d96b48f…98471eb2")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tx-link"));
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${TX2}`);
  });

  it("links each transaction to the merchant's node when the screen reads it", async () => {
    await render(
      <ReceivedTransactions
        transactions={[{ txid: TX2, sats: 4_000n, receivedAt: AT_1436, confirmations: 1 }]}
        lightning={0n}
        languageTag={LANGUAGE}
        node={NODE}
      />
    );
    expect(
      screen.getByLabelText("View transaction 3d96b48f…98471eb2 on node.example.ch")
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tx-link"));
    expect(Linking.openURL).toHaveBeenCalledWith(`https://node.example.ch/tx/${TX2}`);
  });
});
