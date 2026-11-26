import { inkOver } from "@/features/card/card-look";
import { fitWithin, openCardImage } from "@/features/media/card-image";
import { PickImageError } from "@/features/media/pick-image";
import { meanLight } from "@/lib/media/luminance";

import type * as FileSystemFake from "../../jest/expo-file-system";
import { imageFake, resetImageFake } from "../../jest/image-manipulator";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"));

/** expo-image-picker, faked: the system's photo library and camera app, and its permission. */
const mockPicker = { library: jest.fn(), camera: jest.fn(), permission: jest.fn() };
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (options: unknown) => mockPicker.library(options),
  launchCameraAsync: (options: unknown) => mockPicker.camera(options),
  requestCameraPermissionsAsync: () => mockPicker.permission()
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const PHOTO = "file:///DCIM/photo.jpg";

/** The photo the picker gives, of `width` × `height` (0: the system does not say). */
function picked(width: number, height: number) {
  return { canceled: false, assets: [{ uri: PHOTO, width, height }] };
}

/** A light sky over dark dunes: white above the middle, black below. */
const SKY_OVER_DUNES = (_x: number, y: number) =>
  y < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

beforeEach(() => {
  resetImageFake();
  fileSystem.resetFileSystem();
  fileSystem.binaries.set(PHOTO, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  imageFake.decoded = { width: 4032, height: 3024 };
  imageFake.picture = SKY_OVER_DUNES;
  mockPicker.library.mockReset().mockResolvedValue(picked(4032, 3024));
  mockPicker.camera.mockReset().mockResolvedValue(picked(4032, 3024));
  mockPicker.permission.mockReset().mockResolvedValue({ granted: true, status: "granted" });
});

/** The PickImageError `promise` rejects with: its code. */
async function failure(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  if (!(error instanceof PickImageError)) throw new Error(`Not a PickImageError: ${String(error)}`);
  return error.code;
}

describe("a card's image, opened to be framed", () => {
  it("is picked as it is, decoded at 2048 px at most, shown from that copy", async () => {
    const source = await openCardImage("library");
    expect(mockPicker.library).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: undefined,
      quality: 1
    });
    expect(source).toMatchObject({ width: 2048, height: 1536 });
    // Decoded once, from the photo: everything after works on that copy.
    expect(imageFake.rendered.filter((render) => render.source === PHOTO)).toHaveLength(1);
    // What shows while it is framed: a JPEG of that copy, the pixels framed.
    const shown = imageFake.saved.find((save) => save.format === "jpeg");
    expect(shown).toMatchObject({ width: 2048, height: 1536 });
    expect(source?.uri).toMatch(/^file:\/\/\/cache\/ImageManipulator\/\d+\.jpeg$/);
  });

  it("measures its light place by place, from a copy halved down to the map", async () => {
    const source = await openCardImage("library");
    expect(source?.light).toMatchObject({ width: 96, height: 72 });
    const light = source!.light;
    // The sky's rows white, the dunes' black.
    expect(light.light[0]).toBeCloseTo(1, 9);
    expect(light.light[35 * 96 + 50]).toBeCloseTo(1, 9);
    expect(light.light[36 * 96 + 50]).toBe(0);
    expect(light.light[71 * 96 + 95]).toBe(0);
    // Halved from 2048 px to 128, then made 96: never one step from the whole image.
    const map = imageFake.rendered[1]!;
    expect(map.resizes.map(({ width, height }) => `${width}×${height}`)).toEqual([
      "1024×768",
      "512×384",
      "256×192",
      "128×96",
      "96×72"
    ]);
    expect(imageFake.saved.find((save) => save.format === "png")).toMatchObject({
      width: 96,
      height: 72
    });
  });

  it("measures what is not opaque over black, as the card's JPEG shows it", async () => {
    // A logo's white background at 30 %: dark grey on the card, where only white ink reads.
    imageFake.picture = () => ({ r: 255, g: 255, b: 255, a: 77 });
    const source = await openCardImage("library");
    const light = source!.light;
    // sRGB 77 / 255 made linear: about 0.074, never the 1 of white.
    expect(light.light[0]).toBeCloseTo(0.0743, 3);
    const whole = { left: 0, top: 0, right: 1, bottom: 1 };
    expect(inkOver(meanLight(light, whole))).toBe("light");
    // Opaque, the same white takes dark ink.
    imageFake.picture = () => ({ r: 255, g: 255, b: 255 });
    const opaque = await openCardImage("library");
    expect(inkOver(meanLight(opaque!.light, whole))).toBe("dark");
  });

  it("frees every image it decoded but the one framed, then that one when released", async () => {
    const source = await openCardImage("library");
    const images = imageFake.made.filter((made) => made.kind === "image");
    expect(images.filter((made) => !made.released)).toHaveLength(1);
    expect(imageFake.made.filter((made) => made.kind === "context" && !made.released)).toEqual([]);
    source!.release();
    expect(imageFake.made.every((made) => made.released)).toBe(true);
  });

  it("decodes a photo of unknown size once, then makes it smaller", async () => {
    mockPicker.library.mockResolvedValue(picked(0, 0));
    const source = await openCardImage("library");
    expect(source).toMatchObject({ width: 2048, height: 1536 });
    expect(imageFake.rendered.map(({ width }) => width)).toEqual([4032, 2048, 96]);
    source!.release();
    expect(imageFake.made.every((made) => made.released)).toBe(true);
  });

  it("keeps a small image as it is, never enlarged", async () => {
    imageFake.decoded = { width: 60, height: 40 };
    mockPicker.library.mockResolvedValue(picked(60, 40));
    const source = await openCardImage("library");
    expect(source).toMatchObject({ width: 60, height: 40, light: { width: 60, height: 40 } });
  });

  it("refuses an image whose light cannot be read, freeing what it decoded", async () => {
    imageFake.pngRefused = true;
    expect(await failure(openCardImage("library"))).toBe("unreadable");
    expect(imageFake.made.every((made) => made.released)).toBe(true);
    imageFake.pngRefused = false;
    imageFake.unreadable = true;
    expect(await failure(openCardImage("library"))).toBe("unreadable");
  });

  it("gives nothing when the picker is closed, says when the photos or the camera are refused", async () => {
    mockPicker.library.mockResolvedValue({ canceled: true, assets: null });
    await expect(openCardImage("library")).resolves.toBeNull();
    expect(imageFake.rendered).toEqual([]);
    mockPicker.library.mockRejectedValue(new Error("No access to the photos"));
    expect(await failure(openCardImage("library"))).toBe("denied");
    mockPicker.permission.mockResolvedValue({ granted: false, status: "denied" });
    expect(await failure(openCardImage("camera"))).toBe("cameraDenied");
    expect(mockPicker.camera).not.toHaveBeenCalled();
  });
});

describe("fitWithin", () => {
  it("fits a size within a side, never enlarging it, a pixel at least", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032, 96)).toEqual({ width: 72, height: 96 });
    expect(fitWithin(50, 40, 96)).toEqual({ width: 50, height: 40 });
    expect(fitWithin(10_000, 3, 96)).toEqual({ width: 96, height: 1 });
  });
});
