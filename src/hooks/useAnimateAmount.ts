import {
  AsyncResult,
  Controller,
  ControllerUpdate,
  easings,
  OneOrMore,
  useSprings
} from "@react-spring/native";
import { getFormattedUnit, measureText, sleep } from "@utils";
import { v4 as uuidv4 } from "uuid";
import { getUnitPrefixAndSuffix } from "@utils";
import { countConsecutiveStringParts, diffStrings } from "@utils/diffStrings";
import { formattedUnitChanges } from "@utils/formattedUnitChanges";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import usePrevious from "use-previous";
import { platform } from "@config";
import { useAnimatedValue } from "react-native";

const { springAnimationDelay } = platform;

export type StringPart = {
  id: string;
  text: string;
  add?: boolean;
  remove?: boolean;
};

const VISIBLE_STYLE = {
  scale: 1,
  opacity: 1,
  width: undefined
};

const HIDDEN_STYLE = {
  scale: 0.85,
  opacity: 0,
  width: 0
};

const ANIMATION_CONFIG = {
  duration: 250,
  easing: easings.easeOutQuad
};

const getElementsWidth = async (elements: StringPart[]) => {
  return (
    await Promise.all(
      elements.map((e) =>
        measureText(e.text, { fontSize: 32, fontFamily: "Poppins-Bold" })
      )
    )
  ).map(({ width }, i) => ({ ...elements[i], width }));
};

const SPRING_MAX = 20;

export type AddActions = number | "delete" | "clear" | "decimal";

export enum AnimationMode {
  Normal,
  Plus
}

type UseAnimateAmountParams = {
  unit: string;
  decimalCount: number;
  initialParts?: StringPart[];
  mode?: AnimationMode;
  animationDelay?: number;
};

export const useAnimateAmount = ({
  unit,
  decimalCount = 0,
  initialParts = [],
  mode = AnimationMode.Normal,
  animationDelay
}: UseAnimateAmountParams) => {
  const [springs, api] = useSprings(SPRING_MAX, () => ({
    from: VISIBLE_STYLE
  }));

  const [parts, setParts] = useState<StringPart[]>(initialParts);

  const _setParts = useCallback(
    (_parts: StringPart[]) => {
      setParts(_parts);

      void api.start((springIndex) => {
        const width = _parts[springIndex]?.width || 0;
        return {
          from: { ...VISIBLE_STYLE, width },
          to: { ...VISIBLE_STYLE, width },
          immediate: true
        };
      });
    },
    [api, setParts]
  );
  const isFirstRender = useRef(true);
  const previousUnit = usePrevious(unit);

  useEffect(() => {
    if (initialParts.length) {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }

      (async () => {
        _setParts(await getElementsWidth(initialParts));
      })();
    }
  }, [initialParts]);

  const { unitPrefix, unitSuffix } = useMemo(
    () => getUnitPrefixAndSuffix(unit),
    [unit]
  );

  const getAmountWithoutUnit = useCallback(
    (amount: string) => {
      return amount.replace(unitPrefix, "").replace(unitSuffix, "");
    },
    [unitPrefix, unitSuffix]
  );

  const animateAmount = useCallback(
    async (newFiatAmount: number, add?: AddActions) => {
      const unitChanged = previousUnit && unit !== previousUnit;

      const isZeroUnitChanged = newFiatAmount === 0 && unitChanged;

      const newText = getAmountWithoutUnit(
        newFiatAmount > 0 ? getFormattedUnit(newFiatAmount / 100, unit) : ""
      );

      const addUnit =
        mode === AnimationMode.Normal || (AnimationMode.Plus && newText !== "");

      const joinedParts = parts
        .filter((p) => !p.remove)
        .map((p) => p.text)
        .join("");

      const previousText = addUnit
        ? getAmountWithoutUnit(joinedParts)
        : joinedParts;

      let elementsArray: StringPart[] = [];

      if (unitPrefix && addUnit) {
        elementsArray.push({
          id: uuidv4(),
          text: unitPrefix,
          add: unitChanged
        });
      }

      if (mode === AnimationMode.Normal) {
        elementsArray = formattedUnitChanges(
          previousText,
          add,
          decimalCount,
          elementsArray
        );
      } else {
        elementsArray = diffStrings(previousText, newText, elementsArray);
      }

      if (unitSuffix && addUnit) {
        elementsArray.push({
          id: uuidv4(),
          text: unitSuffix,
          add: unitChanged
        });
      }

      const elemsWithWidths = (await getElementsWidth(elementsArray)).map(
        ({ width, ...part }, i) => {
          const consecutiveElementsNb = part.add
            ? countConsecutiveStringParts(elementsArray, "add", i)
            : part.remove
              ? countConsecutiveStringParts(elementsArray, "remove", i)
              : 0;

          const initialConfig = part.add
            ? HIDDEN_STYLE
            : { ...VISIBLE_STYLE, width };

          return { ...part, width, consecutiveElementsNb, initialConfig };
        }
      );

      await api.start((springIndex) => {
        const { initialConfig } = elemsWithWidths[springIndex] || {};

        if (initialConfig) {
          return {
            from: initialConfig,
            to: initialConfig,
            immediate: true
          };
        }
      });

      setParts(elemsWithWidths);

      if (mode === AnimationMode.Plus && newText) {
        await sleep(animationDelay);
      }

      await api.start((springIndex) => {
        const part = elemsWithWidths[springIndex];

        if (part?.add || part?.remove) {
          const { add, remove, width, consecutiveElementsNb } = part;

          return {
            ...(add
              ? {
                  from: HIDDEN_STYLE,
                  to: { ...VISIBLE_STYLE, width }
                }
              : remove
                ? {
                    from: { ...VISIBLE_STYLE, width },
                    to: HIDDEN_STYLE
                  }
                : {
                    from: { ...VISIBLE_STYLE, width },
                    to: { ...VISIBLE_STYLE, width }
                  }),
            immediate: false,
            delay:
              springAnimationDelay +
              consecutiveElementsNb * (mode === AnimationMode.Normal ? 60 : 30),
            config: ANIMATION_CONFIG
          };
        }
      });

      return true;
    },
    [
      api,
      unit,
      parts,
      decimalCount,
      getAmountWithoutUnit,
      previousUnit,
      animationDelay
    ]
  );

  return [parts, springs, animateAmount, _setParts] as const;
};
