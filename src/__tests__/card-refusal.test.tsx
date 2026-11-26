import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { CodePlate } from "@/components/ui/CodePlate";
import { cardRefusalOf, cleanServiceReason } from "@/features/terminal/card-refusal";
import { CardRefusalVeil, REFUSAL_SHOWN_MS } from "@/features/terminal/CardRefusalVeil";
import i18n from "@/i18n";
import { LANGUAGES } from "@/i18n/languages";
import { LnurlError } from "@/lib/lightning/lnurl";

const t = i18n.getFixedT("en");
const ch = (code: number) => String.fromCodePoint(code);

describe("cleanServiceReason", () => {
  it("keeps the service's words as they came", () => {
    const words =
      "New merchant: the cardholder must approve it in their sattle.me app, then present the card again.";
    expect(cleanServiceReason(words)).toBe(words);
    expect(cleanServiceReason("Withdraw link has been used up 🥐")).toBe(
      "Withdraw link has been used up 🥐"
    );
    // Joiners stay: an emoji of several characters, a script that needs them.
    const family = `${ch(0x1f468)}${ch(0x200d)}${ch(0x1f469)}${ch(0x200d)}${ch(0x1f467)}`;
    expect(cleanServiceReason(`Thanks ${family}`)).toBe(`Thanks ${family}`);
  });

  it("drops what prints nothing or reorders the text, and keeps it on one line", () => {
    // A right-to-left override would show "Payment accepted" read backwards, and tags hide text.
    const override = `${ch(0x202e)}detpecca tnemyaP${ch(0x202c)}`;
    expect(cleanServiceReason(override)).toBe("detpecca tnemyaP");
    const tags = [..."hidden"].map((c) => ch(0xe0000 + c.charCodeAt(0))).join("");
    expect(cleanServiceReason(`Refused${tags}`)).toBe("Refused");
    expect(cleanServiceReason(`a${ch(0x200b)}b${ch(0xfeff)}c${ch(0xad)}d${ch(0x2066)}e`)).toBe(
      "abcde"
    );
    expect(cleanServiceReason(`  Balance\n\ntoo low\t${ch(0x2028)}${ch(0)}!  `)).toBe(
      "Balance too low !"
    );
  });

  it("is empty when nothing visible is left", () => {
    expect(cleanServiceReason("")).toBe("");
    expect(cleanServiceReason(` \n${ch(0x200b)}${ch(0x202e)} `)).toBe("");
  });

  it('cuts at 200 UTF-16 code units, never inside a surrogate pair, ending with "…"', () => {
    const long = cleanServiceReason("x".repeat(500));
    expect(long).toBe(`${"x".repeat(199)}…`);
    expect(long.length).toBe(200);
    // 🥐 takes code units 198 and 199: left out whole rather than cut in half.
    expect(cleanServiceReason(`${"x".repeat(198)}🥐${"y".repeat(10)}`)).toBe(`${"x".repeat(198)}…`);
    expect(cleanServiceReason("x".repeat(200))).toBe("x".repeat(200));
  });
});

describe("cardRefusalOf", () => {
  it('shows a service\'s reason under "Card declined", whatever it says', () => {
    expect(
      cardRefusalOf(new LnurlError("service", "GET …", "Insufficient card balance."), t)
    ).toEqual({ title: "Card declined", message: "Insufficient card balance." });
    // Even words that would read as a success stay a refusal: only the invoice's check says paid.
    expect(cardRefusalOf(new LnurlError("service", "GET …", "Payment accepted"), t)).toEqual({
      title: "Card declined",
      message: "Payment accepted"
    });
  });

  it("says so in the point of sale's words when the service gave no reason", () => {
    const noReason = {
      title: "Card declined",
      message:
        "The card's service gave no reason. Present the card again, or have the code scanned."
    };
    expect(cardRefusalOf(new LnurlError("service", "GET …", ""), t)).toEqual(noReason);
    expect(cardRefusalOf(new LnurlError("service", "GET …", null), t)).toEqual(noReason);
    expect(cardRefusalOf(new LnurlError("service", "GET …", ` ${ch(0x200b)} `), t)).toEqual(
      noReason
    );
  });

  it("tells what the point of sale knows itself, never as the service's words", () => {
    expect(
      cardRefusalOf(new LnurlError("outOfRange", "Amount outside the card's limits"), t)
    ).toEqual({
      title: "Card declined",
      message: "The amount is outside the card's limits. Have the code scanned."
    });
    expect(cardRefusalOf(new LnurlError("network", "GET … failed"), t)).toEqual({
      title: "Card payment interrupted",
      message:
        "The card's service did not answer. Present the card again, or have the code scanned."
    });
    const unread = {
      title: "Card not read",
      message:
        "This is not a payment card that can be read here. Present it again, or have the code scanned."
    };
    expect(cardRefusalOf(new LnurlError("invalidResponse", "not a withdrawRequest"), t)).toEqual(
      unread
    );
    expect(cardRefusalOf(new Error("Not an LNURL"), t)).toEqual(unread);
    expect(cardRefusalOf("tag lost", t)).toEqual(unread);
  });

  it("has every sentence in every language", () => {
    for (const language of LANGUAGES) {
      const lt = i18n.getFixedT(language);
      for (const error of [
        new LnurlError("service", "", ""),
        new LnurlError("outOfRange", ""),
        new LnurlError("network", ""),
        new Error("x")
      ]) {
        const refusal = cardRefusalOf(error, lt);
        expect(refusal.title).not.toMatch(/^pos\./);
        expect(refusal.message).not.toMatch(/^pos\./);
      }
      expect(lt("pos.boltcard.refusal.showCode")).not.toMatch(/^pos\./);
    }
  });
});

describe("the refusal over the code", () => {
  const refusal = { title: "Card declined", message: "Insufficient card balance." };

  it("shows the refusal over the blurred code, and the code again after its time", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const onDone = jest.fn();
      await render(<CardRefusalVeil refusal={refusal} desktop={false} onDone={onDone} />);
      expect(screen.getByTestId("card-refusal-message")).toHaveTextContent(
        "Insufficient card balance."
      );
      expect(screen.getByText("Card declined")).toBeTruthy();
      expect(screen.getByText("Show the code")).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(REFUSAL_SHOWN_MS - 500);
      });
      expect(onDone).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives the code back at once when "Show the code" is pressed', async () => {
    const onDone = jest.fn();
    await render(<CardRefusalVeil refusal={refusal} desktop onDone={onDone} />);
    fireEvent.press(screen.getByTestId("card-refusal-show-code"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is drawn over a code only, and gives way to a payment seen", async () => {
    const notice = <CardRefusalVeil refusal={refusal} desktop={false} onDone={() => undefined} />;
    const view = await render(<CodePlate value="lnbc1test" size={216} notice={notice} />);
    expect(screen.getByTestId("card-refusal")).toBeTruthy();
    expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();
    // The code is no longer offered to screen readers: the refusal is.
    expect(
      screen.getByTestId("qr-code", { includeHiddenElements: true }).props["aria-hidden"]
    ).toBe(true);
    // A payment seen: its own blur and spinner, the refusal gone.
    await view.rerender(<CodePlate value="lnbc1test" size={216} blurred notice={notice} />);
    expect(screen.queryByTestId("card-refusal")).toBeNull();
    expect(screen.getByTestId("qr-spinner", { includeHiddenElements: true })).toBeTruthy();
    // No code (an invoice being made): nothing to say over it.
    await view.rerender(<CodePlate value={null} size={216} notice={notice} />);
    expect(screen.queryByTestId("card-refusal")).toBeNull();
  });
});
