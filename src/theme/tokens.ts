/**
 * Design system tokens, copied verbatim from the design system's CSS tokens, but for the ink:
 * the sattle.me brand kit's, with its alphas and
 * the shadows drawn in it. Values carry the source's half-pixels on purpose: do not
 * round them to a grid.
 *
 * Two themes ("Light", "Dark", "Automatic", the last by default): `lightColors` is the design
 * system's, `darkColors` its dark counterpart. The dark theme takes the brand's ink as its
 * background, the cream as its text, keeps the orange as it is, and turns the umber of readable
 * accent text into a light amber; its surfaces rise in lightness where the light theme's rise in
 * whiteness. Both have
 * the same shape (`ThemeColors`): a screen reads its colours from the theme in use
 * (`useTheme`, `makeStyles`: theme.tsx), never from one of them, but for what stays the same in
 * both themes: `palette` (a QR code's black on white, a glyph on an orange fill, the PDFs).
 *
 * Rules that the tokens alone cannot enforce:
 * - orange is a fill, never text: readable accent text is `text.accent` (umber, amber in the dark);
 * - at most two background colours per screen (cream + white, or cream + sand);
 * - disabled = sand fill, never reduced opacity;
 * - one filled primary button per screen.
 *
 * Every pair of text and background of both themes keeps WCAG AA's 4.5:1 (theme-contrast.test.ts).
 */

/**
 * The brand's colours, the same in both themes: for what must not follow the theme (a QR code's
 * modules and plate, a glyph on an orange or green fill, a card's face, the printed PDFs). A
 * screen's text, surfaces and lines come from its theme's colours instead.
 */
export const palette = {
  cream: "#FAF6EE",
  white: "#FFFFFF",
  sand: "#F2ECE0",
  ink: "#0B1A33",
  stone: "#6E675E",
  stoneLight: "#8A837A",
  slate: "#57534E",
  orange: "#F7931A",
  orangePressed: "#E08414",
  apricot: "#F5E7D2",
  apricotDeep: "#FCEBD5",
  umber: "#8F5300",
  ink05: "rgba(11, 26, 51, 0.05)",
  ink10: "rgba(11, 26, 51, 0.10)",
  ink14: "rgba(11, 26, 51, 0.14)",
  ink35: "rgba(11, 26, 51, 0.35)",
  white12: "rgba(255, 255, 255, 0.12)",
  white50: "rgba(255, 255, 255, 0.5)"
} as const;

/** The two themes. */
export type ColorScheme = "light" | "dark";

/**
 * Over a screen of ink ("Frame the image": an image framed on it): its
 * texts and its quiet buttons, white; around the card's window, the image dimmed. The same in both
 * themes: that screen is ink in both.
 */
const onDark = {
  text: palette.white,
  secondary: "rgba(255, 255, 255, 0.82)",
  pressed: "rgba(255, 255, 255, 0.7)",
  fill: palette.white12,
  fillPressed: "rgba(255, 255, 255, 0.2)",
  ring: "rgba(255, 255, 255, 0.25)",
  frame: "rgba(255, 255, 255, 0.9)",
  // A small line over ink, dimmed (5.2:1): the side bar's group titles and version.
  muted: palette.white50,
  dim: "rgba(11, 26, 51, 0.72)"
} as const;

/**
 * A card's colours but the ink and the orange, the system's: the
 * palette (CARD_PALETTE, card-look.ts) and the cards drawn elsewhere take them from here. A card's
 * own colours: the same in both themes.
 */
const cardFace = {
  night: "#1F3A5F",
  plum: "#4A2D6B",
  bordeaux: "#7A2335",
  fir: "#1F5C45",
  lagoon: "#0E5A66",
  copper: "#8F5300"
} as const;

