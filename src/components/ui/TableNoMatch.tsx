import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { makeStyles, sans, space, type } from "@/theme";

import { Button } from "./Button";

/**
 * Under a table's header, when its column filters leave no row (useTableView's `filtering`): what
 * the table lists none of (`message`: "No transactions match the filters."), and
 * "Clear filters", which brings the table back to its normal state (useTableView). One
 * block for every table. Its side
 * padding is the rows' own, in the tables' cards (22 px). `actionLabel`: its button's, when it
 * shows what the table hides by default rather than clearing filters ("Show expired").
 */
export function TableNoMatch({
  message,
  onClear,
  actionLabel,
  testID,
  clearTestID
}: {
  message: string;
  onClear: () => void;
  actionLabel?: string;
  testID?: string;
  clearTestID?: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View style={styles.root} testID={testID}>
      <Text style={styles.message}>{message}</Text>
      <Button
        variant="secondary"
        size="sm"
        fullWidth={false}
        onPress={onClear}
        testID={clearTestID}
      >
        {actionLabel ?? t("table.clearFilters")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    alignItems: "flex-start",
    gap: space[5],
    paddingHorizontal: space[8],
    paddingVertical: space[5]
  },
  message: { ...sans(500), fontSize: type.prose, color: colors.text.secondary }
}));
