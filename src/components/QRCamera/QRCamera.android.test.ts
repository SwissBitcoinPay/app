import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Signature of the callback the native ZXing scanner invokes (see
// patches/react-native-barcode-zxing-scan+1.0.2.patch).
type NativeScanCallback = (
  value: string | null,
  barcodeImagePath: string | null
) => void;

const mockShowQrReader = jest.fn<(callback: NativeScanCallback) => void>();

// Run the mount effect right away: it is what opens the native scanner.
jest.mock("react", () => ({
  useEffect: (effect: () => void) => effect()
}));

jest.mock("react-native-barcode-zxing-scan", () => ({
  __esModule: true,
  default: {
    showQrReader: (callback: NativeScanCallback) => mockShowQrReader(callback)
  }
}));

import { QRCamera } from "./QRCamera.android";

// Callback handed to the native scanner when the camera was mounted.
const nativeCallback = () => mockShowQrReader.mock.calls[0][0];

describe("QRCamera (Android)", () => {
  beforeEach(() => {
    mockShowQrReader.mockReset();
  });

  it("forwards the scanned value", () => {
    const onScan = jest.fn();
    const onCancel = jest.fn();

    QRCamera({ onScan, onCancel, setConfig: jest.fn(), isTorchOn: false });
    nativeCallback()("bc1qexampleaddress", null);

    expect(onScan).toHaveBeenCalledWith("bc1qexampleaddress");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("reports a cancelled scan instead of forwarding its null result", () => {
    const onScan = jest.fn();
    const onCancel = jest.fn();

    QRCamera({ onScan, onCancel, setConfig: jest.fn(), isTorchOn: false });
    nativeCallback()(null, null);

    expect(onScan).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