/** The colours of the light theme: the design system's. */
const light = {
  background: {
    app: palette.cream,
    surface: palette.white,
    subtle: palette.sand,
    accent: palette.orange,
    accentPressed: palette.orangePressed,
    accentSubtle: palette.apricot,
    // A deeper apricot: an empty card slot chosen (CardWalletFlow).
    accentSubtleStrong: palette.apricotDeep
  },

  text: {
    primary: palette.ink,
    secondary: palette.stone,
    // Below the secondary text: a locked tab's padlock, a row's chevron, a struck amount.
    tertiary: palette.stoneLight,
    // A note's text, between the primary and the secondary (slate).
    note: palette.slate,
    accent: palette.umber,
    // Project override: text on orange surfaces without a ring is white, not ink.
    onAccent: palette.white,
    disabled: palette.stone
  },

  border: {
    // The primary text at 10 %, 14 % and 35 %: a rule, a hairline, a control's ring.
    faint: palette.ink10,
    subtle: palette.ink14,
    strong: palette.ink35,
    accent: palette.orange
  },

  hoverOverlay: palette.ink05,
  scrim: palette.ink35,
  // "Organise" on a desktop: the page under the row of
  // cards being ordered, veiled in its own cream while it waits.
  veil: "rgba(250, 246, 238, 0.78)",

  onDark,

  button: {
    primary: {
      bg: palette.orange,
      bgHover: palette.orangePressed,
      bgActive: palette.orangePressed,
      ring: palette.umber,
      label: palette.white,
      labelShadow: "rgba(143, 83, 0, 0.55)",
      // Between a SplitButton's two parts: its ring's umber at half.
      divider: "rgba(143, 83, 0, 0.5)"
    },
    secondary: {
      bg: palette.white,
      bgHover: "#FBF8F2",
      bgActive: "#F7F2E9",
      ring: palette.ink14,
      ringHover: palette.ink35,
      label: palette.ink,
      labelShadow: palette.white
    },
    text: {
      label: palette.umber,
      labelHover: "#5E3600",
      labelActive: "#3C2200"
    },
    danger: {
      bg: palette.white,
      ring: "#C0492F",
      label: "#8C2F26"
    },
    // The confirm button of a removal: a solid red fill in a ring of its darker tone, white label
    // (overrides of --button-danger-*).
    dangerSolid: {
      bg: "#C0492F",
      bgHover: "#8C2F26",
      ring: "#8C2F26",
      label: palette.white,
      labelShadow: "rgba(90, 20, 14, 0.5)"
    },
    // An ink fill (the v2 migration's button on the welcome screen): white label, lighter on
    // hover as the side bar's ink rows,
    // in a ring of a darker ink. The dark theme turns it into a cream fill with an ink label.
    ink: {
      bg: palette.ink,
      bgHover: "#1C2B45",
      bgActive: "#28354B",
      ring: "#050D1A",
      label: palette.white,
      labelShadow: "rgba(0, 0, 0, 0.45)"
    }
  },

  state: {
    draft: { fg: palette.stone, bg: "#F2ECE0", dot: "#8A837A" },
    open: { fg: "#8F5300", bg: "#FCEBD5", dot: "#F7931A" },
    unconfirmed: { fg: "#14606E", bg: "#DFEDF0", dot: "#2E8AA0" },
    underpaid: { fg: "#7A5A00", bg: "#F5EBCB", dot: "#C79A16" },
    settled: { fg: "#1F6B45", bg: "#DCEDE2", dot: "#2E9C64" },
    canceled: { fg: "#8C2F26", bg: "#F5DEDA", dot: "#C0492F" },
    expired: { fg: "#57534E", bg: "#EDE9E3", dot: "#8A837A" }
  },

  // The phone drawn where a card is held to it (HoldStage.tsx): its body (seen
  // from behind) or its screen, its camera's module, its lenses and their glints.
  // The empty screens' drawings (StepGuide, src/components/illustrations/) take the same, and: the
  // shadow under a drawn panel (the card shadow's ink, drawn flat) and the ground under a drawn
  // object; a card drawn there takes a colour of `cardFace`. Their ink and their paper: what they
  // draw in ink and what they draw in white, swapped in the dark (cream strokes on navy paper).
  illustration: {
    phone: "#2A2521",
    module: "#3A332D",
    lens: "#141210",
    glint: "rgba(255, 255, 255, 0.08)",
    lensRing: "rgba(255, 255, 255, 0.14)",
    shadow: "rgba(11, 26, 51, 0.07)",
    ground: "rgba(11, 26, 51, 0.08)",
    ink: palette.ink,
    paper: palette.white,
    // The disc a loading scene is drawn on (LoadingScene.tsx), inside its ring: off the canvas,
    // under the paper of its panels.
    disc: palette.sand
  },

  cardFace,

  // The desktop side bar in ink: the navigation set apart from the cream screens,
  // an exception to the two backgrounds per screen. Over it, the rows' names and icons in white
  // (9.4:1 and 6.8:1 on ink), the group titles dimmer (5.2:1), the row shown on a lighter pill:
  // `onDark.fill` (white at 12 %) over ink, drawn opaque, since the copy of the rows it clips must
  // hide the rows below. The dark theme sets it apart in a deeper ink.
  sidebar: {
    bg: palette.ink,
    mark: "#28354B",
    hover: "rgba(255, 255, 255, 0.06)",
    label: "rgba(255, 255, 255, 0.72)",
    labelActive: palette.white,
    icon: "rgba(255, 255, 255, 0.6)",
    iconLocked: "rgba(255, 255, 255, 0.4)",
    group: palette.white50,
    // The business at the bottom: `onDark.fill` over ink.
    card: palette.white12
  },

  danger: { fg: "#8C2F26", bg: "#F5DEDA", solid: "#C0492F" },
  // The design system's warning is the underpaid state's ochre (--warning-*).
  warning: { fg: "#7A5A00", bg: "#F5EBCB", solid: "#C79A16" },
  success: { fg: "#1F6B45", bg: "#DCEDE2", solid: "#2E9C64" }
};

