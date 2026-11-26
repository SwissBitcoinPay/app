/** The navigation state of a rendered router, for the tests of the app's navigation. */
import type { RenderRouterResult } from "expo-router/testing-library";

type State = {
  type?: string;
  routes: { name: string; key?: string; state?: State }[];
  history?: { type: string; key?: string }[];
};

/** The screens of the point of sale's stack, the keypad first. */
export function posScreens(router: RenderRouterResult): string[] {
  return stackScreens(router, "pos");
}

/** The screens of "Wallet"'s stack, the wallet first. */
export function walletScreens(router: RenderRouterResult): string[] {
  return stackScreens(router, "wallet");
}

function stackScreens(router: RenderRouterResult, tab: string): string[] {
  const find = (state: State | undefined): string[] | undefined => {
    for (const route of state?.routes ?? []) {
      if (route.name === tab && route.state) return route.state.routes.map(({ name }) => name);
      const found = find(route.state);
      if (found) return found;
    }
    return undefined;
  };
  return find(router.getRouterState() as State | undefined) ?? [];
}

/** The destinations the app's tabs went through, oldest first, as their back behaviour keeps them. */
export function tabHistory(router: RenderRouterResult): string[] {
  const find = (state: State | undefined): State | undefined => {
    if (state?.type === "tab") return state;
    for (const route of state?.routes ?? []) {
      const found = find(route.state);
      if (found) return found;
    }
    return undefined;
  };
  const tabs = find(router.getRouterState() as State | undefined);
  return (tabs?.history ?? []).map(
    ({ key }) => tabs!.routes.find((route) => route.key === key)?.name ?? "?"
  );
}
