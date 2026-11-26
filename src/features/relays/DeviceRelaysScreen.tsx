import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { PosFrame } from "@/features/terminal/PosFrame";
import { logFailure } from "@/lib/log/log";
import { gutter, space } from "@/theme";

import { RelaysScreenBody } from "./RelaysPanel";
import { saveDeviceRelays, useDeviceRelays } from "./device-relays";

/**
 * The relays this device works with, edited before any sign-in: "Advanced settings"
 * (src/app/advanced.tsx) and "No account found" (src/app/no-account.tsx). Saved on the device
 * (saveDeviceRelays), then back to the welcome screen. `above`: what the screen says before the
 * list; `below`: another setting after it; `testID` names the screen's elements (`<testID>-relays`,
 * `<testID>-back`).
 */
export function DeviceRelaysScreen({
  title,
  lead,
  above,
  below,
  testID
}: {
  title: string;
  lead: string;
  above?: ReactNode;
  /** Another of the device's settings, under the relays ("Advanced settings": country.is). */
  below?: ReactNode;
  testID: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const relays = useDeviceRelays();
  // No notifications on these screens (only the welcome screen has some before the sign-in): a
  // failed save is said above the buttons.
  const [failed, setFailed] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const body = (
    <View style={[styles.body, desktop && styles.desktopBody]} testID={`${testID}-relays`}>
      {above ? <View style={styles.above}>{above}</View> : null}
      <RelaysScreenBody
        saved={relays}
        lead={lead}
        below={below}
        failure={failed ? t("settings.errors.saveFailed") : null}
        onSave={async (next) => {
          setFailed(false);
          try {
            await saveDeviceRelays(next);
          } catch (error) {
            logFailure("Saving the device's relays failed", error);
            setFailed(true);
            throw error;
          }
          back();
        }}
      />
    </View>
  );
  return (
    <PosFrame
      title={title}
      desktopTitle={title}
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: `${testID}-back`
      }}
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID={`${testID}-back-desktop`}
        >
          {t("common.back")}
        </Button>
      }
      // Mobile: the frame does not scroll, a short screen scrolls the list and its buttons (the
      // gutter inside, so that the shadows of the list's card are not cut).
      flush="mobile"
      contentStyle={desktop ? styles.desktopContent : undefined}
    >
      {desktop ? body : <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView>}
    </PosFrame>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: gutter },
  body: { flex: 1, paddingBottom: space[6] },
  above: { paddingTop: space[3] },
  desktopContent: { justifyContent: "flex-start" },
  desktopBody: { flex: 0, width: 560, maxWidth: "100%", minHeight: 560 }
});