/** A value's strings as `string`: a theme's colours are any colour, not the light theme's. */
type Widened<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widened<T[K]> };

/** The shape of a theme's colours: every role the screens draw with. */
export type ThemeColors = Widened<typeof light>;

export const lightColors: ThemeColors = light;

/** The dark theme's cream, the light theme's canvas made a little softer: its primary text. */
const DARK_TEXT = "#F4EFE6";

/**
 * The colours of the dark theme: the brand's ink as the canvas
 * (#0B1A33), its surfaces lighter as they rise (OKLCH lightness 0.265, 0.315 at the ink's hue, 260),
 * the cream as text, the orange unchanged. Each state keeps its hue: a deep tint behind, a light
 * tone in front (OKLCH 0.325 / 0.8 or so), its dot as bright as needed on the surfaces (≥ 3:1).
 */
export const darkColors: ThemeColors = {
  background: {
    app: palette.ink,
    surface: "#16253D",
    subtle: "#23324A",
    accent: palette.orange,
    accentPressed: palette.orangePressed,
    accentSubtle: "#4D2F13",
    accentSubtleStrong: "#492D0F"
  },

  text: {
    primary: DARK_TEXT,
    secondary: "#ADB6C6",
    tertiary: "#8993A2",
    note: "#C3CBD8",
    accent: "#F1AF64",
    onAccent: palette.white,
    disabled: "#ADB6C6"
  },

  border: {
    faint: "rgba(244, 239, 230, 0.10)",
    subtle: "rgba(244, 239, 230, 0.14)",
    strong: "rgba(244, 239, 230, 0.35)",
    accent: palette.orange
  },

  hoverOverlay: "rgba(244, 239, 230, 0.06)",
  scrim: "rgba(2, 7, 16, 0.6)",
  veil: "rgba(11, 26, 51, 0.78)",

  onDark,

  button: {
    primary: light.button.primary,
    secondary: {
      bg: "#16253D",
      bgHover: "#1C2B44",
      bgActive: "#122038",
      ring: "rgba(244, 239, 230, 0.16)",
      ringHover: "rgba(244, 239, 230, 0.38)",
      label: DARK_TEXT,
      labelShadow: "rgba(0, 0, 0, 0.35)"
    },
    text: {
      label: "#F1AF64",
      labelHover: "#FCC687",
      labelActive: "#FFD6A4"
    },
    danger: {
      bg: "#16253D",
      ring: "#CE5342",
      label: "#F99F90"
    },
    dangerSolid: {
      bg: "#C0492F",
      bgHover: "#A63E27",
      ring: "#8C2F26",
      label: palette.white,
      labelShadow: "rgba(90, 20, 14, 0.5)"
    },
    ink: {
      bg: DARK_TEXT,
      bgHover: palette.white,
      bgActive: "#E6DFD2",
      ring: "#CFC6B6",
      label: palette.ink,
      labelShadow: "rgba(255, 255, 255, 0.6)"
    }
  },

  state: {
    draft: { fg: "#ADB6C6", bg: "#23324A", dot: "#8993A2" },
    open: { fg: "#F4AD67", bg: "#492D0F", dot: "#F7931A" },
    unconfirmed: { fg: "#85D2E5", bg: "#0D3A44", dot: "#2BA9C2" },
    underpaid: { fg: "#EDCE79", bg: "#3E3313", dot: "#C79A16" },
    settled: { fg: "#8FDCA4", bg: "#1F3B27", dot: "#359658" },
    canceled: { fg: "#F99F90", bg: "#4E2721", dot: "#CE5342" },
    expired: { fg: "#ADB6C6", bg: "#272E39", dot: "#8993A2" }
  },

  illustration: {
    phone: "#3A342F",
    module: "#47413C",
    lens: "#141210",
    glint: "rgba(255, 255, 255, 0.08)",
    lensRing: "rgba(255, 255, 255, 0.14)",
    shadow: "rgba(0, 0, 0, 0.25)",
    ground: "rgba(0, 0, 0, 0.3)",
    ink: DARK_TEXT,
    paper: "#23324A",
    // The surface's navy: the subtle one is the paper's, on which a panel would not show.
    disc: "#16253D"
  },

  cardFace,

  sidebar: { ...light.sidebar, bg: "#051024", mark: "#1C2B44" },

  danger: { fg: "#F99F90", bg: "#4E2721", solid: "#CE5342" },
  warning: { fg: "#EDCE79", bg: "#3E3313", solid: "#C79A16" },
  success: { fg: "#8FDCA4", bg: "#1F3B27", solid: "#359658" }
};

