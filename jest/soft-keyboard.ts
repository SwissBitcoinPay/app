/**
 * Fake of the app's SoftKeyboard module for Jest (modules/soft-keyboard, Android): the fields whose
 * keyboard was asked for (`showOnceFocused`), in order, read by their testID (`keyboardFields`).
 * Jest has no native views, so `findNodeHandle` gives no React tag: installed, it gives each
 * TextInput one of its own (the same for the same field), and leaves anything else as it was.
 */
import { TextInput } from "react-native";
import type * as ReactNative from "react-native";

/**
 * A TextInput as Jest renders it: React Native's Jest mock of it is a class component
 * (@react-native/jest-preset, mocks/TextInput.js), whose instance holds its props. React Native's
 * types describe the native instance (TextInputInstance), which has none.
 */
type JestTextInput = { props: { testID?: string } };

/** The fields by their tag; their tags, given as they are first asked for. */
const fields = new Map<number, JestTextInput>();
let tags = new WeakMap<object, number>();
let lastTag = 0;
let requested: number[] = [];

function tagOf(field: JestTextInput): number {
  let tag = tags.get(field);
  if (tag === undefined) {
    // Even numbers, as Fabric's.
    lastTag += 2;
    tag = lastTag;
    tags.set(field, tag);
    fields.set(tag, field);
  }
  return tag;
}

export const SoftKeyboard = {
  showOnceFocused: async (viewTag: number): Promise<void> => {
    if (!Number.isInteger(viewTag) || !fields.has(viewTag)) {
      // As the native module: no view of that tag.
      throw new Error(`No view found with tag ${viewTag}`);
    }
    requested.push(viewTag);
  }
};

/** The testIDs of the fields whose keyboard was asked for since the test started, in order. */
export function keyboardFields(): (string | undefined)[] {
  return requested.map((tag) => fields.get(tag)?.props.testID);
}

export function resetSoftKeyboard(): void {
  requested = [];
  fields.clear();
  tags = new WeakMap();
}

/**
 * Registers the module (as `requireOptionalNativeModule` finds a native one) and the tags of the
 * TextInputs. On React Native's exports themselves, not as a Jest spy: a test file's
 * `restoreAllMocks` keeps them.
 */
export function installSoftKeyboard(): void {
  globalThis.expo.modules.SoftKeyboard = SoftKeyboard;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the module's own exports
  const exports = require("react-native") as typeof ReactNative;
  const original = Object.getOwnPropertyDescriptor(exports, "findNodeHandle");
  const findNodeHandle = exports.findNodeHandle;
  Object.defineProperty(exports, "findNodeHandle", {
    configurable: true,
    enumerable: original?.enumerable ?? true,
    get: () => (handle: Parameters<typeof findNodeHandle>[0]) =>
      handle instanceof TextInput ? tagOf(handle as JestTextInput) : findNodeHandle(handle)
  });
}
