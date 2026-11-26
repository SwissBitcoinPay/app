import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle
} from "react-native";

import { Icon } from "@/components/ui/Icon";
import { outOfReach } from "@/components/ui/reach";

import type { Destination } from "./destinations";
import type { PillSizes } from "./dock-layout";
import { destinationIcon, destinationName } from "./invoice-wait";

/** What the dock measured so far: a destination's icon, its name, or both. */
export type MeasuredSizes = Partial<Record<Destination, Partial<PillSizes>>>;

type OnSize = (destination: Destination, part: keyof PillSizes, width: number) => void;

/** The widths PillMeasures reports, kept as they come (a width unchanged renders nothing). */
export function useMeasuredSizes(): [MeasuredSizes, OnSize] {
  const [measured, setMeasured] = useState<MeasuredSizes>({});
  const onSize: OnSize = (destination, part, width) =>
    setMeasured((known) =>
      known[destination]?.[part] === width
        ? known
        : { ...known, [destination]: { ...known[destination], [part]: width } }
    );
  return [measured, onSize];
}

/**
 * Every destination's icon and name as a dock's slot draws them (`iconSize`, `labelStyle`; an
 * employee's names and icons with `member`), off screen: their widths place the slots
 * (dock-layout.ts). Measured again when the language or the font size changes.
 */
export function PillMeasures({
  destinations,
  iconSize,
  labelStyle,
  member = false,
  onSize
}: {
  destinations: readonly Destination[];
  iconSize: number;
  labelStyle: StyleProp<TextStyle>;
  member?: boolean;
  onSize: OnSize;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.measures} {...outOfReach(true)}>
      <View style={styles.measuresInner}>
        {destinations.map((destination) => (
          <View key={destination} style={styles.measureRow}>
            <View
              onLayout={(event) => keepSize(event, (width) => onSize(destination, "icon", width))}
              testID={`dock-measure-icon-${destination}`}
            >
              <Icon name={destinationIcon(destination, member)} size={iconSize} />
            </View>
            <Text
              style={labelStyle}
              onLayout={(event) => keepSize(event, (width) => onSize(destination, "label", width))}
              testID={`dock-measure-label-${destination}`}
            >
              {destinationName(destination, t, member)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A measured size, unless it is 0 (a hidden view on the web reports 0). */
function keepSize(event: LayoutChangeEvent, set: (width: number) => void) {
  const width = event.nativeEvent.layout.width;
  if (width > 0) set(width);
}

const styles = StyleSheet.create({
  measures: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none"
  },
  measuresInner: { position: "absolute", top: 0, left: 0, width: 1000, alignItems: "flex-start" },
  measureRow: { flexDirection: "row" }
});