export type PaymentState = keyof ThemeColors["state"];

/** Indexed spacing scale (tokens/spacing.css). */
export const space = {
  1: 2,
  2: 4,
  3: 6,
  4: 9,
  5: 12,
  6: 16,
  7: 20,
  8: 22,
  9: 26,
  10: 30,
  11: 38,
  12: 56
} as const;

/** Screen gutter: headers, rows and sheets align to it. */
export const gutter = space[8];

/** Mobile cards of rows ("To follow up", "Settings", "Employees", relays): where rows start. */
export const cardInset = space[6];

export const radius = {
  sm: 12, // chips, small tiles
  md: 16, // inputs, selects, framed regions
  lg: 22, // cards, dialogs, QR plate
  xl: 24, // keypad keys
  sheet: 26, // bottom-sheet top corners
  pill: 999 // buttons, status pills
} as const;

export const control = {
  min: 44, // tap-target floor, icon buttons
  md: 56, // inputs, secondary buttons
  lg: 64 // the one primary action on a screen
} as const;

export const stroke = {
  hairline: 1,
  control: 1.5
} as const;

export const qr = {
  quietZone: 18, // never reduce
  size: 200
} as const;

/**
 * The only two shadows of the system (tokens/elevation.css), as CSS
 * `boxShadow` strings (supported by React Native's New Architecture and web).
 */
/** A card shadow's colour and opacity: the shadow below, drawn at another size by an animation. */
type ShadowTint = { readonly rgb: string; readonly alpha: number };

const LIGHT_CARD_TINT: ShadowTint = { rgb: "11, 26, 51", alpha: 0.07 };
const DARK_CARD_TINT: ShadowTint = { rgb: "0, 0, 0", alpha: 0.32 };

const cardShadow = ({ rgb, alpha }: ShadowTint) => `0px 2px 14px 0px rgba(${rgb}, ${alpha})`;

const lightShadowValues = {
  card: cardShadow(LIGHT_CARD_TINT),
  // The card shadow's colour, for the paid screen's plate, which carries it as it grows
  // (PaidArrival.tsx).
  cardTint: LIGHT_CARD_TINT,
  raised: "0px 1px 3px 0px rgba(11, 26, 51, 0.07)",
  // A card held to the phone on its stage (HoldStage.tsx): lifted off it.
  held: "0px 6px 14px 0px rgba(11, 26, 51, 0.28)",
  focusRing: `0px 0px 0px 4px ${palette.apricot}`,
  buttonInnerHighlight: "inset 0px 1px 0px 0px rgba(255, 255, 255, 0.3)",
  buttonInnerHighlightLight: "inset 0px 1px 0px 0px #FFFFFF",
  buttonLift: "0px 1px 2px 0px rgba(11, 26, 51, 0.07)",
  buttonPressInset: "inset 0px 2px 4px 0px rgba(143, 83, 0, 0.4)",
  buttonPressInsetInk: "inset 0px 2px 4px 0px rgba(0, 0, 0, 0.45)",
  buttonPressInsetLight: "inset 0px 2px 4px 0px rgba(11, 26, 51, 0.12)"
};

