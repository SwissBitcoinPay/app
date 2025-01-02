import { decimalSeparator } from "./decimalSeparator";
import { v4 as uuidv4 } from "uuid";

export interface StringPart {
  id: string;
  text: string;
  add?: boolean;
  remove?: boolean;
}

export function diffStrings(oldStr: string, newStr?: string): StringPart[] {
  // If strings are identical, return single part
  if (oldStr === newStr || !newStr) {
    return degroup([{ id: uuidv4(), text: oldStr }]);
  }

  const result: StringPart[] = [];
  let i = 0;
  let j = 0;

  // Find common prefix
  while (i < oldStr.length && j < newStr.length && oldStr[i] === newStr[j]) {
    i++;
    j++;
  }

  if (i > 0) {
    result.push({ text: oldStr.slice(0, i) });
  }

  // Handle case where newStr is shorter by at least 2 characters
  if (oldStr.length - newStr.length >= 2) {
    const commonSuffixLength = (() => {
      let k = 0;
      while (
        k < oldStr.length - i &&
        k < newStr.length - j &&
        oldStr[oldStr.length - 1 - k] === newStr[newStr.length - 1 - k]
      ) {
        k++;
      }
      return k;
    })();

    if (commonSuffixLength > 0) {
      result.push({
        text: oldStr.slice(i, oldStr.length - commonSuffixLength),
        remove: true
      });
      result.push({
        text: newStr.slice(j, newStr.length - commonSuffixLength),
        add: true
      });
      result.push({ text: oldStr.slice(oldStr.length - commonSuffixLength) });
      return degroup(result.map((part) => ({ ...part, id: uuidv4() })));
    }
  }

  // Find potential removal in old string
  let removeStart = i;
  let removeLength = 0;
  let bestAddStart = j;
  let bestAddLength = 0;
  let bestCommonAfterLength = 0;
  let bestMatch = null;

  // Try different combinations of removals and additions
  for (let removeLen = 0; removeLen <= 4; removeLen++) {
    for (let addLen = 0; addLen <= 4; addLen++) {
      let oldIndex = i + removeLen;
      let newIndex = j + addLen;

      // Count matching characters after the change
      let matchLen = 0;
      while (
        oldIndex + matchLen < oldStr.length &&
        newIndex + matchLen < newStr.length &&
        oldStr[oldIndex + matchLen] === newStr[newIndex + matchLen]
      ) {
        matchLen++;
      }

      if (matchLen > bestCommonAfterLength) {
        removeLength = removeLen;
        bestAddStart = j;
        bestAddLength = addLen;
        bestCommonAfterLength = matchLen;
        bestMatch = {
          oldStart: oldIndex,
          newStart: newIndex,
          length: matchLen
        };
      }
    }
  }

  // Handle the differing section character by character
  const removedChars = oldStr.slice(removeStart, removeStart + removeLength);
  const addedChars = newStr.slice(bestAddStart, bestAddStart + bestAddLength);

  // Compare characters one by one
  let k = 0;
  while (k < removedChars.length || k < addedChars.length) {
    if (k < removedChars.length && k < addedChars.length) {
      if (removedChars[k] === addedChars[k]) {
        result.push({ text: removedChars[k] });
      } else {
        if (k < removedChars.length) {
          result.push({ text: removedChars[k], remove: true });
        }
        if (k < addedChars.length) {
          result.push({ text: addedChars[k], add: true });
        }
      }
    } else if (k < removedChars.length) {
      result.push({ text: removedChars[k], remove: true });
    } else if (k < addedChars.length) {
      result.push({ text: addedChars[k], add: true });
    }
    k++;
  }

  // Add remaining common suffix
  if (bestMatch && bestMatch.length > 0) {
    result.push({
      text: newStr.slice(
        bestMatch.newStart,
        bestMatch.newStart + bestMatch.length
      )
    });
  }

  const remainingText = newStr.slice(
    bestAddStart + bestAddLength + bestCommonAfterLength
  );
  if (remainingText) {
    result.push({ text: remainingText });
  }

  // Optimization: Group consecutive elements with the same add/remove attributes
  const optimizedResult: StringPart[] = [];
  for (let i = 0; i < result.length; i++) {
    const current = result[i];
    const last = optimizedResult[optimizedResult.length - 1];

    if (last && last.add === current.add && last.remove === current.remove) {
      last.text += current.text;
    } else {
      optimizedResult.push({ ...current });
    }
  }

  // Optimization: Avoid add/removes for the same text
  const finalResult: StringPart[] = [];
  for (let i = 0; i < optimizedResult.length; i++) {
    const current = optimizedResult[i];
    const next = optimizedResult[i + 1];

    if (next && current.add && next.remove && current.text === next.text) {
      finalResult.push({ text: current.text });
      i++; // Skip the next element
    } else {
      finalResult.push(current);
    }
  }

  // add ids
  for (let i = 0; i < finalResult.length; i++) {
    finalResult[i] = { ...finalResult[i], id: uuidv4() };
  }

  // Special case: Handle decimal separator changes
  for (let i = 0; i < finalResult.length - 1; i++) {
    const previous = i > 0 ? finalResult[i - 1] : undefined;
    const current = finalResult[i];
    const next = finalResult[i + 1];

    // Handle decimal separator changes
    if (
      current.add &&
      next.text === decimalSeparator &&
      previous?.remove === true
    ) {
      finalResult[i - 1] = {
        id: previous.id,
        text: `${previous.text}${decimalSeparator}`,
        remove: true
      };
      finalResult[i] = { id: finalResult[i].id, text: finalResult[i].text };
      finalResult.splice(i + 1, 2, {
        id: uuidv4(),
        text: decimalSeparator,
        add: true
      });
    }

    // Handle number position changes
    if (
      current.remove &&
      next?.add &&
      current.text.replace(/[^0-9]/g, "") === next.text.replace(/[^0-9]/g, "")
    ) {
      const nonDigits = current.text.match(/[^0-9]/g) || [];
      const newNonDigits = next.text.match(/[^0-9]/g) || [];

      if (nonDigits.length === 0 && newNonDigits.length === 0) {
        // Keep as is - digits only
        finalResult[i] = {
          id: current.id,
          text: current.text,
          remove: true
        };
        finalResult[i + 1] = {
          id: next.id,
          text: next.text,
          add: true
        };
      } else {
        // Handle digits with formatting
        const digits = current.text.replace(/[^0-9]/g, "");
        finalResult[i] = {
          id: current.id,
          text: digits
        };
        finalResult.splice(i + 1, 1);
      }
    }
  }

  return degroup(finalResult);
}

const degroup = (result: StringPart[]) => {
  const degroup: StringPart[] = [];
  for (let i = 0; i < result.length; i++) {
    const elem = result[i];

    if (elem.add || elem.remove) {
      degroup.push(
        ...elem.text.split("").map((c) => ({
          id: uuidv4(),
          text: c,
          add: elem.add,
          remove: elem.remove
        }))
      );
    } else {
      degroup.push(elem);
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
