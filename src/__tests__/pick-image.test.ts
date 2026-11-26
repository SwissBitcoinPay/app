import {
  PickImageError,
  cardJpeg,
  centredCrop,
  pickImageToSquare,
  pickSquareImage,
  squareJpeg
} from "@/features/media/pick-image";

/**
 * expo-image-manipulator, faked: a JPEG of `side` × `height` px (`height` = `side` when the resize
 * names none) at quality `compress` weighs about side × height × compress × `mockDensity` bytes, so
 * that each test says which attempt fits.
 */
let mockDensity = 0.25;
const mockRendered: { crop: unknown; side: number; height: number; source: unknown }[] = [];
/** What squareJpeg made (contexts, images) and whether each was released. */
const mockMade: { kind: "context" | "image"; released: boolean }[] = [];

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: (source: unknown) => {
      const step: { crop: unknown; side: number; height: number; source: unknown } = {
        crop: null,
        side: 0,
        height: 0,
        source
      };
      const made = { kind: "context" as const, released: false };
      mockMade.push(made);
      const context = {
        crop: (crop: unknown) => {
          step.crop = crop;
          return context;
        },
        resize: ({ width, height }: { width: number; height?: number }) => {
          step.side = width;
          step.height = height ?? width;
          return context;
        },
        renderAsync: async () => {
          mockRendered.push(step);
          const image = { kind: "image" as const, released: false };
          mockMade.push(image);
          return {
            saveAsync: async ({ compress }: { compress: number }) => ({
              // "AAAA" is 3 zero bytes in base64.
              base64: "AAAA".repeat(
                Math.ceil((step.side * step.height * compress * mockDensity) / 3)
              )
            }),
            release: () => {
              image.released = true;
            }
          };
        },
        release: () => {
          made.released = true;
        }
      };
      return context;
    }
  }
}));

/** expo-image-picker, faked: the system's photo library and camera app, and its permission. */
const mockPicker = {
  library: jest.fn(),
  camera: jest.fn(),
  permission: jest.fn()
};
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (options: unknown) => mockPicker.library(options),
  launchCameraAsync: (options: unknown) => mockPicker.camera(options),
  requestCameraPermissionsAsync: () => mockPicker.permission()
}));

/** A photo the picker gives, as the system's editor cropped it. */
const PICKED = { canceled: false, assets: [{ uri: "file:///photo.jpg", width: 900, height: 900 }] };

beforeEach(() => {
  mockRendered.length = 0;
  mockMade.length = 0;
  mockDensity = 0.25;
  mockPicker.library.mockReset().mockResolvedValue(PICKED);
  mockPicker.camera.mockReset().mockResolvedValue(PICKED);
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

describe("pickSquareImage", () => {
  const SQUARE = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };

  it("picks from the photo library by default, asking for no camera", async () => {
    mockDensity = 0.1;
    const bytes = await pickSquareImage("article");
    expect(mockPicker.library).toHaveBeenCalledWith(SQUARE);
    expect(mockPicker.camera).not.toHaveBeenCalled();
    expect(mockPicker.permission).not.toHaveBeenCalled();
    expect(mockRendered.map(({ source, side }) => [source, side])).toEqual([
      ["file:///photo.jpg", 512]
    ]);
    expect(bytes?.length).toBeGreaterThan(0);
  });

  it("takes a photo with the camera once it is allowed, cropped square as the library's", async () => {
    mockDensity = 0.1;
    const bytes = await pickSquareImage("article", "camera");
    expect(mockPicker.permission).toHaveBeenCalledTimes(1);
    expect(mockPicker.camera).toHaveBeenCalledWith(SQUARE);
    expect(mockPicker.library).not.toHaveBeenCalled();
    expect(mockRendered.map(({ source, side }) => [source, side])).toEqual([
      ["file:///photo.jpg", 512]
    ]);
    expect(bytes?.length).toBeGreaterThan(0);
  });

  it("gives nothing when the camera or the library is closed without a photo", async () => {
    mockPicker.camera.mockResolvedValue({ canceled: true, assets: null });
    mockPicker.library.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickSquareImage("article", "camera")).resolves.toBeNull();
    await expect(pickSquareImage("article")).resolves.toBeNull();
    expect(mockRendered).toEqual([]);
  });

  it("opens no camera that was not allowed", async () => {
    mockPicker.permission.mockResolvedValue({ granted: false, status: "denied" });
    expect(await failure(pickSquareImage("article", "camera"))).toBe("cameraDenied");
    expect(mockPicker.camera).not.toHaveBeenCalled();
  });

  it("tells a camera that does not open from a library refused", async () => {
    // Android 9: the storage refused (expo-image-picker 57.0.20); or no camera app.
    mockPicker.camera.mockRejectedValue(new Error("User rejected permissions"));
    expect(await failure(pickSquareImage("article", "camera"))).toBe("cameraDenied");
    mockPicker.permission.mockRejectedValue(new Error("Permissions module not found"));
    expect(await failure(pickSquareImage("article", "camera"))).toBe("cameraDenied");
    mockPicker.library.mockRejectedValue(new Error("Missing camera roll permission"));
    expect(await failure(pickSquareImage("article"))).toBe("denied");
  });
});

