import { renderHook } from "@testing-library/react-native";
import type { ViewInstance } from "react-native";

import { usePhotoDrop } from "@/features/catalog/photo-drop.web";
import { PickImageError } from "@/features/media/pick-image";

// The web app's drops of a photo onto "Items"' form (photo-drop.web.ts): the file handed over at
// once, its square JPEG being made; a failure told, never a photo silently left out.

const SQUARE = new Uint8Array(300).fill(5);
const mockSquareJpeg = jest.fn<Promise<Uint8Array>, [string, number, number, string]>(
  async () => SQUARE
);
jest.mock("@/features/media/pick-image", () => ({
  ...jest.requireActual("@/features/media/pick-image"),
  squareJpeg: (uri: string, width: number, height: number, use: string) =>
    mockSquareJpeg(uri, width, height, use)
}));

/** The browser's `<img>`, faked: it reads the size of an image it decodes, else fails. */
let mockDecodes = true;
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_uri: string) {
    queueMicrotask(() => {
      if (!mockDecodes) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = 1200;
      this.naturalHeight = 900;
      this.onload?.();
    });
  }
}

/** The form's photo zone as react-native-web renders it: a DOM element, its listeners. */
function zone() {
  const listeners = new Map<string, (event: unknown) => void>();
  const node = {
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    contains: () => false
  };
  return { ref: { current: node as unknown as ViewInstance }, listeners };
}

/** The bytes handed over for `file` dropped on the zone: in an object, so that none awaits them. */
async function drop(file: { type: string }): Promise<{ bytes: Promise<Uint8Array | null> }> {
  const { ref, listeners } = zone();
  const onDrop = jest.fn<void, [Promise<Uint8Array | null>]>();
  await renderHook(() => usePhotoDrop(ref, onDrop));
  listeners.get("drop")!({
    preventDefault: () => undefined,
    dataTransfer: { types: ["Files"], files: [file] }
  });
  expect(onDrop).toHaveBeenCalledTimes(1);
  return { bytes: onDrop.mock.calls[0]![0] };
}

const urls = URL as unknown as {
  createObjectURL: (file: unknown) => string;
  revokeObjectURL: (uri: string) => void;
};
const original = { ...urls, Image: (globalThis as { Image?: unknown }).Image };
const revoked: string[] = [];

beforeEach(() => {
  mockDecodes = true;
  mockSquareJpeg.mockReset().mockImplementation(async () => SQUARE);
  revoked.length = 0;
  urls.createObjectURL = () => "blob:photo";
  urls.revokeObjectURL = (uri) => revoked.push(uri);
  (globalThis as { Image?: unknown }).Image = FakeImage;
});

afterEach(() => {
  urls.createObjectURL = original.createObjectURL;
  urls.revokeObjectURL = original.revokeObjectURL;
  (globalThis as { Image?: unknown }).Image = original.Image;
});

describe("a photo dropped on the web", () => {
  it("is handed over at once, then made a square JPEG from its middle", async () => {
    const { bytes } = await drop({ type: "image/jpeg" });
    await expect(bytes).resolves.toBe(SQUARE);
    expect(mockSquareJpeg).toHaveBeenCalledWith("blob:photo", 1200, 900, "article");
    expect(revoked).toEqual(["blob:photo"]);
  });

  it("gives nothing for a file that is no image", async () => {
    const { bytes } = await drop({ type: "application/pdf" });
    await expect(bytes).resolves.toBeNull();
    expect(mockSquareJpeg).not.toHaveBeenCalled();
  });

  it("says an image the browser cannot read, never nothing", async () => {
    mockDecodes = false;
    const { bytes } = await drop({ type: "image/heic" });
    const error: unknown = await bytes.then(
      () => null,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(PickImageError);
    expect((error as PickImageError).code).toBe("unreadable");
    expect(mockSquareJpeg).not.toHaveBeenCalled();
    expect(revoked).toEqual(["blob:photo"]);
  });

  it("says an image that cannot be made small enough", async () => {
    const tooBig = new PickImageError("unreadable", "The image could not be made small enough");
    mockSquareJpeg.mockImplementation(async () => {
      throw tooBig;
    });
    const { bytes } = await drop({ type: "image/png" });
    await expect(bytes).rejects.toBe(tooBig);
    expect(revoked).toEqual(["blob:photo"]);
  });
});
