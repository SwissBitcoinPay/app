import { useMemo } from "react";
import { View } from "react-native";

import { makeStyles, palette, qr, radius, useTheme } from "@/theme";

import { qrRuns } from "./qr-modules";

type QrPlateProps = {
  value: string;
  /** Size of the code itself; the 18 px quiet zone is added around it. */
  size?: number;
  elevation?: "shadow" | "flat";
  /** What screen readers name the code (what it opens); none by default. */
  accessibilityLabel?: string;
  /**
   * Its modules faded, its plate as it is: a code nobody can pay any more ("Invoice expired" on
   * a desktop).
   */
  faded?: boolean;
};

/**
 * A scannable QR code on a white plate, in both themes (scanners read dark on light). Modules are
 * drawn as horizontal runs of Views (no SVG dependency); error correction M.
 */
export function QrPlate({
  value,
  size = qr.size,
  elevation = "shadow",
  accessibilityLabel,
  faded = false
}: QrPlateProps) {
  const { shadow } = useTheme();
  const styles = useStyles();
  const rows = useMemo(() => qrRuns(value), [value]);

  const cell = size / rows.count;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.plate, elevation === "shadow" ? { boxShadow: shadow.card } : styles.flat]}
    >
      <View style={[{ width: size, height: size }, faded && styles.faded]}>
        {rows.rows.map((runs, row) =>
          runs.map((run) => (
            <View
              key={`${row}-${run.start}`}
              style={{
                position: "absolute",
                top: row * cell,
                left: run.start * cell,
                width: run.length * cell,
                // Slight overlap hides hairline gaps between rows on fractional pixel sizes.
                height: cell + 0.4,
                backgroundColor: palette.ink
              }}
            />
          ))
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  plate: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: qr.quietZone,
    alignSelf: "flex-start"
  },
  flat: { borderWidth: 1, borderColor: colors.border.subtle },
  faded: { opacity: 0.18 }
}));
