import { v4 as uuidv4 } from "uuid";
import { getFormattedUnit, decimalSeparator } from "./getFormattedUnit";
import { AddActions, StringPart } from "@hooks/useAnimateAmount";

export const formattedUnitChanges = (
  amount: string,
  add: AddActions,
  decimalCount = 0,
  array: StringPart[]
) => {
  if (amount && (amount !== "0" || add !== 0 || decimalCount > 0)) {
    const [leftPart, rightPart] = amount.split(decimalSeparator);

    let decimalSwitch = false;

    if (decimalCount > 0 && typeof add === "number") {
      add = Math.pow(10, decimalCount - 1) * add;
    }

    if (typeof add === "number") {
      if (!rightPart || (leftPart === "0" && rightPart[0] === "0")) {
        array.push({ id: uuidv4(), text: leftPart });
        decimalSwitch = !rightPart;
      } else {
        if (leftPart === "0" && decimalCount === 0) {
          array.push({ id: uuidv4(), text: "0", remove: true });
        } else {
          array.push({ id: uuidv4(), text: leftPart });
        }
        if (decimalCount === 0) {
          array.push({ id: uuidv4(), text: decimalSeparator, remove: true });
          array.push({ id: uuidv4(), text: rightPart[0] });
          decimalSwitch = true;
        }
      }

      array.push({
        id: uuidv4(),
        text: decimalSeparator,
        add: decimalSwitch && decimalCount === 0
      });

      const firstChar = add.toString()[0];

      if (!rightPart) {
        if (decimalCount === 2) {
          array.push({ id: uuidv4(), text: firstChar, add: true });
        } else {
          array.push({ id: uuidv4(), text: "0", add: true });
        }
      } else {
        if (rightPart[0] === "0" && leftPart === "0" && decimalCount !== 1) {
          array.push({ id: uuidv4(), text: "0", remove: true });
          if (decimalCount === 2) {
            array.push({ id: uuidv4(), text: firstChar, add: true });
            array.push({ id: uuidv4(), text: "0" });
          }
        }
        if (decimalCount === 0) {
          array.push({ id: uuidv4(), text: rightPart.slice(-1) });
        } else if (decimalCount === 1) {
          array.push({ id: uuidv4(), text: rightPart[0] });
          if (firstChar === "0") {
            array.push({ id: uuidv4(), text: "0", add: true });
          } else {
            if (decimalCount !== 1) {
              array.push({ id: uuidv4(), text: "0", remove: true });
            }
            array.push({ id: uuidv4(), text: firstChar, add: true });
          }
        }
      }
      if (decimalCount === 0) {
        array.push({ id: uuidv4(), text: firstChar, add: true });
      }
    } else if (add === "delete") {
      if (leftPart === "0") {
        array.push({ id: uuidv4(), text: leftPart });
      } else {
        if (leftPart.length === 1) {
          array.push({ id: uuidv4(), text: "0", add: true });
        }
        if (leftPart.length >= 1) {
          array.push({ id: uuidv4(), text: leftPart.slice(0, -1) });
          array.push({ id: uuidv4(), text: decimalSeparator, add: true });
          decimalSwitch = true;
        }
      }

      if (decimalCount === 2 && !rightPart) {
        array.push({ id: uuidv4(), text: decimalSeparator, remove: true });
      }

      if (leftPart !== "0") {
        array.push({ id: uuidv4(), text: leftPart[leftPart.length - 1] });
        array.push({ id: uuidv4(), text: decimalSeparator, remove: decimalSwitch });
      } else {
        array.push({ id: uuidv4(), text: decimalSeparator, add: decimalSwitch });
        array.push({ id: uuidv4(), text: "0", add: true });
      }

      array.push({ id: uuidv4(), text: rightPart[0] });
      if (decimalCount !== 1) {
        array.push({ id: uuidv4(), text: rightPart[1], remove: true });
      }
    } else if (add === "clear") {
      const isRightPartDefined = rightPart !== undefined;
      const isLastLeftPartCharZero = leftPart[leftPart.length - 1] === "0";

      if (leftPart !== "0") {
        if (!isRightPartDefined) {
          array.push({ id: uuidv4(), text: "0" });
        }
        array.push({
          id: uuidv4(),
          text: leftPart.slice(
            isRightPartDefined ? 0 : 1,
            isLastLeftPartCharZero ? -1 : undefined
          ),
          remove: true
        });
      }
      if (isLastLeftPartCharZero) {
        array.push({ id: uuidv4(), text: "0" });
      }

      const isLastRightPartCharZero =
        isRightPartDefined &&
        !isLastLeftPartCharZero &&
        rightPart[rightPart.length - 1] === "0";

      if (
        !isLastRightPartCharZero &&
        !isLastLeftPartCharZero &&
        isRightPartDefined
      ) {
        array.push({ id: uuidv4(), text: "0", add: leftPart !== "0" });
      }

      if (decimalCount === 2 && !rightPart) {
        array.push({ id: uuidv4(), text: decimalSeparator, remove: true });
      }

      if (rightPart) {
        array.push({
          id: uuidv4(),
          text: `${decimalSeparator}${rightPart.slice(0, isLastRightPartCharZero ? -1 : undefined)}`,
          remove: true
        });
      }
      if (isLastRightPartCharZero) {
        array.push({ id: uuidv4(), text: "0" });
      }
    } else if (add === "decimal") {
      if (!rightPart) {
        array.push({ id: uuidv4(), text: leftPart });
        array.push({ id: uuidv4(), text: decimalSeparator, add: true });
      } else {
        if (decimalCount === 0) {
          array.push({ id: uuidv4(), text: leftPart, remove: leftPart === "0" });
          array.push({ id: uuidv4(), text: decimalSeparator, remove: true });
          if (rightPart === "00") {
            array.push({ id: uuidv4(), text: "00" });
          }

          const fullRight = rightPart.replace(/^0+/, "");
          if (fullRight.length === 1) {
            array.push({ id: uuidv4(), text: "0", remove: leftPart === "0" });
          }
          array.push({ id: uuidv4(), text: fullRight });
        }
        array.push({ id: uuidv4(), text: decimalSeparator, add: true });
      }
    }
  } else {
    array.push({ id: uuidv4(), text: amount });
  }

  return degroup(array);
};

const degroup = (array: StringPart[]) => {
  const degroupArr: StringPart[] = [];
  for (let i = 0; i < array.length; i++) {
    const elem = array[i];

    if (elem.add || elem.remove) {
      degroupArr.push(
        ...elem.text.split("").map((c) => ({
          id: uuidv4(),
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
