import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { useHover } from "@/components/ui/useHover";
import { capitalized, formatDate } from "@/lib/locale/date";
import { makeStyles, mono, radius, sans, stroke, type } from "@/theme";

import { calendarDate, dateOf } from "./invoices";

/*
 * The due date's calendar (desktop: a calendar laid in the page, which the system's picker does not
 * offer there): a month, Monday first, its days in mono, the chosen one filled with orange; the
 * days outside the range offered are not choosable. The apps' phones use the device's own picker
 * (DueDateField.tsx); the web on a phone shows this one in a bottom sheet (DueDateField.web.tsx).
 */

type CalendarProps = {
  /** "YYYY-MM-DD", null when none is chosen yet. */
  value: string | null;
  /** The first and last days that can be chosen, "YYYY-MM-DD". */
  first: string;
  last: string;
  onChange: (day: string) => void;
  languageTag: string;
  testID?: string;
};

/** The month shown first: the chosen day's, else the first day's. */
function monthOf(day: string): { year: number; month: number } {
  const date = dateOf(day);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function Calendar({ value, first, last, onChange, languageTag, testID }: CalendarProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [shown, setShown] = useState(() => monthOf(value ?? first));
  const firstMonth = monthOf(first);
  const lastMonth = monthOf(last);
  const index = (m: { year: number; month: number }) => m.year * 12 + m.month;
  const canGoBack = index(shown) > index(firstMonth);
  const canGoOn = index(shown) < index(lastMonth);
  const move = (delta: number) => {
    const next = new Date(shown.year, shown.month + delta, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  };

  const monthStart = new Date(shown.year, shown.month, 1);
  const title = capitalized(
    formatDate(monthStart, languageTag, { month: "long", year: "numeric" }),
    languageTag
  );
  // Monday first ("M T W T F S S"), in the device's language.
  const weekdays = Array.from({ length: 7 }, (_, day) =>
    formatDate(new Date(2024, 0, 1 + day), languageTag, { weekday: "narrow" })
  );
  const offset = (monthStart.getDay() + 6) % 7;
  const days = new Date(shown.year, shown.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, day) =>
      calendarDate(new Date(shown.year, shown.month, day + 1))
    )
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.head}>
        <IconButton
          icon="chevron-left"
          label={t("invoices.due.previousMonth")}
          onPress={() => move(-1)}
          disabled={!canGoBack}
          testID={testID && `${testID}-previous`}
        />
        <Text style={styles.title}>{title}</Text>
        <IconButton
          icon="chevron-right"
          label={t("invoices.due.nextMonth")}
          onPress={() => move(1)}
          disabled={!canGoOn}
          testID={testID && `${testID}-next`}
        />
      </View>
      <View style={styles.grid}>
        {weekdays.map((weekday, i) => (
          <View key={`w${i}`} style={styles.cell}>
            <Text style={styles.weekday}>{weekday}</Text>
          </View>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <View key={`e${i}`} style={styles.cell} />
          ) : (
            <Day
              key={day}
              day={day}
              selected={day === value}
              disabled={day < first || day > last}
              label={formatDate(dateOf(day), languageTag, { dateStyle: "full" })}
              onPress={() => onChange(day)}
            />
          )
        )}
      </View>
    </View>
  );
}

function Day({
  day,
  selected,
  disabled,
  label,
  onPress
}: {
  day: string;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={`calendar-day-${day}`}
        {...hoverProps}
        style={[
          styles.day,
          selected && styles.selected,
          !selected && hovered && !disabled && styles.hovered
        ]}
      >
        <Text
          style={[styles.dayText, selected && styles.selectedText, disabled && styles.disabledText]}
        >
          {Number(day.slice(8))}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10
  },
  title: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, padding: 1, alignItems: "stretch" },
  weekday: {
    ...sans(600),
    fontSize: type.caption,
    lineHeight: 28,
    textAlign: "center",
    color: colors.text.secondary
  },
  day: {
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  hovered: { backgroundColor: colors.hoverOverlay },
  selected: { backgroundColor: colors.background.accent },
  dayText: { ...mono(500), fontSize: type.label, color: colors.text.primary },
  selectedText: { ...mono(700), color: colors.text.onAccent },
  disabledText: { color: colors.text.tertiary }
}));
