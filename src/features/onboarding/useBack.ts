import { useRouter, type Href } from "expo-router";

/** Goes back, or to `fallback` when there is no history (web reload, deep link). */
export function useBack(fallback: Href) {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace(fallback));
}
