import { fileUriToPath, getStorageDir } from "@/lib/breez/storage";

describe("fileUriToPath", () => {
  it("turns the file:// URIs of expo-file-system into the plain paths the SDK expects", () => {
    // Android: Uri.fromFile(filesDir) + "/".
    expect(fileUriToPath("file:///data/user/0/ch.swissbitcoinpay.checkout/files/")).toBe(
      "/data/user/0/ch.swissbitcoinpay.checkout/files"
    );
    // iOS: URL.absoluteString is percent-encoded.
    expect(fileUriToPath("file:///Users/Jane%20Doe/Library/Documents/")).toBe(
      "/Users/Jane Doe/Library/Documents"
    );
  });

  it("rejects anything that is not an absolute file URI", () => {
    expect(() => fileUriToPath("/data/user/0/app/files")).toThrow(/Not a file:\/\/ URI/);
    expect(() => fileUriToPath("content://media/external/files")).toThrow(/Not a file:\/\/ URI/);
    expect(() => fileUriToPath("file://relative/path")).toThrow(/Not an absolute file URI/);
    expect(() => fileUriToPath("file:///")).toThrow(/Not an absolute file URI/);
  });
});

describe("getStorageDir", () => {
  it("keeps the SDK database in the documents directory of the app", () => {
    // Paths.document is mocked in jest.setup.ts.
    expect(getStorageDir()).toBe(
      "/data/user/0/ch.swissbitcoinpay.checkout.staging/files/breez-sdk-spark"
    );
  });
});
