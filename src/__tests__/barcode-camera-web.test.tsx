import "@/i18n";

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { BarcodeCamera } from "@/features/catalog/BarcodeScanner";

import type * as CameraFake from "../../jest/expo-camera";

// The web app's reader (barcode-engine.web.ts), controlled here: each load waits for the test.
const mockLoads: { resolve: () => void; reject: (error: Error) => void }[] = [];
let mockReady = false;
jest.mock("@/features/catalog/barcode-engine", () => ({
  isBarcodeEngineReady: () => mockReady,
  prepareBarcodeEngine: () =>
    new Promise<void>((resolve, reject) => {
      mockLoads.push({
        resolve: () => {
          mockReady = true;
          resolve();
        },
        reject
      });
    })
}));

const camera = jest.requireMock<typeof CameraFake>("expo-camera");

beforeEach(() => {
  mockLoads.length = 0;
  mockReady = false;
});

describe("the camera of the web app", () => {
  it("shows once the barcode reader is loaded, and reads with it", async () => {
    const scanned = jest.fn();
    await render(<BarcodeCamera onScanned={scanned} />);
    // Loading: no camera yet, nothing can read.
    expect(() => camera.scan("7610097111072")).toThrow("No camera is scanning");
    expect(mockLoads).toHaveLength(1);

    await act(async () => mockLoads[0].resolve());
    await act(async () => camera.scan("7610097111072"));
    expect(scanned).toHaveBeenCalledWith("7610097111072");
  });

  it('says when the reader could not be loaded, and loads it again on "Try again"', async () => {
    await render(<BarcodeCamera onScanned={() => undefined} />);
    await act(async () => mockLoads[0].reject(new Error("Failed to fetch")));
    expect(screen.getByTestId("barcode-engine-failed")).toBeTruthy();
    expect(
      screen.getByText(
        "The barcode reader could not be loaded. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    expect(() => camera.scan("7610097111072")).toThrow("No camera is scanning");

    await fireEvent.press(screen.getByTestId("barcode-engine-retry"));
    expect(mockLoads).toHaveLength(2);
    await act(async () => mockLoads[1].resolve());
    expect(screen.queryByTestId("barcode-engine-failed")).toBeNull();
  });

  it("sends a browser's refused camera to its own settings", async () => {
    mockReady = true;
    jest.replaceProperty(Platform, "OS", "web");
    camera.permission.granted = false;
    camera.permission.canAskAgain = false;
    camera.permission.status = "denied";
    await render(<BarcodeCamera onScanned={() => undefined} />);
    expect(
      screen.getByText(
        "Allow the camera for this site in your browser's settings (the padlock next to the address), then tap “Allow the camera”."
      )
    ).toBeTruthy();
    // A browser has no system settings to open: the button asks again.
    expect(screen.getByText("Allow the camera")).toBeTruthy();
    expect(screen.queryByText("Open settings")).toBeNull();
  });
});

describe("whether the web app scans", () => {
  type Available = typeof import("@/features/catalog/camera-available.web");
  const { useCanScanBarcodes } = jest.requireActual<Available>(
    "@/features/catalog/camera-available.web"
  );

  it("scans where the browser lists a camera, a webcam included", async () => {
    camera.device.listed = true;
    const { result } = await renderHook(() => useCanScanBarcodes());
    await act(async () => undefined);
    expect(result.current).toBe(true);
  });

  it("does not scan where the browser lists none", async () => {
    camera.device.listed = false;
    const { result } = await renderHook(() => useCanScanBarcodes());
    await act(async () => undefined);
    expect(result.current).toBe(false);
  });
});
