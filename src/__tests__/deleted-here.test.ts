import { noteAccountDeleted, onAccountDeleted } from "@/features/settings/deleted-here";

/*
 * The welcome screen's notification once "Delete account" is done on this device
 * (deleted-here.ts): said once, whether the welcome screen mounts before or after the deletion ends.
 */

describe("the account deleted on this device", () => {
  it("is said once to a welcome screen that mounts after the deletion", () => {
    noteAccountDeleted();
    const first = jest.fn();
    const unsubscribe = onAccountDeleted(first);
    expect(first).toHaveBeenCalledTimes(1);
    unsubscribe();
    // Mounted again (or another one): already said.
    const again = jest.fn();
    onAccountDeleted(again)();
    expect(again).not.toHaveBeenCalled();
  });

  it("is said to a welcome screen mounted before the deletion ends, and to it alone", () => {
    const shown = jest.fn();
    const other = jest.fn();
    const unsubscribe = onAccountDeleted(shown);
    const unsubscribeOther = onAccountDeleted(other);
    expect(shown).not.toHaveBeenCalled();
    noteAccountDeleted();
    expect(shown.mock.calls.length + other.mock.calls.length).toBe(1);
    unsubscribe();
    unsubscribeOther();
  });

  it("waits for the next welcome screen when none listens any more", () => {
    const gone = jest.fn();
    onAccountDeleted(gone)();
    noteAccountDeleted();
    expect(gone).not.toHaveBeenCalled();
    const next = jest.fn();
    onAccountDeleted(next)();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
