import { act, render, screen } from "@testing-library/react-native";

import { CardFaceView, CardUnderFace } from "@/features/card/CardFaceView";
import { loadImage, rememberImage } from "@/features/media/images";
import { lightColors as colors, palette } from "@/theme";

const CARD_ID = "04a1b2c3d4e5f6";
const IMAGE = { key: "11".repeat(32), hash: "22".repeat(32) };
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const ISSUER = { image: IMAGE, number: "4821-0937-5530-1186", white: false };

describe("a card's face", () => {
  it("writes the name its holder gave a v2 card over its visual, in its ink, never its number", async () => {
    rememberImage(IMAGE, PNG);
    await render(
      <CardFaceView
        card={{ cardId: CARD_ID, name: "Everyday", look: null, issuer: ISSUER }}
        label="Everyday"
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.getByTestId("face-label")).toHaveTextContent("Everyday");
    expect(screen.getByTestId("face-label")).toHaveStyle({ color: palette.white });
    expect(screen.queryByText("4821-0937-5530-1186")).toBeNull();
  });

  it('writes nothing over a v2 card\'s visual without a name: never "Card 0403"', async () => {
    rememberImage(IMAGE, PNG);
    await render(
      <CardFaceView
        card={{ cardId: CARD_ID, name: "", look: null, issuer: ISSUER }}
        label="Card 0403"
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.queryByTestId("face-label")).toBeNull();
    expect(screen.queryByText("4821-0937-5530-1186")).toBeNull();
  });

  it("draws a v2 card's visual alone where it is held: neither its name nor its number", async () => {
    rememberImage(IMAGE, PNG);
    await render(
      <CardFaceView
        card={{ cardId: CARD_ID, name: "Everyday", look: null, issuer: ISSUER }}
        label="Everyday"
        bare
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.queryByTestId("face-label")).toBeNull();
    expect(screen.queryByText("4821-0937-5530-1186")).toBeNull();
  });

  it("writes a v2 card's label while its visual is not read, even held, never its number", async () => {
    await render(
      <CardFaceView
        card={{ cardId: CARD_ID, name: "", look: null, issuer: ISSUER }}
        label="Card 0403"
        bare
        testID="face"
      />
    );
    // Read from the relays, which do not hold it (the face's own read, shared): the sand, the name
    // over it in ink, once the read is over too.
    expect(await act(() => loadImage(IMAGE))).toBeNull();
    expect(screen.getByTestId("face-label")).toHaveTextContent("Card 0403");
    expect(screen.getByTestId("face-label")).toHaveStyle({ color: palette.ink });
    expect(screen.queryByTestId("face-image")).toBeNull();
    expect(screen.queryByText("4821-0937-5530-1186")).toBeNull();
  });

  it("writes the name over a colour and over an image its holder imported, held or not", async () => {
    const colour = await render(
      <CardFaceView
        card={{
          cardId: CARD_ID,
          name: "Everyday",
          look: { kind: "color", color: "plum" },
          issuer: null
        }}
        label="Everyday"
        bare
        testID="face"
      />
    );
    expect(colour.getByTestId("face-label")).toHaveTextContent("Everyday");
    await colour.unmount();

    rememberImage(IMAGE, PNG);
    await render(
      <CardFaceView
        card={{
          cardId: CARD_ID,
          name: "Everyday",
          look: { kind: "image", image: IMAGE, ink: "dark" },
          issuer: null
        }}
        label="Everyday"
        bare
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.getByTestId("face-label")).toHaveTextContent("Everyday");
  });

  it("keeps the name over an image its holder imported, held, a v2 visual without image beside it", async () => {
    rememberImage(IMAGE, PNG);
    await render(
      <CardFaceView
        card={{
          cardId: CARD_ID,
          name: "Everyday",
          look: { kind: "image", image: IMAGE, ink: "dark" },
          issuer: null
        }}
        label="Everyday"
        legacy={{ number: ISSUER.number, white: true, image: { status: "none" } }}
        bare
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.getByTestId("face-label")).toHaveTextContent("Everyday");
  });

  it("writes a v2 card found's label and number over its colour only, never over its visual", async () => {
    const card = {
      cardId: CARD_ID,
      name: "",
      look: { kind: "color", color: "plum" } as const,
      issuer: null
    };
    const legacy = { number: ISSUER.number, white: true };
    const colour = await render(
      <CardFaceView
        card={card}
        label="Card 0403"
        legacy={{ ...legacy, image: { status: "none" } }}
      />
    );
    expect(colour.getByText("Card 0403")).toBeTruthy();
    expect(colour.getByText("4821-0937-5530-1186")).toBeTruthy();
    await colour.unmount();

    const loading = await render(
      <CardFaceView
        card={card}
        label="Card 0403"
        legacy={{ ...legacy, image: { status: "loading" } }}
      />
    );
    expect(loading.getByText("Card 0403")).toBeTruthy();
    expect(loading.queryByText("4821-0937-5530-1186")).toBeNull();
    await loading.unmount();

    await render(
      <CardFaceView
        card={card}
        label="Card 0403"
        legacy={{ ...legacy, image: { status: "shown", uri: "data:image/jpeg;base64,AA==" } }}
        testID="face"
      />
    );
    expect(screen.getByTestId("face-image")).toBeTruthy();
    expect(screen.queryByTestId("face-label")).toBeNull();
    expect(screen.queryByText("4821-0937-5530-1186")).toBeNull();
  });

  it("writes the name of a v2 card found over its visual in the app's ink on a light card", async () => {
    await render(
      <CardFaceView
        card={{
          cardId: CARD_ID,
          name: "Everyday",
          look: { kind: "color", color: "plum" },
          issuer: null
        }}
        label="Everyday"
        legacy={{
          number: ISSUER.number,
          white: true,
          image: { status: "shown", uri: "data:image/jpeg;base64,AA==" }
        }}
        testID="face"
      />
    );
    expect(screen.getByTestId("face-label")).toHaveStyle({ color: palette.ink });
  });
});