/** The shape of a theme's shadows. */
export type ThemeShadow = typeof lightShadowValues;

export const lightShadow: ThemeShadow = lightShadowValues;

/**
 * The dark theme's shadows: an ink shadow does not show on ink, so they are black and stronger
 * (the surfaces' lightness tells their elevation first); a light button's white highlight is a
 * faint one; the focus halo is the orange at 45 %, the apricot showing as a stain on navy.
 */
export const darkShadow: ThemeShadow = {
  ...lightShadowValues,
  card: cardShadow(DARK_CARD_TINT),
  cardTint: DARK_CARD_TINT,
  raised: "0px 1px 3px 0px rgba(0, 0, 0, 0.4)",
  held: "0px 6px 14px 0px rgba(0, 0, 0, 0.5)",
  focusRing: "0px 0px 0px 4px rgba(247, 147, 26, 0.45)",
  buttonInnerHighlightLight: "inset 0px 1px 0px 0px rgba(255, 255, 255, 0.06)",
  buttonLift: "0px 1px 2px 0px rgba(0, 0, 0, 0.3)",
  buttonPressInsetLight: "inset 0px 2px 4px 0px rgba(0, 0, 0, 0.35)"
};

export const motion = {
  pulseDuration: 1600,
  // Spinner: one turn of its arc.
  spin: 1000,
  fast: 140,
  sheet: 260,
  // A panel going from one page to the next (Sheet's `page`): the
  // page left fades out (sheetPageOut) while the panel takes its new height (sheet), and the new
  // page fades in a little after (sheetPageInDelay, then sheetPageIn). Fades: kept with Reduce
  // Motion.
  sheetPageOut: 140,
  sheetPageInDelay: 80,
  sheetPageIn: 220,
  // Segmented control: the white thumb slides to the option chosen, carrying its ink with it.
  segmentInk: 300,
  // Wallet: the sync pill beside the list's title fades out once the first sync is done.
  syncFade: 260,
  // "Wallet" / "My activity": a state of "To follow up" chosen, the rows out of it fold away
  // (their height) and fade, as the title and the other states.
  activityFold: 260,
  activityFade: 200,
  // Step dots (ProgressDots): a change of step, a dot added to or removed from the path.
  dots: 260,
  // Split bar (SplitBar): the blocks and handle follow the share, the colours fade
  // (currency, figure in or out of its block), a figure slides out of or back into its block, and
  // its link line grows once it is out.
  splitBar: 160,
  splitFade: 220,
  splitFigure: 380,
  splitLineDelay: 200,
  // Keypad amount (AnimatedAmount): each key slides the digits one place (amountSlide, also the
  // figure's width and scale); what it brings in rises into place once its neighbour moved away
  // (amountEnterDelay, then amountEnter), each glyph a little after the one on its right
  // (amountStagger). A deleted digit sinks out (amountDeleted), anything else fades (amountOut).
  amountSlide: 300,
  amountEnter: 260,
  amountEnterDelay: 90,
  amountStagger: 30,
  amountDeleted: 100,
  amountOut: 160,
  // Navigation: a screen fades in when its destination is chosen, the
  // active mark slides between rows or slots, the dock morphs between till mode and unlocked,
  // the "More" panel rises from the dock, the dock leaves for the invoice.
  navScreen: 220,
  navIndicator: 260,
  navDock: 320,
  navPanel: 260,
  navStagger: 35,
  // The side bar's pill: its slide lasts with the distance, from
  // navMarkMin for the next row to navMarkMax across the whole list (navMarkPerPx ms per pt in
  // between): a long jump does not rush, a short one does not drag. The icon of the row it
  // reaches makes its gesture (navGesture, the gear's and the clock's turn: navGestureTurn) once
  // the pill is nearly there (half its slide).
  navMarkMin: 220,
  navMarkMax: 380,
  navMarkPerPx: 0.32,
  navGesture: 480,
  navGestureTurn: 800,
  // Delays: the dock's slots once the till-mode pair fades, the "More" content after the card,
  // the side bar's "Switch to till mode" after the padlocks.
  navEnterDelay: 90,
  navTileDelay: 60,
  navTillDelay: 120,
  // The "More" content fades in after the card (navTileDelay), without moving.
  navContent: 200,
  // The name of the screen shown, in its dock slot: it comes in once the slot has room for it
  // (navEnterDelay), and leaves at once.
  navLabelIn: 180,
  navLabelOut: 60,
  // "Customize" ↔ "Done": the card's title and action cross-fade (out, then in after
  // navFadeDelay), its height follows (navPanel).
  navFadeOut: 120,
  navFadeIn: 200,
  navFadeDelay: 40,
  // A swap while customising: both icons slide (navSlide),
  // the one coming in fades in after navTileDelay (navSlideIn), the other fades out (navSlideOut).
  navSlide: 320,
  navSlideIn: 220,
  navSlideOut: 140,
  // Notifications: one comes in fading and
  // sliding 12 pt from its edge (notificationIn), leaves fading and sliding 8 pt back towards it
  // (notificationOut); the others of the stack slide to make room or close the gap
  // (notificationMove).
  notificationIn: 260,
  notificationOut: 180,
  notificationMove: 260,
  // Paid (a green fade; mobile):
  // the code's plate turns green, its code fading with it (paidTint), as the rest of the waiting
  // screen fades out (paidWaitOut); the green plate then contracts into the paid screen's disc
  // (paidMorph, after paidMorphDelay), whose check pops (paidCheck, after paidCheckDelay); the
  // paid screen's rows rise into place one after the other (paidRows, from paidRowsDelay,
  // paidRowsStagger apart).
  paidTint: 280,
  paidWaitOut: 220,
  paidMorphDelay: 240,
  paidMorph: 460,
  paidCheckDelay: 560,
  paidCheck: 260,
  paidRowsDelay: 500,
  paidRowsStagger: 35,
  paidRows: 300,
  // A column's menu of a table (sorting and filtering):
  // it drops from its header, fading in while sliding 4 pt into place, and fades out the same way.
  popover: 160,
  // Login's loading screen: the business fades in above
  // the spinner once its settings are known, without moving.
  loginBusiness: 260,
  // The keypad's note, written under the amount: its orange line grows from the centre
  // (noteLine); on mobile, the keypad and "Charge" fade out for the keyboard, and back
  // (noteKeypad).
  noteLine: 260,
  noteKeypad: 200,
  // The point of sale's scan: the card of the article
  // just read lights up in apricot, then fades back.
  scanFlash: 450,
  // "Wallet" live: a row arrived folds in (activityFold, its content fading: activityFade), lit in
  // apricot as the scanned article; the glow holds (arrivalGlowHold), then fades back to white
  // (arrivalGlowFade). A colour, kept with Reduce Motion. The pill telling arrivals kept out of a
  // list scrolled down comes in as a column's menu (popover).
  arrivalGlowHold: 650,
  arrivalGlowFade: 1950,
  // The mined chain of "Confirming" (ChainLoader): each loop (chainCycle) the chain slides one
  // step left (chainSlide), the
  // block that arrives flickers (chainTick, the design system's) until mined, pops (chainPop),
  // then grows its link toward the next one (chainGrow).
  chainSlide: 460,
  chainTick: 90,
  chainPop: 260,
  chainGrow: 200,
  chainCycle: 2200,
  // "Organise" of "Cards":
  // the cards a dragged one passes slide to their new place, the dragged one settles into its own
  // once let go. A card taken lifts, leaning (reorderLift); carried, it leans with its movement
  // (reorderLean), then swings back like a card held by one point once the pointer slows
  // (reorderSwing, a spring's perceptual duration).
  reorder: 200,
  reorderLift: 160,
  reorderLean: 90,
  reorderSwing: 650,
  // A screen's loading scene (LoadingScene.tsx): nothing for loadingDelay, so that what the device
  // reads at once never flashes a scene, then the scene comes in, fading and growing from 94 %
  // (loadingEnter; with Reduce Motion, fading only). Once read, it fades out, shrinking back a
  // little (loadingExit, useLoadingScene), then what takes its place fades in (loadingArrival,
  // Arrival.tsx). Fades: kept with Reduce Motion.
  loadingDelay: 250,
  loadingEnter: 260,
  loadingExit: 220,
  loadingArrival: 220,
  // A change of theme ("Theme"): the screen as
  // it showed fades out over the screen in the new theme, slowing down (theme-crossfade.ts, in
  // src/features/appearance/). A fade, kept with Reduce Motion.
  themeCrossfade: 260
} as const;
