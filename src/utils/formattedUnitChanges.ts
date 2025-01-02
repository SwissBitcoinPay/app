import { decimalSeparator } from "./decimalSeparator";
import { v4 as uuidv4 } from "uuid";
import { getFormattedUnit } from "./getFormattedUnit";

export interface StringPart {
  id: string;
  text: string;
  add?: boolean;
  remove?: boolean;
}

const TEST_AMOUNT = 123;

export const formattedUnitChanges = (
  amount: number,
  unit: string,
  add?: number | "delete" | "clear" | "decimal",
  decimalCount = 0
) => {
  const result: StringPart[] = [];

  let unitPrefix: string | undefined;
  let unitSuffix: string | undefined;

  const testFormattedUnit = getFormattedUnit(TEST_AMOUNT, unit, 0);

  if (/^[0-9]/.test(testFormattedUnit)) {
    unitSuffix = testFormattedUnit.replace(TEST_AMOUNT.toString(), "");
  } else {
    unitPrefix = testFormattedUnit.replace(TEST_AMOUNT.toString(), "");
  }

  if (unitPrefix) {
    result.push({ text: unitPrefix });
  }

  if (add !== undefined && !(amount === 0 && add === 0)) {
    const [leftPart, rightPart] = getFormattedUnit(
      amount,
      unit,
      amount > 0 && decimalCount < 2 ? 2 : 0
    )
      .split(/(\s+)/)
      .filter((e) => e.trim().length > 0)[0]
      .split(decimalSeparator);

    let decimalSwitch = false;

    if (decimalCount > 0 && typeof add === "number") {
      add = Math.pow(10, decimalCount - 1) * add;
    }

    if (typeof add === "number") {
      if (!rightPart || (leftPart === "0" && rightPart[0] === "0")) {
        result.push({ text: leftPart });
        decimalSwitch = !rightPart;
      } else {
        if (leftPart === "0" && decimalCount === 0) {
          result.push({ text: "0", remove: true });
        } else {
          result.push({ text: leftPart });
        }
        if (decimalCount === 0) {
          result.push({ text: decimalSeparator, remove: true });
          result.push({ text: rightPart[0] });
          decimalSwitch = true;
        }
      }

      result.push({
        text: decimalSeparator,
        add: decimalSwitch && decimalCount === 0
      });

      const firstChar = add.toString()[0];

      if (!rightPart) {
        if (decimalCount === 2) {
          result.push({ text: firstChar, add: true });
        } else {
          result.push({ text: "0", add: true });
        }
      } else {
        if (rightPart[0] === "0" && leftPart === "0") {
          result.push({ text: "0", remove: true });
          if (decimalCount === 2) {
            result.push({ text: firstChar, add: true });
            result.push({ text: "0" });
          }
        }
        if (decimalCount === 0) {
          result.push({ text: rightPart.slice(-1) });
        } else if (decimalCount === 1) {
          result.push({ text: rightPart[0] });
          if (firstChar === "0") {
            result.push({ text: "0" });
          } else {
            if (decimalCount !== 1) {
              result.push({ text: "0", remove: true });
            }
            result.push({ text: firstChar, add: true });
          }
        }
      }
      if (decimalCount === 0) {
        result.push({ text: firstChar, add: true });
      }
    } else if (add === "delete") {
      if (leftPart === "0") {
        result.push({ text: leftPart });
      } else {
        if (leftPart.length === 1) {
          result.push({ text: "0", add: true });
        }
        if (leftPart.length >= 1) {
          result.push({ text: leftPart.slice(0, -1) });
          result.push({ text: decimalSeparator, add: true });
          decimalSwitch = true;
        }
      }

      if (decimalCount === 2 && !rightPart) {
        result.push({ text: decimalSeparator, remove: true });
      }

      if (leftPart !== "0") {
        result.push({ text: leftPart[leftPart.length - 1] });
        result.push({ text: decimalSeparator, remove: decimalSwitch });
      } else {
        result.push({ text: decimalSeparator, add: decimalSwitch });
        result.push({ text: "0", add: true });
      }

      result.push({ text: rightPart[0] });
      result.push({ text: rightPart[1], remove: true });
    } else if (add === "clear") {
      const isLastLeftPartCharZero = leftPart[leftPart.length - 1] === "0";

      if (leftPart !== "0") {
        result.push({
          text: leftPart.slice(0, isLastLeftPartCharZero ? -1 : undefined),
          remove: true
        });
      }
      if (isLastLeftPartCharZero) {
        result.push({ text: "0" });
      }

      const isLastRightPartCharZero =
        !isLastLeftPartCharZero && rightPart[rightPart.length - 1] === "0";

      if (!isLastRightPartCharZero && !isLastLeftPartCharZero) {
        result.push({ text: "0", add: leftPart !== "0" });
      }

      if (decimalCount === 2 && !rightPart) {
        result.push({ text: decimalSeparator, remove: true });
      }

      if (rightPart) {
        result.push({
          text: `${decimalSeparator}${rightPart.slice(0, isLastRightPartCharZero ? -1 : undefined)}`,
          remove: true
        });
      }
      if (isLastRightPartCharZero) {
        result.push({ text: "0" });
      }
    } else if (add === "decimal") {
      if (!rightPart) {
        result.push({ text: leftPart });
        result.push({ text: decimalSeparator, add: true });
      } else {
        if (decimalCount === 0) {
          result.push({ text: leftPart, remove: leftPart === "0" });
          result.push({ text: decimalSeparator, remove: true });
          const fullRight = rightPart.replace(/^0+/, "");
          if (fullRight.length === 1) {
            result.push({ text: "0", remove: true });
          }
          result.push({ text: fullRight });
        }
        result.push({ text: decimalSeparator, add: true });
      }
    }
  } else {
    result.push({ text: amount.toString() });
  }
  if (unitSuffix) {
    result.push({ text: unitSuffix });
  }

  return degroup(result).map((r) => ({ ...r, id: uuidv4() }));
};

const degroup = (result: StringPart[]) => {
  const degroupArr: StringPart[] = [];
  for (let i = 0; i < result.length; i++) {
    const elem = result[i];

    if (elem.add || elem.remove) {
      degroupArr.push(
        ...elem.text.split("").map((c) => ({
          text: c,
          add: elem.add,
          remove: elem.remove
        }))
      );
    } else {
      degroupArr.push(elem);
    }
  }

  return degroupArr;
};

export const countConsecutiveStringParts = (
  array: StringPart[],
  attribute: "add" | "remove",
  startIndex: number
) => {
  let count = 0;

  if (attribute === "add") {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (array[i].add) {
        count++;
      } else {
        break;
      }
    }
  } else if (attribute === "remove") {
    for (let i = startIndex + 1; i < array.length; i++) {
      if (array[i].remove) {
        count++;
      } else {
        break;
      }
    }
  }

  return count;
};
