import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NativeScanCallback } from "@utils/showQrReader";

const mockShowQrReader = jest.fn<(callback: NativeScanCallback) => void>();

// Run effects right away (the mount effect is what opens the native scanner),
// and keep refs as plain objects so a re-render can be simulated by calling
// the component again with the same ref.
const mockRef: { current?: unknown } = {};
jest.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: (initialValue: unknown) => {
    if (!("current" in mockRef)) {
      mockRef.current = initialValue;
    }
    return mockRef;
  }
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

const props = { setConfig: jest.fn(), isTorchOn: false };

describe("QRCamera (Android)", () => {
  beforeEach(() => {
    mockShowQrReader.mockReset();
    delete mockRef.current;
  });

  it("forwards the scanned value", () => {
    const onScan = jest.fn();
    const onCancel = jest.fn();

    QRCamera({ ...props, onScan, onCancel });
    nativeCallback()("bc1qexampleaddress", null);

    expect(onScan).toHaveBeenCalledWith("bc1qexampleaddress");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("reports a cancelled scan instead of forwarding its null result", () => {
    const onScan = jest.fn();
    const onCancel = jest.fn();

    QRCamera({ ...props, onScan, onCancel });
    nativeCallback()(null, null);

    expect(onScan).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("reports to the handlers of the latest render", () => {
    const staleOnScan = jest.fn();
    const onScan = jest.fn();

    QRCamera({ ...props, onScan: staleOnScan });
    QRCamera({ ...props, onScan });
    nativeCallback()("bc1qexampleaddress", null);

    expect(staleOnScan).not.toHaveBeenCalled();
    expect(onScan).toHaveBeenCalledWith("bc1qexampleaddress");
  });
});
