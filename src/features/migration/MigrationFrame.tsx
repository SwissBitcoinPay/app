import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/layout/Logo";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { gutter, makeStyles } from "@/theme";

/**
 * The frame of the migration's screens (src/app/migration/): the logo over one column, as the
 * invitation's page (src/app/join.tsx), which a till of the v2 app goes to. Composed of the app's
 * pieces. Scrolls its fields above the keyboard (the v2 password).
 */
export function MigrationFrame({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useStyles();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen} testID={testID}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + (desktop ? 40 : 20),
            paddingBottom: Math.max(insets.bottom, desktop ? 40 : 24)
          }
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.column}>
          <View style={styles.logo}>
            <Logo width={desktop ? 168 : 150} />
          </View>
          <View style={styles.section}>{children}</View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  body: { flexGrow: 1, alignItems: "center", paddingHorizontal: gutter },
  column: { width: 440, maxWidth: "100%", flexGrow: 1 },
  logo: { alignItems: "center", marginBottom: 28 },
  section: { gap: 18 }
}));
