import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Signature of the callback the native ZXing scanner invokes (see
// patches/react-native-barcode-zxing-scan+1.0.2.patch).
type NativeScanCallback = (
  value: string | null,
  barcodeImagePath: string | null
) => void;

const mockShowQrReader = jest.fn<(callback: NativeScanCallback) => void>();

jest.mock("react-native-barcode-zxing-scan", () => ({
  __esModule: true,
  default: {
    showQrReader: (callback: NativeScanCallback) => mockShowQrReader(callback)
  }
}));

import { useScanQr } from "./useScanQr.android";

// Callback handed to the native scanner when the scan was started.
const nativeCallback = () => mockShowQrReader.mock.calls[0][0];

describe("useScanQr (Android)", () => {
  beforeEach(() => {
    mockShowQrReader.mockReset();
  });

  it("forwards the scanned value", () => {
    const onScan = jest.fn();

    useScanQr({ onScan })();
    nativeCallback()("https://app.example.com/connect/key", null);

    expect(onScan).toHaveBeenCalledWith("https://app.example.com/connect/key");
  });

  it("ignores the null result of a cancelled scan", () => {
    const onScan = jest.fn();

    useScanQr({ onScan })();
    nativeCallback()(null, null);

    expect(onScan).not.toHaveBeenCalled();
  });
});
