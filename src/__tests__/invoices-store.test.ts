import { refreshInvoices, resetInvoicesStore } from "@/features/invoices/store";
import { loadInvoices } from "@/features/invoices/invoices";

jest.mock("@/features/account/session", () => ({
  ...jest.requireActual("@/features/account/session"),
  getAccountWalletId: () => "wallet-1"
}));

jest.mock("@/features/invoices/invoices", () => ({
  ...jest.requireActual("@/features/invoices/invoices"),
  loadInvoices: jest.fn()
}));

const load = jest.mocked(loadInvoices);

describe("invoices store", () => {
  beforeEach(() => {
    resetInvoicesStore();
    load.mockReset();
  });

  it("reads once more after a read when asked again while it ran, never more", async () => {
    let finish: () => void = () => undefined;
    load.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ invoices: [], authors: new Map(), answered: 1, newerUnreadable: false });
        })
    );
    const first = refreshInvoices();
    // Asked twice while it runs ("Wallet" live: a new invoice of an assistant).
    void refreshInvoices();
    void refreshInvoices();
    expect(load).toHaveBeenCalledTimes(1);
    finish();
    await first;
    // The read asked meanwhile, once.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(2);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reads once when nothing asks meanwhile", async () => {
    load.mockResolvedValue({
      invoices: [],
      authors: new Map(),
      answered: 1,
      newerUnreadable: false
    });
    await refreshInvoices();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