describe("a v2 card's printed number", () => {
  it("shows under the face, out of its layout, where the name starts", async () => {
    await render(<CardUnderFace number={ISSUER.number} width={150} />);
    expect(screen.getByTestId("card-printed-number")).toHaveTextContent("4821-0937-5530-1186");
    // The face's padding (18 px at 300 px) scaled to its width: the name's left, as far from the
    // right edge.
    expect(screen.getByTestId("card-under-face")).toHaveStyle({
      position: "absolute",
      top: "100%",
      left: 9,
      right: 9
    });
    // Out of the layout, in the 14 px its parents keep: never grown by the system's font size.
    expect(screen.getByTestId("card-printed-number").props.maxFontSizeMultiplier).toBe(1);
    expect(screen.queryByTestId("card-face-status")).toBeNull();
  });

  it("shows nothing without a number nor a status", async () => {
    await render(<CardUnderFace number={null} status={null} />);
    expect(screen.queryByTestId("card-under-face")).toBeNull();
  });
});

describe("a card's status under its face", () => {
  it("shows under its right, the number whole at its left, the status cut if it must", async () => {
    await render(<CardUnderFace number={ISSUER.number} status="Paused" />);
    expect(screen.getByTestId("card-under-face")).toHaveStyle({
      flexDirection: "row",
      left: 18,
      right: 18
    });
    expect(screen.getByTestId("card-printed-number")).toHaveStyle({ flexShrink: 0 });
    const status = screen.getByTestId("card-face-status");
    expect(status).toHaveTextContent("Paused");
    expect(status).toHaveStyle({ flexShrink: 1, marginLeft: "auto", color: colors.warning.fg });
    expect(status.props.numberOfLines).toBe(1);
    expect(status.props.maxFontSizeMultiplier).toBe(1);
  });

  it("shows at the right without a number", async () => {
    await render(<CardUnderFace number={null} status="Paused" />);
    expect(screen.queryByTestId("card-printed-number")).toBeNull();
    expect(screen.getByTestId("card-face-status")).toHaveStyle({ marginLeft: "auto" });
  });
});
