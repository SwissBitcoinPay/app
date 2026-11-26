import { renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { syncMembership } from "@/features/team/member";
import { MEMBERSHIP_CHECK_INTERVAL_MS, useMembershipSync } from "@/features/team/useTeamSync";

jest.mock("../features/team/member", () => ({
  ...jest.requireActual("../features/team/member"),
  syncMembership: jest.fn(async () => "none")
}));

const sync = jest.mocked(syncMembership);

beforeEach(() => {
  jest.useFakeTimers();
  sync.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("an employee's device", () => {
  it("reads its channel at launch, then every 5 minutes while it shows, until it leaves", async () => {
    const { unmount } = await renderHook(() => useMembershipSync());
    expect(sync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(MEMBERSHIP_CHECK_INTERVAL_MS - 1);
    expect(sync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(sync).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(MEMBERSHIP_CHECK_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(3);
    await unmount();
    jest.advanceTimersByTime(3 * MEMBERSHIP_CHECK_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it("reads it again when the app comes back to the foreground", async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      await renderHook(() => useMembershipSync());
      expect(sync).toHaveBeenCalledTimes(1);
      for (const listener of listeners) listener("background");
      expect(sync).toHaveBeenCalledTimes(1);
      for (const listener of listeners) listener("active");
      expect(sync).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});