describe("pickImageToSquare", () => {
  it("gives the photo picked at once, its square JPEG made after", async () => {
    mockDensity = 0.1;
    const picked = await pickImageToSquare("article", "camera");
    expect(mockPicker.camera).toHaveBeenCalledTimes(1);
    expect(picked).not.toBeNull();
    const bytes = await picked!.bytes;
    expect(mockRendered.map(({ source, side }) => [source, side])).toEqual([
      ["file:///photo.jpg", 512]
    ]);
    expect(bytes).toEqual(await pickSquareImage("article", "camera"));
  });

  it("gives nothing, making nothing, when the picker is closed without a photo", async () => {
    mockPicker.library.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImageToSquare("article")).resolves.toBeNull();
    expect(mockRendered).toEqual([]);
  });

  it("tells the picker's failures from a photo that cannot be made", async () => {
    mockPicker.library.mockRejectedValue(new Error("Missing camera roll permission"));
    expect(await failure(pickImageToSquare("article"))).toBe("denied");

    // Picked, but too heavy at every size: the picker answered, its bytes say it.
    mockPicker.library.mockResolvedValue(PICKED);
    mockDensity = 10;
    const picked = await pickImageToSquare("article");
    expect(picked).not.toBeNull();
    expect(await failure(picked!.bytes)).toBe("unreadable");
    expect(mockMade.every(({ released }) => released)).toBe(true);
  });
});

