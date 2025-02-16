import { v4 as uuidv4 } from "uuid";
import { getUnitPrefixAndSuffix, decimalSeparator } from "./getFormattedUnit";
import { StringPart } from "@hooks/useAnimateAmount";

export const diffStrings = (
  oldStr: string,
  newStr: string,
  array: StringPart[]
) => {
  if (newStr) {
    const oldAmount = oldStr;
    const newAmount = newStr;

    let oldIndex = 0;
    let newIndex = 0;

    while (oldIndex < oldAmount.length || newIndex < newAmount.length) {
      if (
        oldIndex < oldAmount.length &&
        newIndex < newAmount.length &&
        oldAmount[oldIndex] === newAmount[newIndex]
      ) {
        array.push({ text: oldAmount[oldIndex] });
        oldIndex++;
        newIndex++;
      } else if (
        oldAmount[oldIndex] === decimalSeparator ||
        newAmount[newIndex] === decimalSeparator
      ) {
        if (oldIndex < oldAmount.length) {
          array.push({ text: oldAmount[oldIndex], remove: true });
          oldIndex++;
        }
        if (newIndex < newAmount.length) {
          array.push({ text: newAmount[newIndex], add: true });
          newIndex++;
        }
      } else {
        if (oldIndex < oldAmount.length) {
          array.push({ text: oldAmount[oldIndex], remove: true });
          oldIndex++;
        }
        if (newIndex < newAmount.length) {
          array.push({ text: newAmount[newIndex], add: true });
          newIndex++;
        }
      }
    }
  } else {
    array.push({ text: oldStr, remove: true });
  }

  return degroup(array);
};

const degroup = (result: StringPart[]) => {
  const degroup: StringPart[] = [];

  for (let i = 0; i < result.length; i++) {
    const elem = result[i];

    if (elem?.add || elem?.remove) {
      degroup.push(
        ...elem.text.split("").map((c) => ({
          id: uuidv4(),
          text: c,
          add: elem?.add || false,
          remove: elem?.remove || false
        }))
      );
    } else {
      let groupStr = "";

      while (i < result.length) {
        const element = result[i];

        if (!element?.add && !element?.remove) {
          groupStr += element.text;
          i++;
        } else {
          break;
        }
      }
      i--;
      if (groupStr) {
        degroup.push({ id: uuidv4(), text: groupStr });
      }
    }
  }

  return degroup;
};

export const countConsecutiveStringParts = (
  array: StringPart[],
  attribute: "add" | "remove",
  startIndex: number
) => {
  let count = 0;

  if (attribute === "add") {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (array[i]?.add) {
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

console;
// // degroup.re.reduce()()()
