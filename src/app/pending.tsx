import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuildInfo } from "@/components/BuildInfo";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { IconButton } from "@/components/ui/IconButton";
import { useBack } from "@/features/onboarding/useBack";
import { gutter, makeStyles } from "@/theme";

/** A placeholder screen (`/pending`): the build info, for testers. */
export default function PendingScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const back = useBack("/");
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 }
      ]}
    >
      <IconButton icon="arrow-left" label={t("common.back")} overhang="left" onPress={back} />
      <ScreenTitle>{t("pending.title")}</ScreenTitle>
      <Lead style={styles.lead}>{t("pending.description")}</Lead>
      <BuildInfo />
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  content: { paddingHorizontal: gutter, maxWidth: 560, width: "100%", alignSelf: "center" },
  lead: { marginBottom: 24 }
}));