describe("squareJpeg", () => {
  it("keeps a logo or a photo of a person at 256 px, 24 000 bytes at most", async () => {
    const bytes = await squareJpeg("file:///logo.jpg", 1200, 900);
    expect(mockRendered.map(({ side }) => side)).toEqual([256]);
    expect(bytes.length).toBeLessThanOrEqual(24_000);
    // Its middle square.
    expect(mockRendered[0]?.crop).toEqual({ originX: 150, originY: 0, width: 900, height: 900 });
  });

  it("makes an article's photo 512 px when it fits one record", async () => {
    mockDensity = 0.15;
    const bytes = await squareJpeg("file:///croissant.jpg", 960, 1280, "article");
    expect(mockRendered.map(({ side }) => side)).toEqual([512]);
    expect(bytes.length).toBeLessThanOrEqual(30_000);
  });

  it("falls back to 384 px for a photo too busy for 512 px", async () => {
    // 512 px weighs 45 875, 39 322 then 32 768 bytes: none fits 30 000; 384 px at 0.7 does.
    const bytes = await squareJpeg("file:///sandwich.jpg", 960, 640, "article");
    expect(mockRendered.map(({ side }) => side)).toEqual([512, 384]);
    expect(bytes.length).toBeLessThanOrEqual(30_000);
  });

  it("never enlarges an article's photo past its own square (Open Food Facts: 400 px)", async () => {
    mockDensity = 0.1;
    await squareJpeg("file:///rivella.jpg", 400, 400, "article");
    expect(mockRendered.map(({ side }) => side)).toEqual([400]);
  });

  it("releases every context and image it made, whether it fits or not", async () => {
    // 512 px fits nowhere, 384 px does: two renders, each released.
    await squareJpeg("file:///sandwich.jpg", 960, 640, "article");
    expect(mockMade.map(({ kind }) => kind)).toEqual(["context", "image", "context", "image"]);
    expect(mockMade.every(({ released }) => released)).toBe(true);

    mockMade.length = 0;
    mockDensity = 10;
    await expect(squareJpeg("file:///poster.jpg", 2000, 2000, "article")).rejects.toThrow(
      "small enough"
    );
    expect(mockMade.length).toBeGreaterThan(0);
    expect(mockMade.every(({ released }) => released)).toBe(true);
  });

  it("cuts an image already decoded from its own pixels, and leaves it to its caller", async () => {
    const decoded = { width: 400, height: 600, release: jest.fn() };
    mockDensity = 0.1;
    await squareJpeg(decoded as never, 400, 600, "article");
    expect(mockRendered.map(({ source, side }) => [source, side])).toEqual([[decoded, 400]]);
    expect(mockRendered[0]?.crop).toEqual({ originX: 0, originY: 100, width: 400, height: 400 });
    expect(decoded.release).not.toHaveBeenCalled();
  });
});

describe("cardJpeg", () => {
  /** The card's shape (ISO/IEC 7810 ID-1). */
  const CARD = 85.6 / 53.98;

  it("cuts the largest part of the card's shape from an image's middle", () => {
    expect(centredCrop(1200, 1200, CARD)).toEqual({
      originX: 0,
      originY: 222,
      width: 1200,
      height: 756
    });
    expect(centredCrop(3000, 1000, CARD)).toEqual({
      originX: 707,
      originY: 0,
      width: 1585,
      height: 1000
    });
    // Already of the card's shape: whole.
    expect(centredCrop(1012, 638, CARD)).toEqual({
      originX: 0,
      originY: 0,
      width: 1011,
      height: 638
    });
  });

  it("makes a card's image 640 px wide of the crop's shape, when it fits one record", async () => {
    mockDensity = 0.1;
    const crop = { originX: 0, originY: 222, width: 1200, height: 756 };
    const bytes = await cardJpeg("file:///front.png", crop);
    expect(mockRendered).toEqual([{ source: "file:///front.png", crop, side: 640, height: 403 }]);
    expect(bytes.length).toBeLessThanOrEqual(30_000);
  });

  it("comes out narrower for a busy image, and never wider than its crop", async () => {
    // 640 px weighs 90 272, 77 376 then 64 480 bytes; 512 px 49 613 then 41 344: none fits
    // 30 000; 384 px at 0.5 does (23 232).
    mockDensity = 0.5;
    const crop = { originX: 0, originY: 0, width: 1200, height: 756 };
    await cardJpeg("file:///busy.png", crop);
    expect(mockRendered.map(({ side }) => side)).toEqual([640, 512, 384]);

    mockRendered.length = 0;
    mockDensity = 0.1;
    await cardJpeg("file:///small.png", { originX: 0, originY: 0, width: 300, height: 189 });
    expect(mockRendered.map(({ side, height }) => [side, height])).toEqual([[300, 189]]);
  });

  it("refuses what it cannot make small enough, or an empty crop, every image released", async () => {
    mockDensity = 10;
    await expect(
      cardJpeg("file:///poster.png", { originX: 0, originY: 0, width: 4000, height: 2522 })
    ).rejects.toThrow("small enough");
    expect(mockMade.every(({ released }) => released)).toBe(true);
    await expect(
      cardJpeg("file:///none.png", { originX: 0, originY: 0, width: 0, height: 0 })
    ).rejects.toBeInstanceOf(PickImageError);
  });
});
